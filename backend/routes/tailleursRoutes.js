/**
 * FITMOD — Routes Tailleurs (catalogue, profil, portfolio, modèles)
 */
const express = require('express');
const router = express.Router();
const pool = require('../db');
const upload = require('../upload');

// GET /api/tailleurs — Liste avec filtres
router.get('/', async (req, res) => {
    try {
        const { ville, specialite, note_min, search } = req.query;
        let sql = `
      SELECT t.*, u.nom, u.prenom, u.telephone, u.ville, u.email
      FROM tailleur t
      JOIN utilisateur u ON t.utilisateur_id = u.id
      WHERE t.statut = 'actif' AND u.actif = 1
    `;
        const params = [];

        if (ville) { sql += ' AND u.ville = ?'; params.push(ville); }
        if (specialite) { sql += ' AND t.specialites LIKE ?'; params.push(`%${specialite}%`); }
        if (note_min) { sql += ' AND t.note_moyenne >= ?'; params.push(parseFloat(note_min)); }
        if (search) {
            sql += ' AND (u.nom LIKE ? OR u.prenom LIKE ? OR t.nom_atelier LIKE ?)';
            const q = `%${search}%`;
            params.push(q, q, q);
        }

        sql += ' ORDER BY t.note_moyenne DESC';

        const [rows] = await pool.query(sql, params);
        res.json(rows);
    } catch (err) {
        console.error('Erreur liste tailleurs:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// GET /api/tailleurs/:id — Profil détaillé
router.get('/:id', async (req, res) => {
    try {
        const [rows] = await pool.query(`
      SELECT t.*, u.nom, u.prenom, u.telephone, u.ville, u.email
      FROM tailleur t
      JOIN utilisateur u ON t.utilisateur_id = u.id
      WHERE t.id = ?
    `, [req.params.id]);

        if (rows.length === 0) return res.status(404).json({ error: 'Tailleur non trouvé' });

        const tailleur = rows[0];

        // Récupérer les modèles
        const [modeles] = await pool.query('SELECT * FROM modele WHERE tailleur_id = ? AND actif = 1', [tailleur.id]);
        tailleur.modeles = modeles;

        // Récupérer le portfolio
        const [portfolio] = await pool.query('SELECT * FROM portfolio WHERE tailleur_id = ? ORDER BY date_upload DESC', [tailleur.id]);
        tailleur.portfolio = portfolio;

        // Récupérer les avis
        const [avis] = await pool.query(`
      SELECT a.*, u.nom as client_nom, u.prenom as client_prenom
      FROM avis a
      JOIN client c ON a.client_id = c.id
      JOIN utilisateur u ON c.utilisateur_id = u.id
      WHERE a.tailleur_id = ?
      ORDER BY a.date_avis DESC
    `, [tailleur.id]);
        tailleur.avis = avis;

        res.json(tailleur);
    } catch (err) {
        console.error('Erreur profil tailleur:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// PUT /api/tailleurs/:id — Modifier profil
router.put('/:id', async (req, res) => {
    try {
        const { nom_atelier, adresse, quartier, specialites, tarif_min, delai_moyen, statut } = req.body;
        await pool.query(
            'UPDATE tailleur SET nom_atelier=?, adresse=?, quartier=?, specialites=?, tarif_min=?, delai_moyen=?, statut=? WHERE id=?',
            [nom_atelier, adresse, quartier, specialites, tarif_min, delai_moyen, statut, req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Erreur update tailleur:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// --- MODELES ---

// GET /api/tailleurs/:id/modeles
router.get('/:id/modeles', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM modele WHERE tailleur_id = ? AND actif = 1 ORDER BY date_creation DESC', [req.params.id]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// POST /api/tailleurs/:id/modeles — Créer un modèle
router.post('/:id/modeles', (req, res, next) => { req.uploadType = 'modeles'; next(); }, upload.single('photo'), async (req, res) => {
    try {
        const { titre, description, type_tenue, prix_base, delai_confection, couleurs_disponibles } = req.body;
        const photo_url = req.file ? `/uploads/modeles/${req.file.filename}` : null;

        const [result] = await pool.query(
            'INSERT INTO modele (tailleur_id, titre, description, type_tenue, photo_url, prix_base, delai_confection, couleurs_disponibles) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [req.params.id, titre, description, type_tenue, photo_url, prix_base || 0, delai_confection || null, couleurs_disponibles || null]
        );
        res.status(201).json({ id: result.insertId, photo_url });
    } catch (err) {
        console.error('Erreur création modèle:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// PUT /api/tailleurs/modeles/:modeleId
router.put('/modeles/:modeleId', (req, res, next) => { req.uploadType = 'modeles'; next(); }, upload.single('photo'), async (req, res) => {
    try {
        const { titre, description, type_tenue, prix_base, delai_confection, couleurs_disponibles, actif } = req.body;
        let sql = 'UPDATE modele SET titre=?, description=?, type_tenue=?, prix_base=?, delai_confection=?, couleurs_disponibles=?, actif=?';
        const params = [titre, description, type_tenue, prix_base, delai_confection, couleurs_disponibles, actif ?? 1];

        if (req.file) {
            sql += ', photo_url=?';
            params.push(`/uploads/modeles/${req.file.filename}`);
        }
        sql += ' WHERE id=?';
        params.push(req.params.modeleId);

        await pool.query(sql, params);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// DELETE /api/tailleurs/modeles/:modeleId
router.delete('/modeles/:modeleId', async (req, res) => {
    try {
        await pool.query('UPDATE modele SET actif = 0 WHERE id = ?', [req.params.modeleId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// --- PORTFOLIO ---

// GET /api/tailleurs/:id/portfolio
router.get('/:id/portfolio', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM portfolio WHERE tailleur_id = ? ORDER BY date_upload DESC', [req.params.id]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// POST /api/tailleurs/:id/portfolio
router.post('/:id/portfolio', (req, res, next) => { req.uploadType = 'portfolio'; next(); }, upload.single('photo'), async (req, res) => {
    try {
        const photo_url = req.file ? `/uploads/portfolio/${req.file.filename}` : null;
        if (!photo_url) return res.status(400).json({ error: 'Photo requise' });

        const [result] = await pool.query(
            'INSERT INTO portfolio (tailleur_id, photo_url, legende) VALUES (?, ?, ?)',
            [req.params.id, photo_url, req.body.legende || null]
        );
        res.status(201).json({ id: result.insertId, photo_url });
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// DELETE /api/tailleurs/portfolio/:photoId
router.delete('/portfolio/:photoId', async (req, res) => {
    try {
        await pool.query('DELETE FROM portfolio WHERE id = ?', [req.params.photoId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// GET /api/tailleurs/modeles/all — Tous les modèles (pour le catalogue)
router.get('/modeles/all', async (req, res) => {
    try {
        const { type_tenue, prix_max, search } = req.query;
        let sql = `
      SELECT m.*, t.nom_atelier, u.ville
      FROM modele m
      JOIN tailleur t ON m.tailleur_id = t.id
      JOIN utilisateur u ON t.utilisateur_id = u.id
      WHERE m.actif = 1
    `;
        const params = [];

        if (type_tenue) { sql += ' AND m.type_tenue = ?'; params.push(type_tenue); }
        if (prix_max) { sql += ' AND m.prix_base <= ?'; params.push(parseFloat(prix_max)); }
        if (search) { sql += ' AND (m.titre LIKE ? OR m.description LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }

        sql += ' ORDER BY m.date_creation DESC';

        const [rows] = await pool.query(sql, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

module.exports = router;
