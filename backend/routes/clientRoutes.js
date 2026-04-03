/**
 * FITMOD — Routes Client
 * Gestion des mesures corporelles et favoris
 */

const express = require('express');
const router = express.Router();

// ============================================================
// POST /api/client/mesures
// Sauvegarde les mesures corporelles d'un client
// ============================================================
router.post('/mesures', async (req, res) => {
    try {
        const {
            clientId,
            poitrine,
            taille,
            hanches,
            longueurDos,
            longueurBras,
            entrejambe,
            tailleReelle,
            mesuresJson
        } = req.body;

        // Validation basique
        if (!clientId) {
            return res.status(400).json({ error: 'clientId est requis' });
        }

        // NOTE : En production, ici on ferait la requête MySQL
        // const mysql = require('mysql2/promise');
        // const connection = await mysql.createConnection(process.env.DATABASE_URL);
        // await connection.execute(
        //   `UPDATE client SET poitrine=?, taille=?, hanches=?, longueur_dos=?,
        //    longueur_bras=?, entrejambe=?, taille_reelle=?, mesures_json=?
        //    WHERE utilisateur_id=?`,
        //   [poitrine, taille, hanches, longueurDos, longueurBras,
        //    entrejambe, tailleReelle, JSON.stringify(mesuresJson), clientId]
        // );

        // Réponse de succès (mode démo sans BDD)
        console.log('📏 Mesures reçues pour client:', clientId);
        console.log('   Poitrine:', poitrine, 'cm');
        console.log('   Taille:', taille, 'cm');
        console.log('   Hanches:', hanches, 'cm');
        console.log('   Dos:', longueurDos, 'cm');
        console.log('   Bras:', longueurBras, 'cm');
        console.log('   Entrejambe:', entrejambe, 'cm');

        res.json({
            success: true,
            message: 'Mesures sauvegardées avec succès',
            data: {
                clientId,
                poitrine,
                taille,
                hanches,
                longueurDos,
                longueurBras,
                entrejambe,
                tailleReelle
            }
        });
    } catch (error) {
        console.error('❌ Erreur sauvegarde mesures:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
});

// ============================================================
// POST /api/client/favoris
// Ajoute un modèle aux favoris (déclenché par geste 👍)
// ============================================================
router.post('/favoris', async (req, res) => {
    try {
        const { clientId, modeleId } = req.body;

        if (!clientId || !modeleId) {
            return res.status(400).json({ error: 'clientId et modeleId sont requis' });
        }

        console.log('⭐ Favori ajouté — Client:', clientId, '→ Modèle:', modeleId);

        res.json({
            success: true,
            message: 'Modèle ajouté aux favoris',
            data: { clientId, modeleId }
        });
    } catch (error) {
        console.error('❌ Erreur ajout favori:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
});

module.exports = router;
