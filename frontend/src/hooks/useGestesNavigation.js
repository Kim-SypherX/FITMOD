/**
 * FITMOD — useGestesNavigation.js
 * ================================
 * Hook MediaPipe Hands pour la navigation gestuelle dans la cabine AR.
 * Fonctionne EN PARALLÈLE de Camera Kit (qui gère le corps).
 * 
 * Gestes supportés :
 *   👋 Swipe droite/gauche → Changer de modèle
 *   ☝️ Doigt haut/bas → Changer de couleur
 *   👍 Pouce → Favori
 *   ✊ Poing → Commander
 */

import { useEffect, useRef, useCallback, useState } from 'react';

const GESTURE_COOLDOWN = 800; // ms entre deux gestes identiques
const SWIPE_THRESHOLD = 0.15; // Déplacement min normalisé pour un swipe

export default function useGestesNavigation(videoElement, callbacks = {}) {
    const recognizerRef = useRef(null);
    const lastGestureRef = useRef({ action: null, time: 0 });
    const prevWristRef = useRef(null);
    const frameIdRef = useRef(null);
    const [isReady, setIsReady] = useState(false);
    const [gestureLabel, setGestureLabel] = useState(null);
    const gestureTimeoutRef = useRef(null);

    const {
        onNextModel,
        onPrevModel,
        onNextColor,
        onPrevColor,
        onFavorite,
        onOrder,
    } = callbacks;

    // ═══════════════════════════════════════════════════════════
    // INITIALISATION MediaPipe GestureRecognizer
    // ═══════════════════════════════════════════════════════════
    useEffect(() => {
        let cancelled = false;

        async function init() {
            try {
                const { GestureRecognizer, FilesetResolver } = await import('@mediapipe/tasks-vision');

                const vision = await FilesetResolver.forVisionTasks(
                    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
                );

                const recognizer = await GestureRecognizer.createFromOptions(vision, {
                    baseOptions: {
                        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/latest/gesture_recognizer.task',
                        delegate: 'GPU',
                    },
                    runningMode: 'VIDEO',
                    numHands: 1,
                });

                if (cancelled) return;
                recognizerRef.current = recognizer;
                setIsReady(true);
                console.log('✅ GestureRecognizer initialisé');
            } catch (err) {
                console.warn('⚠ Gestes non disponibles:', err.message);
            }
        }

        init();
        return () => { cancelled = true; };
    }, []);

    // ═══════════════════════════════════════════════════════════
    // BOUCLE DE DÉTECTION
    // ═══════════════════════════════════════════════════════════
    useEffect(() => {
        if (!isReady || !videoElement) return;

        const recognizer = recognizerRef.current;
        if (!recognizer) return;

        let running = true;

        const detect = () => {
            if (!running || !videoElement || videoElement.paused || videoElement.readyState < 2) {
                frameIdRef.current = requestAnimationFrame(detect);
                return;
            }

            try {
                const result = recognizer.recognizeForVideo(videoElement, performance.now());
                processResult(result);
            } catch (e) {
                // Ignore frame errors
            }

            frameIdRef.current = requestAnimationFrame(detect);
        };

        frameIdRef.current = requestAnimationFrame(detect);

        return () => {
            running = false;
            if (frameIdRef.current) cancelAnimationFrame(frameIdRef.current);
        };
    }, [isReady, videoElement]);

    // ═══════════════════════════════════════════════════════════
    // TRAITEMENT DES RÉSULTATS
    // ═══════════════════════════════════════════════════════════
    const processResult = useCallback((result) => {
        if (!result?.gestures?.length || !result?.landmarks?.length) {
            prevWristRef.current = null;
            return;
        }

        const gesture = result.gestures[0][0];
        const landmarks = result.landmarks[0];
        const wrist = landmarks[0]; // Poignet
        const now = Date.now();

        // Cooldown
        const last = lastGestureRef.current;
        const canFire = !last.action || last.action !== gesture.categoryName || now - last.time > GESTURE_COOLDOWN;

        // ── Détection des swipes (mouvement du poignet) ──
        if (prevWristRef.current && gesture.categoryName === 'Open_Palm') {
            const dx = wrist.x - prevWristRef.current.x;
            const dy = wrist.y - prevWristRef.current.y;

            if (Math.abs(dx) > SWIPE_THRESHOLD && canFire) {
                if (dx > 0) {
                    onPrevModel?.();
                    showGesture('👋 Modèle précédent');
                } else {
                    onNextModel?.();
                    showGesture('👋 Modèle suivant');
                }
                lastGestureRef.current = { action: 'swipe', time: now };
                prevWristRef.current = wrist;
                return;
            }

            if (Math.abs(dy) > SWIPE_THRESHOLD && canFire) {
                if (dy > 0) {
                    onNextColor?.();
                    showGesture('☝️ Couleur suivante');
                } else {
                    onPrevColor?.();
                    showGesture('☝️ Couleur précédente');
                }
                lastGestureRef.current = { action: 'color', time: now };
                prevWristRef.current = wrist;
                return;
            }
        }
        prevWristRef.current = wrist;

        // ── Gestes statiques ──
        if (!canFire) return;

        switch (gesture.categoryName) {
            case 'Thumb_Up':
                onFavorite?.();
                showGesture('👍 Ajouté aux favoris');
                lastGestureRef.current = { action: 'Thumb_Up', time: now };
                break;

            case 'Closed_Fist':
                onOrder?.();
                showGesture('✊ Commander');
                lastGestureRef.current = { action: 'Closed_Fist', time: now };
                break;
        }
    }, [onNextModel, onPrevModel, onNextColor, onPrevColor, onFavorite, onOrder]);

    // ── Afficher le toast du geste ──
    const showGesture = useCallback((label) => {
        setGestureLabel(label);
        clearTimeout(gestureTimeoutRef.current);
        gestureTimeoutRef.current = setTimeout(() => setGestureLabel(null), 1500);
    }, []);

    return { gestureLabel, isReady };
}
