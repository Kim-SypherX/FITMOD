/**
 * FITMOD — Routes Paiement LigdiCash + Escrow
 * =============================================
 * Flux : Payin sans redirection (OTP)
 * Commission FITMOD : 15% prélevée au paiement
 * Escrow : montant tailleur (85%) bloqué, libéré par étapes
 *
 * POST /api/paiement/initier   → Envoie l'OTP au client
 * POST /api/paiement/valider   → Valide avec l'OTP + init escrow
 * POST /api/paiement/callback  → Webhook LigdiCash (confirmation async)
 * GET  /api/paiement/statut/:token → Vérifie le statut d'un token
 * GET  /api/paiement/commande/:commandeId → Paiement + escrow d'une commande
 */

const express = require('express');
const router  = express.Router();
const pool    = require('../db');
const { initialiserEscrow, calculerMontants, getEscrowStatus } = require('../services/escrowService');

const LIGDICASH_BASE = 'https://app.ligdicash.com';
const API_KEY        = process.env.LIGDICASH_API_KEY;
const API_TOKEN      = process.env.LIGDICASH_API_TOKEN;
const IS_SANDBOX     = process.env.LIGDICASH_SANDBOX === 'true';

// Headers communs pour les requêtes LigdiCash
const ligdiHeaders = () => ({
  'Apikey':         API_KEY,
  'Authorization':  `Bearer ${API_TOKEN}`,
  'Accept':         'application/json',
  'Content-Type':   'application/json',
});

// Helper : Requête LigdiCash (avec mode sandbox)
async function ligdiRequest(method, path, body = null) {
  if (IS_SANDBOX) {
    // Mode sandbox : simule les réponses pour le développement
    return mockLigdiResponse(method, path, body);
  }

  const url = `${LIGDICASH_BASE}${path}`;
  const opts = {
    method,
    headers: ligdiHeaders(),
  };
  if (body) opts.body = JSON.stringify(body);

  const res  = await fetch(url, opts);
  const data = await res.json();
  return data;
}

// Sandbox mock pour développement sans vraies clés
function mockLigdiResponse(method, path, body) {
  if (path.includes('/debitotp/')) {
    return { error: false, message: 'OTP sent. Please check your phone.' };
  }
  if (path.includes('/debitwallet/withotp')) {
    const isValid = body?.commande?.invoice?.otp === '123456';
    if (isValid) {
      return {
        response_code: '00',
        token: 'SANDBOX_TOKEN_' + Date.now(),
        response_text: 'Success',
      };
    }
    return { response_code: '01', response_text: 'OTP invalide' };
  }
  if (path.includes('/checkout-invoice/confirm')) {
    return {
      response_code: '00',
      status: 'completed',
      amount: '0',
      operator_name: 'SANDBOX',
      transaction_id: 'TRNS.SANDBOX.' + Date.now(),
    };
  }
  return { error: true, message: 'Route mock inconnue' };
}

// ─── 1. INITIER — Envoi de l'OTP ─────────────────────────────
// POST /api/paiement/initier
// Body: { commande_id, telephone, montant, operateur }
router.post('/initier', async (req, res) => {
  try {
    const { commande_id, telephone, montant, operateur } = req.body;

    if (!commande_id || !telephone || !montant) {
      return res.status(400).json({ error: 'Données manquantes (commande_id, telephone, montant)' });
    }

    // Vérifie que la commande existe
    const [commandes] = await pool.query(
      `SELECT c.id, c.client_id, c.tailleur_id, c.prix_total, c.statut
       FROM commande c WHERE c.id = ?`,
      [commande_id]
    );
    if (commandes.length === 0) {
      return res.status(404).json({ error: 'Commande introuvable' });
    }
    const commande = commandes[0];

    // Formate le numéro (ajoute 226 si besoin)
    const phoneFormatted = telephone.startsWith('226')
      ? telephone
      : `226${telephone.replace(/^0+/, '')}`;

    // Appel LigdiCash retiré car pour le Mobile Money (Orange/Moov), 
    // c'est le client qui génère l'OTP via USSD sans requête serveur préalable.

    // Créer/mettre à jour l'entrée paiement en BDD
    const [existing] = await pool.query(
      `SELECT id FROM paiement WHERE commande_id = ? AND statut IN (?,?)`,
      [commande_id, 'en_attente', 'otp_envoye']
    );

    if (existing.length > 0) {
      await pool.query(
        `UPDATE paiement SET telephone=?, operateur=?, statut='otp_envoye', otp_envoye=1
         WHERE id=?`,
        [phoneFormatted, operateur || 'orange', existing[0].id]
      );
    } else {
      await pool.query(
        `INSERT INTO paiement
         (commande_id, client_id, tailleur_id, montant, telephone, operateur, methode, statut, otp_envoye)
         VALUES (?, ?, ?, ?, ?, ?, 'mobile_money', 'otp_envoye', 1)`,
        [commande_id, commande.client_id, commande.tailleur_id, montant, phoneFormatted, operateur || 'orange']
      );
    }

    res.json({
      success: true,
      message: 'OTP envoyé par SMS. Veuillez saisir le code reçu.',
      sandbox: IS_SANDBOX,
      hint: IS_SANDBOX ? 'En mode sandbox, utilisez le code OTP : 123456' : undefined,
    });

  } catch (err) {
    console.error('[PAIEMENT initier]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── 2. VALIDER — Confirmation OTP ───────────────────────────
// POST /api/paiement/valider
// Body: { commande_id, otp, telephone, montant }
router.post('/valider', async (req, res) => {
  try {
    const { commande_id, otp, telephone, montant } = req.body;

    if (!commande_id || !otp || !telephone || !montant) {
      return res.status(400).json({ error: 'Données manquantes' });
    }

    // Récupère la commande + client + tailleur (schéma v1)
    const [commandes] = await pool.query(`
      SELECT c.id, c.client_id, c.tailleur_id, c.prix_total,
             u.nom, u.prenom, u.email, m.titre as modele_titre
      FROM commande c
      JOIN client cl ON c.client_id = cl.id
      JOIN utilisateur u ON cl.utilisateur_id = u.id
      JOIN modele m ON c.modele_id = m.id
      WHERE c.id = ?
    `, [commande_id]);

    if (commandes.length === 0) {
      return res.status(404).json({ error: 'Commande introuvable' });
    }
    const commande = commandes[0];

    const phoneFormatted = telephone.startsWith('226')
      ? telephone
      : `226${telephone.replace(/^0+/, '')}`;

    // Appel LigdiCash — validation OTP
    const ligdiPayload = {
      commande: {
        invoice: {
          items: [{
            name: `Commande FITMOD #${commande_id}`,
            description: commande.modele_titre,
            quantity: 1,
            unit_price: parseFloat(montant),
            total_price: parseFloat(montant),
          }],
          total_amount: parseFloat(montant),
          devise: 'XOF',
          description: `Paiement commande FITMOD #${commande_id} — ${commande.modele_titre}`,
          customer: phoneFormatted,
          customer_firstname: commande.prenom,
          customer_lastname: commande.nom,
          customer_email: commande.email || '',
          external_id: `FITMOD-${commande_id}`,
          otp: otp,
        },
        store: {
          name: 'FITMOD',
          website_url: 'https://fitmod.bf',
        },
        actions: {
          cancel_url:   '',
          return_url:   '',
          callback_url: process.env.LIGDICASH_CALLBACK_URL || '',
        },
        custom_data: {
          order_id:       `FITMOD-${commande_id}`,
          transaction_id: `FITMOD-${commande_id}-${Date.now()}`,
        },
      },
    };

    const ligdiRes = await ligdiRequest('POST', '/pay/v01/straight/checkout-invoice/create', ligdiPayload);

    if (ligdiRes.response_code !== '00') {
      // Échec
      await pool.query(
        `UPDATE paiement SET statut='echoue', reponse_json=? WHERE commande_id=? AND statut='otp_envoye'`,
        [JSON.stringify(ligdiRes), commande_id]
      );
      return res.status(402).json({
        error: 'Paiement refusé',
        message: ligdiRes.response_text || 'OTP invalide ou solde insuffisant',
      });
    }

    // Succès — Vérification du statut
    const token = ligdiRes.token;
    let statusData = { status: 'completed', transaction_id: ligdiRes.token }; // par défaut sandbox

    if (!IS_SANDBOX) {
      statusData = { status: 'pending' };
      // Polling: vérifier jusqu'à 8 fois (environ 16 secondes d'attente max)
      for (let i = 0; i < 8; i++) {
        const check = await ligdiRequest(
          'GET',
          `/pay/v01/redirect/checkout-invoice/confirm/?invoiceToken=${token}`
        );
        if (check.status === 'completed' || check.status === 'failed') {
          statusData = check;
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    if (statusData.response_code === '00' && statusData.status === 'completed') {
      // Mise à jour BDD — paiement validé
      await pool.query(
        `UPDATE paiement
         SET statut='valide', ligdicash_token=?, ligdicash_txn_id=?, reference=?, reponse_json=?
         WHERE commande_id=? AND statut='otp_envoye'`,
        [
          token,
          statusData.transaction_id || '',
          statusData.transaction_id || token,
          JSON.stringify(statusData),
          commande_id,
        ]
      );

      // ── Initialiser l'escrow (commission 15% + blocage 85%) ──
      const [paiementRow] = await pool.query(
        `SELECT id FROM paiement WHERE commande_id = ? AND statut = 'valide' ORDER BY date_paiement DESC LIMIT 1`,
        [commande_id]
      );
      if (paiementRow.length > 0) {
        const escrowInfo = await initialiserEscrow(paiementRow[0].id, parseFloat(montant));
        console.log(`[ESCROW] Commande #${commande_id} — Commission: ${escrowInfo.commission} FCFA, Tailleur: ${escrowInfo.partTailleur} FCFA`);
      }

      // Mise à jour statut commande → acceptée (paiement reçu)
      await pool.query(
        `UPDATE commande SET statut='acceptee' WHERE id=?`,
        [commande_id]
      );

      const montants = calculerMontants(parseFloat(montant));

      return res.json({
        success: true,
        message: 'Paiement validé avec succès !',
        transaction_id: statusData.transaction_id || token,
        operateur: statusData.operator_name || 'Mobile Money',
        escrow: {
          commission_fitmod: montants.commission,
          montant_tailleur: montants.partTailleur,
          montant_bloque: montants.partTailleur,
        },
      });
    }

    // Statut ambigu (en attente)
    res.json({
      success: false,
      pending: true,
      message: 'Paiement en cours de traitement. Vous serez notifié.',
      token,
    });

  } catch (err) {
    console.error('[PAIEMENT valider]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── 3. CALLBACK — Webhook LigdiCash ─────────────────────────
// POST /api/paiement/callback
router.post('/callback', async (req, res) => {
  try {
    const data = req.body;
    console.log('[CALLBACK LigdiCash]', JSON.stringify(data, null, 2));

    // Extraire l'order_id depuis custom_data
    const orderId = data?.custom_data?.find?.(d => d.keyof_customdata === 'order_id')?.valueof_customdata;
    if (!orderId) return res.sendStatus(200);

    const commandeId = orderId.replace('FITMOD-', '');

    if (data.status === 'completed' && data.response_code === '00') {
      await pool.query(
        `UPDATE paiement SET statut='valide', ligdicash_txn_id=?, reponse_json=?
         WHERE commande_id=?`,
        [data.transaction_id, JSON.stringify(data), commandeId]
      );
      await pool.query(
        `UPDATE commande SET statut='acceptee' WHERE id=? AND statut='en_attente_acceptation'`,
        [commandeId]
      );
    } else if (data.status === 'failed') {
      await pool.query(
        `UPDATE paiement SET statut='echoue', reponse_json=? WHERE commande_id=?`,
        [JSON.stringify(data), commandeId]
      );
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('[CALLBACK erreur]', err);
    res.sendStatus(500);
  }
});

// ─── 4. STATUT — Vérifier le statut d'un token ───────────────
// GET /api/paiement/statut/:token
router.get('/statut/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const statusData = await ligdiRequest(
      'GET',
      `/pay/v01/redirect/checkout-invoice/confirm/?invoiceToken=${token}`
    );
    res.json(statusData);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── 5. Récupérer le paiement + escrow d'une commande ────────
// GET /api/paiement/commande/:commandeId
router.get('/commande/:commandeId', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, montant, telephone, operateur, statut, ligdicash_txn_id as transaction_id,
              reference, date_paiement, commission_fitmod, montant_tailleur, montant_bloque, montant_libere
       FROM paiement WHERE commande_id = ? ORDER BY date_paiement DESC LIMIT 1`,
      [req.params.commandeId]
    );
    
    const paiement = rows[0] || null;
    if (paiement) {
      paiement.escrow = await getEscrowStatus(parseInt(req.params.commandeId));
    }
    res.json(paiement);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
