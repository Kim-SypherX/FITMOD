/**
 * FITMOD — Routes Chat (conversations client ↔ tailleur)
 * Messages texte + audio, avec Socket.IO temps réel
 */
const express = require('express');
const router = express.Router();
const pool = require('../db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ─── Audio upload config ───
const audioDir = path.join(process.env.UPLOAD_DIR || './uploads', 'audio');
if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });

const audioStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, audioDir),
    filename: (req, file, cb) => {
        const name = `voice_${Date.now()}_${Math.round(Math.random() * 1000)}.webm`;
        cb(null, name);
    }
});

const audioUpload = multer({
    storage: audioStorage,
    fileFilter: (req, file, cb) => {
        const allowed = /webm|ogg|mp3|wav|m4a/;
        const ext = allowed.test(path.extname(file.originalname).toLowerCase());
        cb(null, ext || file.mimetype.startsWith('audio/'));
    },
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB max
});

// ─── GET /api/chat/conversations/:userId ───
// Liste des conversations d'un utilisateur (groupées par partenaire)
router.get('/conversations/:userId', async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);

        const [rows] = await pool.query(`
            SELECT 
                partner_id,
                partner_nom,
                partner_prenom,
                partner_type,
                partner_atelier,
                dernier_message,
                dernier_type,
                date_dernier,
                non_lus
            FROM (
                SELECT 
                    CASE WHEN m.expediteur_id = ? THEN m.destinataire_id ELSE m.expediteur_id END as partner_id,
                    u2.nom as partner_nom,
                    u2.prenom as partner_prenom,
                    u2.type_compte as partner_type,
                    COALESCE(t.nom_atelier, CONCAT(u2.prenom, ' ', u2.nom)) as partner_atelier,
                    m.contenu as dernier_message,
                    m.type as dernier_type,
                    m.date_heure as date_dernier,
                    (SELECT COUNT(*) FROM message m2 
                     WHERE m2.destinataire_id = ? 
                     AND m2.expediteur_id = CASE WHEN m.expediteur_id = ? THEN m.destinataire_id ELSE m.expediteur_id END
                     AND m2.lu = 0
                     AND m2.commande_id IS NULL
                    ) as non_lus,
                    ROW_NUMBER() OVER (
                        PARTITION BY LEAST(m.expediteur_id, m.destinataire_id), GREATEST(m.expediteur_id, m.destinataire_id)
                        ORDER BY m.date_heure DESC
                    ) as rn
                FROM message m
                JOIN utilisateur u2 ON u2.id = CASE WHEN m.expediteur_id = ? THEN m.destinataire_id ELSE m.expediteur_id END
                LEFT JOIN tailleur t ON t.utilisateur_id = u2.id
                WHERE (m.expediteur_id = ? OR m.destinataire_id = ?)
                AND m.destinataire_id IS NOT NULL
            ) sub
            WHERE rn = 1
            ORDER BY date_dernier DESC
        `, [userId, userId, userId, userId, userId, userId]);

        res.json(rows);
    } catch (err) {
        console.error('Error loading conversations:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ─── GET /api/chat/messages/:userId/:partnerId ───
// Historique des messages entre 2 utilisateurs
router.get('/messages/:userId/:partnerId', async (req, res) => {
    try {
        const { userId, partnerId } = req.params;

        const [rows] = await pool.query(`
            SELECT m.*, 
                   u.nom as expediteur_nom, 
                   u.prenom as expediteur_prenom
            FROM message m
            JOIN utilisateur u ON m.expediteur_id = u.id
            WHERE m.destinataire_id IS NOT NULL
            AND (
                (m.expediteur_id = ? AND m.destinataire_id = ?)
                OR (m.expediteur_id = ? AND m.destinataire_id = ?)
            )
            ORDER BY m.date_heure ASC
        `, [userId, partnerId, partnerId, userId]);

        // Marquer comme lus les messages reçus
        await pool.query(`
            UPDATE message SET lu = 1
            WHERE expediteur_id = ? AND destinataire_id = ? AND lu = 0 AND commande_id IS NULL
        `, [partnerId, userId]);

        res.json(rows);
    } catch (err) {
        console.error('Error loading messages:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ─── POST /api/chat/messages ───
// Envoyer un message (texte)
router.post('/messages', async (req, res) => {
    try {
        const { expediteur_id, destinataire_id, contenu, type = 'TEXT' } = req.body;
        if (!contenu || !contenu.trim()) return res.status(400).json({ error: 'Contenu vide' });

        const [result] = await pool.query(`
            INSERT INTO message (expediteur_id, destinataire_id, contenu, type, commande_id)
            VALUES (?, ?, ?, ?, NULL)
        `, [expediteur_id, destinataire_id, contenu.trim(), type]);

        const [newMsg] = await pool.query(`
            SELECT m.*, u.nom as expediteur_nom, u.prenom as expediteur_prenom
            FROM message m
            JOIN utilisateur u ON m.expediteur_id = u.id
            WHERE m.id = ?
        `, [result.insertId]);

        const msg = newMsg[0];

        // Émettre via Socket.IO si disponible
        const io = req.app.get('io');
        if (io) {
            const room = [parseInt(expediteur_id), parseInt(destinataire_id)].sort().join('_');
            io.to(`chat_${room}`).emit('new_message', msg);
        }

        res.status(201).json(msg);
    } catch (err) {
        console.error('Error sending message:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ─── POST /api/chat/upload-audio ───
// Upload d'un message vocal
router.post('/upload-audio', audioUpload.single('audio'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Aucun fichier audio' });

        const audioUrl = `/uploads/audio/${req.file.filename}`;
        const { expediteur_id, destinataire_id } = req.body;

        const [result] = await pool.query(`
            INSERT INTO message (expediteur_id, destinataire_id, contenu, type, commande_id)
            VALUES (?, ?, ?, 'AUDIO', NULL)
        `, [expediteur_id, destinataire_id, audioUrl]);

        const [newMsg] = await pool.query(`
            SELECT m.*, u.nom as expediteur_nom, u.prenom as expediteur_prenom
            FROM message m
            JOIN utilisateur u ON m.expediteur_id = u.id
            WHERE m.id = ?
        `, [result.insertId]);

        const msg = newMsg[0];

        // Émettre via Socket.IO
        const io = req.app.get('io');
        if (io) {
            const room = [parseInt(expediteur_id), parseInt(destinataire_id)].sort().join('_');
            io.to(`chat_${room}`).emit('new_message', msg);
        }

        res.status(201).json(msg);
    } catch (err) {
        console.error('Error uploading audio:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ─── PATCH /api/chat/messages/read ───
router.patch('/messages/read', async (req, res) => {
    try {
        const { expediteur_id, destinataire_id } = req.body;
        await pool.query(`
            UPDATE message SET lu = 1
            WHERE expediteur_id = ? AND destinataire_id = ? AND lu = 0 AND commande_id IS NULL
        `, [expediteur_id, destinataire_id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ─── GET /api/chat/user-info/:userId ───
// Infos basiques d'un utilisateur pour le header du chat
router.get('/user-info/:userId', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT u.id, u.nom, u.prenom, u.type_compte,
                   COALESCE(t.nom_atelier, CONCAT(u.prenom, ' ', u.nom)) as display_name
            FROM utilisateur u
            LEFT JOIN tailleur t ON t.utilisateur_id = u.id
            WHERE u.id = ?
        `, [req.params.userId]);

        if (rows.length === 0) return res.status(404).json({ error: 'Utilisateur non trouvé' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

module.exports = router;
