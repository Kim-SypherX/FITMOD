/**
 * FITMOD — Routes Commandes (création, suivi, statuts)
 */
const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /api/commandes/client/:clientId — Commandes d'un client
router.get('/client/:clientId', async (req, res) => {
    try {
        const [rows] = await pool.query(`
      SELECT c.*, m.titre as modele_titre, m.photo_url, t.nom_atelier as tailleur_nom
      FROM commande c
      JOIN modele m ON c.modele_id = m.id
      JOIN tailleur t ON c.tailleur_id = t.id
      WHERE c.client_id = ?
      ORDER BY c.date_commande DESC
    `, [req.params.clientId]);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// GET /api/commandes/tailleur/:tailleurId — Commandes d'un tailleur
router.get('/tailleur/:tailleurId', async (req, res) => {
    try {
        const [rows] = await pool.query(`
      SELECT c.*, m.titre as modele_titre, u.nom as client_nom, u.prenom as client_prenom
      FROM commande c
      JOIN modele m ON c.modele_id = m.id
      JOIN client cl ON c.client_id = cl.id
      JOIN utilisateur u ON cl.utilisateur_id = u.id
      WHERE c.tailleur_id = ?
      ORDER BY c.date_commande DESC
    `, [req.params.tailleurId]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// GET /api/commandes/:id — Détail d'une commande + historique
router.get('/:id', async (req, res) => {
    try {
        const [commandes] = await pool.query(`
      SELECT c.*, m.titre as modele_titre, m.photo_url, t.nom_atelier as tailleur_nom,
             u.nom as client_nom, u.prenom as client_prenom
      FROM commande c
      JOIN modele m ON c.modele_id = m.id
      JOIN tailleur t ON c.tailleur_id = t.id
      JOIN client cl ON c.client_id = cl.id
      JOIN utilisateur u ON cl.utilisateur_id = u.id
      WHERE c.id = ?
    `, [req.params.id]);

        if (commandes.length === 0) return res.status(404).json({ error: 'Commande introuvable' });

        const commande = commandes[0];

        // Historique des statuts
        const [historique] = await pool.query(`
      SELECT libelle as statut, date_heure as date
      FROM statut_commande
      WHERE commande_id = ?
      ORDER BY date_heure ASC
    `, [commande.id]);

        commande.historique = historique;
        res.json(commande);
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// POST /api/commandes — Créer une commande
router.post('/', async (req, res) => {
    try {
        const { client_id, tailleur_id, modele_id, mesures_utilisees, tissu_choisi, couleur, prix_total, date_livraison_souhaitee, notes_client } = req.body;

        const [result] = await pool.query(`
      INSERT INTO commande 
      (client_id, tailleur_id, modele_id, mesures_utilisees, tissu_choisi, couleur, prix_total, date_livraison_souhaitee, notes_client) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
            client_id, tailleur_id, modele_id,
            JSON.stringify(mesures_utilisees || {}),
            tissu_choisi, couleur, prix_total,
            date_livraison_souhaitee || null,
            notes_client || null
        ]);

        // L'historique 'en_attente_acceptation' est créé automatiquement via trigger MySQL (ou on l'insère ici géré par trigger)
        // Ici on l'ajoute explicitement car le trigger se déclenche sur UPDATE, pas sur INSERT dans le SQL fourni. Wait, le trigger SQL était sur l'update de commande.
        await pool.query('INSERT INTO statut_commande (commande_id, libelle) VALUES (?, ?)', [result.insertId, 'en_attente_acceptation']);

        res.status(201).json({ id: result.insertId, message: 'Commande créée' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// PATCH /api/commandes/:id/statut — Mettre à jour le statut
router.patch('/:id/statut', async (req, res) => {
    try {
        const { statut } = req.body;
        let sql = 'UPDATE commande SET statut = ?';
        const params = [statut];

        if (statut === 'livre') {
            sql += ', date_livraison_reelle = CURRENT_DATE()';
        }

        sql += ' WHERE id = ?';
        params.push(req.params.id);

        await pool.query(sql, params);
        // Le trigger MySQL "log_statut_commande" insèrera la ligne dans "statut_commande"
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

module.exports = router;
