/**
 * FITMOD — Routes Messagerie (chat par commande)
 */
const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /api/messages/:commandeId — Récupérer les messages d'une commande
router.get('/:commandeId', async (req, res) => {
    try {
        const [rows] = await pool.query(`
      SELECT m.*, u.nom as expediteur_nom, u.prenom as expediteur_prenom
      FROM message m
      JOIN utilisateur u ON m.expediteur_id = u.id
      WHERE m.commande_id = ?
      ORDER BY m.date_heure ASC
    `, [req.params.commandeId]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// POST /api/messages — Envoyer un message
router.post('/', async (req, res) => {
    try {
        const { commande_id, expediteur_id, contenu } = req.body;
        if (!contenu || !contenu.trim()) return res.status(400).json({ error: 'Contenu vide' });

        const [result] = await pool.query(`
      INSERT INTO message (commande_id, expediteur_id, contenu)
      VALUES (?, ?, ?)
    `, [commande_id, expediteur_id, contenu.trim()]);

        const [newMsg] = await pool.query(`
      SELECT m.*, u.nom as expediteur_nom, u.prenom as expediteur_prenom
      FROM message m
      JOIN utilisateur u ON m.expediteur_id = u.id
      WHERE m.id = ?
    `, [result.insertId]);

        res.status(201).json(newMsg[0]);
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// PATCH /api/messages/:commandeId/read — Marquer comme lus
router.patch('/:commandeId/read', async (req, res) => {
    try {
        const { lecteur_id } = req.body; // user.id
        // Marquer lu les messages où l'expéditeur n'est pas le lecteur
        await pool.query(`
      UPDATE message 
      SET lu = 1
      WHERE commande_id = ? AND expediteur_id != ? AND lu = 0
    `, [req.params.commandeId, lecteur_id]);

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// GET /api/messages/user/:userId/conversations — Résumé des conversations d'un utilisateur
router.get('/user/:userId/conversations', async (req, res) => {
    try {
        // Cette requête récupère la dernière interaction de chaque commande pour un utilisateur donné
        const [rows] = await pool.query(`
      SELECT 
        c.id as commande_id, 
        c.tailleur_id, 
        t.nom_atelier as tailleur_nom,
        c.client_id,
        u.nom as client_nom,
        mo.titre as modele_titre,
        (SELECT contenu FROM message WHERE commande_id = c.id ORDER BY date_heure DESC LIMIT 1) as dernier_message,
        (SELECT date_heure FROM message WHERE commande_id = c.id ORDER BY date_heure DESC LIMIT 1) as date_dernier_message,
        (SELECT COUNT(*) FROM message WHERE commande_id = c.id AND expediteur_id != ? AND lu = 0) as non_lus
      FROM commande c
      JOIN modele mo ON c.modele_id = mo.id
      JOIN tailleur t ON c.tailleur_id = t.id
      JOIN client cl ON c.client_id = cl.id
      JOIN utilisateur u ON cl.utilisateur_id = u.id
      WHERE cl.utilisateur_id = ? OR t.utilisateur_id = ?
      HAVING dernier_message IS NOT NULL
      ORDER BY date_dernier_message DESC
    `, [req.params.userId, req.params.userId, req.params.userId]);

        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

module.exports = router;
