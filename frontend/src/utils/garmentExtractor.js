/**
 * FITMOD — Garment Extractor
 * ===========================
 * Extrait le vêtement d'une photo catalogue en supprimant le fond.
 * 
 * Approche : Suppression de fond par distance colorimétrique.
 * 1. Échantillonne la couleur de fond dans les coins de l'image
 * 2. Pour chaque pixel, calcule la distance par rapport au(x) couleur(s) de fond
 * 3. Les pixels proches du fond deviennent transparents
 * 4. Applique un feathering (lissage des bords) pour des contours doux
 * 5. Crop automatique sur le contenu visible
 */

/**
 * Obtient la couleur dominante dans une zone rectangulaire de l'image
 */
function sampleRegionColor(imgData, x, y, w, h, imgW) {
    let r = 0, g = 0, b = 0, count = 0;
    for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
            const px = x + dx;
            const py = y + dy;
            if (px >= 0 && px < imgW && py >= 0) {
                const idx = (py * imgW + px) * 4;
                r += imgData.data[idx];
                g += imgData.data[idx + 1];
                b += imgData.data[idx + 2];
                count++;
            }
        }
    }
    if (count === 0) return { r: 255, g: 255, b: 255 };
    return { r: r / count, g: g / count, b: b / count };
}

/**
 * Distance colorimétrique euclidienne entre deux couleurs RGB
 */
function colorDist(r1, g1, b1, r2, g2, b2) {
    return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

/**
 * Extraction du vêtement par suppression de fond
 * @param {HTMLImageElement} imageElement - Image source
 * @param {Function} onProgress - Callback de progression
 * @returns {Promise<Blob>} - Image PNG avec fond transparent
 */
export async function extractGarment(imageElement, onProgress) {
    if (onProgress) onProgress('Analyse de l\'image...');

    const canvas = document.createElement('canvas');
    const w = imageElement.naturalWidth || imageElement.width;
    const h = imageElement.naturalHeight || imageElement.height;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imageElement, 0, 0, w, h);
    const imgData = ctx.getImageData(0, 0, w, h);

    if (onProgress) onProgress('Détection du fond...');

    // ── 1. Échantillonner les couleurs de fond dans les 4 coins ──
    const sampleSize = Math.max(10, Math.floor(Math.min(w, h) * 0.05));
    const corners = [
        sampleRegionColor(imgData, 0, 0, sampleSize, sampleSize, w),                    // top-left
        sampleRegionColor(imgData, w - sampleSize, 0, sampleSize, sampleSize, w),        // top-right
        sampleRegionColor(imgData, 0, h - sampleSize, sampleSize, sampleSize, w),        // bottom-left
        sampleRegionColor(imgData, w - sampleSize, h - sampleSize, sampleSize, sampleSize, w), // bottom-right
    ];

    // Garder les couleurs de coin qui sont proches entre elles (= vrai fond)
    // On prend les deux coins les plus similaires comme référence
    let bestPair = [0, 1];
    let bestDist = Infinity;
    for (let i = 0; i < corners.length; i++) {
        for (let j = i + 1; j < corners.length; j++) {
            const d = colorDist(corners[i].r, corners[i].g, corners[i].b,
                                corners[j].r, corners[j].g, corners[j].b);
            if (d < bestDist) {
                bestDist = d;
                bestPair = [i, j];
            }
        }
    }

    // Couleur de fond = moyenne des deux coins les plus similaires
    const bgColor = {
        r: (corners[bestPair[0]].r + corners[bestPair[1]].r) / 2,
        g: (corners[bestPair[0]].g + corners[bestPair[1]].g) / 2,
        b: (corners[bestPair[0]].b + corners[bestPair[1]].b) / 2,
    };

    if (onProgress) onProgress('Suppression du fond...');

    // ── 2. Seuil de distance pour le fond ──
    // Seuil adaptatif : si les coins sont très similaires (fond uni), seuil serré
    // Si les coins varient (fond texturé), seuil plus large
    const cornerVariance = bestDist;
    const threshold = Math.max(35, Math.min(80, 40 + cornerVariance * 0.5));
    const softEdge = 15; // zone de transition douce

    // ── 3. Créer le masque alpha ──
    const alphaMap = new Float32Array(w * h);

    for (let i = 0; i < w * h; i++) {
        const r = imgData.data[i * 4];
        const g = imgData.data[i * 4 + 1];
        const b = imgData.data[i * 4 + 2];

        const dist = colorDist(r, g, b, bgColor.r, bgColor.g, bgColor.b);

        if (dist < threshold) {
            alphaMap[i] = 0; // fond → transparent
        } else if (dist < threshold + softEdge) {
            // Zone de transition douce
            alphaMap[i] = (dist - threshold) / softEdge;
        } else {
            alphaMap[i] = 1; // vêtement → opaque
        }
    }

    if (onProgress) onProgress('Lissage des contours...');

    // ── 4. Dilatation légère pour combler les trous dans le vêtement ──
    const dilated = new Float32Array(alphaMap);
    const dilateR = 2;
    for (let y = dilateR; y < h - dilateR; y++) {
        for (let x = dilateR; x < w - dilateR; x++) {
            const idx = y * w + x;
            if (alphaMap[idx] > 0.5) continue; // déjà opaque
            
            // Vérifier le voisinage
            let maxNeighbor = 0;
            for (let dy = -dilateR; dy <= dilateR; dy++) {
                for (let dx = -dilateR; dx <= dilateR; dx++) {
                    const ni = (y + dy) * w + (x + dx);
                    if (alphaMap[ni] > maxNeighbor) maxNeighbor = alphaMap[ni];
                }
            }
            // Si entouré de pixels opaques, combler
            if (maxNeighbor > 0.8) {
                let opaqueCount = 0;
                for (let dy = -dilateR; dy <= dilateR; dy++) {
                    for (let dx = -dilateR; dx <= dilateR; dx++) {
                        if (alphaMap[(y + dy) * w + (x + dx)] > 0.5) opaqueCount++;
                    }
                }
                const total = (dilateR * 2 + 1) ** 2;
                if (opaqueCount > total * 0.6) dilated[idx] = 0.9;
            }
        }
    }

    // ── 5. Flou gaussien léger sur l'alpha pour adoucir les bords ──
    const blurred = new Float32Array(dilated);
    const blurR = 3;
    for (let y = blurR; y < h - blurR; y++) {
        for (let x = blurR; x < w - blurR; x++) {
            let sum = 0, wt = 0;
            for (let dy = -blurR; dy <= blurR; dy++) {
                for (let dx = -blurR; dx <= blurR; dx++) {
                    const d2 = dx * dx + dy * dy;
                    const g = Math.exp(-d2 / (2 * blurR * blurR));
                    sum += dilated[(y + dy) * w + (x + dx)] * g;
                    wt += g;
                }
            }
            blurred[y * w + x] = sum / wt;
        }
    }

    // ── 6. Appliquer le masque alpha à l'image ──
    for (let i = 0; i < w * h; i++) {
        imgData.data[i * 4 + 3] = Math.round(blurred[i] * 255);
    }

    ctx.putImageData(imgData, 0, 0);

    if (onProgress) onProgress('Recadrage...');

    // ── 7. Crop automatique sur le contenu visible ──
    let minX = w, maxX = 0, minY = h, maxY = 0;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (blurred[y * w + x] > 0.1) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }

    if (maxX > minX && maxY > minY) {
        // Ajouter un peu de marge
        const margin = Math.round(Math.min(w, h) * 0.02);
        minX = Math.max(0, minX - margin);
        minY = Math.max(0, minY - margin);
        maxX = Math.min(w - 1, maxX + margin);
        maxY = Math.min(h - 1, maxY + margin);

        const cropW = maxX - minX;
        const cropH = maxY - minY;
        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = cropW;
        cropCanvas.height = cropH;
        cropCanvas.getContext('2d').drawImage(canvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);

        return new Promise((resolve) => cropCanvas.toBlob(resolve, 'image/png'));
    }

    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

// Exported for backward compatibility
export async function extractGarmentFallback(imageElement) {
    return extractGarment(imageElement);
}
