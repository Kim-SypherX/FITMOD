/**
 * FITMOD — useBodyTracking.js
 * ============================
 * Hook qui gère MediaPipe PoseLandmarker ET BodyPix en parallèle.
 * 
 * PoseLandmarker (@mediapipe/tasks-vision) → 33 landmarks corporels
 * BodyPix (@tensorflow-models/body-pix) → segmentation pixel-par-pixel
 * 
 * Les deux modèles tournent en boucle sur chaque frame vidéo.
 */

import { useEffect, useRef, useState } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as bodyPix from '@tensorflow-models/body-pix';

// Index des landmarks MediaPipe Pose
export const LANDMARKS = {
    NOSE: 0,
    L_SHOULDER: 11, R_SHOULDER: 12,
    L_ELBOW: 13,    R_ELBOW: 14,
    L_WRIST: 15,    R_WRIST: 16,
    L_HIP: 23,      R_HIP: 24,
    L_KNEE: 25,     R_KNEE: 26,
    L_ANKLE: 27,    R_ANKLE: 28,
};

// Parties du corps BodyPix utilisées pour l'occlusion
export const BODY_PARTS = {
    LEFT_UPPER_ARM: 12,
    RIGHT_UPPER_ARM: 13,
    LEFT_LOWER_ARM: 10,
    RIGHT_LOWER_ARM: 11,
    LEFT_HAND: 4,
    RIGHT_HAND: 5,
};

export function useBodyTracking(videoRef) {
    const [landmarks, setLandmarks] = useState(null);
    const [segmentation, setSegmentation] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [loadingProgress, setLoadingProgress] = useState('');
    const [error, setError] = useState(null);

    const bodyPixModelRef = useRef(null);
    const poseLandmarkerRef = useRef(null);
    const rafRef = useRef(null);
    const frameCountRef = useRef(0);
    const lastPoseTimeRef = useRef(0);

    useEffect(() => {
        let cancelled = false;

        async function chargerModeles() {
            try {
                // ── 1. Initialiser TensorFlow.js ──
                setLoadingProgress('⚙️ Initialisation TensorFlow.js...');
                await tf.setBackend('webgl');
                await tf.ready();
                if (cancelled) return;

                // ── 2. Charger BodyPix (segmentation corps) ──
                setLoadingProgress('🧠 Chargement BodyPix (segmentation)...');
                const bpModel = await bodyPix.load({
                    architecture: 'MobileNetV1',
                    outputStride: 16,
                    multiplier: 0.75,
                    quantBytes: 2,
                });
                if (cancelled) return;
                bodyPixModelRef.current = bpModel;

                // ── 3. Charger MediaPipe PoseLandmarker (landmarks) ──
                setLoadingProgress('📐 Chargement MediaPipe Pose (landmarks)...');

                const { PoseLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');

                const vision = await FilesetResolver.forVisionTasks(
                    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
                );

                const poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
                    baseOptions: {
                        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task',
                        delegate: 'GPU',
                    },
                    runningMode: 'VIDEO',
                    numPoses: 1,
                    minPoseDetectionConfidence: 0.6,
                    minPosePresenceConfidence: 0.6,
                    minTrackingConfidence: 0.6,
                });

                if (cancelled) return;
                poseLandmarkerRef.current = poseLandmarker;

                setLoadingProgress('✅ Modèles chargés — prêt !');
                setIsLoading(false);

                // ── 4. Lancer la boucle de détection ──
                lancerDetection();

            } catch (err) {
                if (cancelled) return;
                console.error('❌ Erreur chargement modèles:', err);
                setError(`Erreur chargement IA: ${err.message}`);
                setIsLoading(false);
            }
        }

        function lancerDetection() {
            async function detecter() {
                if (cancelled) return;

                const video = videoRef.current;
                if (!video || video.readyState < 2 || video.paused) {
                    rafRef.current = requestAnimationFrame(detecter);
                    return;
                }

                frameCountRef.current++;
                const now = performance.now();

                try {
                    // ── BodyPix — segmentation (toutes les 3 frames pour perf) ──
                    if (bodyPixModelRef.current && frameCountRef.current % 3 === 0) {
                        const seg = await bodyPixModelRef.current.segmentPersonParts(video, {
                            internalResolution: 'medium',
                            segmentationThreshold: 0.6,
                            flipHorizontal: false,
                        });
                        if (!cancelled) setSegmentation(seg);
                    }

                    // ── MediaPipe PoseLandmarker — landmarks (chaque frame, min 30ms entre) ──
                    if (poseLandmarkerRef.current && now - lastPoseTimeRef.current > 30) {
                        const result = poseLandmarkerRef.current.detectForVideo(video, now);
                        if (!cancelled && result?.landmarks?.[0]) {
                            setLandmarks(result.landmarks[0]);
                        }
                        lastPoseTimeRef.current = now;
                    }
                } catch (e) {
                    // Ignorer les erreurs de frame
                }

                rafRef.current = requestAnimationFrame(detecter);
            }

            rafRef.current = requestAnimationFrame(detecter);
        }

        chargerModeles();

        return () => {
            cancelled = true;
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [videoRef]);

    return { landmarks, segmentation, isLoading, loadingProgress, error };
}
