/**
 * FITMOD — useMediaPipeVTON.js
 * ==============================
 * Hook MediaPipe optimisé pour le Virtual Try-On.
 * 
 * Charge :
 *   - PoseLandmarker (détection corporelle 33 landmarks)
 *   - GestureRecognizer (contrôle gestuel mains-libres)
 * 
 * Optimisations :
 *   - Détection à 30fps max (skip frames si nécessaire)
 *   - Lissage temporel des landmarks (smoothing)
 *   - Gestion automatique du cycle de vie (chargement/nettoyage)
 *   - 100% côté client — aucune donnée envoyée au serveur
 */

import { useState, useEffect, useRef, useCallback } from 'react';

// ─── URLs CDN MediaPipe Vision ───
const VISION_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';

// ─── Configuration ───
const SMOOTHING_FACTOR = 0.35;   // Lissage des landmarks (0 = pas de lissage, 1 = pas de mouvement)
const MIN_FRAME_INTERVAL = 33;   // ~30fps max (ms entre détections)

/**
 * Hook principal VTON
 * 
 * @returns {{
 *   detectFrame: Function,      // Détecte pose + gestes sur une frame vidéo
 *   isLoading: boolean,
 *   error: string|null,
 *   progress: string,
 *   smoothedLandmarks: Array,   // Landmarks lissés de la dernière frame
 * }}
 */
export function useMediaPipeVTON() {
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [progress, setProgress] = useState('');

    const poseLandmarkerRef = useRef(null);
    const gestureRecognizerRef = useRef(null);
    const visionModuleRef = useRef(null);

    // Smoothing state
    const smoothedRef = useRef(null); // Array de 33 landmarks lissés
    const lastDetectTime = useRef(0);

    // ── Initialisation ──
    useEffect(() => {
        let cancelled = false;

        async function init() {
            try {
                setProgress('Chargement du module Vision IA...');
                const vision = await importVisionModule();
                if (cancelled) return;
                visionModuleRef.current = vision;

                const { FilesetResolver, PoseLandmarker, GestureRecognizer } = vision;

                setProgress('Initialisation du moteur WASM...');
                const filesetResolver = await FilesetResolver.forVisionTasks(VISION_CDN);
                if (cancelled) return;

                // ── PoseLandmarker (corps) ──
                setProgress('Chargement du modèle de détection corporelle...');
                const poseLandmarker = await PoseLandmarker.createFromOptions(filesetResolver, {
                    baseOptions: {
                        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
                        delegate: 'GPU'
                    },
                    runningMode: 'VIDEO',
                    numPoses: 1,
                    minPoseDetectionConfidence: 0.5,
                    minPosePresenceConfidence: 0.5,
                    minTrackingConfidence: 0.5,
                });
                if (cancelled) return;
                poseLandmarkerRef.current = poseLandmarker;

                // ── GestureRecognizer (mains) ──
                setProgress('Chargement de la reconnaissance gestuelle...');
                const gestureRecognizer = await GestureRecognizer.createFromOptions(filesetResolver, {
                    baseOptions: {
                        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task',
                        delegate: 'GPU'
                    },
                    runningMode: 'VIDEO',
                    numHands: 2,
                });
                if (cancelled) return;
                gestureRecognizerRef.current = gestureRecognizer;

                setProgress('');
                setIsLoading(false);
                console.log('✅ MediaPipe VTON initialisé (Pose + Gesture)');

            } catch (err) {
                if (!cancelled) {
                    console.error('❌ Erreur MediaPipe VTON:', err);
                    setError(err.message || 'Erreur lors du chargement de MediaPipe');
                    setIsLoading(false);
                }
            }
        }

        init();

        return () => {
            cancelled = true;
            poseLandmarkerRef.current?.close();
            gestureRecognizerRef.current?.close();
            poseLandmarkerRef.current = null;
            gestureRecognizerRef.current = null;
        };
    }, []);

    /**
     * Détecte la pose et les gestes sur une frame vidéo.
     * Applique un lissage temporel aux landmarks.
     * Gère le framerate automatiquement.
     * 
     * @param {HTMLVideoElement} video
     * @returns {{ landmarks: Array|null, gestureResult: Object|null, fps: number }}
     */
    const detectFrame = useCallback((video) => {
        if (!video || video.paused || video.ended) return { landmarks: null, gestureResult: null };
        
        const now = performance.now();
        
        // Limiter le framerate de détection
        if (now - lastDetectTime.current < MIN_FRAME_INTERVAL) {
            return {
                landmarks: smoothedRef.current,
                gestureResult: null,
                skipped: true,
            };
        }
        lastDetectTime.current = now;

        let landmarks = null;
        let gestureResult = null;

        // ── Détection Pose ──
        if (poseLandmarkerRef.current) {
            try {
                const result = poseLandmarkerRef.current.detectForVideo(video, now);
                if (result?.landmarks?.length > 0) {
                    landmarks = result.landmarks[0];
                    
                    // Appliquer le lissage temporel
                    if (smoothedRef.current && smoothedRef.current.length === landmarks.length) {
                        landmarks = landmarks.map((lm, i) => {
                            const prev = smoothedRef.current[i];
                            return {
                                x: prev.x + (lm.x - prev.x) * (1 - SMOOTHING_FACTOR),
                                y: prev.y + (lm.y - prev.y) * (1 - SMOOTHING_FACTOR),
                                z: prev.z + (lm.z - prev.z) * (1 - SMOOTHING_FACTOR),
                                visibility: lm.visibility,
                            };
                        });
                    }
                    smoothedRef.current = landmarks;
                }
            } catch (err) {
                console.warn('⚠ Pose detection error:', err.message);
            }
        }

        // ── Détection Gestes ──
        if (gestureRecognizerRef.current) {
            try {
                gestureResult = gestureRecognizerRef.current.recognizeForVideo(video, now + 1);
            } catch (err) {
                // Silencieux — les gestes sont optionnels
            }
        }

        return { landmarks, gestureResult, skipped: false };
    }, []);

    /**
     * Réinitialise le lissage (utile quand on change de modèle)
     */
    const resetSmoothing = useCallback(() => {
        smoothedRef.current = null;
    }, []);

    return {
        detectFrame,
        isLoading,
        error,
        progress,
        smoothedLandmarks: smoothedRef.current,
        resetSmoothing,
    };
}

// ─── Chargement dynamique du module MediaPipe Vision ───
async function importVisionModule() {
    if (window.__mediapipeVision) return window.__mediapipeVision;

    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.type = 'module';
        script.textContent = `
            import * as vision from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest';
            window.__mediapipeVision = vision;
            window.dispatchEvent(new Event('mediapipe-vision-loaded'));
        `;

        const onLoaded = () => {
            window.removeEventListener('mediapipe-vision-loaded', onLoaded);
            if (window.__mediapipeVision) {
                resolve(window.__mediapipeVision);
            } else {
                reject(new Error('Module MediaPipe Vision non disponible'));
            }
        };

        window.addEventListener('mediapipe-vision-loaded', onLoaded);
        script.onerror = () => reject(new Error('Impossible de charger MediaPipe Vision'));
        document.head.appendChild(script);

        setTimeout(() => reject(new Error('Timeout : chargement MediaPipe trop long')), 20000);
    });
}

export default useMediaPipeVTON;
