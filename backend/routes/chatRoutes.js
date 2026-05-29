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
                   u.prenom as expediteur_prenom,
                   r.contenu as reponse_a_contenu,
                   r.type as reponse_a_type,
                   r.is_deleted as reponse_a_is_deleted,
                   ru.prenom as reponse_a_prenom
            FROM message m
            JOIN utilisateur u ON m.expediteur_id = u.id
            LEFT JOIN message r ON m.reponse_a_id = r.id
            LEFT JOIN utilisateur ru ON r.expediteur_id = ru.id
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
            WHERE expediteur_id = ? AND destinataire_id = ? AND lu = 0
        `, [partnerId, userId]);

        const processedRows = rows.map(row => {
            if (typeof row.reactions === 'string') {
                try {
                    row.reactions = JSON.parse(row.reactions);
                } catch(e) {
                    row.reactions = {};
                }
            }
            return row;
        });

        res.json(processedRows);
    } catch (err) {
        console.error('Error loading messages:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ─── POST /api/chat/messages ───
// Envoyer un message (texte)
router.post('/messages', async (req, res) => {
    try {
        const { expediteur_id, destinataire_id, contenu, type = 'TEXT', reponse_a_id = null } = req.body;
        if (!contenu || !contenu.trim()) return res.status(400).json({ error: 'Contenu vide' });

        const [result] = await pool.query(`
            INSERT INTO message (expediteur_id, destinataire_id, contenu, type, commande_id, reponse_a_id)
            VALUES (?, ?, ?, ?, NULL, ?)
        `, [expediteur_id, destinataire_id, contenu.trim(), type, reponse_a_id]);

        const [newMsg] = await pool.query(`
            SELECT m.*, u.nom as expediteur_nom, u.prenom as expediteur_prenom,
                   r.contenu as reponse_a_contenu, r.type as reponse_a_type,
                   r.is_deleted as reponse_a_is_deleted, ru.prenom as reponse_a_prenom
            FROM message m
            JOIN utilisateur u ON m.expediteur_id = u.id
            LEFT JOIN message r ON m.reponse_a_id = r.id
            LEFT JOIN utilisateur ru ON r.expediteur_id = ru.id
            WHERE m.id = ?
        `, [result.insertId]);

        const msg = newMsg[0];

        // Émettre via Socket.IO si disponible
        const io = req.app.get('io');
        if (io) {
            const room = [parseInt(expediteur_id), parseInt(destinataire_id)].sort().join('_');
            // On notifie la discussion ouverte + la room globale du destinataire et de l'expéditeur
            io.to([`chat_${room}`, `user_${destinataire_id}`, `user_${expediteur_id}`]).emit('new_message', msg);
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
        const { expediteur_id, destinataire_id, reponse_a_id = null } = req.body;

        const [result] = await pool.query(`
            INSERT INTO message (expediteur_id, destinataire_id, contenu, type, commande_id, reponse_a_id)
            VALUES (?, ?, ?, 'AUDIO', NULL, ?)
        `, [expediteur_id, destinataire_id, audioUrl, reponse_a_id]);

        const [newMsg] = await pool.query(`
            SELECT m.*, u.nom as expediteur_nom, u.prenom as expediteur_prenom,
                   r.contenu as reponse_a_contenu, r.type as reponse_a_type,
                   r.is_deleted as reponse_a_is_deleted, ru.prenom as reponse_a_prenom
            FROM message m
            JOIN utilisateur u ON m.expediteur_id = u.id
            LEFT JOIN message r ON m.reponse_a_id = r.id
            LEFT JOIN utilisateur ru ON r.expediteur_id = ru.id
            WHERE m.id = ?
        `, [result.insertId]);

        const msg = newMsg[0];

        // Émettre via Socket.IO
        const io = req.app.get('io');
        if (io) {
            const room = [parseInt(expediteur_id), parseInt(destinataire_id)].sort().join('_');
            io.to([`chat_${room}`, `user_${destinataire_id}`, `user_${expediteur_id}`]).emit('new_message', msg);
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
            WHERE expediteur_id = ? AND destinataire_id = ? AND lu = 0
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

// ─── PUT /api/chat/messages/:id ───
// Modifier un message (limite 15 minutes, uniquement originellement de type TEXT)
router.put('/messages/:id', async (req, res) => {
    try {
        const messageId = req.params.id;
        const { expediteur_id, contenu } = req.body;

        const [msgRows] = await pool.query('SELECT * FROM message WHERE id = ? AND (expediteur_id = ? OR destinataire_id = ?)', [messageId, expediteur_id, expediteur_id]);
        if (msgRows.length === 0) return res.status(404).json({ error: 'Message introuvable ou non autorisé' });

        const msg = msgRows[0];
        
        if (msg.type !== 'texte' && msg.type !== 'TEXT') {
            return res.status(403).json({ error: 'Les médias et vocaux ne peuvent pas être modifiés' });
        }

        const msgDateMs = new Date(msg.date_heure).getTime();
        const diffMins = (Date.now() - msgDateMs) / (1000 * 60);

        if (diffMins > 15) {
            return res.status(403).json({ error: 'Délai de modification de 15 minutes dépassé' });
        }

        if (!contenu || !contenu.trim()) return res.status(400).json({ error: 'Contenu vide interdit' });

        await pool.query('UPDATE message SET contenu = ?, is_edited = 1 WHERE id = ?', [contenu.trim(), messageId]);

        const updatedMsg = { ...msg, contenu: contenu.trim(), is_edited: 1 };
        
        const io = req.app.get('io');
        if (io) {
            const room = [parseInt(msg.expediteur_id), parseInt(msg.destinataire_id)].sort().join('_');
            io.to([`chat_${room}`, `user_${msg.destinataire_id}`, `user_${msg.expediteur_id}`]).emit('message_edited', updatedMsg);
        }

        res.json(updatedMsg);
    } catch (err) {
        console.error('Error edit message:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ─── DELETE /api/chat/messages/:id ───
// Supprimer un message (soft delete)
router.delete('/messages/:id', async (req, res) => {
    try {
        const messageId = req.params.id;
        const expediteur_id = req.query.expediteur_id;

        const [msgRows] = await pool.query('SELECT * FROM message WHERE id = ? AND (expediteur_id = ? OR destinataire_id = ?)', [messageId, expediteur_id, expediteur_id]);
        if (msgRows.length === 0) return res.status(404).json({ error: 'Message introuvable ou non autorisé' });
        
        const msg = msgRows[0];

        await pool.query('UPDATE message SET is_deleted = 1 WHERE id = ?', [messageId]);

        const io = req.app.get('io');
        if (io) {
            const room = [parseInt(msg.expediteur_id), parseInt(msg.destinataire_id)].sort().join('_');
            io.to([`chat_${room}`, `user_${msg.destinataire_id}`, `user_${msg.expediteur_id}`]).emit('message_deleted', { id: parseInt(messageId) });
        }

        res.json({ success: true, id: messageId });
    } catch (err) {
        console.error('Error delete message:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ─── PUT /api/chat/messages/:id/react ───
// Ajouter ou modifier une réaction
router.put('/messages/:id/react', async (req, res) => {
    try {
        const messageId = req.params.id;
        const { expediteur_id, emoji } = req.body;

        const [msgRows] = await pool.query('SELECT * FROM message WHERE id = ?', [messageId]);
        if (msgRows.length === 0) return res.status(404).json({ error: 'Message introuvable' });

        const msg = msgRows[0];
        let reactions = msg.reactions;
        
        // Ensure reactions is a proper object
        if (typeof reactions === 'string') {
            try { reactions = JSON.parse(reactions); } catch(e) { reactions = {}; }
        }
        if (!reactions || typeof reactions !== 'object') {
            reactions = {};
        }

        if (emoji === null || emoji === '') {
            delete reactions[expediteur_id];
        } else {
            reactions[expediteur_id] = emoji;
        }

        await pool.query('UPDATE message SET reactions = ? WHERE id = ?', [JSON.stringify(reactions), messageId]);

        const io = req.app.get('io');
        if (io) {
            const room = [parseInt(msg.expediteur_id), parseInt(msg.destinataire_id)].sort().join('_');
            io.to([`chat_${room}`, `user_${msg.destinataire_id}`, `user_${msg.expediteur_id}`]).emit('message_reacted', { id: parseInt(messageId), reactions });
        }

        res.json({ success: true, reactions });
    } catch (err) {
        console.error('Error reacting:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

module.exports = router;

