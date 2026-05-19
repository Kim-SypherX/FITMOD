/**
 * FITMOD — Proxy VTON (Virtual Try-On)
 * =====================================
 * Proxy les appels vers Hugging Face Spaces (Kolors VTON)
 * Gradio 4.x utilise un système de queue (queue/join + queue/data)
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const uploadMiddleware = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const VTON_SPACE = 'https://Kwai-Kolors-Kolors-Virtual-Try-On.hf.space';

// POST /api/vton/upload — Proxy upload de fichier vers Gradio
router.post('/upload', uploadMiddleware.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Aucun fichier fourni' });

        const fetch = (await import('node-fetch')).default;
        const { FormData, Blob } = await import('node-fetch');

        const blob = new Blob([req.file.buffer], { type: req.file.mimetype });
        const formData = new FormData();
        formData.append('files', blob, req.file.originalname || 'image.png');

        const resp = await fetch(`${VTON_SPACE}/upload`, {
            method: 'POST',
            body: formData,
        });

        if (!resp.ok) {
            const text = await resp.text();
            console.error('VTON upload error:', resp.status, text);
            return res.status(resp.status).json({ error: `Upload HF échoué: ${resp.status}` });
        }

        const data = await resp.json();
        res.json(data);
    } catch (err) {
        console.error('Proxy upload error:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/vton/predict — Gradio 4.x queue-based prediction (SSE streaming)
router.post('/predict', async (req, res) => {
    try {
        const fetch = (await import('node-fetch')).default;
        const sessionHash = Math.random().toString(36).substring(2, 15);

        // Step 1: Join the queue
        const joinResp = await fetch(`${VTON_SPACE}/queue/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...req.body,
                session_hash: sessionHash,
            }),
        });

        if (!joinResp.ok) {
            const text = await joinResp.text();
            console.error('VTON queue/join error:', joinResp.status, text);
            return res.status(joinResp.status).json({ error: `Queue join échoué: ${joinResp.status}` });
        }

        const joinData = await joinResp.json();
        console.log('VTON queue joined, event_id:', joinData.event_id);

        // Step 2: Read SSE stream chunk by chunk with a 300s timeout
        const result = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Timeout: l\'IA met trop de temps (>300s)'));
            }, 300000);

            fetch(`${VTON_SPACE}/queue/data?session_hash=${sessionHash}`, {
                headers: { 'Accept': 'text/event-stream' },
            }).then(dataResp => {
                if (!dataResp.ok) {
                    clearTimeout(timeout);
                    reject(new Error(`Queue data échoué: ${dataResp.status}`));
                    return;
                }

                let buffer = '';
                const reader = dataResp.body;

                reader.on('data', (chunk) => {
                    buffer += chunk.toString();
                    // Process complete lines
                    const lines = buffer.split('\n');
                    buffer = lines.pop(); // Keep incomplete last line

                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            try {
                                const parsed = JSON.parse(line.substring(6));
                                console.log('VTON SSE msg:', parsed.msg);

                                if (parsed.msg === 'process_completed') {
                                    clearTimeout(timeout);
                                    if (parsed.success === false) {
                                        reject(new Error(`IA erreur interne: ${JSON.stringify(parsed)}`));
                                    } else if (parsed.output) {
                                        resolve(parsed.output);
                                    } else {
                                        reject(new Error('IA: traitement échoué, output manquant'));
                                    }
                                    reader.destroy();
                                    return;
                                }
                            } catch (e) {
                                // Skip unparseable lines
                            }
                        }
                    }
                });

                reader.on('end', () => {
                    clearTimeout(timeout);
                    // Check remaining buffer
                    if (buffer.startsWith('data: ')) {
                        try {
                            const parsed = JSON.parse(buffer.substring(6));
                            if (parsed.msg === 'process_completed' && parsed.output) {
                                resolve(parsed.output);
                                return;
                            }
                        } catch (e) {}
                    }
                    reject(new Error('Stream terminé sans résultat'));
                });

                reader.on('error', (err) => {
                    clearTimeout(timeout);
                    reject(err);
                });
            }).catch(err => {
                clearTimeout(timeout);
                reject(err);
            });
        });

        console.log('VTON final result:', JSON.stringify(result).substring(0, 100) + '...');
        res.json(result);

    } catch (err) {
        console.error('Proxy predict error:', err.message);
        res.status(500).json({ error: err ? err.message : 'Unknown error', stack: err ? err.stack : null });
    }
});

// GET /api/vton/file/* — Proxy pour récupérer les fichiers résultats
router.get('/file/*', async (req, res) => {
    try {
        const fetch = (await import('node-fetch')).default;
        const filePath = req.params[0];

        const resp = await fetch(`${VTON_SPACE}/file=${filePath}`);
        if (!resp.ok) return res.status(resp.status).send('File not found');

        res.set('Content-Type', resp.headers.get('content-type'));
        res.set('Cross-Origin-Resource-Policy', 'cross-origin');
        const buffer = await resp.arrayBuffer();
        res.send(Buffer.from(buffer));
    } catch (err) {
        console.error('Proxy file error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
