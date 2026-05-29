/**
 * FITMOD — Routes Commandes (v2 — Escrow + Photo preuve)
 * ========================================================
 * - Création, suivi, changement de statut
 * - Photo preuve obligatoire pour changer d'étape
 * - Déclenchement automatique des versements escrow
 * - Annulation impossible à partir de couture_en_cours
 */
const express = require('express');
const router = express.Router();
const pool = require('../db');
const multer = require('multer');
const path = require('path');
const { libererVersement, getEscrowStatus, peutAnnuler } = require('../services/escrowService');

// ─── Multer pour les photos preuves ───
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(__dirname, '../uploads/preuves')),
    filename: (req, file, cb) => cb(null, `preuve_${Date.now()}_${file.originalname}`),
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } }); // 5 MB max

// ─── Étapes nécessitant une photo preuve ───
const ETAPES_AVEC_PREUVE = ['couture_en_cours', 'finitions', 'pret_a_recuperer', 'livre'];

// GET /api/commandes/client/:clientId
router.get('/client/:clientId', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT c.*, m.titre as modele_titre, m.photo_url, 
                   t.nom_atelier as tailleur_nom, t.mode_paiement,
                   p.statut as paiement_statut, p.montant_bloque, p.montant_libere, p.montant_tailleur
            FROM commande c
            JOIN modele m ON c.modele_id = m.id
            JOIN tailleur t ON c.tailleur_id = t.id
            LEFT JOIN paiement p ON p.commande_id = c.id AND p.statut = 'valide'
            WHERE c.client_id = ?
            ORDER BY c.date_commande DESC
        `, [req.params.clientId]);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// GET /api/commandes/tailleur/:tailleurId
router.get('/tailleur/:tailleurId', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT c.*, m.titre as modele_titre, m.photo_url,
                   u.nom as client_nom, u.prenom as client_prenom,
                   t.mode_paiement,
                   p.statut as paiement_statut, p.montant_bloque, p.montant_libere, p.montant_tailleur
            FROM commande c
            JOIN modele m ON c.modele_id = m.id
            JOIN utilisateur u ON c.client_id = u.id
            JOIN tailleur t ON c.tailleur_id = t.id
            LEFT JOIN paiement p ON p.commande_id = c.id AND p.statut = 'valide'
            WHERE c.tailleur_id = (
                SELECT id FROM tailleur WHERE id = ? OR utilisateur_id = ? LIMIT 1
            )
            ORDER BY c.date_commande DESC
        `, [req.params.tailleurId, req.params.tailleurId]);
        res.json(rows);
    } catch (err) {
        console.error('[commandes tailleur]', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// GET /api/commandes/:id — Détail + historique + escrow
router.get('/:id', async (req, res) => {
    try {
        const [commandes] = await pool.query(`
            SELECT c.*, m.titre as modele_titre, m.photo_url, 
                   t.nom_atelier as tailleur_nom, t.mode_paiement,
                   u.nom as client_nom, u.prenom as client_prenom
            FROM commande c
            JOIN modele m ON c.modele_id = m.id
            JOIN tailleur t ON c.tailleur_id = t.id
            JOIN utilisateur u ON c.client_id = u.id
            WHERE c.id = ?
        `, [req.params.id]);

        if (commandes.length === 0) return res.status(404).json({ error: 'Commande introuvable' });

        const commande = commandes[0];

        // Historique des statuts
        const [historique] = await pool.query(
            `SELECT libelle as statut, date_heure as date FROM statut_commande WHERE commande_id = ? ORDER BY date_heure ASC`,
            [commande.id]
        );
        commande.historique = historique;

        // Escrow (paiement + versements + preuves)
        commande.escrow = await getEscrowStatus(commande.id);

        // Avis existant ?
        const [avisRows] = await pool.query(
            'SELECT id, note, commentaire, date_avis FROM avis WHERE commande_id = ?',
            [commande.id]
        );
        commande.avis = avisRows.length > 0 ? avisRows[0] : null;

        // Peut annuler ?
        commande.peut_annuler = await peutAnnuler(commande.id);

        res.json(commande);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// POST /api/commandes — Créer une commande
router.post('/', async (req, res) => {
    try {
        const { client_id, tailleur_id, modele_id, mesures_utilisees, tissu_option, couleur, date_livraison_souhaitee, notes_client } = req.body;

        // Récupérer le modèle pour calculer le prix côté serveur
        const [modeles] = await pool.query('SELECT prix_base, tissu_disponible, prix_tissu FROM modele WHERE id = ?', [modele_id]);
        if (modeles.length === 0) return res.status(404).json({ error: 'Modèle introuvable' });

        const modele = modeles[0];
        let prix_total = parseFloat(modele.prix_base);

        // Si le client veut le tissu du tailleur, vérifier qu'il est disponible et ajouter le prix
        const choixTissu = tissu_option || 'client_fournit';
        if (choixTissu === 'tailleur_fournit') {
            if (!modele.tissu_disponible || !modele.prix_tissu) {
                return res.status(400).json({ error: 'Le tailleur ne fournit pas de tissu pour ce modèle' });
            }
            prix_total += parseFloat(modele.prix_tissu);
        }

        const [result] = await pool.query(`
            INSERT INTO commande 
            (client_id, tailleur_id, modele_id, mesures_utilisees, tissu_option, couleur, prix_total, date_livraison_souhaitee, notes_client) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            client_id, tailleur_id, modele_id,
            JSON.stringify(mesures_utilisees || {}),
            choixTissu, couleur, prix_total,
            date_livraison_souhaitee || null,
            notes_client || null
        ]);

        await pool.query('INSERT INTO statut_commande (commande_id, libelle) VALUES (?, ?)', [result.insertId, 'en_attente_acceptation']);

        res.status(201).json({ id: result.insertId, message: 'Commande créée', prix_total });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// PATCH /api/commandes/:id/statut — Changer le statut (avec photo preuve)
router.patch('/:id/statut', upload.single('preuve'), async (req, res) => {
    try {
        const { statut, commentaire } = req.body;
        const commandeId = req.params.id;

        // Vérifier que la commande existe
        const [cmdRows] = await pool.query('SELECT statut, tailleur_id FROM commande WHERE id = ?', [commandeId]);
        if (cmdRows.length === 0) return res.status(404).json({ error: 'Commande introuvable' });

        const currentStatut = cmdRows[0].statut;

        // ── Vérification annulation ──
        if (statut === 'annulee') {
            const canCancel = await peutAnnuler(commandeId);
            if (!canCancel) {
                return res.status(400).json({ 
                    error: 'Annulation impossible — la confection a déjà commencé' 
                });
            }
        }

        // ── Photo preuve obligatoire pour certaines étapes ──
        if (ETAPES_AVEC_PREUVE.includes(statut) && !req.file) {
            return res.status(400).json({ 
                error: `Photo preuve obligatoire pour passer à l'étape "${statut}"` 
            });
        }

        // ── Sauvegarder la preuve photo ──
        if (req.file) {
            const photoUrl = `uploads/preuves/${req.file.filename}`;
            await pool.query(
                `INSERT INTO preuve_etape (commande_id, etape, photo_url, commentaire) VALUES (?, ?, ?, ?)`,
                [commandeId, statut, photoUrl, commentaire || null]
            );
        }

        // ── Mettre à jour le statut ──
        let sql = 'UPDATE commande SET statut = ?';
        const params = [statut];
        if (statut === 'livre') {
            sql += ', date_livraison_reelle = CURRENT_DATE()';
        }
        sql += ' WHERE id = ?';
        params.push(commandeId);

        await pool.query(sql, params);

        // ── Déclencher le versement escrow ──
        let versement = null;
        if (['couture_en_cours', 'finitions', 'pret_a_recuperer', 'livre'].includes(statut)) {
            versement = await libererVersement(parseInt(commandeId), statut);
        }

        // ── Notification chat ──
        if (statut === 'acceptee' || statut === 'annulee') {
            await notifierClient(req, commandeId, statut);
        }

        res.json({ 
            success: true, 
            versement,
            message: versement 
                ? `Statut mis à jour → ${versement.montant} FCFA libérés (${versement.pourcentage}%)`
                : 'Statut mis à jour'
        });
    } catch (err) {
        console.error('[COMMANDE statut]', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// GET /api/commandes/:id/escrow — État de l'escrow
router.get('/:id/escrow', async (req, res) => {
    try {
        const escrow = await getEscrowStatus(parseInt(req.params.id));
        res.json(escrow);
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ─── Notification chat helper ───
async function notifierClient(req, commandeId, statut) {
    try {
        const [cmdRow] = await pool.query(`
            SELECT c.client_id, t.utilisateur_id as tailleur_utilisateur_id, m.titre
            FROM commande c
            JOIN tailleur t ON c.tailleur_id = t.id
            JOIN modele m ON c.modele_id = m.id
            WHERE c.id = ?
        `, [commandeId]);

        if (cmdRow.length === 0) return;
        const cmd = cmdRow[0];

        const messages = {
            acceptee: `✅ Votre commande pour « ${cmd.titre} » a été acceptée ! Le paiement est maintenant requis.`,
            annulee: `❌ La commande pour « ${cmd.titre} » a été annulée.`,
        };

        const msgText = messages[statut];
        if (!msgText) return;

        // Insérer le message directement (schema BDD réel)
        await pool.query(
            `INSERT INTO message (expediteur_id, destinataire_id, contenu, commande_id, type)
             VALUES (?, ?, ?, ?, 'TEXT')`,
            [cmd.tailleur_utilisateur_id, cmd.client_id, msgText, commandeId]
        );

        // Notifier via Socket.IO si disponible
        const io = req.app?.get?.('io');
        if (io) {
            io.to(`user_${cmd.client_id}`).emit('new_message', {
                expediteur_id: cmd.tailleur_utilisateur_id,
                destinataire_id: cmd.client_id,
                contenu: msgText,
            });
        }
    } catch (err) {
        console.error('[Notification chat]', err.message);
    }
}

module.exports = router;
