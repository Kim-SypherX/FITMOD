/**
 * FITMOD — Routes Profil Client (avis, favoris, mesures)
 */
const express = require('express');
const router = express.Router();
const pool = require('../db');

// --- MESURES ---

// PUT /api/client-profil/:clientId/mesures
router.put('/:clientId/mesures', async (req, res) => {
    try {
        const { poitrine, taille, hanches, longueur_dos, longueur_bras, entrejambe, taille_reelle, mesures_json } = req.body;
        await pool.query(`
      UPDATE client 
      SET poitrine=?, taille=?, hanches=?, longueur_dos=?, longueur_bras=?, entrejambe=?, taille_reelle=?, mesures_json=?
      WHERE id=?
    `, [poitrine, taille, hanches, longueur_dos, longueur_bras, entrejambe, taille_reelle, JSON.stringify(mesures_json || {}), req.params.clientId]);

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// --- FAVORIS ---

// GET /api/client-profil/:clientId/favoris
router.get('/:clientId/favoris', async (req, res) => {
    try {
        const [rows] = await pool.query(`
      SELECT f.id as favori_id, m.*, t.nom_atelier as tailleur_nom
      FROM favori f
      JOIN modele m ON f.modele_id = m.id
      JOIN tailleur t ON m.tailleur_id = t.id
      WHERE f.client_id = ?
      ORDER BY f.date_ajout DESC
    `, [req.params.clientId]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// POST /api/client-profil/:clientId/favoris
router.post('/:clientId/favoris', async (req, res) => {
    try {
        const { modele_id } = req.body;
        await pool.query('INSERT IGNORE INTO favori (client_id, modele_id) VALUES (?, ?)', [req.params.clientId, modele_id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// DELETE /api/client-profil/:clientId/favoris/:modeleId
router.delete('/:clientId/favoris/:modeleId', async (req, res) => {
    try {
        await pool.query('DELETE FROM favori WHERE client_id = ? AND modele_id = ?', [req.params.clientId, req.params.modeleId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// --- AVIS ---

// POST /api/client-profil/avis
router.post('/avis', async (req, res) => {
    try {
        const { commande_id, client_id, tailleur_id, note, commentaire } = req.body;

        const [result] = await pool.query(`
      INSERT INTO avis (commande_id, client_id, tailleur_id, note, commentaire)
      VALUES (?, ?, ?, ?, ?)
    `, [commande_id, client_id, tailleur_id, note, commentaire]);

        // Le trigger MySQL "maj_note_tailleur" mettra à jour la note moyenne du tailleur

        res.status(201).json({ id: result.insertId, success: true });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'Vous avez déjà laissé un avis pour cette commande' });
        }
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

module.exports = router;
