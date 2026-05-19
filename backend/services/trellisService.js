/**
 * FITMOD — trellisService.js
 * ============================
 * Service backend pour la génération 3D via TRELLIS (Microsoft)
 * 
 * Supporte plusieurs providers :
 *   - NVIDIA NIM (hosted API) — images de démo uniquement
 *   - HuggingFace Spaces (gratuit, instable)
 *   - Self-hosted (Docker local)
 *   - GLB statiques pré-générés (fallback fiable)
 * 
 * Usage :
 *   const trellis = require('./services/trellisService');
 *   const glbPath = await trellis.generateGLB(imagePath);
 */

const fs = require('fs');
const path = require('path');
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

// ─── Configuration ───
const TRELLIS_CONFIG = {
    // Provider actif : 'nvidia', 'huggingface', 'local', 'static'
    provider: process.env.TRELLIS_PROVIDER || 'static',
    
    // NVIDIA NIM
    nvidia: {
        apiKey: process.env.NVIDIA_API_KEY || '',
        endpoint: 'https://ai.api.nvidia.com/v1/genai/microsoft/trellis',
    },
    
    // HuggingFace Space
    huggingface: {
        spaceUrl: process.env.TRELLIS_HF_SPACE || 'https://jainarham-trellis-3d-api.hf.space',
    },
    
    // Serveur local (Docker)
    local: {
        endpoint: process.env.TRELLIS_LOCAL_URL || 'http://localhost:8000/v1/infer',
    },
    
    // Dossier de stockage des GLB générés
    outputDir: path.join(__dirname, '..', 'uploads', 'models3d'),
    
    // Cache : ne pas régénérer si le GLB existe déjà
    enableCache: true,
};

// Créer le dossier de sortie s'il n'existe pas
if (!fs.existsSync(TRELLIS_CONFIG.outputDir)) {
    fs.mkdirSync(TRELLIS_CONFIG.outputDir, { recursive: true });
}

/**
 * Génère un modèle 3D GLB à partir d'une image
 * @param {string} imagePath - Chemin absolu vers l'image source
 * @param {Object} options - Options de génération
 * @returns {Promise<{success: boolean, glbPath: string, glbUrl: string}>}
 */
async function generateGLB(imagePath, options = {}) {
    const { seed = 42, format = 'glb' } = options;
    
    // Vérifier que l'image existe
    if (!fs.existsSync(imagePath)) {
        throw new Error(`Image introuvable: ${imagePath}`);
    }
    
    // Générer un nom unique basé sur le hash de l'image
    const imageHash = hashFile(imagePath);
    const outputFilename = `model_${imageHash}.glb`;
    const outputPath = path.join(TRELLIS_CONFIG.outputDir, outputFilename);
    const glbUrl = `/uploads/models3d/${outputFilename}`;
    
    // Cache : vérifier si le GLB existe déjà
    if (TRELLIS_CONFIG.enableCache && fs.existsSync(outputPath)) {
        console.log(`✅ GLB trouvé en cache: ${outputFilename}`);
        return { success: true, glbPath: outputPath, glbUrl, cached: true };
    }
    
    // Générer selon le provider configuré
    const provider = TRELLIS_CONFIG.provider;
    console.log(`🔄 Génération 3D via ${provider}...`);
    
    switch (provider) {
        case 'nvidia':
            return await generateViaNvidia(imagePath, outputPath, glbUrl, seed);
        case 'huggingface':
            return await generateViaHuggingFace(imagePath, outputPath, glbUrl, seed);
        case 'local':
            return await generateViaLocal(imagePath, outputPath, glbUrl, seed);
        case 'static':
        default:
            return await getStaticModel(imagePath, outputPath, glbUrl);
    }
}

/**
 * Génération via NVIDIA NIM API
 * NOTE: L'API Preview ne supporte que les images de démo (example_id 0-3)
 */
async function generateViaNvidia(imagePath, outputPath, glbUrl, seed) {
    const apiKey = TRELLIS_CONFIG.nvidia.apiKey;
    if (!apiKey) throw new Error('NVIDIA_API_KEY non configurée');
    
    // Encoder l'image en base64
    const imageBuffer = fs.readFileSync(imagePath);
    const imageB64 = imageBuffer.toString('base64');
    const ext = path.extname(imagePath).toLowerCase().replace('.', '');
    const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
    
    const response = await fetch(TRELLIS_CONFIG.nvidia.endpoint, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
        body: JSON.stringify({
            mode: 'image',
            image: `data:${mimeType};base64,${imageB64}`,
            output_format: 'glb',
            seed: seed,
        }),
    });
    
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(`NVIDIA API error: ${error.detail || response.statusText}`);
    }
    
    const data = await response.json();
    
    // Extraire le GLB du résultat
    if (data.artifacts?.[0]?.base64) {
        const glbBuffer = Buffer.from(data.artifacts[0].base64, 'base64');
        fs.writeFileSync(outputPath, glbBuffer);
        console.log(`✅ GLB généré via NVIDIA: ${outputPath} (${glbBuffer.length} bytes)`);
        return { success: true, glbPath: outputPath, glbUrl, cached: false };
    }
    
    throw new Error('Format de réponse NVIDIA inattendu');
}

/**
 * Génération via HuggingFace Spaces (Gradio API)
 */
async function generateViaHuggingFace(imagePath, outputPath, glbUrl, seed) {
    const spaceUrl = TRELLIS_CONFIG.huggingface.spaceUrl;
    
    // Encoder l'image en base64
    const imageBuffer = fs.readFileSync(imagePath);
    const imageB64 = imageBuffer.toString('base64');
    const ext = path.extname(imagePath).toLowerCase().replace('.', '');
    const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
    
    // Appeler l'API Gradio
    const response = await fetch(`${spaceUrl}/api/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            fn_index: 0,
            data: [
                { data: `data:${mimeType};base64,${imageB64}`, name: 'image.jpg' },
                seed,
                false,  // randomize_seed
                '512',  // resolution
            ],
        }),
    });
    
    if (!response.ok) {
        throw new Error(`HuggingFace API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Le résultat Gradio contient un chemin de fichier temporaire
    if (data.data?.[1]?.name) {
        const fileUrl = `${spaceUrl}/file=${data.data[1].name}`;
        const fileResponse = await fetch(fileUrl);
        const buffer = Buffer.from(await fileResponse.arrayBuffer());
        fs.writeFileSync(outputPath, buffer);
        console.log(`✅ GLB généré via HuggingFace: ${outputPath} (${buffer.length} bytes)`);
        return { success: true, glbPath: outputPath, glbUrl, cached: false };
    }
    
    throw new Error('Format de réponse HuggingFace inattendu');
}

/**
 * Génération via serveur local (Docker TRELLIS)
 */
async function generateViaLocal(imagePath, outputPath, glbUrl, seed) {
    const endpoint = TRELLIS_CONFIG.local.endpoint;
    
    const imageBuffer = fs.readFileSync(imagePath);
    const imageB64 = imageBuffer.toString('base64');
    const ext = path.extname(imagePath).toLowerCase().replace('.', '');
    const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
    
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
        body: JSON.stringify({
            mode: 'image',
            image: `data:${mimeType};base64,${imageB64}`,
            output_format: 'glb',
            seed: seed,
        }),
        timeout: 300000, // 5 minutes
    });
    
    if (!response.ok) {
        throw new Error(`Local TRELLIS error: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.artifacts?.[0]?.base64) {
        const glbBuffer = Buffer.from(data.artifacts[0].base64, 'base64');
        fs.writeFileSync(outputPath, glbBuffer);
        console.log(`✅ GLB généré localement: ${outputPath} (${glbBuffer.length} bytes)`);
        return { success: true, glbPath: outputPath, glbUrl, cached: false };
    }
    
    throw new Error('Format de réponse local inattendu');
}

/**
 * Fallback : retourne un GLB statique pré-existant
 * Utilisé quand aucune API n'est disponible
 */
async function getStaticModel(imagePath, outputPath, glbUrl) {
    // Chercher un GLB existant dans le dossier de sortie
    const existingFiles = fs.readdirSync(TRELLIS_CONFIG.outputDir)
        .filter(f => f.endsWith('.glb'));
    
    if (existingFiles.length > 0) {
        const existing = existingFiles[0];
        const existingPath = path.join(TRELLIS_CONFIG.outputDir, existing);
        const existingUrl = `/uploads/models3d/${existing}`;
        console.log(`📦 Modèle statique utilisé: ${existing}`);
        return { success: true, glbPath: existingPath, glbUrl: existingUrl, cached: true, static: true };
    }
    
    // Aucun modèle disponible
    return { 
        success: false, 
        error: 'Aucun modèle 3D disponible. Configurez TRELLIS_PROVIDER pour activer la génération.',
        glbPath: null,
        glbUrl: null 
    };
}

/**
 * Liste tous les modèles 3D générés
 * @returns {Array<{filename, path, url, size, created}>}
 */
function listModels() {
    if (!fs.existsSync(TRELLIS_CONFIG.outputDir)) return [];
    
    return fs.readdirSync(TRELLIS_CONFIG.outputDir)
        .filter(f => f.endsWith('.glb'))
        .map(f => {
            const fullPath = path.join(TRELLIS_CONFIG.outputDir, f);
            const stats = fs.statSync(fullPath);
            return {
                filename: f,
                path: fullPath,
                url: `/uploads/models3d/${f}`,
                size: stats.size,
                created: stats.birthtime,
            };
        });
}

/**
 * Génère un hash simple à partir d'un fichier 
 */
function hashFile(filePath) {
    const crypto = require('crypto');
    const buffer = fs.readFileSync(filePath);
    return crypto.createHash('md5').update(buffer).digest('hex').substring(0, 12);
}

module.exports = {
    generateGLB,
    listModels,
    config: TRELLIS_CONFIG,
};
