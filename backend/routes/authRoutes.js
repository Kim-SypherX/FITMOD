/**
 * FITMOD — Routes Auth (inscription / connexion)
 */
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../db');

// POST /api/auth/register
router.post('/register', async (req, res) => {
    try {
        const { nom, prenom, email, mot_de_passe, telephone, ville, type_compte,
            nom_atelier, adresse, quartier, specialites, tarif_min, delai_moyen } = req.body;

        // Vérifier si l'email existe déjà
        const [existing] = await pool.query('SELECT id FROM utilisateur WHERE email = ?', [email]);
        if (existing.length > 0) return res.status(400).json({ error: 'Cet email est déjà utilisé' });

        // Hasher le mot de passe
        const hash = await bcrypt.hash(mot_de_passe, 10);

        // Créer l'utilisateur
        const [result] = await pool.query(
            'INSERT INTO utilisateur (nom, prenom, email, mot_de_passe, telephone, ville, type_compte) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [nom, prenom, email, hash, telephone || null, ville || null, type_compte || 'client']
        );
        const userId = result.insertId;

        // Créer le profil étendu
        if (type_compte === 'tailleur') {
            await pool.query(
                'INSERT INTO tailleur (utilisateur_id, nom_atelier, adresse, quartier, specialites, tarif_min, delai_moyen) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [userId, nom_atelier || '', adresse || null, quartier || null,
                    specialites || null, tarif_min || 0, delai_moyen || null]
            );
        } else {
            await pool.query('INSERT INTO client (utilisateur_id) VALUES (?)', [userId]);
        }

        // Récupérer le profil complet
        const user = await getUserProfile(userId);
        res.status(201).json(user);
    } catch (err) {
        console.error('Erreur inscription:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { email, mot_de_passe } = req.body;

        const [rows] = await pool.query('SELECT * FROM utilisateur WHERE email = ?', [email]);
        if (rows.length === 0) return res.status(401).json({ error: 'Email ou mot de passe incorrect' });

        const user = rows[0];
        const valid = await bcrypt.compare(mot_de_passe, user.mot_de_passe);
        if (!valid) return res.status(401).json({ error: 'Email ou mot de passe incorrect' });

        const profile = await getUserProfile(user.id);
        res.json(profile);
    } catch (err) {
        console.error('Erreur connexion:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Fonction utilitaire : récupérer le profil complet
async function getUserProfile(userId) {
    const [users] = await pool.query(
        'SELECT id, nom, prenom, email, telephone, ville, type_compte, date_inscription FROM utilisateur WHERE id = ?',
        [userId]
    );
    if (users.length === 0) return null;
    const user = users[0];

    if (user.type_compte === 'tailleur') {
        const [taileurs] = await pool.query('SELECT * FROM tailleur WHERE utilisateur_id = ?', [userId]);
        if (taileurs.length > 0) user.tailleur = taileurs[0];
    } else if (user.type_compte === 'client') {
        const [clients] = await pool.query('SELECT * FROM client WHERE utilisateur_id = ?', [userId]);
        if (clients.length > 0) user.client = clients[0];
    }

    return user;
}

module.exports = router;
