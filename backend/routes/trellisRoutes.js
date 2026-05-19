/**
 * FITMOD — Routes TRELLIS (Image → 3D)
 * ======================================
 * POST /api/trellis/generate — Générer un GLB depuis une image
 * GET  /api/trellis/models   — Lister les modèles 3D disponibles
 * GET  /api/trellis/models/:filename — Télécharger un GLB
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const multer = require('multer');
const trellis = require('../services/trellisService');

// Upload temporaire pour les images envoyées
const upload = multer({ 
    dest: '/tmp/fitmod-trellis-uploads/',
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB max
});

/**
 * POST /api/trellis/generate
 * Body: multipart/form-data avec champ 'image'
 * Retourne: { success, glbUrl, cached }
 */
router.post('/generate', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Image requise (champ "image")' });
        }

        console.log(`🔄 TRELLIS: Génération 3D pour ${req.file.originalname}...`);

        const result = await trellis.generateGLB(req.file.path, {
            seed: parseInt(req.body.seed) || 42,
        });

        // Nettoyer le fichier temporaire
        const fs = require('fs');
        fs.unlinkSync(req.file.path);

        if (result.success) {
            res.json({
                success: true,
                glbUrl: result.glbUrl,
                cached: result.cached || false,
                static: result.static || false,
            });
        } else {
            res.status(500).json({ success: false, error: result.error });
        }
    } catch (err) {
        console.error('❌ TRELLIS error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/trellis/models
 * Liste tous les modèles 3D disponibles
 */
router.get('/models', (req, res) => {
    try {
        const models = trellis.listModels();
        res.json({ models, provider: trellis.config.provider });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/trellis/status
 * État du service TRELLIS
 */
router.get('/status', (req, res) => {
    res.json({
        provider: trellis.config.provider,
        outputDir: trellis.config.outputDir,
        cacheEnabled: trellis.config.enableCache,
        modelsCount: trellis.listModels().length,
    });
});

module.exports = router;
