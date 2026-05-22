/**
 * FITMOD — useVetementRenderer.js
 * =================================
 * Dessine le vêtement sur le canvas 2 et l'occlusion bras sur le canvas 3.
 * 
 * Architecture 3 canvas :
 *   Canvas 1 → webcam brute (géré dans CabineEssayage.jsx)
 *   Canvas 2 → vêtement positionné/redimensionné (ce hook)
 *   Canvas 3 → occlusion bras via BodyPix (ce hook)
 */

import { useEffect, useRef } from 'react';
import { LANDMARKS, BODY_PARTS } from './useBodyTracking';

export function useVetementRenderer(
    canvasVetementRef,
    canvasOcclusionRef,
    videoRef,
    landmarks,
    segmentation,
    vetementImg,
    options = {}
) {
    const { opacity = 0.92 } = options;
    const prevPosRef = useRef(null);

    useEffect(() => {
        if (!landmarks || !vetementImg) return;

        const cvVet = canvasVetementRef.current;
        const cvOcc = canvasOcclusionRef.current;
        const video = videoRef.current;
        if (!cvVet || !cvOcc || !video) return;

        const ctxV = cvVet.getContext('2d');
        const ctxO = cvOcc.getContext('2d');
        const W = cvVet.width;
        const H = cvVet.height;

        if (W === 0 || H === 0) return;

        // ═══════════════════════════════════════════════════════════
        // 1. POSITIONNER LE VÊTEMENT
        // ═══════════════════════════════════════════════════════════

        // Les landmarks MediaPipe sont normalisés (0-1)
        // Convertir en pixels canvas (avec miroir pour webcam)
        const lmPixel = (idx) => {
            const lm = landmarks[idx];
            if (!lm) return null;
            return {
                x: (1 - lm.x) * W,  // Miroir horizontal
                y: lm.y * H,
            };
        };

        const epauleG = lmPixel(LANDMARKS.L_SHOULDER);
        const epauleD = lmPixel(LANDMARKS.R_SHOULDER);
        const hancheG = lmPixel(LANDMARKS.L_HIP);
        const hancheD = lmPixel(LANDMARKS.R_HIP);

        if (!epauleG || !epauleD || !hancheG || !hancheD) return;

        // Milieu des épaules et hanches
        const midShX = (epauleG.x + epauleD.x) / 2;
        const midShY = (epauleG.y + epauleD.y) / 2;
        const midHipY = (hancheG.y + hancheD.y) / 2;

        // Dimensions du torse
        const largeurEpaules = Math.abs(epauleD.x - epauleG.x);
        const hauteurTorse = Math.abs(midHipY - midShY);

        // Le vêtement dépasse les épaules (+30% de chaque côté) et descend sous les hanches
        const largeurVetement = largeurEpaules * 1.6;
        const hauteurVetement = hauteurTorse * 1.4;

        // Position centrée sur le milieu des épaules
        const xVetement = midShX - largeurVetement / 2;
        const yVetement = midShY - hauteurVetement * 0.1; // Légèrement au-dessus (col)

        // ── Lissage temporel (éviter les saccades) ──
        const SMOOTH = 0.25;
        let fx = xVetement, fy = yVetement, fw = largeurVetement, fh = hauteurVetement;

        if (prevPosRef.current) {
            fx = prevPosRef.current.x + (xVetement - prevPosRef.current.x) * (1 - SMOOTH);
            fy = prevPosRef.current.y + (yVetement - prevPosRef.current.y) * (1 - SMOOTH);
            fw = prevPosRef.current.w + (largeurVetement - prevPosRef.current.w) * (1 - SMOOTH);
            fh = prevPosRef.current.h + (hauteurVetement - prevPosRef.current.h) * (1 - SMOOTH);
        }
        prevPosRef.current = { x: fx, y: fy, w: fw, h: fh };

        // ── Dessiner le vêtement ──
        ctxV.clearRect(0, 0, W, H);
        ctxV.globalAlpha = opacity;
        ctxV.drawImage(vetementImg, fx, fy, fw, fh);
        ctxV.globalAlpha = 1.0;

        // ═══════════════════════════════════════════════════════════
        // 2. OCCLUSION DES BRAS (bras par-dessus le vêtement)
        // ═══════════════════════════════════════════════════════════
        ctxO.clearRect(0, 0, W, H);

        if (!segmentation || !segmentation.data) return;

        const segW = segmentation.width;
        const segH = segmentation.height;
        const partData = segmentation.data;

        // Parties du corps = bras + mains
        const armParts = new Set([
            BODY_PARTS.LEFT_UPPER_ARM,
            BODY_PARTS.RIGHT_UPPER_ARM,
            BODY_PARTS.LEFT_LOWER_ARM,
            BODY_PARTS.RIGHT_LOWER_ARM,
            BODY_PARTS.LEFT_HAND,
            BODY_PARTS.RIGHT_HAND,
        ]);

        // Créer le masque sur un canvas temporaire à la taille de la segmentation
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = segW;
        maskCanvas.height = segH;
        const maskCtx = maskCanvas.getContext('2d');
        const maskData = maskCtx.createImageData(segW, segH);

        for (let i = 0; i < partData.length; i++) {
            if (armParts.has(partData[i])) {
                const px = i * 4;
                maskData.data[px] = 255;
                maskData.data[px + 1] = 255;
                maskData.data[px + 2] = 255;
                maskData.data[px + 3] = 255;
            }
        }
        maskCtx.putImageData(maskData, 0, 0);

        // Dessiner le masque redimensionné
        ctxO.drawImage(maskCanvas, 0, 0, W, H);

        // Appliquer la vidéo uniquement sur les zones de bras (source-in)
        ctxO.globalCompositeOperation = 'source-in';
        ctxO.save();
        ctxO.translate(W, 0);  // Miroir
        ctxO.scale(-1, 1);
        ctxO.drawImage(video, 0, 0, W, H);
        ctxO.restore();
        ctxO.globalCompositeOperation = 'source-over';

    }, [landmarks, segmentation, vetementImg, opacity]);
}
