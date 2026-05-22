/**
 * FITMOD — Calculateur de Mesures Corporelles (v5 — Recalibré Tailleur)
 * =====================================================================
 * Convertit les landmarks MediaPipe Pose en mesures corporelles réelles (cm).
 *
 * CALIBRATION v5 — Basée sur comparaison directe avec fiche tailleur réelle :
 *
 * | Code | Mesure               | Tailleur | FITMOD v4 | Correction         |
 * |------|----------------------|:--------:|:---------:|--------------------|
 * | E    | Épaule (largeur)     | 48       | 45.2      | +OFFSET ×0.072     |
 * | P    | Poitrine (tour)      | 100      | 98.5      | facteur 2.08       |
 * | L    | Longueur habit       | 74       | 52.3      | nouvelle formule   |
 * | CM   | Manche courte        | 30       | —         | AJOUTÉE            |
 * | tM   | Tour de manche       | 40       | 23.5      | facteur 1.67       |
 * | LM   | Manche longue        | 55       | 56.9      | facteur 1.054      |
 * | L    | Longueur globale     | 121      | 152       | épaule→tibia       |
 * | C    | Ceinture (tour)      | 82       | 80.9      | léger ajustement   |
 * | B    | Bassin (tour fesses) | 102      | 75.2      | facteur 3.49       |
 * | K    | Cuisse/Entrejambe    | 69       | —         | AJOUTÉE            |
 * | LP   | Longueur pantalon    | 94       | 94.2      | ✅ parfait          |
 * | B    | Tour cheville        | 16       | —         | AJOUTÉE            |
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
// CONSTANTES DE BASE — calibrées pour le BMI de référence (24.5)
// Ces valeurs sont ensuite ajustées dynamiquement par computeMorphFactors()
// ================================================================

// --- OFFSETS DE BASE (compensation articulation → surface peau) ---
const BASE_OFFSETS = {
    SHOULDER: 0.064,  // Épaules : articulation gléno-humérale
    HIP: 0.094,       // Hanches : articulation coxo-fémorale (très interne)
    WAIST: 0.033      // Taille : offset milieu-tronc
};

// --- RATIOS DE PROFONDEUR DE BASE (rapport profondeur/largeur par zone) ---
const BASE_DEPTH_RATIOS = {
    CHEST: 0.65,    // Thorax : section elliptique aplatie
    WAIST: 0.47,    // Abdomen : section plus plate
    HIPS: 0.68,     // Bassin : section large
    NECK: 0.88      // Cou : quasi-circulaire
};

// --- CONVERSIONS ANATOMIQUES DE BASE (landmark → largeur réelle) ---
const BASE_ANATOMICAL = {
    CHEST_TO_SHOULDER: 0.80,   // Largeur poitrine ≈ 80% largeur épaules
    NECK_TO_EAR: 1.09          // Cou : calibré pour ~40cm tour de cou
};

// --- RATIOS DE CIRCONFÉRENCE DE BASE (parties non mesurables frontalement) ---
const BASE_CIRC_RATIOS = {
    ARM_TO_SHOULDER: 0.833,   // Tour bras / largeur épaules
    THIGH_TO_HIP: 0.683,     // Tour cuisse / tour bassin
    KNEE_TO_HIP: 0.54,       // Tour genou / tour bassin
    ANKLE_TO_HIP: 0.158      // Tour cheville / tour bassin
};

// --- FACTEURS DE CORRECTION DES LONGUEURS ---
const BASE_FACTORS = {
    CM_CORRECTION: 1.08,      // Manche courte (épaule→coude)
    LM_CORRECTION: 1.04,      // Manche longue (épaule→poignet)
    JAMBE_CORRECTION: 1.13,   // Longueur jambe (hanche→cheville)
    HABIT_CORRECTION: 1.50,   // Longueur habit (épaule→hanche)
    GLOBAL_CORRECTION: 1.05   // Longueur globale (épaule→tibia)
};

// ================================================================
// BMI DE RÉFÉRENCE — point de calibration des constantes de base
// Les constantes ci-dessus sont exactes pour ce BMI.
// Pour tout autre BMI, elles sont ajustées par computeMorphFactors().
// ================================================================
const REF_BMI = 21;

// ================================================================
// MODÈLE MORPHOLOGIQUE — Ajuste les constantes selon le BMI
// ================================================================
function computeMorphFactors(bmi) {
    const ratio = bmi / REF_BMI;

    // --- tissueFactor : épaisseur des tissus mous autour des articulations ---
    // Power 1.5 en-dessous (réduction douce pour les minces)
    // Power 1.2 au-dessus (augmentation modérée pour les costauds)
    const tissueFactor = ratio < 1
        ? Math.pow(Math.max(0.5, ratio), 1.5)
        : Math.pow(Math.min(1.6, ratio), 1.2);

    const depthFactor = Math.max(0.85, Math.min(1.15,
        0.70 + 0.30 * ratio
    ));

    const circFactor = Math.max(0.80, Math.min(1.20,
        0.65 + 0.35 * ratio
    ));

    return { tissueFactor, depthFactor, circFactor, bmi };
}

// ================================================================
// Périmètre d'une ellipse (approximation de Ramanujan)
// ================================================================
function ellipsePerimeter(width, depthRatio) {
    const a = width / 2;
    const b = a * depthRatio;
    const h = Math.pow((a - b) / (a + b), 2);
    return Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
}

// ================================================================
// FONCTIONS UTILITAIRES
// ================================================================

function round(v) { return Math.round(v * 10) / 10; }

function hDist(a, b, cpp, vw) {
    return Math.abs(a.x - b.x) * vw * cpp;
}

function distanceCm(a, b, cpp, vw, vh) {
    const dx = (a.x - b.x) * vw;
    const dy = (a.y - b.y) * vh;
    return Math.sqrt(dx * dx + dy * dy) * cpp;
}

function mid(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function distance2D(a, b) {
    return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
}

// ================================================================
// LABELS TAILLEUR — Dictionnaire d'affichage
// ================================================================
export const MESURE_LABELS = {
    E:        { short: 'E',     full: 'Épaule (largeur)',           group: 'haut' },
    P:        { short: 'P',     full: 'Poitrine (tour)',            group: 'haut' },
    C:        { short: 'C',     full: 'Ceinture (tour de taille)',  group: 'haut' },
    B:        { short: 'B',     full: 'Bassin (tour de fesses)',    group: 'haut' },
    cou:      { short: 'Cou',   full: 'Tour de cou',                group: 'haut' },
    tM:       { short: 'tM',    full: 'Tour de manche (bras)',      group: 'haut' },
    L_habit:  { short: 'L',     full: 'Longueur habit (épaule→hanche)', group: 'haut' },
    CM:       { short: 'CM',    full: 'Manche courte (épaule→coude)', group: 'manches' },
    LM:       { short: 'LM',    full: 'Manche longue (épaule→poignet)', group: 'manches' },
    K:        { short: 'K',     full: 'Cuisse / Entrejambe',        group: 'jambes' },
    LP:       { short: 'LP',    full: 'Longueur pantalon (hanche→cheville)', group: 'jambes' },
    L_global: { short: 'L',     full: 'Longueur globale (épaule→tibia)', group: 'jambes' },
    T_genou:  { short: 'TG',    full: 'Tour de genou',              group: 'jambes' },
    TChev:    { short: 'TChev', full: 'Tour de cheville',            group: 'jambes' },
};

// ================================================================
// CALCUL PRINCIPAL DES MESURES (v6 — BMI-Adaptive)
// ================================================================

/**
 * Calcule les 14 mesures corporelles pour un tailleur
 * Les constantes sont ajustées dynamiquement selon le BMI du client.
 *
 * @param {Array} landmarks  - 33 landmarks MediaPipe Pose
 * @param {number} heightCm  - Taille réelle (cm)
 * @param {number} vw        - Largeur vidéo (pixels)
 * @param {number} vh        - Hauteur vidéo (pixels)
 * @param {number} weightKg  - Poids réel (kg) — utilisé pour le BMI
 * @returns {Object} 14 mesures en cm avec notation tailleur
 */
export function calculateAllMeasurements(landmarks, heightCm, vw = 1280, vh = 720, weightKg = 70) {
    if (!landmarks || landmarks.length < 29) {
        throw new Error('Landmarks insuffisants');
    }

    const bmi = weightKg / Math.pow(heightCm / 100, 2);
    const morph = computeMorphFactors(bmi);

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

    // --- FACTEURS MORPHOLOGIQUES ---
    const heightRatio = heightCm / 175; // ratio par rapport à la taille de réf.
    const bmiRatio = morph.bmi / REF_BMI;
    // Compound: combine taille + tissu pour les corrections de longueur torse
    const heightTissueFactor = Math.pow(heightRatio * morph.tissueFactor, 1.5);

    // --- OFFSETS ajustés par morphologie ---
    // ÉPAULES: réduit par tissueFactor (peu de tissu chez les minces)
    const shOffset = heightCm * BASE_OFFSETS.SHOULDER * morph.tissueFactor;
    // HANCHES: asymétrique — les minces gardent des hanches proéminentes,
    // les costauds ont PLUS de tissu aux hanches
    const hipTissue = morph.tissueFactor < 1
        ? (1 / morph.tissueFactor)   // BMI bas → inverse (hanches ne maigrissent pas)
        : morph.tissueFactor;         // BMI haut → normal (plus de tissu)
    const hipOffset = heightCm * BASE_OFFSETS.HIP * hipTissue;
    // TAILLE: réduction douce (racine carrée du tissueFactor)
    const waistOffset = heightCm * BASE_OFFSETS.WAIST * Math.pow(morph.tissueFactor, 0.5);

    // ============================================================
    // E — LARGEUR D'ÉPAULES (mesurée directement depuis les landmarks)
    // ============================================================
    const shRaw = hDist(lSh, rSh, cpp, vw);
    const E = round(shRaw + shOffset);

    // ============================================================
    // cou — TOUR DE COU (ellipse sur la largeur du cou)
    // ============================================================
    const earWidth = hDist(lEar, rEar, cpp, vw);
    const neckWidth = earWidth * BASE_ANATOMICAL.NECK_TO_EAR * Math.pow(morph.depthFactor, 0.5);
    const cou = round(ellipsePerimeter(neckWidth, BASE_DEPTH_RATIOS.NECK * morph.depthFactor));

    // ============================================================
    // P — TOUR DE POITRINE (ellipse: largeur poitrine × profondeur)
    // ============================================================
    const chestWidth = E * BASE_ANATOMICAL.CHEST_TO_SHOULDER;
    const P = round(ellipsePerimeter(chestWidth, BASE_DEPTH_RATIOS.CHEST * morph.depthFactor));

    // ============================================================
    // C — CEINTURE / TOUR DE TAILLE (ellipse: largeur taille mesurée)
    // ============================================================
    const waistRaw = hDist(mid(lSh, lHip), mid(rSh, rHip), cpp, vw);
    const waistWidth = waistRaw + waistOffset;
    const C = round(ellipsePerimeter(waistWidth, BASE_DEPTH_RATIOS.WAIST * morph.depthFactor));

    // ============================================================
    // B — BASSIN / TOUR DE FESSES (ellipse: largeur hanches mesurée)
    // depthFactor NON appliqué: les hanches ne s'aplatissent pas chez les minces
    // ============================================================
    const hipRaw = hDist(lHip, rHip, cpp, vw);
    const hipWidth = hipRaw + hipOffset;
    const B = round(ellipsePerimeter(hipWidth, BASE_DEPTH_RATIOS.HIPS));

    // ============================================================
    // tM — TOUR DE MANCHE / BRAS
    // Les bras maigrissent VITE avec un BMI bas → ratio^2
    // ============================================================
    const armFactor = bmiRatio < 1 ? Math.pow(bmiRatio, 2) : Math.pow(bmiRatio, 1.2);
    const tM = round(E * BASE_CIRC_RATIOS.ARM_TO_SHOULDER * armFactor);

    // ============================================================
    // L_habit — LONGUEUR HABIT (épaule → bas de hanche)
    // Correction réduite pour les personnes courtes/minces (moins de tissu = moins de courbure)
    // ============================================================
    const lSide = distanceCm(lSh, lHip, cpp, vw, vh);
    const rSide = distanceCm(rSh, rHip, cpp, vw, vh);
    const L_habit = round(((lSide + rSide) / 2) * BASE_FACTORS.HABIT_CORRECTION * heightTissueFactor);

    // ============================================================
    // CM — MANCHE COURTE (épaule → coude)
    // Correction réduite pour les personnes courtes/minces
    // ============================================================
    const lShEl = distanceCm(lSh, lEl, cpp, vw, vh);
    const rShEl = distanceCm(rSh, rEl, cpp, vw, vh);
    const CM = round(((lShEl + rShEl) / 2) * BASE_FACTORS.CM_CORRECTION * heightTissueFactor);

    // ============================================================
    // LM — MANCHE LONGUE (épaule → coude → poignet) — MESURE DIRECTE
    // ============================================================
    const lArm = distanceCm(lSh, lEl, cpp, vw, vh) + distanceCm(lEl, lWr, cpp, vw, vh);
    const rArm = distanceCm(rSh, rEl, cpp, vw, vh) + distanceCm(rEl, rWr, cpp, vw, vh);
    const LM = round(((lArm + rArm) / 2) * BASE_FACTORS.LM_CORRECTION);

    // ============================================================
    // K — TOUR DE CUISSE (proportionnel au tour de bassin)
    // Les cuisses maigrissent MOINS que les bras → ratio^0.5
    // ============================================================
    const thighFactor = bmiRatio < 1 ? Math.pow(bmiRatio, 0.5) : Math.pow(bmiRatio, 1.2);
    const K = round(B * BASE_CIRC_RATIOS.THIGH_TO_HIP * thighFactor);

    // ============================================================
    // T_genou — TOUR DE GENOU (proportionnel au tour de bassin)
    // ============================================================
    const T_genou = round(B * BASE_CIRC_RATIOS.KNEE_TO_HIP * Math.pow(thighFactor, 0.5));

    // ============================================================
    // LP — LONGUEUR PANTALON (hanche → cheville)
    // Boost pour les personnes plus courtes (jambes proportionnellement plus longues)
    // ============================================================
    const lHC = distanceCm(lHip, lAn, cpp, vw, vh);
    const rHC = distanceCm(rHip, rAn, cpp, vw, vh);
    const lpBoost = 1 + (1 - heightRatio) * 0.8;
    const LP = round(((lHC + rHC) / 2) * BASE_FACTORS.JAMBE_CORRECTION * lpBoost);

    // ============================================================
    // L_global — LONGUEUR GLOBALE (épaule → tibia) — MESURE DIRECTE
    // ============================================================
    const lShKn = distanceCm(lSh, lKn, cpp, vw, vh);
    const rShKn = distanceCm(rSh, rKn, cpp, vw, vh);
    const lKnAn = distanceCm(lKn, lAn, cpp, vw, vh);
    const rKnAn = distanceCm(rKn, rAn, cpp, vw, vh);
    const avgShKn = (lShKn + rShKn) / 2;
    const avgKnAn = (lKnAn + rKnAn) / 2;
    const L_global = round((avgShKn + avgKnAn * 0.5) * BASE_FACTORS.GLOBAL_CORRECTION);

    // ============================================================
    // TChev — TOUR DE CHEVILLE (proportionnel au tour de bassin)
    // ============================================================
    const TChev = round(B * BASE_CIRC_RATIOS.ANKLE_TO_HIP * Math.pow(morph.circFactor, 0.3));

    return {
        E,
        P,
        C,
        B,
        cou,
        tM,
        L_habit,
        CM,
        LM,
        K,
        LP,
        L_global,
        T_genou,
        TChev
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
        return { isValid: false, messages: ['Corps non détecté — placez-vous devant la caméra'] };
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
    // Longueur habit (épaule → hanche, un côté)
    draw(ls, lh, 'rgba(139, 94, 60, 0.5)');
    // Entrejambe (milieu hanches → genou)
    if (lh && rh) {
        const crotch = mid(lh, rh);
        draw(crotch, landmarks[LANDMARKS.LEFT_KNEE], 'rgba(198, 139, 89, 0.4)');
    }

    ctx.setLineDash([]);
}

export { LANDMARKS };
