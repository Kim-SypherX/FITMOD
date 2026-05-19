/**
 * FITMOD — Routes Admin (Statistiques du tableau de bord global)
 */
const express = require('express');
const router = express.Router();
const pool = require('../db');
const { sendTailorValidationEmail } = require('../services/mailerService');

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

        // Récents
        const [recent_tailleurs] = await pool.query(`
            SELECT t.id, t.nom_atelier, u.nom, u.prenom, u.ville, u.date_inscription as date_creation, t.statut
            FROM tailleur t
            JOIN utilisateur u ON t.utilisateur_id = u.id
            ORDER BY u.date_inscription DESC LIMIT 5
        `);
        const [recent_commandes] = await pool.query(`
            SELECT c.id, c.prix_total, c.statut, m.titre as modele_titre
            FROM commande c
            JOIN modele m ON c.modele_id = m.id
            ORDER BY c.date_commande DESC LIMIT 5
        `);

        res.json({
            totalClients: clients.count,
            totalTailleurs: tailleurs.count,
            totalCommandes: commandes.count,
            totalRevenu: revenus.total || 0,
            noteMoyenne: note.avg ? parseFloat(note.avg).toFixed(1) : 0,
            commandesByStatut: statutsCount,
            recent_tailleurs,
            recent_commandes
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
        
        // Obtenir les infos du tailleur AVANT de mettre à jour pour savoir s'il était déjà actif
        const [tailleurs] = await pool.query(
            'SELECT t.statut, u.email, u.nom, u.prenom FROM tailleur t JOIN utilisateur u ON t.utilisateur_id = u.id WHERE t.id = ?', 
            [req.params.id]
        );

        await pool.query('UPDATE tailleur SET statut = ? WHERE id = ?', [statut, req.params.id]);

        // Si le statut passe à actif et qu'il ne l'était pas avant, on notifie !
        if (statut === 'actif' && tailleurs.length > 0 && tailleurs[0].statut !== 'actif') {
            const tInfo = tailleurs[0];
            sendTailorValidationEmail(tInfo.email, tInfo.prenom || tInfo.nom).catch(console.error);
        }

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

// GET /api/admin/conversations_list
router.get('/conversations_list', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT 
                LEAST(m.expediteur_id, m.destinataire_id) AS user1_id,
                GREATEST(m.expediteur_id, m.destinataire_id) AS user2_id,
                MAX(m.date_heure) AS last_activity,
                COUNT(m.id) AS total_messages,
                u1.nom as u1_nom, u1.prenom as u1_prenom, u1.type_compte as u1_type,
                u2.nom as u2_nom, u2.prenom as u2_prenom, u2.type_compte as u2_type
            FROM message m
            JOIN utilisateur u1 ON LEAST(m.expediteur_id, m.destinataire_id) = u1.id
            JOIN utilisateur u2 ON GREATEST(m.expediteur_id, m.destinataire_id) = u2.id
            GROUP BY user1_id, user2_id, u1_nom, u1_prenom, u1_type, u2_nom, u2_prenom, u2_type
            ORDER BY last_activity DESC
            LIMIT 100
        `);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// GET /api/admin/conversations/historique/:idA/:idB
router.get('/conversations/historique/:idA/:idB', async (req, res) => {
    try {
        const { idA, idB } = req.params;
        const [rows] = await pool.query(`
            SELECT m.*, u.nom, u.prenom, u.type_compte
            FROM message m
            JOIN utilisateur u ON m.expediteur_id = u.id
            WHERE (m.expediteur_id = ? AND m.destinataire_id = ?) 
               OR (m.expediteur_id = ? AND m.destinataire_id = ?)
            ORDER BY m.date_heure ASC
        `, [idA, idB, idB, idA]);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// POST /api/admin/conversations/avertissement
router.post('/conversations/avertissement', async (req, res) => {
    try {
        // L'admin ID est dans req.user.userId
        const adminId = req.user.userId;
        const { cible_id, message_texte } = req.body;
        
        if(!cible_id || !message_texte) return res.status(400).json({ error: 'Données manquantes' });

        await pool.query(
            "INSERT INTO message (expediteur_id, destinataire_id, contenu, type, date_heure, lu) VALUES (?, ?, ?, 'TEXT', NOW(), 0)",
            [adminId, cible_id, message_texte]
        );
        res.json({ message: 'Avertissement envoyé avec succès' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// GET /api/admin/favoris
router.get('/favoris', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT f.id, f.date_ajout,
                   u.nom as client_nom, u.prenom as client_prenom,
                   m.titre as modele_titre, m.photo_url as modele_image,
                   ut.nom as tailleur_nom, ut.prenom as tailleur_prenom, t.nom_atelier
            FROM favori f
            JOIN client c ON f.client_id = c.id
            JOIN utilisateur u ON c.utilisateur_id = u.id
            JOIN modele m ON f.modele_id = m.id
            JOIN tailleur t ON m.tailleur_id = t.id
            JOIN utilisateur ut ON t.utilisateur_id = ut.id
            ORDER BY f.date_ajout DESC
            LIMIT 200
        `);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

module.exports = router;
