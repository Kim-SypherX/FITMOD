/**
 * FITMOD — useMediaPipe Hook
 * ===========================
 * Centralise le chargement et l'initialisation de :
 * - MediaPipe Pose Landmarker (détection corporelle)
 * - MediaPipe Gesture Recognizer (contrôle gestuel)
 *
 * Charge les scripts via CDN — aucune installation requise.
 * Tout le traitement IA se passe 100% côté client.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

// URLs CDN MediaPipe Vision
const VISION_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';

/**
 * Hook principal — charge et initialise les modules MediaPipe
 * @param {Object} options
 * @param {boolean} options.enablePose - Activer PoseLandmarker (défaut: true)
 * @param {boolean} options.enableGesture - Activer GestureRecognizer (défaut: false)
 * @returns {Object} { poseLandmarker, gestureRecognizer, isLoading, error, detectPose, detectGesture }
 */
export function useMediaPipe({ enablePose = true, enableGesture = false } = {}) {
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [progress, setProgress] = useState('');

    const poseLandmarkerRef = useRef(null);
    const gestureRecognizerRef = useRef(null);
    const visionModuleRef = useRef(null);

    useEffect(() => {
        let cancelled = false;

        async function init() {
            try {
                setProgress('Chargement du module Vision...');

                // Charger le module Vision depuis le CDN
                const vision = await importVisionModule();
                if (cancelled) return;
                visionModuleRef.current = vision;

                const { FilesetResolver, PoseLandmarker, GestureRecognizer } = vision;

                // Créer le fileset resolver avec les fichiers WASM
                setProgress('Initialisation du moteur WASM...');
                const filesetResolver = await FilesetResolver.forVisionTasks(VISION_CDN);
                if (cancelled) return;

                // --- Initialisation de PoseLandmarker ---
                if (enablePose) {
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
                        minTrackingConfidence: 0.5
                    });
                    if (cancelled) return;
                    poseLandmarkerRef.current = poseLandmarker;
                }

                // --- Initialisation de GestureRecognizer ---
                if (enableGesture) {
                    setProgress('Chargement du modèle de reconnaissance gestuelle...');
                    const gestureRecognizer = await GestureRecognizer.createFromOptions(filesetResolver, {
                        baseOptions: {
                            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task',
                            delegate: 'GPU'
                        },
                        runningMode: 'VIDEO',
                        numHands: 2
                    });
                    if (cancelled) return;
                    gestureRecognizerRef.current = gestureRecognizer;
                }

                setProgress('');
                setIsLoading(false);
            } catch (err) {
                if (!cancelled) {
                    console.error('❌ Erreur initialisation MediaPipe:', err);
                    setError(err.message || 'Erreur lors du chargement de MediaPipe');
                    setIsLoading(false);
                }
            }
        }

        init();

        return () => {
            cancelled = true;
            // Nettoyage des instances MediaPipe
            if (poseLandmarkerRef.current) {
                poseLandmarkerRef.current.close();
                poseLandmarkerRef.current = null;
            }
            if (gestureRecognizerRef.current) {
                gestureRecognizerRef.current.close();
                gestureRecognizerRef.current = null;
            }
        };
    }, [enablePose, enableGesture]);

    /**
     * Détecte la pose corporelle sur une frame vidéo
     * @param {HTMLVideoElement} videoElement
     * @param {number} timestamp - performance.now()
     * @returns {Object|null} Résultat avec landmarks
     */
    const detectPose = useCallback((videoElement, timestamp) => {
        if (!poseLandmarkerRef.current || !videoElement) return null;
        try {
            return poseLandmarkerRef.current.detectForVideo(videoElement, timestamp);
        } catch (err) {
            console.warn('⚠ Erreur détection pose:', err);
            return null;
        }
    }, []);

    /**
     * Détecte la pose sur une image statique (mode upload)
     * @param {HTMLImageElement} imageElement
     * @returns {Object|null} Résultat avec landmarks
     */
    const detectPoseImage = useCallback(async (imageElement) => {
        if (!poseLandmarkerRef.current || !imageElement) return null;
        try {
            // Switcher temporairement en mode IMAGE
            const { PoseLandmarker } = visionModuleRef.current;
            const { FilesetResolver } = visionModuleRef.current;

            // Recréer en mode IMAGE pour l'analyse de photo
            const filesetResolver = await FilesetResolver.forVisionTasks(VISION_CDN);
            const imagePoseLandmarker = await PoseLandmarker.createFromOptions(filesetResolver, {
                baseOptions: {
                    modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
                    delegate: 'GPU'
                },
                runningMode: 'IMAGE',
                numPoses: 1
            });

            const result = imagePoseLandmarker.detect(imageElement);
            imagePoseLandmarker.close();
            return result;
        } catch (err) {
            console.warn('⚠ Erreur détection pose image:', err);
            return null;
        }
    }, []);

    /**
     * Reconnaît les gestes sur une frame vidéo
     * @param {HTMLVideoElement} videoElement
     * @param {number} timestamp
     * @returns {Object|null} Résultat avec gestes et landmarks des mains
     */
    const detectGesture = useCallback((videoElement, timestamp) => {
        if (!gestureRecognizerRef.current || !videoElement) return null;
        try {
            return gestureRecognizerRef.current.recognizeForVideo(videoElement, timestamp);
        } catch (err) {
            console.warn('⚠ Erreur reconnaissance geste:', err);
            return null;
        }
    }, []);

    return {
        poseLandmarker: poseLandmarkerRef.current,
        gestureRecognizer: gestureRecognizerRef.current,
        isLoading,
        error,
        progress,
        detectPose,
        detectPoseImage,
        detectGesture
    };
}

/**
 * Charge dynamiquement le module @mediapipe/tasks-vision depuis le CDN
 * Utilise un import dynamique via un script injecté
 */
async function importVisionModule() {
    // Vérifier si déjà chargé
    if (window.__mediapipeVision) {
        return window.__mediapipeVision;
    }

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
        script.onerror = () => reject(new Error('Impossible de charger MediaPipe Vision depuis le CDN'));
        document.head.appendChild(script);

        // Timeout de sécurité (15 secondes)
        setTimeout(() => {
            reject(new Error('Timeout : chargement de MediaPipe Vision trop long'));
        }, 15000);
    });
}

export default useMediaPipe;
