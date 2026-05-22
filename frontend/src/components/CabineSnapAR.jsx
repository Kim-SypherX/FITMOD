/**
 * FITMOD — CabineSnapAR.jsx
 * ==========================
 * Cabine d'essayage basée sur Snap Camera Kit.
 * Chaque vêtement correspond à une Lens Snap créée dans Lens Studio.
 * 
 * Ce composant gère :
 *   - Initialisation Camera Kit (webcam → canvas AR en temps réel)
 *   - Changement de Lens quand l'utilisateur sélectionne un vêtement
 *   - Navigation gestuelle via MediaPipe Hands en parallèle
 *   - UI de la cabine (sidebar + viewport plein écran)
 * 
 * Prérequis :
 *   - VITE_SNAP_API_TOKEN dans .env
 *   - VITE_SNAP_LENS_GROUP_ID dans .env
 *   - Chaque modèle doit avoir un champ `lens_id` dans la BDD
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import useCameraKit from '../hooks/useCameraKit';
import useGestesNavigation from '../hooks/useGestesNavigation';
import api from '../utils/api';
import '../styles/CabineEssayage.css';

// ─── Configuration Snap ───
const SNAP_API_TOKEN = import.meta.env.VITE_SNAP_API_TOKEN || '';
const SNAP_LENS_GROUP_ID = import.meta.env.VITE_SNAP_LENS_GROUP_ID || '';

export default function CabineSnapAR() {
    // ═══ State ═══
    const [models, setModels] = useState([]);
    const [selectedModel, setSelectedModel] = useState(null);
    const [modelIndex, setModelIndex] = useState(-1);
    const [status, setStatus] = useState('');
    const [gestureToast, setGestureToast] = useState(null);
    const gestureToastTimeout = useRef(null);
    const modelIndexRef = useRef(-1);
    const modelsRef = useRef([]);

    // ═══ Camera Kit ═══
    const {
        canvasRef,
        isReady: cameraReady,
        isLoading: cameraLoading,
        error: cameraError,
        currentLensId,
        applyLens,
        removeLens,
    } = useCameraKit(SNAP_API_TOKEN, SNAP_LENS_GROUP_ID);

    // ═══ Gestes (vidéo source = canvas de Camera Kit n'est pas une vidéo, on bypass) ═══
    const videoRef = useRef(null);

    // Sync refs
    useEffect(() => { modelsRef.current = models; }, [models]);
    useEffect(() => { modelIndexRef.current = modelIndex; }, [modelIndex]);

    // ═══════════════════════════════════════════════════════════
    // 1. CHARGEMENT DES MODÈLES
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
    // 2. SÉLECTION D'UN VÊTEMENT → Appliquer sa Lens
    // ═══════════════════════════════════════════════════════════
    const selectModel = useCallback(async (model) => {
        setSelectedModel(model);

        if (!model.lens_id) {
            setStatus(`⚠ ${model.titre} — Pas de Lens AR configurée`);
            await removeLens();
            return;
        }

        setStatus(`⏳ Chargement AR : ${model.titre}...`);
        const ok = await applyLens(model.lens_id);

        if (ok) {
            setStatus(`✅ ${model.titre} — AR active`);
        } else {
            setStatus(`❌ Erreur AR : ${model.titre}`);
        }
    }, [applyLens, removeLens]);

    // ═══════════════════════════════════════════════════════════
    // 3. NAVIGATION GESTUELLE
    // ═══════════════════════════════════════════════════════════
    const showToast = useCallback((label) => {
        setGestureToast(label);
        clearTimeout(gestureToastTimeout.current);
        gestureToastTimeout.current = setTimeout(() => setGestureToast(null), 1500);
    }, []);

    const navigateModel = useCallback((direction) => {
        const all = modelsRef.current;
        if (!all.length) return;
        let next;
        if (direction > 0) {
            next = (modelIndexRef.current + 1) % all.length;
        } else {
            next = modelIndexRef.current <= 0 ? all.length - 1 : modelIndexRef.current - 1;
        }
        setModelIndex(next);
        selectModel(all[next]);
        showToast(direction > 0 ? '👋 Modèle suivant' : '👋 Modèle précédent');
    }, [selectModel, showToast]);

    // ═══════════════════════════════════════════════════════════
    // RENDU
    // ═══════════════════════════════════════════════════════════

    // Écran d'erreur si pas de token
    if (!SNAP_API_TOKEN || !SNAP_LENS_GROUP_ID) {
        return (
            <div className="cabine-essayage" style={{ padding: '40px', textAlign: 'center' }}>
                <div className="ce-header">
                    <h1 className="ce-title">
                        <span className="ce-title-icon">🧥</span>
                        Cabine d'Essayage Virtuelle
                    </h1>
                </div>
                <div style={{
                    background: 'rgba(255,200,100,0.15)',
                    border: '2px solid rgba(200,150,50,0.3)',
                    borderRadius: '16px',
                    padding: '32px',
                    maxWidth: '600px',
                    margin: '40px auto',
                }}>
                    <h2 style={{ margin: '0 0 16px', fontSize: '20px' }}>⚙️ Configuration Snap Camera Kit requise</h2>
                    <p style={{ fontSize: '14px', lineHeight: '1.8', textAlign: 'left' }}>
                        Pour activer la cabine AR Snap, ajoutez ces clés dans <code>.env</code> :
                    </p>
                    <pre style={{
                        background: 'rgba(0,0,0,0.05)', padding: '16px', borderRadius: '8px',
                        textAlign: 'left', fontSize: '13px', overflow: 'auto',
                    }}>
{`VITE_SNAP_API_TOKEN=votre_token_ici
VITE_SNAP_LENS_GROUP_ID=votre_group_id_ici`}
                    </pre>
                    <p style={{ fontSize: '13px', margin: '16px 0 0', opacity: 0.7 }}>
                        Obtenez ces clés sur <a href="https://kit.snapchat.com" target="_blank" rel="noreferrer" style={{ color: 'var(--color-accent-choco)' }}>kit.snapchat.com</a>
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="cabine-essayage" style={{ padding: '8px' }}>
            {/* ── LAYOUT PRINCIPAL ── */}
            <div style={{
                display: 'flex', gap: '10px', alignItems: 'stretch',
                height: 'calc(100vh - 80px)',
            }}>
                {/* ═══ SIDEBAR ═══ */}
                <div style={{
                    width: '180px', flexShrink: 0,
                    display: 'flex', flexDirection: 'column', gap: '8px',
                    background: 'rgba(255,255,255,0.65)',
                    backdropFilter: 'blur(20px)',
                    borderRadius: '12px', padding: '10px',
                    border: '1px solid rgba(139,94,60,0.12)',
                    overflowY: 'auto',
                }}>
                    {/* Status */}
                    <div style={{
                        padding: '8px 10px', borderRadius: '10px',
                        background: cameraReady ? 'rgba(76,175,80,0.08)' : 'rgba(139,94,60,0.08)',
                        fontSize: '11px', textAlign: 'center', fontWeight: 500,
                    }}>
                        {cameraLoading ? '⏳ Initialisation AR...' :
                         cameraReady ? '✅ Snap AR actif' :
                         '❌ ' + (cameraError || 'Erreur')}
                    </div>

                    {/* Liste des vêtements */}
                    <div>
                        <div style={{ fontWeight: 700, fontSize: '13px', margin: '4px 0 6px' }}>Vêtements</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {models.map((m, i) => (
                                <button
                                    key={m.id}
                                    onClick={() => { setModelIndex(i); selectModel(m); }}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '8px',
                                        padding: '6px 8px', border: 'none', borderRadius: '8px',
                                        cursor: 'pointer', textAlign: 'left', fontSize: '11px',
                                        background: selectedModel?.id === m.id
                                            ? 'linear-gradient(135deg, var(--color-accent-choco), var(--color-accent-caramel))'
                                            : 'rgba(139,94,60,0.05)',
                                        color: selectedModel?.id === m.id ? '#fff' : 'inherit',
                                        transition: 'all 0.2s ease',
                                    }}
                                >
                                    {m.photo_url && (
                                        <img
                                            src={m.photo_url.startsWith('http') ? m.photo_url : api.getUploadUrl(m.photo_url)}
                                            alt={m.titre}
                                            style={{ width: '32px', height: '32px', borderRadius: '6px', objectFit: 'cover' }}
                                        />
                                    )}
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: '11px' }}>{m.titre}</div>
                                        <div style={{ fontSize: '9px', opacity: 0.7 }}>
                                            {m.lens_id ? '🔮 Lens AR' : '⚠ Pas de Lens'}
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* ═══ VIEWPORT AR ═══ */}
                <div style={{
                    flex: 1, position: 'relative',
                    background: '#000', borderRadius: '12px',
                    overflow: 'hidden', height: '100%',
                }}>
                    {/* Canvas Camera Kit — rendu AR en temps réel */}
                    <canvas
                        ref={canvasRef}
                        style={{
                            width: '100%', height: '100%',
                            display: 'block', objectFit: 'cover',
                        }}
                    />

                    {/* ── Status badge ── */}
                    <div style={{
                        position: 'absolute', top: '12px', left: '50%', transform: 'translateX(-50%)',
                        background: 'rgba(0,0,0,0.6)', color: '#fff',
                        padding: '6px 16px', borderRadius: '20px',
                        fontSize: '12px', fontWeight: 500, backdropFilter: 'blur(10px)',
                        zIndex: 10,
                    }}>
                        {status || (cameraReady ? '✅ Sélectionnez un vêtement' : 'Chargement...')}
                    </div>

                    {/* ── Modèle actif badge ── */}
                    {selectedModel && (
                        <div style={{
                            position: 'absolute', bottom: '16px', left: '50%', transform: 'translateX(-50%)',
                            background: 'rgba(0,0,0,0.6)', color: '#fff',
                            padding: '8px 20px', borderRadius: '20px',
                            fontSize: '13px', fontWeight: 600, backdropFilter: 'blur(10px)',
                            zIndex: 10,
                        }}>
                            🧥 {selectedModel.titre}
                        </div>
                    )}

                    {/* ── Gesture toast ── */}
                    {gestureToast && (
                        <div style={{
                            position: 'absolute', top: '50%', left: '50%',
                            transform: 'translate(-50%, -50%)',
                            background: 'rgba(0,0,0,0.75)', color: '#fff',
                            padding: '16px 32px', borderRadius: '16px',
                            fontSize: '18px', fontWeight: 700, zIndex: 20,
                            backdropFilter: 'blur(10px)',
                            animation: 'fadeInUp 0.3s ease',
                        }}>
                            {gestureToast}
                        </div>
                    )}

                    {/* ── Guide des gestes ── */}
                    <div style={{
                        position: 'absolute', bottom: '16px', right: '16px',
                        background: 'rgba(0,0,0,0.5)', color: '#fff',
                        padding: '10px 14px', borderRadius: '12px',
                        fontSize: '11px', lineHeight: '1.8', zIndex: 10,
                        backdropFilter: 'blur(10px)',
                    }}>
                        <div style={{ fontWeight: 700, marginBottom: '4px' }}>🤚 Gestes</div>
                        <div>👋 Swipe → Changer modèle</div>
                        <div>☝️ Doigt ↕ Couleur</div>
                        <div>👍 Pouce = Favori</div>
                        <div>✊ Poing = Commander</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
