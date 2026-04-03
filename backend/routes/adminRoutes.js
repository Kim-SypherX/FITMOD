/**
 * FITMOD — Routes Admin (Statistiques du tableau de bord global)
 */
const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /api/admin/dashboard
router.get('/dashboard', async (req, res) => {
    try {
        const [[clients]] = await pool.query("SELECT COUNT(*) as count FROM utilisateur WHERE type_compte='client'");
        const [[tailleurs]] = await pool.query("SELECT COUNT(*) as count FROM utilisateur WHERE type_compte='tailleur'");
        const [[commandes]] = await pool.query("SELECT COUNT(*) as count FROM commande");

        const [[revenus]] = await pool.query("SELECT SUM(prix_total) as total FROM commande WHERE statut NOT IN ('annulee')");
        const [[note]] = await pool.query("SELECT AVG(note_moyenne) as avg FROM tailleur WHERE note_moyenne > 0");

        // Commandes par statut
        const [statutsCount] = await pool.query("SELECT statut as label, COUNT(*) as count FROM commande GROUP BY statut");

        res.json({
            totalClients: clients.count,
            totalTailleurs: tailleurs.count,
            totalCommandes: commandes.count,
            totalRevenu: revenus.total || 0,
            noteMoyenne: note.avg ? parseFloat(note.avg).toFixed(1) : 0,
            commandesByStatut: statutsCount
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// GET /api/admin/tailleurs
router.get('/tailleurs', async (req, res) => {
    try {
        const [rows] = await pool.query(`
      SELECT t.*, u.nom, u.prenom, u.email, u.telephone, u.ville, u.date_inscription
      FROM tailleur t
      JOIN utilisateur u ON t.utilisateur_id = u.id
      ORDER BY u.date_inscription DESC
    `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// PATCH /api/admin/tailleur/:id/statut
router.patch('/tailleur/:id/statut', async (req, res) => {
    try {
        const { statut } = req.body; // 'actif', 'en_conge', 'suspendu'
        await pool.query('UPDATE tailleur SET statut = ? WHERE id = ?', [statut, req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// GET /api/admin/commandes
router.get('/commandes', async (req, res) => {
    try {
        const [rows] = await pool.query(`
      SELECT c.*, m.titre as modele_titre, t.nom_atelier as tailleur_nom, u.nom as client_nom
      FROM commande c
      JOIN modele m ON c.modele_id = m.id
      JOIN tailleur t ON c.tailleur_id = t.id
      JOIN client cl ON c.client_id = cl.id
      JOIN utilisateur u ON cl.utilisateur_id = u.id
      ORDER BY c.date_commande DESC
      LIMIT 100
    `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// GET /api/admin/avis
router.get('/avis', async (req, res) => {
    try {
        const [rows] = await pool.query(`
      SELECT a.*, t.nom_atelier as tailleur_nom, u.nom as client_nom
      FROM avis a
      JOIN tailleur t ON a.tailleur_id = t.id
      JOIN client c ON a.client_id = c.id
      JOIN utilisateur u ON c.utilisateur_id = u.id
      ORDER BY a.date_avis DESC
      LIMIT 100
    `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

module.exports = router;
