/**
 * FITMOD — Tableau de Bord Tailleur
 * ===================================
 * Gestion des modèles (upload photo + détails) et portfolio
 */
import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api, { fetchApi } from '../utils/api';
import '../styles/Pages.css';

export default function TailleurDashboard() {
    const { user, login } = useAuth();
    const [tab, setTab] = useState('modeles'); // 'modeles' | 'portfolio' | 'profil'
    const [modeles, setModeles] = useState([]);
    const [portfolio, setPortfolio] = useState([]);
    const [tailleurData, setTailleurData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showModelForm, setShowModelForm] = useState(false);
    const [editingModel, setEditingModel] = useState(null);
    const [formStatus, setFormStatus] = useState('');
    const [tailleurId, setTailleurId] = useState(user?.tailleur?.id || null);

    // Resolve tailleurId: if user.tailleur doesn't exist, fetch tailleurs list to find our profile
    useEffect(() => {
        const resolve = async () => {
            if (user?.tailleur?.id) {
                setTailleurId(user.tailleur.id);
                return;
            }
            // Try to find our tailleur profile from the tailleurs list
            try {
                const tailleurs = await api.get('/tailleurs');
                const mine = tailleurs.find(t => t.utilisateur_id === user?.id || t.email === user?.email);
                if (mine) {
                    setTailleurId(mine.id);
                }
            } catch (err) {
                console.error('Erreur résolution ID tailleur:', err);
            }
        };
        resolve();
    }, [user]);

    // Fetch tailor data
    useEffect(() => {
        if (!tailleurId) return;
        loadData();
    }, [tailleurId]);

    const loadData = async () => {
        setLoading(true);
        try {
            const data = await api.get(`/tailleurs/${tailleurId}`);
            setTailleurData(data);
            setModeles(data.modeles || []);
            setPortfolio(data.portfolio || []);
        } catch (err) {
            console.error('Erreur chargement données tailleur:', err);
            // Try loading models and portfolio separately
            try {
                const m = await api.get(`/tailleurs/${tailleurId}/modeles`);
                setModeles(m || []);
            } catch (e) { }
            try {
                const p = await api.get(`/tailleurs/${tailleurId}/portfolio`);
                setPortfolio(p || []);
            } catch (e) { }
        }
        setLoading(false);
    };

    // ============ MODELES ============

    const ModelForm = ({ model = null, onClose }) => {
        const [titre, setTitre] = useState(model?.titre || '');
        const [description, setDescription] = useState(model?.description || '');
        const [typeTenue, setTypeTenue] = useState(model?.type_tenue || 'boubou');
        const [prixBase, setPrixBase] = useState(model?.prix_base || '');
        const [delai, setDelai] = useState(model?.delai_confection || '');
        const [couleurs, setCouleurs] = useState(model?.couleurs_disponibles || '');
        const [photo, setPhoto] = useState(null);
        const [preview, setPreview] = useState(model?.photo_url ? api.getUploadUrl(model.photo_url) : null);
        const [submitting, setSubmitting] = useState(false);
        const fileRef = useRef(null);

        const handlePhotoChange = (e) => {
            const file = e.target.files[0];
            if (file) {
                setPhoto(file);
                setPreview(URL.createObjectURL(file));
            }
        };

        const handleSubmit = async (e) => {
            e.preventDefault();
            if (!titre.trim()) return setFormStatus('❌ Le titre est requis');
            setSubmitting(true);
            setFormStatus('⏳ Envoi en cours...');

            const formData = new FormData();
            formData.append('titre', titre);
            formData.append('description', description);
            formData.append('type_tenue', typeTenue);
            formData.append('prix_base', prixBase || 0);
            formData.append('delai_confection', delai ? parseInt(delai) : '');
            formData.append('couleurs_disponibles', couleurs || '');
            if (photo) formData.append('photo', photo);

            try {
                if (model) {
                    formData.append('actif', '1');
                    await fetchApi(`/tailleurs/modeles/${model.id}`, { method: 'PUT', body: formData });
                    setFormStatus('✅ Modèle mis à jour !');
                } else {
                    await fetchApi(`/tailleurs/${tailleurId}/modeles`, { method: 'POST', body: formData });
                    setFormStatus('✅ Modèle créé !');
                }
                await loadData();
                setTimeout(() => { onClose(); setFormStatus(''); }, 1000);
            } catch (err) {
                setFormStatus(`❌ ${err.message}`);
            }
            setSubmitting(false);
        };

        return (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
                <div style={{ background: '#fff', borderRadius: '24px', padding: '32px', maxWidth: '600px', width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 60px rgba(0,0,0,0.3)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                        <h2 style={{ fontFamily: 'var(--font-heading)', margin: 0, fontSize: '22px', fontWeight: '700' }}>
                            {model ? 'Modifier le Modèle' : 'Nouveau Modèle'}
                        </h2>
                        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: 'var(--color-text-muted)' }}>✕</button>
                    </div>

                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {/* Photo Upload */}
                        <div
                            onClick={() => fileRef.current?.click()}
                            style={{
                                width: '100%', height: '200px', borderRadius: '16px',
                                border: '2px dashed rgba(139,94,60,0.3)', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                overflow: 'hidden', background: 'rgba(139,94,60,0.04)',
                                transition: 'all 0.3s'
                            }}
                        >
                            {preview ? (
                                <img src={preview} alt="Aperçu" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                                <div style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
                                    <div style={{ fontSize: '40px', marginBottom: '8px' }}>📸</div>
                                    <div style={{ fontSize: '14px', fontWeight: '600' }}>Cliquez pour ajouter une photo</div>
                                </div>
                            )}
                        </div>
                        <input ref={fileRef} type="file" accept="image/*" onChange={handlePhotoChange} style={{ display: 'none' }} />

                        {/* Fields */}
                        <InputField label="Titre *" value={titre} onChange={setTitre} placeholder="Ex: Boubou Grand Bazin" />
                        <InputField label="Description" value={description} onChange={setDescription} placeholder="Décrivez le modèle..." multiline />

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            <div>
                                <label style={labelStyle}>Type de tenue</label>
                                <select value={typeTenue} onChange={e => setTypeTenue(e.target.value)} style={inputStyle}>
                                    <option value="boubou">Boubou</option>
                                    <option value="robe">Robe</option>
                                    <option value="costume">Costume</option>
                                    <option value="ensemble">Ensemble</option>
                                    <option value="chemise">Chemise</option>
                                    <option value="pantalon">Pantalon</option>
                                    <option value="autre">Autre</option>
                                </select>
                            </div>
                            <InputField label="Prix de base (FCFA)" value={prixBase} onChange={setPrixBase} type="number" placeholder="15000" />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            <InputField label="Délai confection (jours)" value={delai} onChange={setDelai} type="number" placeholder="Ex: 7" />
                            <InputField label="Couleurs disponibles" value={couleurs} onChange={setCouleurs} placeholder="Rouge, Bleu, Or" />
                        </div>

                        {formStatus && (
                            <div style={{ padding: '10px 16px', borderRadius: '12px', background: formStatus.startsWith('✅') ? 'rgba(22,163,74,0.1)' : formStatus.startsWith('⏳') ? 'rgba(139,94,60,0.1)' : 'rgba(220,38,38,0.1)', fontSize: '14px', fontWeight: '600', textAlign: 'center' }}>
                                {formStatus}
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                            <button type="submit" className="page-btn page-btn-primary" disabled={submitting} style={{ flex: 1 }}>
                                {submitting ? '⏳ Envoi...' : model ? 'Mettre à jour' : 'Publier le Modèle'}
                            </button>
                            <button type="button" className="page-btn page-btn-secondary" onClick={onClose} style={{ flex: 0 }}>Annuler</button>
                        </div>
                    </form>
                </div>
            </div>
        );
    };

    // ============ PORTFOLIO ============

    const PortfolioUpload = () => {
        const [uploading, setUploading] = useState(false);
        const [legende, setLegende] = useState('');
        const fileRef = useRef(null);

        const handleUpload = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            setUploading(true);

            const formData = new FormData();
            formData.append('photo', file);
            formData.append('legende', legende);

            try {
                await fetchApi(`/tailleurs/${tailleurId}/portfolio`, { method: 'POST', body: formData });
                await loadData();
                setLegende('');
            } catch (err) {
                alert('Erreur upload: ' + err.message);
            }
            setUploading(false);
        };

        return (
            <div style={{ marginBottom: '20px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                    value={legende} onChange={e => setLegende(e.target.value)}
                    placeholder="Légende (optionnel)"
                    style={{ ...inputStyle, flex: '1 1 200px' }}
                />
                <input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} style={{ display: 'none' }} />
                <button
                    className="page-btn page-btn-primary"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                >
                    {uploading ? '⏳ Upload...' : '📸 Ajouter une Photo'}
                </button>
            </div>
        );
    };

    const deleteModel = async (id) => {
        if (!confirm('Supprimer ce modèle ?')) return;
        try {
            await api.delete(`/tailleurs/modeles/${id}`);
            await loadData();
        } catch (err) {
            alert('Erreur: ' + err.message);
        }
    };

    const deletePortfolioItem = async (id) => {
        if (!confirm('Supprimer cette photo ?')) return;
        try {
            await api.delete(`/tailleurs/portfolio/${id}`);
            await loadData();
        } catch (err) {
            alert('Erreur: ' + err.message);
        }
    };

    if (!tailleurId) {
        return (
            <div className="page-container" style={{ textAlign: 'center', padding: '80px 20px' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>⏳</div>
                <p style={{ color: 'var(--color-text-muted)' }}>Résolution de votre profil tailleur...</p>
                <p style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>Si cela persiste, déconnectez-vous et reconnectez-vous.</p>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="page-container" style={{ textAlign: 'center', padding: '80px 20px' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>⏳</div>
                <p style={{ color: 'var(--color-text-muted)' }}>Chargement de votre atelier...</p>
            </div>
        );
    }

    return (
        <div className="page-container">
            <div className="page-header">
                <h1>Mon Atelier</h1>
                <p>Gérez vos modèles et votre portfolio pour attirer des clients.</p>
            </div>

            {/* Stats Summary */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '24px' }}>
                {[
                    { label: 'Modèles', value: modeles.length, icon: '👔' },
                    { label: 'Portfolio', value: portfolio.length, icon: '📸' },
                    { label: 'Note', value: tailleurData?.note_moyenne ? `${tailleurData.note_moyenne}/5` : 'N/A', icon: '⭐' },
                    { label: 'Atelier', value: tailleurData?.nom_atelier || 'Mon Atelier', icon: '🏪' }
                ].map((s, i) => (
                    <div key={i} style={{ background: 'rgba(255,255,255,0.65)', backdropFilter: 'blur(20px)', border: '1px solid rgba(139,94,60,0.12)', borderRadius: '20px', padding: '20px', textAlign: 'center' }}>
                        <div style={{ fontSize: '28px', marginBottom: '8px' }}>{s.icon}</div>
                        <div style={{ fontSize: '22px', fontWeight: '700', fontFamily: 'var(--font-heading)', color: 'var(--color-accent-choco)' }}>{s.value}</div>
                        <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', fontWeight: '600' }}>{s.label}</div>
                    </div>
                ))}
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
                {[
                    { id: 'modeles', label: '👔 Mes Modèles' },
                    { id: 'portfolio', label: '📸 Portfolio' },
                    { id: 'profil', label: '⚙ Mon Profil' }
                ].map(t => (
                    <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        style={{
                            padding: '12px 24px', borderRadius: '14px',
                            background: tab === t.id ? 'linear-gradient(135deg, var(--color-accent-choco), var(--color-accent-caramel))' : 'rgba(255,255,255,0.5)',
                            color: tab === t.id ? '#fff' : 'var(--color-text-main)',
                            border: tab === t.id ? 'none' : '1px solid rgba(139,94,60,0.12)',
                            fontWeight: '700', fontSize: '14px', cursor: 'pointer',
                            boxShadow: tab === t.id ? '0 4px 15px rgba(139,94,60,0.3)' : 'none',
                            transition: 'all 0.3s'
                        }}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* ============ TAB: MODELES ============ */}
            {tab === 'modeles' && (
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <h3 style={{ fontFamily: 'var(--font-heading)', margin: 0, fontSize: '18px' }}>Mes Modèles ({modeles.length})</h3>
                        <button className="page-btn page-btn-primary" onClick={() => { setEditingModel(null); setShowModelForm(true); }}>
                            ＋ Nouveau Modèle
                        </button>
                    </div>

                    {modeles.length === 0 ? (
                        <div style={{ background: 'rgba(255,255,255,0.65)', backdropFilter: 'blur(20px)', border: '2px dashed rgba(139,94,60,0.15)', borderRadius: '24px', padding: '60px 20px', textAlign: 'center' }}>
                            <div style={{ fontSize: '48px', marginBottom: '16px' }}>👔</div>
                            <h4 style={{ fontFamily: 'var(--font-heading)', margin: '0 0 8px' }}>Aucun modèle publié</h4>
                            <p style={{ color: 'var(--color-text-muted)', margin: '0 0 20px', fontSize: '14px' }}>Publiez votre premier modèle pour apparaître dans le catalogue.</p>
                            <button className="page-btn page-btn-primary" onClick={() => { setEditingModel(null); setShowModelForm(true); }}>
                                Créer mon premier modèle
                            </button>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                            {modeles.map(m => (
                                <div key={m.id} style={{ background: 'rgba(255,255,255,0.65)', backdropFilter: 'blur(20px)', border: '1px solid rgba(139,94,60,0.12)', borderRadius: '20px', overflow: 'hidden', transition: 'all 0.3s' }}>
                                    {m.photo_url ? (
                                        <img src={api.getUploadUrl(m.photo_url)} alt={m.titre} style={{ width: '100%', height: '200px', objectFit: 'cover' }} />
                                    ) : (
                                        <div style={{ width: '100%', height: '200px', background: 'rgba(139,94,60,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '48px' }}>👔</div>
                                    )}
                                    <div style={{ padding: '16px' }}>
                                        <h4 style={{ fontFamily: 'var(--font-heading)', margin: '0 0 4px', fontSize: '16px' }}>{m.titre}</h4>
                                        <p style={{ color: 'var(--color-text-muted)', margin: '0 0 8px', fontSize: '13px', lineHeight: '1.4' }}>{m.description || 'Pas de description'}</p>
                                        <div style={{ display: 'flex', gap: '8px', fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '12px', flexWrap: 'wrap' }}>
                                            <span style={{ background: 'rgba(139,94,60,0.08)', padding: '4px 10px', borderRadius: '8px', fontWeight: '600' }}>{m.type_tenue}</span>
                                            {m.prix_base > 0 && <span style={{ background: 'rgba(139,94,60,0.08)', padding: '4px 10px', borderRadius: '8px', fontWeight: '600' }}>{Number(m.prix_base).toLocaleString()} F</span>}
                                            {m.delai_confection && <span style={{ background: 'rgba(139,94,60,0.08)', padding: '4px 10px', borderRadius: '8px', fontWeight: '600' }}>{m.delai_confection} jours</span>}
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button className="page-btn page-btn-secondary" onClick={() => { setEditingModel(m); setShowModelForm(true); }} style={{ flex: 1, fontSize: '12px', padding: '8px' }}>
                                                ✏️ Modifier
                                            </button>
                                            <button className="page-btn page-btn-secondary" onClick={() => deleteModel(m.id)} style={{ flex: 0, fontSize: '12px', padding: '8px', color: '#dc2626' }}>
                                                🗑
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ============ TAB: PORTFOLIO ============ */}
            {tab === 'portfolio' && (
                <div>
                    <h3 style={{ fontFamily: 'var(--font-heading)', margin: '0 0 20px', fontSize: '18px' }}>Portfolio ({portfolio.length})</h3>
                    <PortfolioUpload />

                    {portfolio.length === 0 ? (
                        <div style={{ background: 'rgba(255,255,255,0.65)', backdropFilter: 'blur(20px)', border: '2px dashed rgba(139,94,60,0.15)', borderRadius: '24px', padding: '60px 20px', textAlign: 'center' }}>
                            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📸</div>
                            <h4 style={{ fontFamily: 'var(--font-heading)', margin: '0 0 8px' }}>Portfolio vide</h4>
                            <p style={{ color: 'var(--color-text-muted)', margin: 0, fontSize: '14px' }}>Ajoutez des photos de vos réalisations.</p>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
                            {portfolio.map(p => (
                                <div key={p.id} style={{ position: 'relative', borderRadius: '16px', overflow: 'hidden', background: 'rgba(255,255,255,0.65)', border: '1px solid rgba(139,94,60,0.12)' }}>
                                    <img src={api.getUploadUrl(p.photo_url)} alt={p.legende || 'Portfolio'} style={{ width: '100%', height: '220px', objectFit: 'cover' }} />
                                    {p.legende && (
                                        <div style={{ padding: '10px 14px', fontSize: '13px', color: 'var(--color-text-muted)', fontWeight: '600' }}>{p.legende}</div>
                                    )}
                                    <button
                                        onClick={() => deletePortfolioItem(p.id)}
                                        style={{ position: 'absolute', top: '8px', right: '8px', background: 'rgba(220,38,38,0.85)', color: '#fff', border: 'none', borderRadius: '50%', width: '30px', height: '30px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', backdropFilter: 'blur(4px)' }}
                                    >✕</button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ============ TAB: PROFIL ============ */}
            {tab === 'profil' && (
                <ProfilTab tailleurData={tailleurData} tailleurId={tailleurId} onUpdate={loadData} />
            )}

            {/* Model Form Modal */}
            {showModelForm && (
                <ModelForm model={editingModel} onClose={() => { setShowModelForm(false); setEditingModel(null); setFormStatus(''); }} />
            )}
        </div>
    );
}

// ============ PROFIL TAB ============
function ProfilTab({ tailleurData, tailleurId, onUpdate }) {
    const [nomAtelier, setNomAtelier] = useState(tailleurData?.nom_atelier || '');
    const [adresse, setAdresse] = useState(tailleurData?.adresse || '');
    const [quartier, setQuartier] = useState(tailleurData?.quartier || '');
    const [specialites, setSpecialites] = useState(tailleurData?.specialites || '');
    const [tarifMin, setTarifMin] = useState(tailleurData?.tarif_min || '');
    const [delaiMoyen, setDelaiMoyen] = useState(tailleurData?.delai_moyen || '');
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState('');

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await api.put(`/tailleurs/${tailleurId}`, {
                nom_atelier: nomAtelier, adresse, quartier, specialites,
                tarif_min: tarifMin, delai_moyen: delaiMoyen, statut: 'actif'
            });
            setStatus('✅ Profil mis à jour !');
            onUpdate();
        } catch (err) {
            setStatus('❌ ' + err.message);
        }
        setSaving(false);
    };

    return (
        <div style={{ background: 'rgba(255,255,255,0.65)', backdropFilter: 'blur(20px)', border: '1px solid rgba(139,94,60,0.12)', borderRadius: '24px', padding: '32px', maxWidth: '600px' }}>
            <h3 style={{ fontFamily: 'var(--font-heading)', margin: '0 0 24px', fontSize: '18px' }}>Profil de l'Atelier</h3>
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <InputField label="Nom de l'atelier" value={nomAtelier} onChange={setNomAtelier} placeholder="Ex: Atelier Kôrô" />
                <InputField label="Adresse" value={adresse} onChange={setAdresse} placeholder="Rue / quartier principal" />
                <InputField label="Quartier" value={quartier} onChange={setQuartier} placeholder="Ex: Ouaga 2000" />
                <InputField label="Spécialités" value={specialites} onChange={setSpecialites} placeholder="Boubou, Robe, Costume" />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <InputField label="Tarif minimum (FCFA)" value={tarifMin} onChange={setTarifMin} type="number" placeholder="5000" />
                    <InputField label="Délai moyen" value={delaiMoyen} onChange={setDelaiMoyen} placeholder="3-5 jours" />
                </div>
                {status && <div style={{ padding: '10px', borderRadius: '12px', background: status.startsWith('✅') ? 'rgba(22,163,74,0.1)' : 'rgba(220,38,38,0.1)', fontSize: '14px', fontWeight: '600', textAlign: 'center' }}>{status}</div>}
                <button type="submit" className="page-btn page-btn-primary" disabled={saving}>
                    {saving ? '⏳ Sauvegarde...' : 'Sauvegarder le Profil'}
                </button>
            </form>
        </div>
    );
}

// ============ HELPERS ============
const labelStyle = { fontSize: '13px', fontWeight: '600', color: 'var(--color-text-muted)', marginBottom: '6px', display: 'block' };
const inputStyle = {
    width: '100%', padding: '12px 16px',
    background: 'rgba(255,255,255,0.8)', border: '1px solid rgba(139,94,60,0.15)',
    borderRadius: '12px', fontSize: '14px', outline: 'none',
    transition: 'border-color 0.3s', boxSizing: 'border-box'
};

function InputField({ label, value, onChange, placeholder, type = 'text', multiline = false }) {
    return (
        <div>
            <label style={labelStyle}>{label}</label>
            {multiline ? (
                <textarea
                    value={value} onChange={e => onChange(e.target.value)}
                    placeholder={placeholder} rows={3}
                    style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                />
            ) : (
                <input
                    type={type} value={value} onChange={e => onChange(e.target.value)}
                    placeholder={placeholder} style={inputStyle}
                />
            )}
        </div>
    );
}
