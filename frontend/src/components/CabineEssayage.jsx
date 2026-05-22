/**
 * FITMOD — CabineEssayage.jsx (v4 — IDM-VTON Hugging Face)
 * ===========================================================
 * Cabine d'essayage virtuelle via IA générative.
 * 
 * Flow :
 *   1. L'utilisateur se prend en photo via la webcam
 *   2. Il choisit un vêtement du catalogue
 *   3. La photo + le vêtement sont envoyés à IDM-VTON (Hugging Face)
 *   4. L'IA génère une image réaliste en ~20-30 secondes
 *   5. Le résultat s'affiche — l'utilisateur se voit habillé
 * 
 * C'est la méthode utilisée par les meilleures apps commerciales.
 * Résultat ultra-réaliste, pas de tricks avec du mesh warping.
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import '../styles/CabineEssayage.css';

// ─── Configuration ───
// Proxy via notre backend pour contourner CORS
const API_BASE = 'http://localhost:3001/api/vton';
const VTON_SPACE = 'https://Kwai-Kolors-Kolors-Virtual-Try-On.hf.space';

export default function CabineEssayage() {
    // ═══ State ═══
    const [models, setModels] = useState([]);
    const [selectedModel, setSelectedModel] = useState(null);
    const [phase, setPhase] = useState('accueil'); // accueil | camera | preview | processing | result
    const [photoBlob, setPhotoBlob] = useState(null);
    const [photoUrl, setPhotoUrl] = useState(null);
    const [resultUrl, setResultUrl] = useState(null);
    const [error, setError] = useState(null);
    const [progress, setProgress] = useState('');
    const [cameraReady, setCameraReady] = useState(false);
    const [bodyStatus, setBodyStatus] = useState(''); // Message guidage
    const [countdown, setCountdown] = useState(null); // 3, 2, 1, null

    // ═══ Refs ═══
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const streamRef = useRef(null);
    const poseLandmarkerRef = useRef(null);
    const poseRafRef = useRef(null);
    const bodyReadyStartRef = useRef(null); // Timestamp quand le corps est détecté
    const countdownIntervalRef = useRef(null);
    const capturedRef = useRef(false); // Éviter double capture

    // ═══════════════════════════════════════════════════════════
    // 1. CHARGER LES MODÈLES DU CATALOGUE
    // ═══════════════════════════════════════════════════════════
    useEffect(() => {
        async function load() {
            try {
                const res = await api.get('/tailleurs/modeles/all');
                const list = Array.isArray(res) ? res : (res.modeles || []);
                setModels(list);
            } catch (err) {
                console.warn('⚠ Pas de modèles:', err.message);
            }
        }
        load();
    }, []);

    // ═══════════════════════════════════════════════════════════
    // 2. WEBCAM — Activer / Arrêter / Capturer
    // ═══════════════════════════════════════════════════════════
    const startCamera = useCallback(async () => {
        try {
            setError(null);
            setPhase('camera'); // Rendre le <video> AVANT d'attacher le stream
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 1024 }, height: { ideal: 1024 }, facingMode: 'user' },
            });
            streamRef.current = stream;
            // Le useEffect ci-dessous va attacher le stream au video
            setCameraReady(true);
        } catch (err) {
            setError(`❌ Caméra refusée : ${err.message}`);
            setPhase('accueil');
        }
    }, []);

    const handleFileUpload = useCallback((e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setPhotoBlob(file);
        setPhotoUrl(URL.createObjectURL(file));
        setPhase('preview');
        setError(null);
    }, []);

    // Attacher le stream au <video> quand il est prêt
    useEffect(() => {
        if (cameraReady && streamRef.current && videoRef.current) {
            videoRef.current.srcObject = streamRef.current;
            videoRef.current.play().catch(() => {});
        }
    }, [cameraReady, phase]);

    const stopCamera = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        setCameraReady(false);
    }, []);

    // Nettoyage
    useEffect(() => () => {
        stopCamera();
        if (poseRafRef.current) cancelAnimationFrame(poseRafRef.current);
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    }, [stopCamera]);

    // ═══════════════════════════════════════════════════════════
    // 2b. AUTO-DÉTECTION DU CORPS (PoseLandmarker)
    // ═══════════════════════════════════════════════════════════
    useEffect(() => {
        if (phase !== 'camera' || !cameraReady) return;

        capturedRef.current = false;
        let cancelled = false;

        async function initPoseDetection() {
            try {
                if (!poseLandmarkerRef.current) {
                    const { PoseLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
                    const vision = await FilesetResolver.forVisionTasks(
                        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
                    );
                    poseLandmarkerRef.current = await PoseLandmarker.createFromOptions(vision, {
                        baseOptions: {
                            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task',
                            delegate: 'GPU',
                        },
                        runningMode: 'VIDEO',
                        numPoses: 1,
                    });
                }
                if (!cancelled) detectLoop();
            } catch (err) {
                console.warn('⚠ Auto-détection indisponible:', err.message);
                setBodyStatus('📸 Appuyez sur le bouton pour capturer');
            }
        }

        function detectLoop() {
            if (cancelled || capturedRef.current) return;
            const video = videoRef.current;
            if (!video || video.readyState < 2) {
                poseRafRef.current = requestAnimationFrame(detectLoop);
                return;
            }

            try {
                const result = poseLandmarkerRef.current.detectForVideo(video, performance.now());
                const lm = result?.landmarks?.[0];

                if (lm) {
                    // Pour éviter les crashs de Kolors (qui utilise DensePose),
                    // il faut impérativement que les hanches soient visibles.
                    const lSh = lm[11], rSh = lm[12], lHip = lm[23], rHip = lm[24];
                    const visible = [lSh, rSh, lHip, rHip].every(p => p && p.visibility > 0.4);

                    // Vérifier que le corps est bien centré
                    const centerX = (lSh.x + rSh.x) / 2;
                    const centered = centerX > 0.2 && centerX < 0.8;

                    if (visible && centered) {
                        if (!bodyReadyStartRef.current) {
                            bodyReadyStartRef.current = Date.now();
                            setBodyStatus('✅ Corps détecté — restez immobile...');
                        }

                        const elapsed = Date.now() - bodyReadyStartRef.current;

                        // Après 1.5s stable → lancer le countdown
                        if (elapsed > 1500 && countdown === null && !capturedRef.current) {
                            lancerCountdown();
                        }
                    } else {
                        bodyReadyStartRef.current = null;
                        if (countdown === null) {
                            if (!visible) setBodyStatus('👤 Reculez pour inclure vos hanches/cuisses');
                            else if (!centered) setBodyStatus('↔️ Centrez-vous dans le cadre');
                        }
                    }
                } else {
                    bodyReadyStartRef.current = null;
                    if (countdown === null) setBodyStatus('👤 Aucun corps détecté — placez-vous devant la caméra');
                }
            } catch (e) { /* ignore */ }

            poseRafRef.current = requestAnimationFrame(detectLoop);
        }

        initPoseDetection();

        return () => {
            cancelled = true;
            if (poseRafRef.current) cancelAnimationFrame(poseRafRef.current);
        };
    }, [phase, cameraReady]);

    // ── Countdown 3-2-1 puis capture ──
    const lancerCountdown = useCallback(() => {
        let count = 3;
        setCountdown(count);

        countdownIntervalRef.current = setInterval(() => {
            count--;
            if (count > 0) {
                setCountdown(count);
            } else {
                clearInterval(countdownIntervalRef.current);
                setCountdown(null);
                capturedRef.current = true;
                capturePhoto();
            }
        }, 1000);
    }, []);

    const capturePhoto = useCallback(() => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) return;

        // Capturer en 768x1024 (portrait, optimal pour IDM-VTON)
        const W = 768;
        const H = 1024;
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');

        // Miroir horizontal + crop centré
        ctx.save();
        ctx.translate(W, 0);
        ctx.scale(-1, 1);

        const vw = video.videoWidth;
        const vh = video.videoHeight;
        const ratio = Math.max(W / vw, H / vh);
        const sw = W / ratio;
        const sh = H / ratio;
        const sx = (vw - sw) / 2;
        const sy = (vh - sh) / 2;

        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, W, H);
        ctx.restore();

        // Convertir en blob
        canvas.toBlob((blob) => {
            setPhotoBlob(blob);
            setPhotoUrl(URL.createObjectURL(blob));
            setPhase('preview');
            stopCamera();
        }, 'image/png', 1.0);
    }, [stopCamera]);

    const retakePhoto = useCallback(() => {
        setPhotoBlob(null);
        setPhotoUrl(null);
        setResultUrl(null);
        setError(null);
        startCamera();
    }, [startCamera]);

    // ═══════════════════════════════════════════════════════════
    // 3. ENVOI À IDM-VTON (Hugging Face)
    // ═══════════════════════════════════════════════════════════
    const lancerEssayage = useCallback(async () => {
        if (!photoBlob || !selectedModel) {
            setError('📸 Prenez une photo et sélectionnez un vêtement');
            return;
        }

        setPhase('processing');
        setProgress('⏳ Préparation de votre essayage virtuel...');
        setError(null);
        setResultUrl(null);

        try {
            // ── 1. Upload la photo humaine ──
            setProgress('📤 Upload de votre photo...');
            const humanUpload = await uploadToGradio(photoBlob, 'photo.png');

            // ── 2. Upload l'image du vêtement ──
            setProgress('👔 Upload du vêtement...');
            const garmentUrl = selectedModel.photo_url?.startsWith('http')
                ? selectedModel.photo_url
                : api.getUploadUrl(selectedModel.photo_url);

            // Télécharger l'image du vêtement
            const garmentResp = await fetch(garmentUrl);
            const garmentBlob = await garmentResp.blob();
            const garmentUpload = await uploadToGradio(garmentBlob, 'garment.png');

            // ── 3. Appeler l'API Kolors Virtual Try-On ──
            setProgress('Analyse de la morphologie et ajustement des textures en cours (~30s)');

            const payload = {
                data: [
                    humanUpload,    // Person image
                    garmentUpload,  // Garment image
                    42,             // Seed
                    true,           // Random seed
                ],
                fn_index: 2,
            };

            const response = await fetch(`${API_BASE}/predict`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                throw new Error(`API erreur: ${response.status}`);
            }

            const result = await response.json();
            handleResult(result);

        } catch (err) {
            console.error('❌ Erreur VTON:', err);
            // Translate backend error to user-friendly message
            const errMsg = err.message.toLowerCase();
            const errorMsg = errMsg.includes('500') || errMsg.includes('504') || errMsg.includes('timeout')
                ? 'Le serveur de modélisation est actuellement surchargé. Veuillez réessayer.'
                : errMsg.includes('erreur interne')
                ? 'Votre corps n\'a pas pu être détecté. Assurez-vous d\'être visible jusqu\'aux cuisses.'
                : err.message;
            setError(`❌ Erreur: ${errorMsg}`);
            setPhase('preview');
        }
    }, [photoBlob, selectedModel]);

    function handleResult(result) {
        // Kolors: data[0] = result image
        const img = result?.data?.[0];
        if (!img) {
            setError('❌ L\'essayage a échoué, veuillez réessayer');
            setPhase('preview');
            return;
        }

        let finalUrl = null;
        if (typeof img === 'string') {
            finalUrl = img.startsWith('http') ? img : `${API_BASE}/file/${img}`;
        } else if (img.url && img.url.includes('/file=')) {
            // Extraire le chemin du fichier de l'URL pour passer par notre proxy
            const filePath = img.url.split('/file=')[1];
            finalUrl = `${API_BASE}/file/${filePath}`;
        } else if (img.path) {
            finalUrl = `${API_BASE}/file/${img.path}`;
        } else if (img.url) {
            finalUrl = img.url;
        }

        if (finalUrl) {
            setResultUrl(finalUrl);
            setPhase('result');
            setProgress('');
        } else {
            setError('❌ Résultat non valide');
            setPhase('preview');
        }
    }

    async function uploadToGradio(blob, filename) {
        const formData = new FormData();
        formData.append('file', blob, filename);

        const resp = await fetch(`${API_BASE}/upload`, {
            method: 'POST',
            body: formData,
        });

        if (!resp.ok) throw new Error(`Upload échoué: ${resp.status}`);
        const files = await resp.json();

        // Retourne le FileData Gradio
        return {
            path: files[0],
            meta: { _type: 'gradio.FileData' },
            orig_name: filename,
            url: `${VTON_SPACE}/file=${files[0]}`,
        };
    }

    // ═══════════════════════════════════════════════════════════
    // RENDU
    // ═══════════════════════════════════════════════════════════
    return (
        <div className="cabine-essayage" style={{ padding: '12px' }}>
            {/* Canvas caché pour la capture */}
            <canvas ref={canvasRef} style={{ display: 'none' }} />

            {/* ── EN-TÊTE ── */}
            {phase === 'accueil' && (
                <div className="ce-header">
                    <h1 className="ce-title">
                        <span className="ce-title-icon">🧥</span>
                        Cabine d'Essayage Virtuelle
                    </h1>
                    <p className="ce-subtitle">
                        Découvrez notre cabine d'essayage virtuelle haute fidélité
                    </p>
                </div>
            )}

            {/* ── LAYOUT PRINCIPAL ── */}
            <div style={{
                display: 'flex', gap: '12px', alignItems: 'stretch',
                height: phase !== 'accueil' ? 'calc(100vh - 80px)' : 'auto',
                minHeight: phase === 'accueil' ? '60vh' : 'auto',
            }}>
                {/* ═══ SIDEBAR — Vêtements ═══ */}
                <div style={{
                    width: phase !== 'accueil' ? '180px' : '240px',
                    flexShrink: 0,
                    display: 'flex', flexDirection: 'column', gap: '8px',
                    background: 'rgba(255,255,255,0.65)',
                    backdropFilter: 'blur(20px)',
                    borderRadius: '16px', padding: '12px',
                    border: '1px solid rgba(139,94,60,0.12)',
                    overflowY: 'auto',
                }}>
                    <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '4px' }}>
                        👔 Vêtements
                    </div>

                    {models.length === 0 && (
                        <p style={{ fontSize: '11px', opacity: 0.5 }}>Aucun vêtement disponible</p>
                    )}

                    {models.map((m) => {
                        const imgSrc = m.photo_url?.startsWith('http')
                            ? m.photo_url : api.getUploadUrl(m.photo_url);
                        const isSelected = selectedModel?.id === m.id;
                        return (
                            <button
                                key={m.id}
                                onClick={() => setSelectedModel(m)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    padding: '6px 8px', border: 'none', borderRadius: '10px',
                                    cursor: 'pointer', textAlign: 'left', fontSize: '12px',
                                    background: isSelected
                                        ? 'linear-gradient(135deg, var(--color-accent-choco), var(--color-accent-caramel))'
                                        : 'rgba(139,94,60,0.05)',
                                    color: isSelected ? '#fff' : 'inherit',
                                    transition: 'all 0.25s ease',
                                    transform: isSelected ? 'scale(1.02)' : 'scale(1)',
                                }}
                            >
                                {m.photo_url ? (
                                    <img src={imgSrc} alt=""
                                        style={{ width: '36px', height: '36px', borderRadius: '8px', objectFit: 'cover' }}
                                    />
                                ) : (
                                    <div style={{
                                        width: '36px', height: '36px', borderRadius: '8px',
                                        background: 'rgba(139,94,60,0.1)', display: 'flex',
                                        alignItems: 'center', justifyContent: 'center', fontSize: '16px',
                                    }}>👔</div>
                                )}
                                <div>
                                    <div style={{ fontWeight: 600 }}>{m.titre}</div>
                                    <div style={{ fontSize: '10px', opacity: 0.6 }}>{m.type_tenue || ''}</div>
                                </div>
                            </button>
                        );
                    })}

                    {/* Vêtement sélectionné — aperçu */}
                    {selectedModel && (
                        <div style={{
                            marginTop: '8px', padding: '8px', borderRadius: '10px',
                            background: 'rgba(139,94,60,0.06)', textAlign: 'center',
                        }}>
                            <div style={{ fontSize: '11px', fontWeight: 600, marginBottom: '4px' }}>
                                ✅ {selectedModel.titre}
                            </div>
                            {selectedModel.photo_url && (
                                <img
                                    src={selectedModel.photo_url?.startsWith('http')
                                        ? selectedModel.photo_url : api.getUploadUrl(selectedModel.photo_url)}
                                    alt="" style={{
                                        width: '100%', maxHeight: '120px', objectFit: 'contain',
                                        borderRadius: '8px',
                                    }}
                                />
                            )}
                        </div>
                    )}
                </div>

                {/* ═══ ZONE PRINCIPALE ═══ */}
                <div style={{
                    flex: 1, position: 'relative',
                    background: phase === 'camera' ? '#000' : 'rgba(255,255,255,0.65)',
                    borderRadius: '16px', overflow: 'hidden',
                    border: phase === 'camera' ? 'none' : '1px solid rgba(139,94,60,0.12)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    minHeight: '400px',
                }}>
                    {/* ── PHASE ACCUEIL ── */}
                    {phase === 'accueil' && (
                        <div style={{ textAlign: 'center', padding: '40px', maxWidth: '500px' }}>
                            <div style={{ fontSize: '72px', marginBottom: '20px' }}>🧥</div>
                            <h2 style={{ fontFamily: 'var(--font-heading)', margin: '0 0 12px', fontSize: '24px' }}>
                                Essayez avant de commander
                            </h2>
                            <p style={{ fontSize: '15px', color: 'var(--color-text-muted)', lineHeight: 1.6, margin: '0 0 8px' }}>
                                Prenez-vous en photo, choisissez un vêtement, et la cabine virtuelle vous montrera
                                à quoi il ressemblera sur vous — <strong>résultat ultra-réaliste</strong>.
                            </p>
                            <div style={{
                                display: 'flex', gap: '12px', justifyContent: 'center',
                                margin: '24px 0 16px', fontSize: '13px', color: 'var(--color-text-muted)',
                            }}>
                                <span>📸 Photo</span>
                                <span>→</span>
                                <span>👔 Vêtement</span>
                                <span>→</span>
                                <span>⏳ Traitement</span>
                                <span>→</span>
                                <span>✨ Résultat</span>
                            </div>
                            <div style={{ display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.65)', backdropFilter: 'blur(20px)', border: '1px solid rgba(139,94,60,0.12)', borderRadius: '20px', padding: '4px', margin: '0 auto 16px', maxWidth: '420px' }}>
                                <button
                                    onClick={startCamera}
                                    style={{
                                        flex: 1, padding: '12px 20px', border: 'none', borderRadius: '16px',
                                        background: 'linear-gradient(135deg, var(--color-accent-choco), var(--color-accent-caramel))',
                                        color: '#fff', fontSize: '15px', fontWeight: '600', cursor: 'pointer',
                                        boxShadow: '0 4px 15px rgba(139,94,60,0.3)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                                    }}
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
                                    Caméra en direct
                                </button>
                                <label
                                    style={{
                                        flex: 1, padding: '12px 20px', border: 'none', borderRadius: '16px',
                                        background: 'transparent',
                                        color: 'var(--color-text-muted)', fontSize: '15px', fontWeight: '600', cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                        transition: 'all 0.3s ease'
                                    }}
                                    onMouseOver={(e) => e.currentTarget.style.background = 'rgba(139,94,60,0.05)'}
                                    onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                                >
                                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileUpload} />
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                                    Upload de photos
                                </label>
                            </div>
                        </div>
                    )}

                    {/* ── PHASE CAMÉRA (auto-capture) ── */}
                    {phase === 'camera' && (
                        <>
                            <video ref={videoRef} playsInline muted
                                style={{
                                    width: '100%', height: '100%', objectFit: 'cover',
                                    transform: 'scaleX(-1)',
                                }}
                            />

                            {/* Countdown 3-2-1 */}
                            {countdown !== null && (
                                <div style={{
                                    position: 'absolute', inset: 0,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: 'rgba(0,0,0,0.3)', zIndex: 20,
                                }}>
                                    <div style={{
                                        fontSize: '120px', fontWeight: 900, color: '#fff',
                                        textShadow: '0 0 40px rgba(139,94,60,0.8), 0 0 80px rgba(0,0,0,0.5)',
                                        animation: 'pulseCount 1s ease-in-out',
                                    }}>
                                        {countdown}
                                    </div>
                                </div>
                            )}

                            {/* Guide rectangulaire élargi vers le bas */}
                            {countdown === null && (
                                <div style={{
                                    position: 'absolute', inset: 0,
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                    pointerEvents: 'none', zIndex: 5,
                                }}>
                                    <div style={{
                                        width: '60%', height: '80%',
                                        border: '2px dashed rgba(255,255,255,0.4)',
                                        borderBottom: 'none', // Open at the bottom
                                        borderTopLeftRadius: '100px',
                                        borderTopRightRadius: '100px',
                                    }} />
                                    <div style={{
                                        position: 'absolute', bottom: '20px',
                                        color: '#fff', fontSize: '13px', fontWeight: 600,
                                        textAlign: 'center', padding: '10px 20px',
                                        background: 'rgba(0,0,0,0.5)', borderRadius: '20px',
                                        backdropFilter: 'blur(10px)',
                                    }}>
                                        ⚠️ Reculez pour inclure vos hanches/jambes
                                    </div>
                                </div>
                            )}

                            {/* Status du corps */}
                            <div style={{
                                position: 'absolute', top: '16px', left: '50%', transform: 'translateX(-50%)',
                                background: bodyStatus.includes('✅') ? 'rgba(46,125,50,0.8)' : 'rgba(0,0,0,0.6)',
                                color: '#fff',
                                padding: '8px 20px', borderRadius: '20px', fontSize: '13px',
                                fontWeight: 500, backdropFilter: 'blur(10px)', zIndex: 10,
                                transition: 'background 0.3s',
                                maxWidth: '90%', textAlign: 'center',
                            }}>
                                {bodyStatus || '🔄 Chargement de la détection...'}
                            </div>

                            {/* Bouton capture manuelle (fallback) */}
                            {cameraReady && countdown === null && (
                                <button onClick={capturePhoto} style={{
                                    position: 'absolute', bottom: '16px', right: '16px',
                                    padding: '8px 16px', borderRadius: '20px',
                                    border: '1px solid rgba(255,255,255,0.3)',
                                    background: 'rgba(0,0,0,0.4)', color: '#fff',
                                    fontSize: '12px', cursor: 'pointer', zIndex: 10,
                                    backdropFilter: 'blur(8px)',
                                }}>
                                    📸 Capture manuelle
                                </button>
                            )}
                        </>
                    )}

                    {/* ── PHASE PREVIEW — Photo prise, prêt à envoyer ── */}
                    {phase === 'preview' && photoUrl && (
                        <div style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center',
                            gap: '16px', padding: '20px',
                        }}>
                            <div style={{
                                position: 'relative', borderRadius: '16px', overflow: 'hidden',
                                boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
                                maxHeight: 'calc(100vh - 250px)',
                            }}>
                                <img src={photoUrl} alt="Votre photo"
                                    style={{ height: '100%', maxHeight: 'calc(100vh - 250px)', objectFit: 'contain' }}
                                />
                            </div>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button onClick={retakePhoto} style={{
                                    padding: '10px 20px', borderRadius: '12px',
                                    border: '1px solid rgba(139,94,60,0.2)',
                                    background: 'rgba(255,255,255,0.8)', cursor: 'pointer',
                                    fontSize: '13px', fontWeight: 500,
                                }}>
                                    🔄 Reprendre la photo
                                </button>
                                <button onClick={lancerEssayage}
                                    disabled={!selectedModel}
                                    style={{
                                        padding: '10px 24px', borderRadius: '12px', border: 'none',
                                        background: selectedModel
                                            ? 'linear-gradient(135deg, var(--color-accent-choco), var(--color-accent-caramel))'
                                            : '#ccc',
                                        color: '#fff', cursor: selectedModel ? 'pointer' : 'not-allowed',
                                        fontSize: '14px', fontWeight: 600,
                                        boxShadow: selectedModel ? '0 4px 15px rgba(139,94,60,0.3)' : 'none',
                                    }}
                                >
                                    {selectedModel ? `🧥 Essayer « ${selectedModel.titre} »` : '👈 Choisissez un vêtement'}
                                </button>
                            </div>
                            {error && (
                                <div style={{
                                    color: '#c62828', fontSize: '13px', padding: '8px 16px',
                                    background: 'rgba(198,40,40,0.08)', borderRadius: '10px',
                                }}>
                                    {error}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── PHASE PROCESSING — IA en cours ── */}
                    {phase === 'processing' && (
                        <div style={{ textAlign: 'center', padding: '40px' }}>
                            <div style={{
                                width: '80px', height: '80px', margin: '0 auto 20px',
                                border: '4px solid rgba(139,94,60,0.15)',
                                borderTopColor: 'var(--color-accent-choco)',
                                borderRadius: '50%',
                                animation: 'spin 1s linear infinite',
                            }} />
                            <h3 style={{ fontFamily: 'var(--font-heading)', margin: '0 0 8px', fontSize: '20px' }}>
                                Modélisation de votre essayage en cours...
                            </h3>
                            <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', margin: '0 0 16px' }}>
                                {progress}
                            </p>
                            <div style={{
                                display: 'flex', gap: '8px', justifyContent: 'center', opacity: 0.5,
                            }}>
                                {photoUrl && (
                                    <img src={photoUrl} alt="" style={{
                                        width: '80px', height: '100px', objectFit: 'cover', borderRadius: '8px',
                                    }} />
                                )}
                                <div style={{
                                    fontSize: '24px', display: 'flex', alignItems: 'center',
                                }}>+</div>
                                {selectedModel?.photo_url && (
                                    <img
                                        src={selectedModel.photo_url?.startsWith('http')
                                            ? selectedModel.photo_url : api.getUploadUrl(selectedModel.photo_url)}
                                        alt="" style={{
                                            width: '80px', height: '100px', objectFit: 'cover', borderRadius: '8px',
                                        }}
                                    />
                                )}
                                <div style={{
                                    fontSize: '24px', display: 'flex', alignItems: 'center',
                                }}>→</div>
                                <div style={{
                                    width: '80px', height: '100px', borderRadius: '8px',
                                    background: 'rgba(139,94,60,0.08)', display: 'flex',
                                    alignItems: 'center', justifyContent: 'center', fontSize: '24px',
                                }}>✨</div>
                            </div>
                        </div>
                    )}

                    {/* ── PHASE RÉSULTAT ── */}
                    {phase === 'result' && resultUrl && (
                        <div style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center',
                            gap: '16px', padding: '20px', width: '100%',
                        }}>
                            <div style={{
                                display: 'flex', gap: '16px', justifyContent: 'center',
                                flexWrap: 'wrap', maxHeight: 'calc(100vh - 230px)',
                            }}>
                                {/* Photo originale */}
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px', opacity: 0.6 }}>
                                        📸 Avant
                                    </div>
                                    <img src={photoUrl} alt="Avant"
                                        style={{
                                            height: 'calc(100vh - 280px)', maxHeight: '500px',
                                            objectFit: 'contain', borderRadius: '12px',
                                            boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                                        }}
                                    />
                                </div>
                                {/* Résultat IA */}
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px',
                                        color: 'var(--color-accent-choco)' }}>
                                        ✨ Avec « {selectedModel?.titre} »
                                    </div>
                                    <img src={resultUrl} alt="Résultat"
                                        style={{
                                            height: 'calc(100vh - 280px)', maxHeight: '500px',
                                            objectFit: 'contain', borderRadius: '12px',
                                            boxShadow: '0 8px 30px rgba(139,94,60,0.2)',
                                            border: '2px solid rgba(139,94,60,0.15)',
                                        }}
                                    />
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
                                <button onClick={retakePhoto} style={{
                                    padding: '10px 20px', borderRadius: '12px',
                                    border: '1px solid rgba(139,94,60,0.2)',
                                    background: 'rgba(255,255,255,0.8)', cursor: 'pointer',
                                    fontSize: '13px', fontWeight: 500,
                                }}>
                                    📸 Nouvelle photo
                                </button>
                                <button onClick={() => { setPhase('preview'); setResultUrl(null); }} style={{
                                    padding: '10px 20px', borderRadius: '12px',
                                    border: '1px solid rgba(139,94,60,0.2)',
                                    background: 'rgba(255,255,255,0.8)', cursor: 'pointer',
                                    fontSize: '13px', fontWeight: 500,
                                }}>
                                    👔 Essayer un autre vêtement
                                </button>
                                <button style={{
                                    padding: '10px 24px', borderRadius: '12px', border: 'none',
                                    background: 'linear-gradient(135deg, var(--color-accent-choco), var(--color-accent-caramel))',
                                    color: '#fff', cursor: 'pointer',
                                    fontSize: '14px', fontWeight: 600,
                                    boxShadow: '0 4px 15px rgba(139,94,60,0.3)',
                                }}>
                                    🛒 Commander ce modèle
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* CSS animations */}
            <style>{`
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
                @keyframes pulseCount {
                    0% { transform: scale(0.5); opacity: 0; }
                    30% { transform: scale(1.2); opacity: 1; }
                    100% { transform: scale(1); opacity: 1; }
                }
            `}</style>
        </div>
    );
}
