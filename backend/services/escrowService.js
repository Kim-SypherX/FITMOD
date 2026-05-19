/**
 * FITMOD — Service Escrow
 * ========================
 * Gère la logique de l'escrow (blocage et libération des fonds).
 * 
 * Commission FITMOD : 15%
 * Part tailleur : 85% du prix total
 * 
 * Mode "par_etape" :
 *   couture_en_cours → 45%
 *   finitions → 25%
 *   pret_a_recuperer → 15%
 *   livre → 15%
 * 
 * Mode "apres_livraison" :
 *   livre → 100%
 */

const pool = require('../db');

const COMMISSION_RATE = 0.15; // 15% pour FITMOD

// Pourcentages de libération par étape (mode par_etape)
// Sur la part tailleur (85%)
const RELEASE_SCHEDULE = {
    couture_en_cours:    45,
    finitions:           25,
    pret_a_recuperer:    15,
    livre:               15,
};

/**
 * Calcule les montants au moment du paiement
 */
function calculerMontants(prixTotal) {
    const commission = Math.round(prixTotal * COMMISSION_RATE * 100) / 100;
    const partTailleur = Math.round((prixTotal - commission) * 100) / 100;
    return {
        prixTotal,
        commission,       // 15% pour FITMOD
        partTailleur,     // 85% pour le tailleur
        montantBloque: partTailleur, // Bloqué en escrow
    };
}

/**
 * Initialise l'escrow quand le paiement est validé.
 * Met à jour la table paiement avec les montants escrow.
 */
async function initialiserEscrow(paiementId, prixTotal) {
    const { commission, partTailleur } = calculerMontants(prixTotal);

    await pool.query(
        `UPDATE paiement 
         SET commission_fitmod = ?, montant_tailleur = ?, 
             montant_bloque = ?, montant_libere = 0
         WHERE id = ?`,
        [commission, partTailleur, partTailleur, paiementId]
    );

    return { commission, partTailleur };
}

/**
 * Libère un versement au tailleur pour une étape donnée.
 * 
 * @param {number} commandeId - ID de la commande
 * @param {string} etape - Statut de l'étape (ex: 'couture_en_cours')
 * @returns {object|null} Le versement créé, ou null si pas de libération
 */
async function libererVersement(commandeId, etape) {
    // 1. Récupérer la commande + tailleur + paiement
    const [rows] = await pool.query(`
        SELECT c.id, c.prix_total, c.tailleur_id,
               t.mode_paiement,
               p.id as paiement_id, p.montant_tailleur, p.montant_bloque, p.montant_libere
        FROM commande c
        JOIN tailleur t ON c.tailleur_id = t.id
        LEFT JOIN paiement p ON p.commande_id = c.id AND p.statut = 'valide'
        WHERE c.id = ?
    `, [commandeId]);

    if (rows.length === 0 || !rows[0].paiement_id) {
        console.log(`[ESCROW] Pas de paiement validé pour commande #${commandeId}`);
        return null;
    }

    const cmd = rows[0];
    const modePaiement = cmd.mode_paiement;

    // 2. Vérifier si un versement a déjà été fait pour cette étape
    const [existing] = await pool.query(
        `SELECT id FROM versement WHERE commande_id = ? AND etape = ?`,
        [commandeId, etape]
    );
    if (existing.length > 0) {
        console.log(`[ESCROW] Versement déjà fait pour étape ${etape}`);
        return null;
    }

    // 3. Calculer le montant à libérer
    let pourcentage = 0;

    if (modePaiement === 'apres_livraison') {
        // Tout libérer uniquement à la livraison
        if (etape === 'livre') {
            pourcentage = 100;
        } else {
            console.log(`[ESCROW] Mode après_livraison — pas de versement pour ${etape}`);
            return null;
        }
    } else {
        // Mode par_etape
        pourcentage = RELEASE_SCHEDULE[etape] || 0;
        if (pourcentage === 0) {
            return null;
        }
    }

    const montant = Math.round(cmd.montant_tailleur * pourcentage / 100 * 100) / 100;
    const nouveauCumul = Math.round((parseFloat(cmd.montant_libere) + montant) * 100) / 100;

    // 4. Créer le versement
    const [result] = await pool.query(
        `INSERT INTO versement (commande_id, paiement_id, etape, pourcentage, montant, cumul_libere)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [commandeId, cmd.paiement_id, etape, pourcentage, montant, nouveauCumul]
    );

    // 5. Mettre à jour l'escrow du paiement
    await pool.query(
        `UPDATE paiement 
         SET montant_libere = ?, montant_bloque = montant_tailleur - ?
         WHERE id = ?`,
        [nouveauCumul, nouveauCumul, cmd.paiement_id]
    );

    console.log(`[ESCROW] Versement #${result.insertId} : ${pourcentage}% = ${montant} FCFA → tailleur`);

    return {
        id: result.insertId,
        etape,
        pourcentage,
        montant,
        cumul_libere: nouveauCumul,
    };
}

/**
 * Récupère l'état de l'escrow pour une commande
 */
async function getEscrowStatus(commandeId) {
    // Paiement
    const [paiements] = await pool.query(
        `SELECT id, montant, commission_fitmod, montant_tailleur, montant_bloque, montant_libere, statut
         FROM paiement WHERE commande_id = ? ORDER BY date_paiement DESC LIMIT 1`,
        [commandeId]
    );

    // Versements
    const [versements] = await pool.query(
        `SELECT etape, pourcentage, montant, cumul_libere, date_versement
         FROM versement WHERE commande_id = ? ORDER BY date_versement ASC`,
        [commandeId]
    );

    // Preuves
    const [preuves] = await pool.query(
        `SELECT etape, photo_url, commentaire, date_upload
         FROM preuve_etape WHERE commande_id = ? ORDER BY date_upload ASC`,
        [commandeId]
    );

    const paiement = paiements[0] || null;

    return {
        paiement,
        versements,
        preuves,
        progression: paiement 
            ? Math.round((parseFloat(paiement.montant_libere) / parseFloat(paiement.montant_tailleur)) * 100)
            : 0,
    };
}

/**
 * Vérifie si l'annulation est possible
 */
async function peutAnnuler(commandeId) {
    const [rows] = await pool.query(
        `SELECT statut FROM commande WHERE id = ?`, [commandeId]
    );
    if (rows.length === 0) return false;
    
    // Annulation impossible à partir de couture_en_cours
    const statutsNonAnnulables = ['couture_en_cours', 'finitions', 'pret_a_recuperer', 'livre'];
    return !statutsNonAnnulables.includes(rows[0].statut);
}

module.exports = {
    COMMISSION_RATE,
    RELEASE_SCHEDULE,
    calculerMontants,
    initialiserEscrow,
    libererVersement,
    getEscrowStatus,
    peutAnnuler,
};
