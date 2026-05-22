/**
 * FITMOD — meshWarping.js
 * ========================
 * Moteur de déformation de vêtement par triangulation affine.
 * 
 * Le vêtement est décomposé en une grille de triangles dont les sommets
 * sont ancrés aux landmarks du corps.  Quand le corps bouge, chaque
 * triangle subit une transformation affine indépendante qui déforme
 * l'image du vêtement de manière réaliste.
 *
 * Pipeline : Image vêtement → Grille UV → Mapping landmarks → Affine par △ → Canvas 2D
 */

// ─── Constantes grille ───
const DEFAULT_COLS = 7;   // Colonnes de la grille (impair pour axe central)
const DEFAULT_ROWS = 9;   // Lignes (du col au bas)

// ─── Points d'ancrage par défaut (coordonnées normalisées 0-1 sur l'image) ───
// Ces coordonnées définissent où les landmarks du corps correspondent sur l'image du vêtement
export const DEFAULT_CLOTH_ANCHORS = {
    col_gauche:     { x: 0.30, y: 0.00 },
    col_droite:     { x: 0.70, y: 0.00 },
    epaule_gauche:  { x: 0.08, y: 0.08 },
    epaule_droite:  { x: 0.92, y: 0.08 },
    aisselle_gauche:{ x: 0.05, y: 0.28 },
    aisselle_droite:{ x: 0.95, y: 0.28 },
    taille_gauche:  { x: 0.12, y: 0.62 },
    taille_droite:  { x: 0.88, y: 0.62 },
    bas_gauche:     { x: 0.10, y: 1.00 },
    bas_droite:     { x: 0.90, y: 1.00 },
};

// ─── Index des landmarks MediaPipe Pose ───
const LM = {
    NOSE: 0,
    L_SHOULDER: 11, R_SHOULDER: 12,
    L_ELBOW: 13,    R_ELBOW: 14,
    L_WRIST: 15,    R_WRIST: 16,
    L_HIP: 23,      R_HIP: 24,
    L_KNEE: 25,     R_KNEE: 26,
    L_ANKLE: 27,    R_ANKLE: 28,
};

/**
 * Crée la grille de maillage du vêtement.
 * Retourne les sommets source (UV sur l'image) et les triangles.
 * Appelé UNE SEULE FOIS par vêtement — les triangles sont statiques.
 * 
 * @param {Object} anchors - Points d'ancrage (format DEFAULT_CLOTH_ANCHORS)
 * @param {number} cols - Nombre de colonnes de la grille
 * @param {number} rows - Nombre de lignes de la grille
 * @returns {{ srcVertices: Array<{x,y}>, triangles: Array<[i,j,k]>, cols, rows }}
 */
export function createGarmentMesh(anchors = DEFAULT_CLOTH_ANCHORS, cols = DEFAULT_COLS, rows = DEFAULT_ROWS) {
    const srcVertices = [];

    // ── Calculer les positions UV de chaque sommet de la grille ──
    // Les bords gauche/droite suivent les contours du vêtement
    // Les points intérieurs sont interpolés bilinéairement
    
    // Profil gauche et droit du vêtement (interpolation verticale des anchors)
    const leftProfile = [
        { t: 0.00, x: anchors.col_gauche.x,     y: anchors.col_gauche.y },
        { t: 0.08, x: anchors.epaule_gauche.x,  y: anchors.epaule_gauche.y },
        { t: 0.28, x: anchors.aisselle_gauche.x, y: anchors.aisselle_gauche.y },
        { t: 0.62, x: anchors.taille_gauche.x,  y: anchors.taille_gauche.y },
        { t: 1.00, x: anchors.bas_gauche.x,     y: anchors.bas_gauche.y },
    ];
    const rightProfile = [
        { t: 0.00, x: anchors.col_droite.x,     y: anchors.col_droite.y },
        { t: 0.08, x: anchors.epaule_droite.x,  y: anchors.epaule_droite.y },
        { t: 0.28, x: anchors.aisselle_droite.x, y: anchors.aisselle_droite.y },
        { t: 0.62, x: anchors.taille_droite.x,  y: anchors.taille_droite.y },
        { t: 1.00, x: anchors.bas_droite.x,     y: anchors.bas_droite.y },
    ];

    for (let r = 0; r < rows; r++) {
        const t = r / (rows - 1); // 0 (haut) → 1 (bas)
        const leftPt  = interpolateProfile(leftProfile, t);
        const rightPt = interpolateProfile(rightProfile, t);

        for (let c = 0; c < cols; c++) {
            const s = c / (cols - 1); // 0 (gauche) → 1 (droite)
            srcVertices.push({
                x: leftPt.x + (rightPt.x - leftPt.x) * s,
                y: leftPt.y + (rightPt.y - leftPt.y) * s,
                row: r,
                col: c,
            });
        }
    }

    // ── Trianguler la grille ──
    const triangles = [];
    for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < cols - 1; c++) {
            const i0 = r * cols + c;
            const i1 = r * cols + c + 1;
            const i2 = (r + 1) * cols + c;
            const i3 = (r + 1) * cols + c + 1;
            // Deux triangles par cellule
            triangles.push([i0, i1, i2]);
            triangles.push([i1, i3, i2]);
        }
    }

    return { srcVertices, triangles, cols, rows };
}

/**
 * Mappe les sommets de la grille sur les landmarks du corps détectés.
 * 
 * @param {Object} mesh - Résultat de createGarmentMesh()
 * @param {Array} landmarks - 33 landmarks MediaPipe (coordonnées normalisées 0-1)
 * @param {number} canvasW - Largeur du canvas en pixels
 * @param {number} canvasH - Hauteur du canvas en pixels
 * @param {Object} options - { typeTenue, modelScale }
 * @returns {Array<{x,y}>} Positions destination en pixels canvas
 */
export function mapMeshToBody(mesh, landmarks, canvasW, canvasH, options = {}) {
    const { typeTenue = '', modelScale = 1.0 } = options;
    const { srcVertices, cols, rows } = mesh;

    // ── Extraire les landmarks clés ──
    const lSh = landmarks[LM.L_SHOULDER];
    const rSh = landmarks[LM.R_SHOULDER];
    const lHip = landmarks[LM.L_HIP];
    const rHip = landmarks[LM.R_HIP];
    const nose = landmarks[LM.NOSE];

    if (!lSh || !rSh || !lHip || !rHip) return null;

    // Coordonnées en pixels (miroir horizontal pour webcam)
    const toPixel = (lm) => ({
        x: (1 - lm.x) * canvasW,  // miroir
        y: lm.y * canvasH,
    });

    const pLSh = toPixel(lSh);
    const pRSh = toPixel(rSh);
    const pLHip = toPixel(lHip);
    const pRHip = toPixel(rHip);
    const pNose = nose ? toPixel(nose) : null;

    // ── Points d'ancrage du corps (approche centrée) ──
    const midSh = { x: (pLSh.x + pRSh.x) / 2, y: (pLSh.y + pRSh.y) / 2 };
    const midHip = { x: (pLHip.x + pRHip.x) / 2, y: (pLHip.y + pRHip.y) / 2 };
    
    // Largeurs mesurées
    const shoulderW = Math.abs(pRSh.x - pLSh.x); // Largeur horizontale pure
    const hipW = Math.abs(pRHip.x - pLHip.x);
    const torsoH = midHip.y - midSh.y; // Hauteur du torse (positive vers le bas)

    // Demi-largeurs pour le placement symétrique
    const halfShW = (shoulderW / 2) * 1.15 * modelScale; // Le vêtement dépasse les épaules de 15%
    const halfHipW = (hipW / 2) * 1.08 * modelScale;
    const halfColW = halfShW * 0.45; // Le col est plus étroit

    // Col : juste au-dessus des épaules
    const colY = midSh.y - shoulderW * 0.18;
    
    // Aisselles : 20% entre épaules et hanches, un peu plus larges
    const aisselleY = midSh.y + torsoH * 0.20;
    const halfAisW = halfShW * 0.85;

    // Bas du vêtement
    const basY = midHip.y + torsoH * 0.25;

    // Points d'ancrage corps (destination) — SYMÉTRIQUES par rapport au centre
    const bodyAnchors = {
        col_gauche:     { x: midSh.x - halfColW,  y: colY },
        col_droite:     { x: midSh.x + halfColW,  y: colY },
        epaule_gauche:  { x: midSh.x - halfShW,   y: midSh.y },
        epaule_droite:  { x: midSh.x + halfShW,   y: midSh.y },
        aisselle_gauche:{ x: midSh.x - halfAisW,   y: aisselleY },
        aisselle_droite:{ x: midSh.x + halfAisW,   y: aisselleY },
        taille_gauche:  { x: midHip.x - halfHipW,  y: midHip.y },
        taille_droite:  { x: midHip.x + halfHipW,  y: midHip.y },
        bas_gauche:     { x: midHip.x - halfHipW,  y: basY },
        bas_droite:     { x: midHip.x + halfHipW,  y: basY },
    };

    // Pour les tenues longues (robes, boubous), étendre le bas
    const isLong = /robe|boubou|djellaba|caftan/i.test(typeTenue);
    if (isLong) {
        const lKnee = landmarks[LM.L_KNEE];
        const rKnee = landmarks[LM.R_KNEE];
        const lAnkle = landmarks[LM.L_ANKLE];
        const rAnkle = landmarks[LM.R_ANKLE];
        if (lAnkle && rAnkle) {
            bodyAnchors.bas_gauche = toPixel(lAnkle);
            bodyAnchors.bas_droite = toPixel(rAnkle);
        } else if (lKnee && rKnee) {
            const pLK = toPixel(lKnee);
            const pRK = toPixel(rKnee);
            bodyAnchors.bas_gauche = { x: pLK.x, y: pLK.y + 30 };
            bodyAnchors.bas_droite = { x: pRK.x, y: pRK.y + 30 };
        }
    }

    // ── Profils gauche/droite du corps (identique structure aux anchors) ──
    const leftBodyProfile = [
        { t: 0.00, ...bodyAnchors.col_gauche },
        { t: 0.08, ...bodyAnchors.epaule_gauche },
        { t: 0.28, ...bodyAnchors.aisselle_gauche },
        { t: 0.62, ...bodyAnchors.taille_gauche },
        { t: 1.00, ...bodyAnchors.bas_gauche },
    ];
    const rightBodyProfile = [
        { t: 0.00, ...bodyAnchors.col_droite },
        { t: 0.08, ...bodyAnchors.epaule_droite },
        { t: 0.28, ...bodyAnchors.aisselle_droite },
        { t: 0.62, ...bodyAnchors.taille_droite },
        { t: 1.00, ...bodyAnchors.bas_droite },
    ];

    // ── Mapper chaque sommet de la grille ──
    const dstVertices = [];
    for (let i = 0; i < srcVertices.length; i++) {
        const v = srcVertices[i];
        const t = v.row / (rows - 1); // position verticale normalisée
        const s = v.col / (cols - 1); // position horizontale normalisée

        const leftPt  = interpolateProfile(leftBodyProfile, t);
        const rightPt = interpolateProfile(rightBodyProfile, t);

        dstVertices.push({
            x: leftPt.x + (rightPt.x - leftPt.x) * s,
            y: leftPt.y + (rightPt.y - leftPt.y) * s,
        });
    }

    return dstVertices;
}

/**
 * Dessine le vêtement déformé sur le canvas 2D.
 * Chaque triangle du mesh est dessiné avec une transformation affine indépendante.
 * 
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLImageElement} garmentImg - Image du vêtement (PNG transparent)
 * @param {Array<{x,y}>} srcVertices - Positions source (UV * imgSize)
 * @param {Array<{x,y}>} dstVertices - Positions destination (pixels canvas)
 * @param {Array<[i,j,k]>} triangles - Indices des triangles
 * @param {number} imgW - Largeur de l'image du vêtement
 * @param {number} imgH - Hauteur de l'image du vêtement
 * @param {number} opacity - Opacité globale (0-1)
 */
export function renderWarpedGarment(ctx, garmentImg, srcVertices, dstVertices, triangles, imgW, imgH, opacity = 0.92) {
    if (!ctx || !garmentImg || !srcVertices || !dstVertices || !triangles) return;
    if (srcVertices.length !== dstVertices.length) return;

    ctx.save();
    ctx.globalAlpha = opacity;

    for (let t = 0; t < triangles.length; t++) {
        const [i0, i1, i2] = triangles[t];

        // Source : coordonnées UV converties en pixels image
        const s0x = srcVertices[i0].x * imgW;
        const s0y = srcVertices[i0].y * imgH;
        const s1x = srcVertices[i1].x * imgW;
        const s1y = srcVertices[i1].y * imgH;
        const s2x = srcVertices[i2].x * imgW;
        const s2y = srcVertices[i2].y * imgH;

        // Destination : pixels canvas
        const d0x = dstVertices[i0].x;
        const d0y = dstVertices[i0].y;
        const d1x = dstVertices[i1].x;
        const d1y = dstVertices[i1].y;
        const d2x = dstVertices[i2].x;
        const d2y = dstVertices[i2].y;

        drawTexturedTriangle(ctx, garmentImg, s0x, s0y, s1x, s1y, s2x, s2y, d0x, d0y, d1x, d1y, d2x, d2y);
    }

    ctx.restore();
}

/**
 * Dessine un triangle texturé via transformation affine.
 * C'est le cœur du mesh warping sur Canvas 2D.
 */
function drawTexturedTriangle(ctx, img, s0x, s0y, s1x, s1y, s2x, s2y, d0x, d0y, d1x, d1y, d2x, d2y) {
    // Déterminant du triangle source
    const det = s0x * (s1y - s2y) + s1x * (s2y - s0y) + s2x * (s0y - s1y);
    if (Math.abs(det) < 0.001) return; // Triangle dégénéré

    ctx.save();

    // ── Découper le triangle destination ──
    ctx.beginPath();
    ctx.moveTo(d0x, d0y);
    ctx.lineTo(d1x, d1y);
    ctx.lineTo(d2x, d2y);
    ctx.closePath();
    ctx.clip();

    // ── Calculer la matrice affine : source → destination ──
    // ctx.setTransform(a, b, c, d, e, f) applique :
    //   x' = a*x + c*y + e
    //   y' = b*x + d*y + f
    const invDet = 1 / det;

    const a = (d0x * (s1y - s2y) + d1x * (s2y - s0y) + d2x * (s0y - s1y)) * invDet;
    const b = (d0y * (s1y - s2y) + d1y * (s2y - s0y) + d2y * (s0y - s1y)) * invDet;
    const c = (d0x * (s2x - s1x) + d1x * (s0x - s2x) + d2x * (s1x - s0x)) * invDet;
    const d = (d0y * (s2x - s1x) + d1y * (s0x - s2x) + d2y * (s1x - s0x)) * invDet;
    const e = (d0x * (s1x * s2y - s2x * s1y) + d1x * (s2x * s0y - s0x * s2y) + d2x * (s0x * s1y - s1x * s0y)) * invDet;
    const f = (d0y * (s1x * s2y - s2x * s1y) + d1y * (s2x * s0y - s0x * s2y) + d2y * (s0x * s1y - s1x * s0y)) * invDet;

    ctx.setTransform(a, b, c, d, e, f);
    ctx.drawImage(img, 0, 0);

    ctx.restore();
}

/**
 * Dessine l'occlusion des bras (les bras repassent par-dessus le vêtement).
 * Utilise les landmarks des bras pour créer un masque.
 * 
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLVideoElement} video
 * @param {Array} landmarks - MediaPipe landmarks
 * @param {number} canvasW
 * @param {number} canvasH
 */
export function drawArmOcclusion(ctx, video, landmarks, canvasW, canvasH) {
    if (!ctx || !video || !landmarks) return;

    // Bras à dessiner par-dessus le vêtement
    const armPairs = [
        [LM.L_SHOULDER, LM.L_ELBOW, LM.L_WRIST],  // Bras gauche
        [LM.R_SHOULDER, LM.R_ELBOW, LM.R_WRIST],  // Bras droit
    ];

    const shoulderW = Math.hypot(
        (landmarks[LM.R_SHOULDER]?.x - landmarks[LM.L_SHOULDER]?.x) * canvasW,
        (landmarks[LM.R_SHOULDER]?.y - landmarks[LM.L_SHOULDER]?.y) * canvasH
    );
    const armThickness = shoulderW * 0.18; // Épaisseur du bras proportionnelle

    ctx.save();

    for (const [shIdx, elbIdx, wrstIdx] of armPairs) {
        const sh = landmarks[shIdx];
        const elb = landmarks[elbIdx];
        const wrst = landmarks[wrstIdx];

        if (!sh || !elb || !wrst) continue;

        // Vérifier si le bras est devant le torse (z < z_torse)
        const midShZ = ((landmarks[LM.L_SHOULDER]?.z || 0) + (landmarks[LM.R_SHOULDER]?.z || 0)) / 2;
        const armZ = (elb.z + wrst.z) / 2;
        
        // Si le bras est plus loin que le torse, pas d'occlusion nécessaire
        if (armZ > midShZ + 0.05) continue;

        // Convertir en pixels canvas (miroir)
        const pts = [sh, elb, wrst].map(lm => ({
            x: (1 - lm.x) * canvasW,
            y: lm.y * canvasH,
        }));

        // Créer un tracé épais le long du bras
        ctx.beginPath();
        buildArmPath(ctx, pts, armThickness);
        ctx.closePath();
        ctx.clip();

        // Redessiner la vidéo webcam dans cette zone (miroir)
        ctx.save();
        ctx.translate(canvasW, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, canvasW, canvasH);
        ctx.restore();

        // Reset le clip pour le prochain bras
        ctx.restore();
        ctx.save();
    }

    ctx.restore();
}

/**
 * Construit le tracé d'un bras (forme épaisse depuis l'épaule au poignet)
 */
function buildArmPath(ctx, points, thickness) {
    if (points.length < 2) return;

    // Créer les points gauche et droite du bras
    const leftPts = [];
    const rightPts = [];

    for (let i = 0; i < points.length; i++) {
        const curr = points[i];
        const next = points[Math.min(i + 1, points.length - 1)];
        const prev = points[Math.max(i - 1, 0)];

        // Direction tangente
        const dx = next.x - prev.x;
        const dy = next.y - prev.y;
        const len = Math.hypot(dx, dy) || 1;

        // Perpendiculaire
        const px = -dy / len;
        const py = dx / len;

        // L'épaisseur diminue vers le poignet
        const taper = 1.0 - (i / (points.length - 1)) * 0.4;
        const t = thickness * taper;

        leftPts.push({ x: curr.x + px * t, y: curr.y + py * t });
        rightPts.push({ x: curr.x - px * t, y: curr.y - py * t });
    }

    // Tracer le contour
    ctx.moveTo(leftPts[0].x, leftPts[0].y);
    for (let i = 1; i < leftPts.length; i++) {
        ctx.lineTo(leftPts[i].x, leftPts[i].y);
    }
    // Remonter par la droite
    for (let i = rightPts.length - 1; i >= 0; i--) {
        ctx.lineTo(rightPts[i].x, rightPts[i].y);
    }
}

/**
 * Dessine le mesh de debug (triangles en fil de fer)
 */
export function drawDebugMesh(ctx, dstVertices, triangles, color = 'rgba(255, 165, 0, 0.3)') {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.5;

    for (const [i0, i1, i2] of triangles) {
        ctx.beginPath();
        ctx.moveTo(dstVertices[i0].x, dstVertices[i0].y);
        ctx.lineTo(dstVertices[i1].x, dstVertices[i1].y);
        ctx.lineTo(dstVertices[i2].x, dstVertices[i2].y);
        ctx.closePath();
        ctx.stroke();
    }

    ctx.restore();
}

// ─── Utilitaires ───

/**
 * Interpole un point sur un profil défini par des segments
 * @param {Array<{t, x, y}>} profile - Points du profil, triés par t croissant
 * @param {number} t - Position normalisée (0-1)
 * @returns {{x, y}}
 */
function interpolateProfile(profile, t) {
    if (t <= profile[0].t) return { x: profile[0].x, y: profile[0].y };
    if (t >= profile[profile.length - 1].t) {
        const last = profile[profile.length - 1];
        return { x: last.x, y: last.y };
    }

    for (let i = 0; i < profile.length - 1; i++) {
        const a = profile[i];
        const b = profile[i + 1];
        if (t >= a.t && t <= b.t) {
            const localT = (t - a.t) / (b.t - a.t);
            return {
                x: a.x + (b.x - a.x) * localT,
                y: a.y + (b.y - a.y) * localT,
            };
        }
    }

    return { x: profile[0].x, y: profile[0].y };
}

export default {
    createGarmentMesh,
    mapMeshToBody,
    renderWarpedGarment,
    drawArmOcclusion,
    drawDebugMesh,
    DEFAULT_CLOTH_ANCHORS,
};
