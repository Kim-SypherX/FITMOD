/**
 * FITMOD — useCameraKit.js
 * ========================
 * Hook React pour gérer Snap Camera Kit :
 * - Initialisation du SDK avec API Token
 * - Connexion webcam → Camera Kit → canvas
 * - Chargement et changement de Lens (vêtements)
 * - Nettoyage propre au démontage
 * 
 * Usage :
 *   const { canvasRef, isReady, error, applyLens, removeLens } = useCameraKit(API_TOKEN, LENS_GROUP_ID);
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { bootstrapCameraKit, createMediaStreamSource, Transform2D } from '@snap/camera-kit';

export default function useCameraKit(apiToken, lensGroupId) {
    const canvasRef = useRef(null);
    const cameraKitRef = useRef(null);
    const sessionRef = useRef(null);
    const mediaStreamRef = useRef(null);
    const currentLensRef = useRef(null);

    const [isReady, setIsReady] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [currentLensId, setCurrentLensId] = useState(null);

    // ═══════════════════════════════════════════════════════════
    // INITIALISATION
    // ═══════════════════════════════════════════════════════════
    useEffect(() => {
        if (!apiToken || !lensGroupId) {
            setError('⚠ Token API Snap ou Lens Group ID manquant. Configurez vos clés dans .env');
            setIsLoading(false);
            return;
        }

        let cancelled = false;

        async function init() {
            try {
                setIsLoading(true);
                setError(null);

                // 1. Bootstrap Camera Kit
                const cameraKit = await bootstrapCameraKit({ apiToken });
                if (cancelled) return;
                cameraKitRef.current = cameraKit;

                // 2. Créer la session liée au canvas
                if (!canvasRef.current) {
                    throw new Error('Canvas non trouvé');
                }

                const session = await cameraKit.createSession({
                    liveRenderTarget: canvasRef.current,
                });
                if (cancelled) return;
                sessionRef.current = session;

                // 3. Activer la webcam
                const mediaStream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                        facingMode: 'user',
                    },
                });
                if (cancelled) {
                    mediaStream.getTracks().forEach(t => t.stop());
                    return;
                }
                mediaStreamRef.current = mediaStream;

                // 4. Connecter webcam → Camera Kit (miroir horizontal)
                const source = createMediaStreamSource(mediaStream, {
                    transform: Transform2D.MirrorX,
                });
                await session.setSource(source);

                // 5. Démarrer le rendu live
                await session.play('live');

                setIsReady(true);
                setIsLoading(false);

                console.log('✅ Camera Kit initialisé avec succès');
            } catch (err) {
                if (cancelled) return;
                console.error('❌ Erreur Camera Kit:', err);
                setError(`Erreur Camera Kit: ${err.message}`);
                setIsLoading(false);
            }
        }

        init();

        return () => {
            cancelled = true;
            cleanup();
        };
    }, [apiToken, lensGroupId]);

    // ═══════════════════════════════════════════════════════════
    // APPLIQUER UNE LENS (= un vêtement)
    // ═══════════════════════════════════════════════════════════
    const applyLens = useCallback(async (lensId) => {
        const cameraKit = cameraKitRef.current;
        const session = sessionRef.current;

        if (!cameraKit || !session) {
            console.warn('Camera Kit non initialisé');
            return false;
        }

        if (!lensId) {
            console.warn('Pas de Lens ID fourni');
            return false;
        }

        try {
            // Charger la Lens depuis le repository Snap
            const lens = await cameraKit.lensRepository.loadLens(lensId, lensGroupId);

            // Appliquer la Lens à la session
            await session.applyLens(lens);

            currentLensRef.current = lens;
            setCurrentLensId(lensId);

            console.log(`✅ Lens appliquée: ${lensId}`);
            return true;
        } catch (err) {
            console.error(`❌ Erreur chargement Lens ${lensId}:`, err);
            setError(`Impossible de charger le vêtement AR: ${err.message}`);
            return false;
        }
    }, [lensGroupId]);

    // ═══════════════════════════════════════════════════════════
    // RETIRER LA LENS ACTIVE
    // ═══════════════════════════════════════════════════════════
    const removeLens = useCallback(async () => {
        const session = sessionRef.current;
        if (!session) return;

        try {
            await session.removeLens();
            currentLensRef.current = null;
            setCurrentLensId(null);
        } catch (err) {
            console.warn('Erreur retrait Lens:', err);
        }
    }, []);

    // ═══════════════════════════════════════════════════════════
    // NETTOYAGE
    // ═══════════════════════════════════════════════════════════
    function cleanup() {
        // Arrêter la webcam
        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(t => t.stop());
            mediaStreamRef.current = null;
        }

        // Arrêter la session Camera Kit
        if (sessionRef.current) {
            try { sessionRef.current.pause(); } catch (e) { /* ignore */ }
            sessionRef.current = null;
        }

        cameraKitRef.current = null;
        currentLensRef.current = null;
    }

    return {
        canvasRef,
        isReady,
        isLoading,
        error,
        currentLensId,
        applyLens,
        removeLens,
    };
}
