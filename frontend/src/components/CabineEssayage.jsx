/**
 * FITMOD — CabineEssayage (AR Virtual Try-On)
 * ============================================
 * Webcam + MediaPipe Pose + Garment Photo Overlay
 * Fetches real models from API and overlays garment photos on body
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useMediaPipe } from '../hooks/useMediaPipe';
import { drawLandmarks } from '../utils/mesuresCalculator';
import api from '../utils/api';
import { extractGarment } from '../utils/garmentExtractor';
import '../styles/CabineEssayage.css';

// Pose landmark indices
const L_SHOULDER = 11, R_SHOULDER = 12;
const L_HIP = 23, R_HIP = 24;
const L_KNEE = 25, R_KNEE = 26;
const L_ANKLE = 27, R_ANKLE = 28;

export default function CabineEssayage() {
    const [models, setModels] = useState([]);
    const [selectedModel, setSelectedModel] = useState(null);
    const [isActive, setIsActive] = useState(false);
    const [opacity, setOpacity] = useState(0.75);
    const [showLandmarks, setShowLandmarks] = useState(false);
    const [status, setStatus] = useState('');

    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const streamRef = useRef(null);
    const animFrameRef = useRef(null);
    const garmentImgRef = useRef(null);

    const { detectPose, isLoading: mpLoading, error: mpError, progress: mpProgress } = useMediaPipe({ enablePose: true });

    // Fetch models from API
    useEffect(() => {
        async function fetchModels() {
            try {
                const data = await api.get('/tailleurs/modeles/all');
                setModels(data || []);
            } catch (err) {
                console.error('Erreur chargement modèles:', err);
                // Fallback demo models
                setModels([
                    { id: 1, titre: 'Boubou Traditionnel', type_tenue: 'boubou', photo_url: null, tailleur_nom: 'Atelier Demo' },
                    { id: 2, titre: 'Robe Bazin', type_tenue: 'robe', photo_url: null, tailleur_nom: 'Atelier Demo' },
                    { id: 3, titre: 'Costume Croisé', type_tenue: 'costume', photo_url: null, tailleur_nom: 'Atelier Demo' }
                ]);
            }
        }
        fetchModels();
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
            if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
        };
    }, []);

    const startCamera = async () => {
        setStatus('📷 Démarrage caméra...');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
            });
            streamRef.current = stream;
            setIsActive(true);
        } catch (err) {
            setStatus("❌ Impossible d'accéder à la caméra");
        }
    };

    // Attach stream to video AFTER React renders the video element
    useEffect(() => {
        if (isActive && streamRef.current && videoRef.current) {
            const video = videoRef.current;
            video.srcObject = streamRef.current;
            video.onloadeddata = () => {
                setStatus('✅ Caméra active — sélectionnez un modèle');
                startDetectionLoop();
            };
            video.play().catch(err => console.warn('Video play error:', err));
        }
    }, [isActive]);

    const stopCamera = () => {
        if (animFrameRef.current) {
            cancelAnimationFrame(animFrameRef.current);
            animFrameRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        setIsActive(false);
        setStatus('');
    };

    const startDetectionLoop = useCallback(() => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) return;

        const ctx = canvas.getContext('2d');

        const detectFrame = () => {
            if (!video || video.paused || video.ended) return;

            // Match canvas to video
            canvas.width = video.videoWidth || 1280;
            canvas.height = video.videoHeight || 720;

            // Draw mirrored video
            ctx.save();
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            ctx.restore();

            // Run MediaPipe
            const result = detectPose(video, performance.now());

            if (result && result.landmarks && result.landmarks.length > 0) {
                const lm = result.landmarks[0];

                // Mirror landmarks for display (since video is mirrored)
                const mirrored = lm.map(p => ({ x: 1 - p.x, y: p.y, z: p.z }));

                // Draw landmarks if enabled (read from ref to avoid stale closure)
                if (settingsRef.current.showLandmarks) {
                    drawLandmarks(ctx, mirrored, canvas.width, canvas.height);
                }

                // Overlay garment
                if (garmentImgRef.current && settingsRef.current.selectedModel) {
                    overlayGarment(ctx, mirrored, canvas.width, canvas.height);
                }

                setStatus(selectedModel ? `🎯 Essayage: ${selectedModel.titre}` : '👆 Sélectionnez un modèle à essayer');
            } else {
                setStatus('📷 Placez-vous devant la caméra');
            }

            animFrameRef.current = requestAnimationFrame(detectFrame);
        };

        animFrameRef.current = requestAnimationFrame(detectFrame);
    }, [detectPose]);

    // Restart detection loop when settings change (but only if already running)
    const settingsRef = useRef({ showLandmarks, selectedModel, opacity });
    useEffect(() => {
        settingsRef.current = { showLandmarks, selectedModel, opacity };
    }, [showLandmarks, selectedModel, opacity]);

    const overlayGarment = (ctx, landmarks, w, h) => {
        const img = garmentImgRef.current;
        if (!img) return;

        const lSh = landmarks[L_SHOULDER];
        const rSh = landmarks[R_SHOULDER];
        const lHip = landmarks[L_HIP];
        const rHip = landmarks[R_HIP];
        const lKn = landmarks[L_KNEE];
        const rKn = landmarks[R_KNEE];

        if (!lSh || !rSh || !lHip || !rHip) return;

        // Calculate body dimensions
        const shoulderWidth = Math.abs(rSh.x - lSh.x) * w;
        const shoulderCenterX = ((lSh.x + rSh.x) / 2) * w;
        const shoulderY = ((lSh.y + rSh.y) / 2) * h;

        // Garment width: since we cropped tightly, the aspect ratio of the img matters
        // Or we just stretch it. Let's stretch it based on shoulders and bottom limit.
        const garmentWidth = shoulderWidth * 1.6; // A bit wider to cover shoulders fully

        // Garment height depends on type
        let bottomY;
        const type = selectedModel?.type_tenue || '';
        if (type.includes('robe') || type.includes('boubou')) {
            // Long garment: goes down to knees/ankles
            const lAn = landmarks[L_ANKLE];
            const rAn = landmarks[R_ANKLE];
            bottomY = lAn && rAn && lAn.y > lKn.y ? ((lAn.y + rAn.y) / 2) * h : ((lKn.y + rKn.y) / 2) * h + 80;
        } else {
            // Short garment (costume/top): goes to hips/thighs
            bottomY = ((lHip.y + rHip.y) / 2) * h + 80;
        }

        const garmentHeight = bottomY - shoulderY;
        const garmentX = shoulderCenterX - garmentWidth / 2;

        // The top of our extracted image is roughly the top of the shoulders/neck
        const garmentY = shoulderY - (garmentHeight * 0.05); // slightly above shoulders to cover neck line

        // Draw garment with transparency
        ctx.save();
        ctx.globalAlpha = opacity;

        // Slight perspective based on shoulder tilt
        const tilt = (rSh.y - lSh.y) * w * 0.001;

        ctx.translate(shoulderCenterX, shoulderY);
        ctx.rotate(tilt);
        ctx.translate(-shoulderCenterX, -shoulderY);

        ctx.drawImage(img, garmentX, garmentY, garmentWidth, garmentHeight);

        ctx.globalAlpha = 1.0;
        ctx.restore();
    };

    const selectModel = async (model) => {
        setSelectedModel(null); // Clear current model while loading
        setStatus(`📦 Chargement et extraction: ${model.titre}...`);

        try {
            const imgUrl = api.getUploadUrl(model.photo_url);

            // Wait for BodySegmentation to process the image and extract ONLY the clothes (torso/legs)
            setStatus(`✨ Détourage sémantique en cours...`);

            // Load the image first
            const imgEl = new Image();
            imgEl.crossOrigin = 'Anonymous';

            await new Promise((resolve, reject) => {
                imgEl.onload = resolve;
                imgEl.onerror = reject;
                imgEl.src = imgUrl;
            });

            const blob = await extractGarment(imgEl, (msg) => {
                setStatus(`✨ ${msg}`);
            });

            const processedUrl = URL.createObjectURL(blob);

            const processedImg = new Image();
            processedImg.src = processedUrl;
            processedImg.onload = () => {
                garmentImgRef.current = processedImg;
                setSelectedModel(model);
                setStatus(`✅ Prêt: ${model.titre}`);
            };
            processedImg.onerror = () => {
                setStatus('❌ Erreur de chargement de l\'image détourée');
            };
        } catch (err) {
            console.error('Erreur de détourage:', err);

            // Fallback to original image if AI fails
            setStatus('⚠️ Échec du détourage, utilisation de l\'image originale');
            const img = new Image();
            img.crossOrigin = 'Anonymous';
            img.src = api.getUploadUrl(model.photo_url);
            img.onload = () => {
                garmentImgRef.current = img;
                setSelectedModel(model);
                setStatus(`✅ Prêt (sans détourage): ${model.titre}`);
            };
        }
    };

    return (
        <div className="page-container" style={isActive ? { padding: '8px', maxWidth: '100%' } : undefined}>
            {!isActive && (
                <div className="page-header">
                    <h1>Cabine d'Essayage Virtuelle</h1>
                    <p>Essayez les modèles des tailleurs en réalité augmentée.</p>
                </div>
            )}

            <div style={{ display: 'flex', gap: '12px', height: isActive ? 'calc(100vh - 90px)' : 'auto', flexDirection: isActive ? 'row' : 'column' }}>

                {/* Controls Sidebar */}
                <div style={{
                    width: isActive ? '280px' : '100%',
                    background: 'rgba(255,255,255,0.65)',
                    backdropFilter: 'blur(20px)',
                    border: '1px solid rgba(139,94,60,0.12)',
                    borderRadius: '20px',
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px',
                    overflowY: 'auto',
                    flexShrink: 0
                }}>
                    {/* Status */}
                    <div style={{ padding: '10px 14px', background: 'rgba(139,94,60,0.06)', borderRadius: '12px', fontSize: '13px', fontWeight: '600', color: 'var(--color-text-muted)', textAlign: 'center' }}>
                        {mpLoading ? `⏳ ${mpProgress || 'Chargement IA...'}` : mpError ? `❌ ${mpError}` : status || '✅ Prêt'}
                    </div>

                    {/* Camera Toggle */}
                    <button
                        className={`page-btn ${isActive ? 'page-btn-secondary' : 'page-btn-primary'}`}
                        onClick={isActive ? stopCamera : startCamera}
                        disabled={mpLoading}
                        style={{ width: '100%' }}
                    >
                        {isActive ? '⏹ Arrêter la Caméra' : '📷 Activer la Caméra'}
                    </button>

                    {/* Models List */}
                    <div>
                        <h3 style={{ fontFamily: 'var(--font-heading)', margin: '0 0 12px', fontSize: '16px', fontWeight: '700' }}>Modèles</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {models.length === 0 && (
                                <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', textAlign: 'center', padding: '16px' }}>Aucun modèle disponible</p>
                            )}
                            {models.map(m => (
                                <button
                                    key={m.id}
                                    onClick={() => selectModel(m)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '10px',
                                        padding: '10px 14px', textAlign: 'left',
                                        background: selectedModel?.id === m.id
                                            ? 'linear-gradient(135deg, var(--color-accent-choco), var(--color-accent-caramel))'
                                            : 'rgba(255,255,255,0.5)',
                                        color: selectedModel?.id === m.id ? '#fff' : 'var(--color-text-main)',
                                        border: selectedModel?.id === m.id ? 'none' : '1px solid rgba(139,94,60,0.12)',
                                        borderRadius: '14px',
                                        cursor: 'pointer',
                                        transition: 'all 0.3s ease',
                                        boxShadow: selectedModel?.id === m.id ? '0 4px 15px rgba(139,94,60,0.3)' : 'none'
                                    }}
                                >
                                    {m.photo_url ? (
                                        <img
                                            src={api.getUploadUrl(m.photo_url)}
                                            alt={m.titre}
                                            style={{ width: '40px', height: '40px', borderRadius: '10px', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.3)' }}
                                        />
                                    ) : (
                                        <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(139,94,60,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>👔</div>
                                    )}
                                    <div>
                                        <div style={{ fontWeight: '600', fontSize: '13px' }}>{m.titre}</div>
                                        <div style={{ fontSize: '11px', opacity: 0.7 }}>{m.tailleur_nom || m.type_tenue}</div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Controls */}
                    {isActive && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: 'auto' }}>
                            <div>
                                <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--color-text-muted)', marginBottom: '6px', display: 'block' }}>
                                    Transparence: {Math.round(opacity * 100)}%
                                </label>
                                <input
                                    type="range" min="0.2" max="1" step="0.05"
                                    value={opacity}
                                    onChange={e => setOpacity(Number(e.target.value))}
                                    style={{ width: '100%', accentColor: 'var(--color-accent-choco)' }}
                                />
                            </div>

                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: '600', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={showLandmarks}
                                    onChange={e => setShowLandmarks(e.target.checked)}
                                    style={{ accentColor: 'var(--color-accent-choco)' }}
                                />
                                Afficher les points du corps
                            </label>
                        </div>
                    )}
                </div>

                {/* Camera / Canvas Area */}
                <div style={{
                    flex: 1,
                    background: isActive ? '#000' : 'rgba(255,255,255,0.65)',
                    backdropFilter: isActive ? 'none' : 'blur(20px)',
                    border: isActive ? 'none' : '1px solid rgba(139,94,60,0.12)',
                    borderRadius: '20px',
                    overflow: 'hidden',
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: isActive ? 'auto' : '50vh'
                }}>
                    {/* Video element — always in DOM, hidden when inactive */}
                    <video ref={videoRef} style={{ position: 'absolute', top: 0, left: 0, width: '1px', height: '1px', opacity: 0, pointerEvents: 'none' }} playsInline muted></video>

                    {isActive ? (
                        <>
                            {/* Canvas renders mirrored video + overlay */}
                            <canvas ref={canvasRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'contain' }}></canvas>

                            {/* Status badge */}
                            <div style={{
                                position: 'absolute', top: '12px', left: '50%', transform: 'translateX(-50%)',
                                background: 'rgba(139,94,60,0.85)', backdropFilter: 'blur(8px)',
                                color: '#fff', padding: '8px 18px', borderRadius: '20px',
                                fontWeight: '600', fontSize: '13px',
                                boxShadow: '0 4px 15px rgba(139,94,60,0.3)',
                                maxWidth: '90%', textAlign: 'center', whiteSpace: 'nowrap'
                            }}>
                                {status}
                            </div>
                        </>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                            <div style={{ fontSize: '72px', marginBottom: '20px', filter: 'drop-shadow(0 0 16px rgba(212,167,106,0.5))' }}>👗</div>
                            <h3 style={{ fontFamily: 'var(--font-heading)', margin: '0 0 8px', color: 'var(--color-text-main)', fontSize: '22px' }}>Cabine d'Essayage AR</h3>
                            <p style={{ color: 'var(--color-text-muted)', fontSize: '14px', margin: '0 0 24px', maxWidth: '400px', marginInline: 'auto' }}>
                                Activez la caméra pour essayer les modèles des tailleurs en réalité augmentée sur votre corps.
                            </p>
                            <button className="page-btn page-btn-primary" onClick={startCamera} disabled={mpLoading}>
                                {mpLoading ? `⏳ ${mpProgress || 'Chargement IA...'}` : '📷 Démarrer l\'essayage'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
