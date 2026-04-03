/**
 * FITMOD — MesuresCapture (Real MediaPipe Integration)
 * Utilise useMediaPipe hook + mesuresCalculator pour détection corporelle réelle
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../utils/api';
import { useMediaPipe } from '../hooks/useMediaPipe';
import {
    drawLandmarks,
    drawMeasurementLines,
    calculateAllMeasurements,
    validatePoseQuality,
    isPoseStable
} from '../utils/mesuresCalculator';
import '../styles/MesuresCapture.css';

export default function MesuresCapture() {
    const { user, login } = useAuth();
    const [mesures, setMesures] = useState(null);
    const [isCapturing, setIsCapturing] = useState(false);
    const [cameraError, setCameraError] = useState('');
    const [poseStatus, setPoseStatus] = useState('');
    const [heightCm, setHeightCm] = useState(175);
    const [isDetecting, setIsDetecting] = useState(false);

    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const streamRef = useRef(null);
    const animFrameRef = useRef(null);
    const prevLandmarksRef = useRef(null);
    const stableCountRef = useRef(0);

    // Init MediaPipe
    const { detectPose, isLoading: mpLoading, error: mpError, progress: mpProgress } = useMediaPipe({ enablePose: true });

    // Load existing mesures from user
    useEffect(() => {
        if (user?.type_compte === 'client' && user.client?.mesures_json) {
            try {
                setMesures(JSON.parse(user.client.mesures_json));
            } catch (e) { console.error(e); }
        }
    }, [user]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
            if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
        };
    }, []);

    const startCamera = async () => {
        setCameraError('');
        setIsCapturing(true);
        setIsDetecting(false);
        setPoseStatus('');
        prevLandmarksRef.current = null;
        stableCountRef.current = 0;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
            });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.play();
            }
            streamRef.current = stream;
        } catch (err) {
            setCameraError("Impossible d'accéder à la caméra. Vérifiez les permissions.");
            setIsCapturing(false);
        }
    };

    const stopCamera = () => {
        if (animFrameRef.current) {
            cancelAnimationFrame(animFrameRef.current);
            animFrameRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
        }
        setIsCapturing(false);
        setIsDetecting(false);
        setPoseStatus('');
    };

    // Real-time pose detection loop
    const startDetection = useCallback(() => {
        if (!videoRef.current || !canvasRef.current) return;
        setIsDetecting(true);
        setPoseStatus('🔍 Détection en cours...');

        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        const detectFrame = () => {
            if (!video || video.paused || video.ended || !isCapturing) return;

            // Match canvas to video size
            canvas.width = video.videoWidth || 640;
            canvas.height = video.videoHeight || 480;

            // Clear canvas
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Run MediaPipe pose detection
            const result = detectPose(video, performance.now());

            if (result && result.landmarks && result.landmarks.length > 0) {
                const landmarks = result.landmarks[0];

                // Draw landmarks on canvas
                drawLandmarks(ctx, landmarks, canvas.width, canvas.height);
                drawMeasurementLines(ctx, landmarks, canvas.width, canvas.height);

                // Validate pose quality
                const quality = validatePoseQuality(landmarks);
                setPoseStatus(quality.messages[quality.messages.length - 1] || '');

                // Check stability
                if (quality.isValid) {
                    if (isPoseStable(landmarks, prevLandmarksRef.current)) {
                        stableCountRef.current++;
                    } else {
                        stableCountRef.current = 0;
                    }

                    // Auto-capture after 15 stable frames (~0.5s)
                    if (stableCountRef.current >= 15) {
                        try {
                            const measures = calculateAllMeasurements(
                                landmarks, heightCm,
                                canvas.width, canvas.height
                            );
                            setMesures(measures);
                            setPoseStatus('✅ Mesures capturées avec succès !');
                            stableCountRef.current = 0;
                            // Don't stop camera — let user see the result overlay
                        } catch (err) {
                            console.warn('Erreur calcul:', err);
                            stableCountRef.current = 0;
                        }
                    }
                } else {
                    stableCountRef.current = 0;
                }

                prevLandmarksRef.current = landmarks;
            } else {
                setPoseStatus('📷 Corps non détecté — placez-vous devant la caméra');
                prevLandmarksRef.current = null;
                stableCountRef.current = 0;
            }

            animFrameRef.current = requestAnimationFrame(detectFrame);
        };

        animFrameRef.current = requestAnimationFrame(detectFrame);
    }, [detectPose, heightCm, isCapturing]);

    const captureManual = () => {
        if (!videoRef.current || !canvasRef.current) return;

        const video = videoRef.current;
        const canvas = canvasRef.current;

        const result = detectPose(video, performance.now());
        if (result && result.landmarks && result.landmarks.length > 0) {
            const landmarks = result.landmarks[0];
            try {
                const measures = calculateAllMeasurements(
                    landmarks, heightCm,
                    canvas.width || 640, canvas.height || 480
                );
                setMesures(measures);
                setPoseStatus('✅ Mesures capturées !');
            } catch (err) {
                setPoseStatus('❌ Erreur: ' + err.message);
            }
        } else {
            setPoseStatus('❌ Aucun corps détecté — réessayez');
        }
    };

    const saveMesures = async () => {
        if (!user || user.type_compte !== 'client') {
            alert("Vous devez être connecté comme client.");
            return;
        }
        try {
            const strMesures = Object.fromEntries(
                Object.entries(mesures).map(([k, v]) => [k, String(v)])
            );
            await api.put(`/client-profil/${user.client.id}/mesures`, { mesures: strMesures });
            alert('Mesures sauvegardées avec succès !');
            await login({ email: user.email, mot_de_passe: '123456' });
        } catch (err) {
            alert(err.message);
        }
    };

    return (
        <div className="page-container" style={isCapturing ? { padding: '12px', maxWidth: '100%' } : undefined}>
            {/* Header — hidden when capturing to maximize space */}
            {!isCapturing && (
                <div className="page-header">
                    <h1>Mesures Automatisées IA</h1>
                    <p>Prenez vos mesures précises via la caméra en quelques secondes.</p>
                </div>
            )}

            {/* Height Input — compact when capturing */}
            <div style={{ background: 'rgba(255,255,255,0.65)', backdropFilter: 'blur(20px)', border: '1px solid rgba(139,94,60,0.12)', borderRadius: isCapturing ? '16px' : '24px', padding: isCapturing ? '10px 16px' : '20px 24px', marginBottom: isCapturing ? '8px' : '20px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: '600', color: 'var(--color-text-muted)', fontSize: '14px' }}>Votre taille :</span>
                <input
                    type="number"
                    value={heightCm}
                    onChange={e => setHeightCm(Number(e.target.value))}
                    min={100} max={250}
                    style={{ width: '80px', padding: '10px 14px', background: 'rgba(255,255,255,0.8)', border: '1px solid rgba(139,94,60,0.12)', borderRadius: '12px', fontSize: '16px', fontWeight: '700', color: 'var(--color-accent-choco)', textAlign: 'center', outline: 'none' }}
                />
                <span style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>cm</span>

                {mpLoading && (
                    <span style={{ marginLeft: 'auto', fontSize: '13px', color: 'var(--color-accent-caramel)', fontWeight: '600' }}>
                        ⏳ {mpProgress || 'Chargement MediaPipe...'}
                    </span>
                )}
                {mpError && (
                    <span style={{ marginLeft: 'auto', fontSize: '13px', color: '#dc2626', fontWeight: '600' }}>
                        ❌ {mpError}
                    </span>
                )}
                {!mpLoading && !mpError && (
                    <span style={{ marginLeft: 'auto', fontSize: '13px', color: '#16a34a', fontWeight: '600' }}>
                        ✅ MediaPipe prêt
                    </span>
                )}
            </div>

            {/* Camera Section */}
            <div style={{ background: isCapturing ? 'rgba(0,0,0,0.95)' : 'rgba(255,255,255,0.65)', backdropFilter: 'blur(20px)', border: isCapturing ? 'none' : '1px solid rgba(139,94,60,0.12)', borderRadius: isCapturing ? '16px' : '24px', padding: isCapturing ? '8px' : '24px', marginBottom: '24px' }}>
                {!isCapturing && <h3 style={{ fontFamily: 'var(--font-heading)', margin: '0 0 16px', fontSize: '18px', fontWeight: '700' }}>Scanner Corporel</h3>}

                <div style={{ width: '100%', height: isCapturing ? 'calc(100vh - 160px)' : '40vh', background: isCapturing ? '#000' : 'var(--color-bg-alt)', border: isCapturing ? 'none' : '1px solid rgba(139,94,60,0.12)', borderRadius: isCapturing ? '12px' : '20px', overflow: 'hidden', position: 'relative', marginBottom: isCapturing ? '8px' : '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {isCapturing ? (
                        <>
                            <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'contain', transform: 'scaleX(-1)' }} playsInline muted></video>
                            <canvas ref={canvasRef} width="1280" height="720" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', transform: 'scaleX(-1)', pointerEvents: 'none' }}></canvas>

                            {/* Overlay guide */}
                            {!isDetecting && (
                                <div style={{ position: 'absolute', inset: 0, border: '3px dashed rgba(198, 139, 89, 0.4)', margin: '40px', borderRadius: '40px', pointerEvents: 'none' }}></div>
                            )}

                            {/* Status badge */}
                            <div style={{ position: 'absolute', top: '16px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(139,94,60,0.85)', backdropFilter: 'blur(8px)', color: '#fff', padding: '10px 20px', borderRadius: '24px', fontWeight: '600', fontSize: '14px', boxShadow: '0 4px 15px rgba(139,94,60,0.3)', maxWidth: '90%', textAlign: 'center' }}>
                                {poseStatus || "Placez-vous au centre de l'écran"}
                            </div>
                        </>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '40px' }}>
                            <div style={{ fontSize: '64px', marginBottom: '16px', filter: 'drop-shadow(0 0 12px rgba(212,167,106,0.5))' }}>📷</div>
                            <h4 style={{ margin: '0 0 8px', color: 'var(--color-text-main)', fontFamily: 'var(--font-heading)' }}>Caméra Inactive</h4>
                            <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', margin: 0 }}>Veuillez autoriser l'accès à la caméra pour démarrer la capture IA.</p>
                        </div>
                    )}
                </div>

                {cameraError && <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#dc2626', padding: '12px 16px', borderRadius: '12px', marginBottom: '16px', fontWeight: '600', fontSize: '14px' }}>{cameraError}</div>}

                <div style={{ display: 'flex', gap: '12px' }}>
                    {!isCapturing ? (
                        <button className="page-btn page-btn-primary" onClick={startCamera} disabled={mpLoading} style={{ flex: 1 }}>
                            {mpLoading ? '⏳ Chargement IA...' : 'Démarrer la Capture'}
                        </button>
                    ) : !isDetecting ? (
                        <>
                            <button className="page-btn page-btn-primary" onClick={startDetection} disabled={mpLoading} style={{ flex: 2 }}>
                                {mpLoading ? '⏳ Chargement...' : '🎯 Lancer la Détection'}
                            </button>
                            <button className="page-btn page-btn-secondary" onClick={stopCamera} style={{ flex: 1 }}>Annuler</button>
                        </>
                    ) : (
                        <>
                            <button className="page-btn page-btn-primary" onClick={captureManual} style={{ flex: 2 }}>
                                📸 Capturer Maintenant
                            </button>
                            <button className="page-btn page-btn-secondary" onClick={stopCamera} style={{ flex: 1 }}>Arrêter</button>
                        </>
                    )}
                </div>
            </div>

            {/* Results Section */}
            <div style={{ background: 'rgba(255,255,255,0.65)', backdropFilter: 'blur(20px)', border: '1px solid rgba(139,94,60,0.12)', borderRadius: '24px', padding: '24px' }}>
                <h3 style={{ fontFamily: 'var(--font-heading)', margin: '0 0 16px', fontSize: '18px', fontWeight: '700', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    Vos Mensurations
                    {mesures && <span style={{ fontSize: '12px', background: 'linear-gradient(135deg, var(--color-accent-choco), var(--color-accent-caramel))', color: '#fff', padding: '5px 14px', borderRadius: '20px', fontWeight: '600' }}>IA Validée</span>}
                </h3>

                {!mesures ? (
                    <div style={{ padding: '40px 20px', textAlign: 'center', border: '2px dashed rgba(139,94,60,0.12)', borderRadius: '16px' }}>
                        <p style={{ color: 'var(--color-text-muted)', margin: 0 }}>Aucune mesure enregistrée.<br />Lancez la capture pour commencer.</p>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
                        {Object.entries(mesures).map(([k, v]) => (
                            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.5)', backdropFilter: 'blur(8px)', padding: '14px 20px', borderRadius: '16px', border: '1px solid rgba(139,94,60,0.12)', transition: 'all 0.3s ease' }}>
                                <span style={{ fontWeight: '600', textTransform: 'capitalize', color: 'var(--color-text-muted)', fontSize: '14px' }}>{k.replace(/_/g, ' ')}</span>
                                <span style={{ fontSize: '20px', fontWeight: '700', color: 'var(--color-accent-choco)', fontFamily: 'var(--font-heading)', textShadow: '0 0 8px rgba(139,94,60,0.3)' }}>{v} cm</span>
                            </div>
                        ))}

                        <div style={{ gridColumn: '1 / -1', marginTop: '8px', display: 'flex', gap: '12px' }}>
                            <button className="page-btn page-btn-primary" onClick={saveMesures} style={{ flex: 1 }}>
                                Sauvegarder dans mon profil
                            </button>
                            <button className="page-btn page-btn-secondary" onClick={() => { setMesures(null); stableCountRef.current = 0; }} style={{ flex: 0 }}>
                                Refaire
                            </button>
                        </div>
                    </div>
                )}
            </div>

        </div>
    );
}
