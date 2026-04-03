/**
 * FITMOD — Calculateur de Mesures Corporelles (v4 — Calibré)
 * ===========================================================
 * Convertit les landmarks MediaPipe Pose en mesures corporelles réelles (cm).
 *
 * CALIBRATION v4 — Basée sur des mesures réelles :
 * 
 * PROBLÈME IDENTIFIÉ :
 * Les landmarks MediaPipe sont positionnés sur les ARTICULATIONS SQUELETTIQUES
 * (glenohumeral joint, os iliaque), PAS sur la surface de la peau.
 * → Il faut des CORRECTIONS ADDITIVES (proportionnelles à la taille)
 *   pour compenser la différence os/surface.
 * → Puis des FACTEURS ELLIPTIQUES pour convertir une largeur 2D en tour 3D.
 *
 * Données de calibration (sujet 1m80) :
 * | Mesure         | Appli v3 | Réel | Correction appliquée |
 * |----------------|----------|------|----------------------|
 * | Tour de cou    | 16.7     | 39   | facteur direct ×3.31 |
 * | Larg. épaules  | 34.9     | 44   | +10cm offset         |
 * | Tour poitrine  | 112.4    | 98   | offset + facteur 2.18|
 * | Tour hanches   | 71.4     | 78   | offset + facteur 2.57|
 * | Tour bras      | 23.3     | 26   | facteur direct ×0.98 |
 * | Long. manche   | 56.9     | 62   | ×1.09                |
 * | Hanche→cheville| 90       | 100  | ×1.11                |
 */

// --- Indices des landmarks ---
const LANDMARKS = {
    NOSE: 0,
    LEFT_EYE_INNER: 1,
    LEFT_EYE: 2,
    LEFT_EYE_OUTER: 3,
    RIGHT_EYE_INNER: 4,
    RIGHT_EYE: 5,
    RIGHT_EYE_OUTER: 6,
    LEFT_EAR: 7,
    RIGHT_EAR: 8,
    MOUTH_LEFT: 9,
    MOUTH_RIGHT: 10,
    LEFT_SHOULDER: 11,
    RIGHT_SHOULDER: 12,
    LEFT_ELBOW: 13,
    RIGHT_ELBOW: 14,
    LEFT_WRIST: 15,
    RIGHT_WRIST: 16,
    LEFT_HIP: 23,
    RIGHT_HIP: 24,
    LEFT_KNEE: 25,
    RIGHT_KNEE: 26,
    LEFT_ANKLE: 27,
    RIGHT_ANKLE: 28
};

// ================================================================
// CORRECTIONS CALIBRÉES
// ================================================================
// OFFSETS : additifs, proportionnels à la taille (cm)
// Compensent la différence entre articulations squelettiques et surface de la peau
const OFFSETS = {
    // Épaules : les landmarks sont au centre de l'articulation gléno-humérale
    // L'acromion (bord extérieur) est ~5cm plus loin de chaque côté
    // → 10cm total, soit taille × 0.056
    SHOULDER: 0.056,

    // Hanches : les landmarks sont sur l'os iliaque
    // La surface extérieure (grand trochanter + tissus) est ~4.5cm de chaque côté
    // → 9cm total, soit taille × 0.050
    HIP: 0.050,

    // Taille : les landmarks milieu-tronc sont ~3cm de chaque côté sous la peau
    // → 6cm total, soit taille × 0.033
    WAIST: 0.033
};

// FACTEURS ELLIPTIQUES : convertissent la largeur surfacique 2D en circumférence 3D
// Dérivés des vraies mesures : réel / (largeur_appli + offset)
const FACTORS = {
    // Tour de poitrine = (largeurÉpaules + offset) × 2.18
    // Calibré : 98 / 44.9 ≈ 2.18
    POITRINE: 2.18,

    // Tour de taille = (largeurTaille + offset) × 2.40
    TAILLE: 2.40,

    // Tour de hanches = (largeurHanches + offset) × 2.57
    // Calibré : 78 / 30.4 ≈ 2.57
    HANCHES: 2.57,

    // Tour de cou = largeurOreilles × 3.31
    // Calibré : 39 / 11.8 ≈ 3.31 (facteur direct, pas d'offset)
    COU: 3.31,

    // Tour de bras = longueurAvantBras × 0.98
    // Calibré : 26 / 26.5 ≈ 0.98
    BRAS: 0.98,

    // Tour de genou ≈ 54% du tour de hanches (relation anthropométrique connue)
    GENOU_RATIO: 0.54,

    // Correction longueur manche (poignet landmarks ≠ bout du poignet)
    MANCHE_CORRECTION: 1.09,

    // Correction longueur jambe (différence crotch estimé vs réel)
    JAMBE_CORRECTION: 1.11
};

// ================================================================
// FONCTIONS DE CALCUL DE DISTANCE
// ================================================================

/**
 * Distance en cm entre deux landmarks (espace pixel réel)
 */
function distanceCm(a, b, cmPerPixel, videoWidth, videoHeight) {
    const dxPx = (a.x - b.x) * videoWidth;
    const dyPx = (a.y - b.y) * videoHeight;
    return Math.sqrt(dxPx * dxPx + dyPx * dyPx) * cmPerPixel;
}

/**
 * Distance horizontale pure en cm
 */
function hDist(a, b, cmPerPixel, videoWidth) {
    return Math.abs(a.x - b.x) * videoWidth * cmPerPixel;
}

/**
 * Distance euclidienne 2D normalisée (pour stabilité)
 */
function distance2D(a, b) {
    return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
}

/**
 * Point milieu entre deux landmarks
 */
function mid(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Arrondir à 1 décimale */
function round(v) {
    return Math.round(v * 10) / 10;
}

// ================================================================
// CALCUL PRINCIPAL DES MESURES
// ================================================================

/**
 * Calcule les 12 mesures corporelles pour un tailleur
 *
 * @param {Array} landmarks - 33 landmarks MediaPipe Pose
 * @param {number} heightCm - Taille réelle (cm)
 * @param {number} vw - Largeur vidéo (pixels)
 * @param {number} vh - Hauteur vidéo (pixels)
 * @returns {Object} 12 mesures en cm
 */
export function calculateAllMeasurements(landmarks, heightCm, vw = 1280, vh = 720) {
    if (!landmarks || landmarks.length < 29) {
        throw new Error('Landmarks insuffisants');
    }

    // --- Landmarks ---
    const nose = landmarks[LANDMARKS.NOSE];
    const lEar = landmarks[LANDMARKS.LEFT_EAR];
    const rEar = landmarks[LANDMARKS.RIGHT_EAR];
    const lSh = landmarks[LANDMARKS.LEFT_SHOULDER];
    const rSh = landmarks[LANDMARKS.RIGHT_SHOULDER];
    const lEl = landmarks[LANDMARKS.LEFT_ELBOW];
    const rEl = landmarks[LANDMARKS.RIGHT_ELBOW];
    const lWr = landmarks[LANDMARKS.LEFT_WRIST];
    const rWr = landmarks[LANDMARKS.RIGHT_WRIST];
    const lHip = landmarks[LANDMARKS.LEFT_HIP];
    const rHip = landmarks[LANDMARKS.RIGHT_HIP];
    const lKn = landmarks[LANDMARKS.LEFT_KNEE];
    const rKn = landmarks[LANDMARKS.RIGHT_KNEE];
    const lAn = landmarks[LANDMARKS.LEFT_ANKLE];
    const rAn = landmarks[LANDMARKS.RIGHT_ANKLE];

    // --- CALIBRATION cm/pixel ---
    const shoulderMidY = (lSh.y + rSh.y) / 2;
    const headOffset = (shoulderMidY - nose.y) * 0.55;
    const headTopY = nose.y - headOffset;
    const feetY = (lAn.y + rAn.y) / 2;
    const bodyHeightPx = Math.abs(feetY - headTopY) * vh;

    if (bodyHeightPx === 0) throw new Error('Hauteur du corps = 0');

    const cpp = heightCm / bodyHeightPx; // cm par pixel

    // --- OFFSETS proportionnels à la taille ---
    const shOffset = heightCm * OFFSETS.SHOULDER;
    const hipOffset = heightCm * OFFSETS.HIP;
    const waistOffset = heightCm * OFFSETS.WAIST;

    // ============================================================
    // 1. LARGEUR D'ÉPAULES (+ offset articulaire)
    // ============================================================
    const shRaw = hDist(lSh, rSh, cpp, vw);
    const largeurEpaules = round(shRaw + shOffset);

    // ============================================================
    // 2. TOUR DE COU (distance inter-auriculaire × facteur calibré)
    // ============================================================
    const earWidth = hDist(lEar, rEar, cpp, vw);
    const tourCou = round(earWidth * FACTORS.COU);

    // ============================================================
    // 3. TOUR DE POITRINE (largeur surface épaules × facteur elliptique)
    // ============================================================
    const poitrine = round(largeurEpaules * FACTORS.POITRINE);

    // ============================================================
    // 4. TOUR DE TAILLE (milieu du tronc + offset × facteur)
    // ============================================================
    const waistRaw = hDist(mid(lSh, lHip), mid(rSh, rHip), cpp, vw);
    const taille = round((waistRaw + waistOffset) * FACTORS.TAILLE);

    // ============================================================
    // 5. TOUR DE HANCHES (largeur hanches + offset × facteur)
    // ============================================================
    const hipRaw = hDist(lHip, rHip, cpp, vw);
    const hanches = round((hipRaw + hipOffset) * FACTORS.HANCHES);

    // ============================================================
    // 6. TOUR DE BRAS / Tour manche (avant-bras × facteur calibré)
    // ============================================================
    const lFA = distanceCm(lEl, lWr, cpp, vw, vh);
    const rFA = distanceCm(rEl, rWr, cpp, vw, vh);
    const tourBras = round(((lFA + rFA) / 2) * FACTORS.BRAS);

    // ============================================================
    // 7. LONGUEUR DU DOS (milieu épaules → milieu hanches)
    // ============================================================
    const longueurDos = round(distanceCm(mid(lSh, rSh), mid(lHip, rHip), cpp, vw, vh));

    // ============================================================
    // 8. LONGUEUR MANCHE (épaule → coude → poignet × correction)
    // ============================================================
    const lArm = distanceCm(lSh, lEl, cpp, vw, vh) + distanceCm(lEl, lWr, cpp, vw, vh);
    const rArm = distanceCm(rSh, rEl, cpp, vw, vh) + distanceCm(rEl, rWr, cpp, vw, vh);
    const longueurManche = round(((lArm + rArm) / 2) * FACTORS.MANCHE_CORRECTION);

    // ============================================================
    // 9. TOUR DE GENOU (estimé depuis le tour de hanches)
    // ============================================================
    const tourGenou = round(hanches * FACTORS.GENOU_RATIO);

    // ============================================================
    // 10. LONGUEUR HANCHE → GENOU
    // ============================================================
    const lHK = distanceCm(lHip, lKn, cpp, vw, vh);
    const rHK = distanceCm(rHip, rKn, cpp, vw, vh);
    const hancheGenou = round(((lHK + rHK) / 2) * FACTORS.JAMBE_CORRECTION);

    // ============================================================
    // 11. LONGUEUR HANCHE → CHEVILLE (longueur de jambe extérieure)
    // ============================================================
    const lHC = distanceCm(lHip, lAn, cpp, vw, vh);
    const rHC = distanceCm(rHip, rAn, cpp, vw, vh);
    const hancheCheville = round(((lHC + rHC) / 2) * FACTORS.JAMBE_CORRECTION);

    // ============================================================
    // 12. LONGUEUR TOTALE (épaule → cheville — pour boubous/robes)
    // ============================================================
    const lTot = distanceCm(lSh, lAn, cpp, vw, vh);
    const rTot = distanceCm(rSh, rAn, cpp, vw, vh);
    const longueurTotale = round(((lTot + rTot) / 2) * FACTORS.JAMBE_CORRECTION);

    return {
        tourCou,
        largeurEpaules,
        poitrine,
        taille,
        hanches,
        tourBras,
        longueurDos,
        longueurManche,
        tourGenou,
        hancheGenou,
        hancheCheville,
        longueurTotale
    };
}

/**
 * Calcul du ratio pixel→cm (export pour usage externe)
 */
export function calculatePixelToCmRatio(landmarks, heightCm) {
    if (!landmarks || !heightCm) return 1;
    const nose = landmarks[LANDMARKS.NOSE];
    const lAn = landmarks[LANDMARKS.LEFT_ANKLE];
    const rAn = landmarks[LANDMARKS.RIGHT_ANKLE];
    const lSh = landmarks[LANDMARKS.LEFT_SHOULDER];
    const rSh = landmarks[LANDMARKS.RIGHT_SHOULDER];

    const shoulderMidY = (lSh.y + rSh.y) / 2;
    const headOffset = (shoulderMidY - nose.y) * 0.55;
    const headTopY = nose.y - headOffset;
    const feetY = (lAn.y + rAn.y) / 2;
    const bodyHeight = Math.abs(feetY - headTopY);

    return bodyHeight === 0 ? 1 : heightCm / bodyHeight;
}

/**
 * Vérifie la stabilité de la pose entre deux frames
 */
export function isPoseStable(currentLandmarks, previousLandmarks, threshold = 0.008) {
    if (!currentLandmarks || !previousLandmarks) return false;

    const keyIndices = [
        LANDMARKS.LEFT_SHOULDER, LANDMARKS.RIGHT_SHOULDER,
        LANDMARKS.LEFT_HIP, LANDMARKS.RIGHT_HIP,
        LANDMARKS.LEFT_KNEE, LANDMARKS.RIGHT_KNEE
    ];

    let totalMovement = 0;
    let validPoints = 0;

    for (const idx of keyIndices) {
        if (currentLandmarks[idx] && previousLandmarks[idx]) {
            totalMovement += distance2D(currentLandmarks[idx], previousLandmarks[idx]);
            validPoints++;
        }
    }

    return validPoints > 0 && (totalMovement / validPoints) < threshold;
}

/**
 * Vérifie la qualité de la pose pour le calcul des mesures
 */
export function validatePoseQuality(landmarks) {
    const messages = [];
    let isValid = true;

    if (!landmarks || landmarks.length < 29) {
        return { isValid: false, messages: ['📷 Corps non détecté — placez-vous devant la caméra'] };
    }

    const lSh = landmarks[LANDMARKS.LEFT_SHOULDER];
    const rSh = landmarks[LANDMARKS.RIGHT_SHOULDER];
    const lHip = landmarks[LANDMARKS.LEFT_HIP];
    const rHip = landmarks[LANDMARKS.RIGHT_HIP];
    const lAn = landmarks[LANDMARKS.LEFT_ANKLE];
    const rAn = landmarks[LANDMARKS.RIGHT_ANKLE];
    const nose = landmarks[LANDMARKS.NOSE];

    if (nose.y < 0.02) {
        messages.push('⬇ Reculez — votre tête est coupée');
        isValid = false;
    }

    if (lAn.y > 0.95 || rAn.y > 0.95) {
        messages.push('⬆ Reculez — vos pieds doivent être visibles');
        isValid = false;
    }

    if (Math.abs(lSh.x - rSh.x) < 0.05) {
        messages.push('↩ Tournez-vous face à la caméra');
        isValid = false;
    }

    if ((lSh.y + rSh.y) / 2 >= (lHip.y + rHip.y) / 2) {
        messages.push('🧍 Tenez-vous debout, bien droit');
        isValid = false;
    }

    if (Math.abs(lSh.y - rSh.y) > 0.05) {
        messages.push('⚖ Redressez vos épaules');
        isValid = false;
    }

    const leftArmDiff = lSh.x - (landmarks[LANDMARKS.LEFT_WRIST]?.x || lSh.x);
    if (Math.abs(leftArmDiff) < 0.02) {
        messages.push('💪 Écartez légèrement les bras du corps');
        isValid = false;
    }

    if (isValid) {
        messages.push('✅ Position parfaite — restez immobile...');
    }

    return { isValid, messages };
}

/**
 * Dessine les landmarks et connexions sur le canvas
 */
export function drawLandmarks(ctx, landmarks, width, height) {
    if (!ctx || !landmarks) return;

    const connections = [
        [LANDMARKS.LEFT_SHOULDER, LANDMARKS.RIGHT_SHOULDER],
        [LANDMARKS.LEFT_HIP, LANDMARKS.RIGHT_HIP],
        [LANDMARKS.LEFT_SHOULDER, LANDMARKS.LEFT_HIP],
        [LANDMARKS.RIGHT_SHOULDER, LANDMARKS.RIGHT_HIP],
        [LANDMARKS.LEFT_SHOULDER, LANDMARKS.LEFT_ELBOW],
        [LANDMARKS.LEFT_ELBOW, LANDMARKS.LEFT_WRIST],
        [LANDMARKS.RIGHT_SHOULDER, LANDMARKS.RIGHT_ELBOW],
        [LANDMARKS.RIGHT_ELBOW, LANDMARKS.RIGHT_WRIST],
        [LANDMARKS.LEFT_HIP, LANDMARKS.LEFT_KNEE],
        [LANDMARKS.LEFT_KNEE, LANDMARKS.LEFT_ANKLE],
        [LANDMARKS.RIGHT_HIP, LANDMARKS.RIGHT_KNEE],
        [LANDMARKS.RIGHT_KNEE, LANDMARKS.RIGHT_ANKLE]
    ];

    ctx.strokeStyle = 'rgba(198, 139, 89, 0.8)';
    ctx.lineWidth = 3;
    for (const [si, ei] of connections) {
        const s = landmarks[si], e = landmarks[ei];
        if (s && e) {
            ctx.beginPath();
            ctx.moveTo(s.x * width, s.y * height);
            ctx.lineTo(e.x * width, e.y * height);
            ctx.stroke();
        }
    }

    const keyPts = [
        LANDMARKS.NOSE,
        LANDMARKS.LEFT_EAR, LANDMARKS.RIGHT_EAR,
        LANDMARKS.LEFT_SHOULDER, LANDMARKS.RIGHT_SHOULDER,
        LANDMARKS.LEFT_ELBOW, LANDMARKS.RIGHT_ELBOW,
        LANDMARKS.LEFT_WRIST, LANDMARKS.RIGHT_WRIST,
        LANDMARKS.LEFT_HIP, LANDMARKS.RIGHT_HIP,
        LANDMARKS.LEFT_KNEE, LANDMARKS.RIGHT_KNEE,
        LANDMARKS.LEFT_ANKLE, LANDMARKS.RIGHT_ANKLE
    ];

    for (const idx of keyPts) {
        const p = landmarks[idx];
        if (p) {
            ctx.fillStyle = 'rgba(198, 139, 89, 0.95)';
            ctx.beginPath();
            ctx.arc(p.x * width, p.y * height, 6, 0, 2 * Math.PI);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(p.x * width, p.y * height, 3, 0, 2 * Math.PI);
            ctx.fill();
        }
    }
}

/**
 * Dessine les lignes de mesure sur le canvas
 */
export function drawMeasurementLines(ctx, landmarks, width, height) {
    if (!ctx || !landmarks) return;

    ctx.setLineDash([5, 5]);
    ctx.lineWidth = 2;

    const draw = (a, b, color = 'rgba(212, 167, 106, 0.9)') => {
        if (!a || !b) return;
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.moveTo(a.x * width, a.y * height);
        ctx.lineTo(b.x * width, b.y * height);
        ctx.stroke();
    };

    const ls = landmarks[LANDMARKS.LEFT_SHOULDER];
    const rs = landmarks[LANDMARKS.RIGHT_SHOULDER];
    const lh = landmarks[LANDMARKS.LEFT_HIP];
    const rh = landmarks[LANDMARKS.RIGHT_HIP];

    // Épaules
    draw(ls, rs);
    // Hanches
    draw(lh, rh);
    // Taille (milieu du tronc)
    if (ls && rs && lh && rh) draw(mid(ls, lh), mid(rs, rh));
    // Cou (oreilles)
    draw(landmarks[LANDMARKS.LEFT_EAR], landmarks[LANDMARKS.RIGHT_EAR], 'rgba(139, 94, 60, 0.8)');
    // Genoux
    draw(landmarks[LANDMARKS.LEFT_KNEE], landmarks[LANDMARKS.RIGHT_KNEE], 'rgba(198, 139, 89, 0.6)');

    ctx.setLineDash([]);
}

export { LANDMARKS };
