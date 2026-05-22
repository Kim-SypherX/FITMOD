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
    isPoseStable,
    MESURE_LABELS
} from '../utils/mesuresCalculator';
import '../styles/MesuresCapture.css';

export default function MesuresCapture() {
    const { user, login, updateProfile } = useAuth();
    const [mesures, setMesures] = useState(null);
    const [mode, setMode] = useState('camera'); // 'camera' | 'upload'
    const [isCapturing, setIsCapturing] = useState(false);
    const [cameraError, setCameraError] = useState('');
    const [poseStatus, setPoseStatus] = useState('');
    const [heightCm, setHeightCm] = useState(175);
    const [weightKg, setWeightKg] = useState(70);
    const heightRef = useRef(175);
    const weightRef = useRef(70);
    const [saveStatus, setSaveStatus] = useState(null);
    const [isDetecting, setIsDetecting] = useState(false);
    // Upload mode states
    const [faceImage, setFaceImage] = useState(null); // File
    const [profileImage, setProfileImage] = useState(null); // File
    const [facePreview, setFacePreview] = useState(null); // data URL
    const [profilePreview, setProfilePreview] = useState(null); // data URL
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [uploadStatus, setUploadStatus] = useState('');

    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const streamRef = useRef(null);
    const animFrameRef = useRef(null);
    const prevLandmarksRef = useRef(null);
    const stableCountRef = useRef(0);
    const samplesRef = useRef([]); // Stocke les échantillons de mesures
    const faceCanvasRef = useRef(null);
    const profileCanvasRef = useRef(null);
    const faceInputRef = useRef(null);
    const profileInputRef = useRef(null);
    const STABLE_FRAMES_NEEDED = 150; // ~5s pour se placer correctement
    const SAMPLES_NEEDED = 120; // ~4 secondes d'échantillonnage à 30fps

    // Calcule la MÉDIANE d'un tableau
    const median = (arr) => {
        const sorted = [...arr].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    };

    // Supprime les outliers via IQR (Interquartile Range)
    const removeOutliers = (arr) => {
        if (arr.length < 10) return arr;
        const sorted = [...arr].sort((a, b) => a - b);
        const q1 = sorted[Math.floor(sorted.length * 0.25)];
        const q3 = sorted[Math.floor(sorted.length * 0.75)];
        const iqr = q3 - q1;
        const lower = q1 - 1.5 * iqr;
        const upper = q3 + 1.5 * iqr;
        return sorted.filter(v => v >= lower && v <= upper);
    };

    // Fusionne les échantillons : IQR → médiane pour chaque mesure
    const computeMedianMeasures = (samples) => {
        if (samples.length === 0) return null;
        const keys = Object.keys(samples[0]);
        const result = {};
        for (const key of keys) {
            const raw = samples.map(s => s[key]).filter(v => v != null && !isNaN(v));
            const cleaned = removeOutliers(raw); // Retire les valeurs aberrantes
            result[key] = Math.round(median(cleaned) * 10) / 10;
        }
        return result;
    };

    // Init MediaPipe — inclut detectPoseImage pour le mode upload
    const { detectPose, detectPoseImage, isLoading: mpLoading, error: mpError, progress: mpProgress } = useMediaPipe({ enablePose: true });

    useEffect(() => {
        if ((user?.type_compte === 'client' || user?.type_compte === 'tailleur') && user.client?.mesures_json) {
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
        setMesures(null);
        prevLandmarksRef.current = null;
        stableCountRef.current = 0;
        samplesRef.current = [];
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
            });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.onloadeddata = () => {
                    videoRef.current.play();
                    // Auto-start detection as soon as video is ready
                    startDetection();
                };
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

    // Real-time pose detection loop with MULTI-SAMPLE AVERAGING
    const startDetection = useCallback(() => {
        if (!videoRef.current || !canvasRef.current) return;
        setIsDetecting(true);
        setPoseStatus('Détection en cours... Placez-vous debout, face à la caméra');
        samplesRef.current = [];
        stableCountRef.current = 0;

        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        const detectFrame = () => {
            if (!video || video.paused || video.ended) return;

            canvas.width = video.videoWidth || 640;
            canvas.height = video.videoHeight || 480;
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const result = detectPose(video, performance.now());

            if (result && result.landmarks && result.landmarks.length > 0) {
                const landmarks = result.landmarks[0];

                drawLandmarks(ctx, landmarks, canvas.width, canvas.height);
                drawMeasurementLines(ctx, landmarks, canvas.width, canvas.height);

                const quality = validatePoseQuality(landmarks);

                if (quality.isValid) {
                    // Seuil de stabilité plus souple (0.02 au lieu de 0.008)
                    const isStable = isPoseStable(landmarks, prevLandmarksRef.current, 0.02);

                    // Phase 1: Stabilisation initiale
                    if (samplesRef.current.length === 0) {
                        if (isStable) {
                            stableCountRef.current++;
                        } else {
                            stableCountRef.current = Math.max(0, stableCountRef.current - 2);
                        }
                    }
                    // Phase 2: Pendant le sampling, on continue même avec de petits mouvements
                    // Seuls les gros mouvements (quality.isValid = false) arrêtent le sampling

                    // Phase 1: Attendre la stabilisation initiale
                    if (stableCountRef.current < STABLE_FRAMES_NEEDED) {
                        const remaining = Math.ceil((STABLE_FRAMES_NEEDED - stableCountRef.current) / 30);
                        setPoseStatus(`✅ Position détectée ! Stabilisation... ${remaining}s`);
                    }
                    // Phase 2: Collecte d'échantillons (MULTI-SAMPLE)
                    else if (samplesRef.current.length < SAMPLES_NEEDED) {
                        try {
                            const measures = calculateAllMeasurements(
                                landmarks, heightRef.current,
                                canvas.width, canvas.height,
                                weightRef.current
                            );
                            samplesRef.current.push(measures);

                            const progress = samplesRef.current.length / SAMPLES_NEEDED;
                            const remaining = Math.ceil((SAMPLES_NEEDED - samplesRef.current.length) / 30);
                            setPoseStatus(`📊 Analyse en cours... ${samplesRef.current.length}/${SAMPLES_NEEDED} échantillons (${remaining}s)`);

                            // Draw progress arc on canvas
                            const cx = canvas.width / 2;
                            const cy = canvas.height - 60;
                            // Background circle
                            ctx.beginPath();
                            ctx.arc(cx, cy, 35, 0, 2 * Math.PI);
                            ctx.fillStyle = 'rgba(0,0,0,0.5)';
                            ctx.fill();
                            // Progress arc
                            ctx.beginPath();
                            ctx.arc(cx, cy, 30, -Math.PI / 2, -Math.PI / 2 + (2 * Math.PI * progress), false);
                            ctx.strokeStyle = 'rgba(198, 139, 89, 0.95)';
                            ctx.lineWidth = 6;
                            ctx.lineCap = 'round';
                            ctx.stroke();
                            // Progress text
                            ctx.fillStyle = '#fff';
                            ctx.font = 'bold 16px sans-serif';
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.fillText(`${Math.round(progress * 100)}%`, cx, cy);
                        } catch (err) {
                            console.warn('Échantillon invalide:', err);
                        }
                    }
                    // Phase 3: Calcul de la médiane et fin
                    else {
                        const finalMeasures = computeMedianMeasures(samplesRef.current);
                        setMesures(finalMeasures);
                        setPoseStatus(`✅ Mesures finalisées ! (médiane de ${SAMPLES_NEEDED} échantillons)`);
                        samplesRef.current = [];
                        stableCountRef.current = 0;
                        return; // Stop the loop
                    }
                } else {
                    stableCountRef.current = 0;
                    samplesRef.current = [];
                    setPoseStatus(quality.messages[quality.messages.length - 1] || '');
                }

                prevLandmarksRef.current = landmarks;
            } else {
                setPoseStatus('Corps non détecté — placez-vous devant la caméra');
                prevLandmarksRef.current = null;
                stableCountRef.current = 0;
                samplesRef.current = [];
            }

            animFrameRef.current = requestAnimationFrame(detectFrame);
        };

        animFrameRef.current = requestAnimationFrame(detectFrame);
    }, [detectPose]);

    const saveMesures = async () => {
        if (!user || (user.type_compte !== 'client' && user.type_compte !== 'tailleur')) {
            alert("Vous devez être connecté comme client ou tailleur.");
            return;
        }
        try {
            // Convertir toutes les valeurs en strings pour le backend
            const strMesures = Object.fromEntries(
                Object.entries(mesures).map(([k, v]) => [k, String(v)])
            );
            await api.put(`/client-profil/${user.client.id}/mesures`, {
                mesures_json: strMesures,
                poitrine: mesures.P || null,
                taille: mesures.C || null,
                hanches: mesures.B || null,
                longueur_dos: mesures.L_habit || null,
                longueur_bras: mesures.LM || null,
                entrejambe: mesures.K || null,
                taille_reelle: heightCm,
                poids: weightKg
            });
            setSaveStatus({ type: 'success', message: 'Mesures sauvegardées avec succès !' });
            setTimeout(() => setSaveStatus(null), 4000);
            // Mettre à jour le user local pour que les mesures restent affichées
            updateProfile({
                client: {
                    ...user.client,
                    mesures_json: JSON.stringify(strMesures)
                }
            });
            // Arrêter la caméra après la sauvegarde
            stopCamera();
        } catch (err) {
            setSaveStatus({ type: 'error', message: err.message || 'Erreur serveur' });
            setTimeout(() => setSaveStatus(null), 4000);
        }
    };

    // ============================================================
    // UPLOAD MODE — Gestion des photos
    // ============================================================
    const handleImageUpload = (file, type) => {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            if (type === 'face') {
                setFaceImage(file);
                setFacePreview(e.target.result);
            } else {
                setProfileImage(file);
                setProfilePreview(e.target.result);
            }
        };
        reader.readAsDataURL(file);
    };

    const handleDrop = (e, type) => {
        e.preventDefault();
        e.stopPropagation();
        const file = e.dataTransfer?.files?.[0];
        if (file && file.type.startsWith('image/')) {
            handleImageUpload(file, type);
        }
    };

    const analyzePhotos = async () => {
        if (!facePreview) {
            setUploadStatus('Veuillez uploader au moins la photo de face.');
            return;
        }
        setIsAnalyzing(true);
        setUploadStatus('Chargement de l\'image...');
        setMesures(null);

        try {
            // Créer un HTMLImageElement à partir du preview
            const origImg = new Image();
            origImg.crossOrigin = 'anonymous';
            await new Promise((resolve, reject) => {
                origImg.onload = resolve;
                origImg.onerror = reject;
                origImg.src = facePreview;
            });

            // ============================================================
            // NORMALISATION 16:9 (1280×720) — Même espace que la webcam
            // On redimensionne la photo dans un canvas 1280×720 en gardant
            // le ratio d'aspect (letterbox/pillarbox), pour que les landmarks
            // MediaPipe soient dans le même système de coordonnées que la webcam.
            // ============================================================
            const TARGET_W = 1280;
            const TARGET_H = 720;
            const normCanvas = document.createElement('canvas');
            normCanvas.width = TARGET_W;
            normCanvas.height = TARGET_H;
            const normCtx = normCanvas.getContext('2d');
            normCtx.fillStyle = '#000';
            normCtx.fillRect(0, 0, TARGET_W, TARGET_H);

            // Calculer le scaling pour remplir au maximum sans déformer
            const scale = Math.min(TARGET_W / origImg.naturalWidth, TARGET_H / origImg.naturalHeight);
            const sw = origImg.naturalWidth * scale;
            const sh = origImg.naturalHeight * scale;
            const sx = (TARGET_W - sw) / 2;
            const sy = (TARGET_H - sh) / 2;
            normCtx.drawImage(origImg, sx, sy, sw, sh);

            // Convertir le canvas normalisé en Image
            const normImg = new Image();
            await new Promise((resolve, reject) => {
                normImg.onload = resolve;
                normImg.onerror = reject;
                normImg.src = normCanvas.toDataURL('image/jpeg', 0.95);
            });

            setUploadStatus('Analyse IA en cours... Détection des points corporels');

            // Détecter la pose sur l'image normalisée 1280×720
            const result = await detectPoseImage(normImg);

            if (!result || !result.landmarks || result.landmarks.length === 0) {
                setUploadStatus('');
                setSaveStatus({ type: 'error', message: 'Aucune pose détectée. Assurez-vous que la photo montre le corps entier, debout, bras légèrement écartés.' });
                setTimeout(() => setSaveStatus(null), 5000);
                setIsAnalyzing(false);
                return;
            }

            const landmarks = result.landmarks[0];

            // Vérifier la qualité de la pose
            const quality = validatePoseQuality(landmarks);
            if (!quality.isValid) {
                setUploadStatus('');
                setSaveStatus({ type: 'error', message: quality.messages.join(' ') || 'Pose non valide. Réessayez avec une meilleure photo.' });
                setTimeout(() => setSaveStatus(null), 5000);
                setIsAnalyzing(false);
                return;
            }

            setUploadStatus('Calcul des mesures...');

            // Dessiner les landmarks sur le canvas de preview (sur l'image originale)
            if (faceCanvasRef.current) {
                const canvas = faceCanvasRef.current;
                canvas.width = origImg.naturalWidth;
                canvas.height = origImg.naturalHeight;
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);

                // Ajuster les landmarks du système normalisé vers l'image originale
                const adjLandmarks = landmarks.map(lm => ({
                    ...lm,
                    x: (lm.x * TARGET_W - sx) / sw,
                    y: (lm.y * TARGET_H - sy) / sh
                }));
                drawLandmarks(ctx, adjLandmarks, canvas.width, canvas.height);
                drawMeasurementLines(ctx, adjLandmarks, canvas.width, canvas.height);
            }

            // Calculer les mesures en 1280×720 — même calibration que la webcam
            const measures = calculateAllMeasurements(
                landmarks, heightCm,
                TARGET_W, TARGET_H,
                weightKg
            );

            setMesures(measures);
            setUploadStatus('');
            setSaveStatus({ type: 'success', message: 'Mesures extraites avec succès à partir de la photo !' });
            setTimeout(() => setSaveStatus(null), 4000);
        } catch (err) {
            console.error('Erreur analyse photo:', err);
            setUploadStatus('');
            setSaveStatus({ type: 'error', message: 'Erreur lors de l\'analyse : ' + (err.message || 'Erreur inconnue') });
            setTimeout(() => setSaveStatus(null), 5000);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const resetUpload = () => {
        setFaceImage(null);
        setFacePreview(null);
        setProfileImage(null);
        setProfilePreview(null);
        setMesures(null);
        setUploadStatus('');
        if (faceCanvasRef.current) {
            faceCanvasRef.current.getContext('2d').clearRect(0, 0, faceCanvasRef.current.width, faceCanvasRef.current.height);
        }
    };

    return (
        <div className="page-container" style={isCapturing ? { padding: '12px', maxWidth: '100%' } : { position: 'relative' }}>
            {/* Toast notification */}
            {saveStatus && (
                <div style={{
                    position: 'fixed', top: '24px', left: '50%', transform: 'translateX(-50%)', zIndex: 9999,
                    background: saveStatus.type === 'success'
                        ? 'linear-gradient(135deg, #16a34a, #15803d)'
                        : 'linear-gradient(135deg, #dc2626, #b91c1c)',
                    color: '#fff', padding: '14px 28px', borderRadius: '16px',
                    fontWeight: '600', fontSize: '15px', boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
                    display: 'flex', alignItems: 'center', gap: '10px',
                    animation: 'slideDown 0.4s ease'
                }}>
                    <span style={{ fontSize: '20px' }}>{saveStatus.type === 'success' ? '✅' : '❌'}</span>
                    {saveStatus.message}
                </div>
            )}
            {/* Header */}
            {!isCapturing && (
                <div className="page-header">
                    <h1>Mesures Automatisées IA</h1>
                    <p>Prenez vos mesures précises via la caméra ou en uploadant vos photos.</p>
                </div>
            )}

            {/* Mode Tabs — hidden when capturing */}
            {!isCapturing && (
                <div style={{ display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.65)', backdropFilter: 'blur(20px)', border: '1px solid rgba(139,94,60,0.12)', borderRadius: '20px', padding: '4px', marginBottom: '20px', maxWidth: '420px' }}>
                    <button
                        onClick={() => { setMode('camera'); setMesures(null); }}
                        style={{
                            flex: 1, padding: '12px 20px', border: 'none', borderRadius: '16px',
                            background: mode === 'camera' ? 'linear-gradient(135deg, var(--color-accent-choco), var(--color-accent-caramel))' : 'transparent',
                            color: mode === 'camera' ? '#fff' : 'var(--color-text-muted)',
                            fontSize: '15px', fontWeight: '600', cursor: 'pointer',
                            transition: 'all 0.3s ease',
                            boxShadow: mode === 'camera' ? '0 4px 15px rgba(139,94,60,0.3)' : 'none',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                        }}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
                        Caméra en direct
                    </button>
                    <button
                        onClick={() => { setMode('upload'); stopCamera(); setMesures(null); }}
                        style={{
                            flex: 1, padding: '12px 20px', border: 'none', borderRadius: '16px',
                            background: mode === 'upload' ? 'linear-gradient(135deg, var(--color-accent-choco), var(--color-accent-caramel))' : 'transparent',
                            color: mode === 'upload' ? '#fff' : 'var(--color-text-muted)',
                            fontSize: '15px', fontWeight: '600', cursor: 'pointer',
                            transition: 'all 0.3s ease',
                            boxShadow: mode === 'upload' ? '0 4px 15px rgba(139,94,60,0.3)' : 'none',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                        }}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                        Upload de photos
                    </button>
                </div>
            )}

            {/* Height + Weight Input — compact when capturing */}
            <div style={{ background: 'rgba(255,255,255,0.65)', backdropFilter: 'blur(20px)', border: '1px solid rgba(139,94,60,0.12)', borderRadius: isCapturing ? '16px' : '24px', padding: isCapturing ? '10px 16px' : '20px 24px', marginBottom: isCapturing ? '8px' : '20px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: '600', color: 'var(--color-text-muted)', fontSize: '14px' }}>Taille :</span>
                <input
                    type="number"
                    value={heightCm}
                    onChange={e => { const v = Number(e.target.value); setHeightCm(v); heightRef.current = v; }}
                    min={100} max={250}
                    style={{ width: '80px', padding: '10px 14px', background: 'rgba(255,255,255,0.8)', border: '1px solid rgba(139,94,60,0.12)', borderRadius: '12px', fontSize: '16px', fontWeight: '700', color: 'var(--color-accent-choco)', textAlign: 'center', outline: 'none' }}
                />
                <span style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>cm</span>

                <span style={{ fontWeight: '600', color: 'var(--color-text-muted)', fontSize: '14px', marginLeft: '8px' }}>Poids :</span>
                <input
                    type="number"
                    value={weightKg}
                    onChange={e => { const v = Number(e.target.value); setWeightKg(v); weightRef.current = v; }}
                    min={30} max={200}
                    style={{ width: '80px', padding: '10px 14px', background: 'rgba(255,255,255,0.8)', border: '1px solid rgba(139,94,60,0.12)', borderRadius: '12px', fontSize: '16px', fontWeight: '700', color: 'var(--color-accent-choco)', textAlign: 'center', outline: 'none' }}
                />
                <span style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>kg</span>

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

            {/* Camera Section — only in camera mode */}
            {mode === 'camera' && (
            <div style={{ background: isCapturing ? 'rgba(0,0,0,0.95)' : 'rgba(255,255,255,0.65)', backdropFilter: 'blur(20px)', border: isCapturing ? 'none' : '1px solid rgba(139,94,60,0.12)', borderRadius: isCapturing ? '16px' : '24px', padding: isCapturing ? '8px' : '24px', marginBottom: '24px' }}>
                {!isCapturing && <h3 style={{ fontFamily: 'var(--font-heading)', margin: '0 0 16px', fontSize: '18px', fontWeight: '700' }}>Scanner Corporel</h3>}

                <div style={{ width: '100%', height: isCapturing ? 'calc(100vh - 160px)' : '40vh', background: isCapturing ? '#000' : 'var(--color-bg-alt)', border: isCapturing ? 'none' : '1px solid rgba(139,94,60,0.12)', borderRadius: isCapturing ? '12px' : '20px', overflow: 'hidden', position: 'relative', marginBottom: isCapturing ? '8px' : '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {isCapturing ? (
                        <>
                            <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'contain', transform: 'scaleX(-1)' }} playsInline muted></video>
                            <canvas ref={canvasRef} width="1280" height="720" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', transform: 'scaleX(-1)', pointerEvents: 'none' }}></canvas>

                            {/* Overlay guide — shown until detection starts */}
                            {!isDetecting && (
                                <div style={{ position: 'absolute', inset: 0, border: '3px dashed rgba(198, 139, 89, 0.4)', margin: '40px', borderRadius: '40px', pointerEvents: 'none' }}></div>
                            )}

                            {/* Instructions overlay for auto-capture */}
                            {isDetecting && !mesures && (
                                <div style={{ position: 'absolute', bottom: '16px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', color: '#fff', padding: '8px 18px', borderRadius: '16px', fontSize: '12px', fontWeight: '500', maxWidth: '80%', textAlign: 'center' }}>
                                    Tenez-vous debout, bras légèrement écartés. La capture se fait automatiquement.
                                </div>
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
                            {mpLoading ? '⏳ Chargement IA...' : '🎯 Démarrer la Capture Automatique'}
                        </button>
                    ) : (
                        <>
                            {mesures && (
                                <button className="page-btn page-btn-primary" onClick={() => { setMesures(null); stableCountRef.current = 0; startDetection(); }} style={{ flex: 2 }}>
                                    🔄 Reprendre la capture
                                </button>
                            )}
                            <button className="page-btn page-btn-secondary" onClick={stopCamera} style={{ flex: 1 }}>Arrêter</button>
                        </>
                    )}
                </div>
            </div>
            )}

            {/* ============================================================ */}
            {/* UPLOAD SECTION — only in upload mode */}
            {/* ============================================================ */}
            {mode === 'upload' && !isCapturing && (
            <div style={{ background: 'rgba(255,255,255,0.65)', backdropFilter: 'blur(20px)', border: '1px solid rgba(139,94,60,0.12)', borderRadius: '24px', padding: '24px', marginBottom: '24px' }}>
                <h3 style={{ fontFamily: 'var(--font-heading)', margin: '0 0 8px', fontSize: '18px', fontWeight: '700' }}>Upload de Photos</h3>
                <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', margin: '0 0 20px' }}>
                    Uploadez une photo de <strong>face</strong> (obligatoire) et une photo de <strong>profil</strong> (optionnel).
                    Tenez-vous debout, bras légèrement écartés, en tenue ajustée.
                </p>

                {/* Dropzones grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                    {/* Face photo */}
                    <div>
                        <h4 style={{ fontFamily: 'var(--font-heading)', fontSize: '14px', color: 'var(--color-text-muted)', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '1px' }}>Vue de face *</h4>
                        <div
                            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                            onDrop={(e) => handleDrop(e, 'face')}
                            onClick={() => faceInputRef.current?.click()}
                            style={{
                                position: 'relative', minHeight: '240px', border: facePreview ? '2px solid var(--color-accent-choco)' : '2px dashed rgba(139,94,60,0.25)',
                                borderRadius: '16px', cursor: 'pointer', overflow: 'hidden',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: facePreview ? '#000' : 'rgba(255,255,255,0.4)',
                                transition: 'all 0.3s ease'
                            }}
                        >
                            {facePreview ? (
                                <>
                                    <img src={facePreview} alt="Face" style={{ width: '100%', height: '100%', objectFit: 'contain', minHeight: '240px' }} />
                                    <canvas ref={faceCanvasRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
                                    <button onClick={(e) => { e.stopPropagation(); setFaceImage(null); setFacePreview(null); setMesures(null); }} style={{
                                        position: 'absolute', top: '8px', right: '8px', background: 'rgba(220,38,38,0.9)', color: '#fff',
                                        border: 'none', borderRadius: '50%', width: '28px', height: '28px', cursor: 'pointer', fontSize: '14px', fontWeight: '700'
                                    }}>×</button>
                                </>
                            ) : (
                                <div style={{ textAlign: 'center', padding: '24px' }}>
                                    <div style={{ fontSize: '48px', marginBottom: '8px', opacity: 0.5 }}>🧍</div>
                                    <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', margin: 0 }}>Cliquez ou glissez-déposez<br/>votre photo de face</p>
                                </div>
                            )}
                        </div>
                        <input ref={faceInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleImageUpload(e.target.files[0], 'face')} />
                    </div>

                    {/* Profile photo */}
                    <div>
                        <h4 style={{ fontFamily: 'var(--font-heading)', fontSize: '14px', color: 'var(--color-text-muted)', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '1px' }}>Vue de profil</h4>
                        <div
                            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                            onDrop={(e) => handleDrop(e, 'profile')}
                            onClick={() => profileInputRef.current?.click()}
                            style={{
                                position: 'relative', minHeight: '240px', border: profilePreview ? '2px solid var(--color-accent-choco)' : '2px dashed rgba(139,94,60,0.15)',
                                borderRadius: '16px', cursor: 'pointer', overflow: 'hidden',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: profilePreview ? '#000' : 'rgba(255,255,255,0.4)',
                                transition: 'all 0.3s ease'
                            }}
                        >
                            {profilePreview ? (
                                <>
                                    <img src={profilePreview} alt="Profil" style={{ width: '100%', height: '100%', objectFit: 'contain', minHeight: '240px' }} />
                                    <canvas ref={profileCanvasRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
                                    <button onClick={(e) => { e.stopPropagation(); setProfileImage(null); setProfilePreview(null); }} style={{
                                        position: 'absolute', top: '8px', right: '8px', background: 'rgba(220,38,38,0.9)', color: '#fff',
                                        border: 'none', borderRadius: '50%', width: '28px', height: '28px', cursor: 'pointer', fontSize: '14px', fontWeight: '700'
                                    }}>×</button>
                                </>
                            ) : (
                                <div style={{ textAlign: 'center', padding: '24px' }}>
                                    <div style={{ fontSize: '48px', marginBottom: '8px', opacity: 0.3 }}>🧍‍♂️</div>
                                    <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', margin: 0, opacity: 0.6 }}>Optionnel<br/>Photo de profil</p>
                                </div>
                            )}
                        </div>
                        <input ref={profileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleImageUpload(e.target.files[0], 'profile')} />
                    </div>
                </div>

                {/* Upload status */}
                {uploadStatus && (
                    <div style={{ textAlign: 'center', padding: '12px', background: 'rgba(139,94,60,0.08)', borderRadius: '12px', marginBottom: '16px', fontSize: '14px', fontWeight: '600', color: 'var(--color-accent-choco)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                        {isAnalyzing && <span style={{ display: 'inline-block', width: '16px', height: '16px', border: '2px solid rgba(139,94,60,0.3)', borderTopColor: 'var(--color-accent-choco)', borderRadius: '50%', animation: 'mc-spin 0.8s linear infinite' }} />}
                        {uploadStatus}
                    </div>
                )}

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                        className="page-btn page-btn-primary"
                        onClick={analyzePhotos}
                        disabled={!facePreview || mpLoading || isAnalyzing}
                        style={{ flex: 1, opacity: (!facePreview || mpLoading || isAnalyzing) ? 0.5 : 1 }}
                    >
                        {isAnalyzing ? '⏳ Analyse en cours...' : mpLoading ? '⏳ Chargement IA...' : '🔍 Analyser les photos'}
                    </button>
                    {(facePreview || profilePreview) && (
                        <button className="page-btn page-btn-secondary" onClick={resetUpload} style={{ flex: 0 }}>
                            Effacer
                        </button>
                    )}
                </div>
            </div>
            )}

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
                ) : (() => {
                    const groups = {
                        'Haut du corps': Object.entries(mesures).filter(([k]) => MESURE_LABELS[k]?.group === 'haut'),
                        'Manches': Object.entries(mesures).filter(([k]) => MESURE_LABELS[k]?.group === 'manches'),
                        'Jambes': Object.entries(mesures).filter(([k]) => MESURE_LABELS[k]?.group === 'jambes'),
                    };
                    return (
                        <div>
                            {Object.entries(groups).map(([groupName, entries]) => entries.length > 0 && (
                                <div key={groupName} style={{ marginBottom: '20px' }}>
                                    <h4 style={{ fontFamily: 'var(--font-heading)', fontSize: '14px', color: 'var(--color-text-muted)', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '1px' }}>{groupName}</h4>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px' }}>
                                        {entries.map(([k, v]) => {
                                            const label = MESURE_LABELS[k];
                                            return (
                                                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.5)', backdropFilter: 'blur(8px)', padding: '14px 18px', borderRadius: '16px', border: '1px solid rgba(139,94,60,0.12)', transition: 'all 0.3s ease' }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                        <span style={{ fontSize: '18px', fontWeight: '800', color: 'var(--color-accent-choco)', fontFamily: 'var(--font-heading)' }}>{label?.short || k}</span>
                                                        <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: '500' }}>{label?.full || k}</span>
                                                    </div>
                                                    <span style={{ fontSize: '20px', fontWeight: '700', color: 'var(--color-accent-choco)', fontFamily: 'var(--font-heading)', textShadow: '0 0 8px rgba(139,94,60,0.3)' }}>{v} cm</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}

                            <div style={{ marginTop: '12px', display: 'flex', gap: '12px' }}>
                                <button className="page-btn page-btn-primary" onClick={saveMesures} style={{ flex: 1 }}>
                                    Sauvegarder dans mon profil
                                </button>
                                <button className="page-btn page-btn-secondary" onClick={() => { setMesures(null); stableCountRef.current = 0; }} style={{ flex: 0 }}>
                                    Refaire
                                </button>
                            </div>
                        </div>
                    );
                })()}
            </div>

        </div>
    );
}
