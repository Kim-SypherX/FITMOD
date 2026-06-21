/**
 * FITMOD — Tableau de Bord Tailleur
 * ===================================
 * Gestion des modèles (upload photo + détails) et portfolio
 */
import React, { useState, useEffect, useRef } from 'react';
import { FiGrid, FiCamera, FiStar, FiHome, FiSettings, FiEdit, FiTrash2, FiPlus, FiX, FiLoader, FiEdit2, FiBox, FiCheckCircle, FiUpload, FiCheck } from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';
import api, { fetchApi } from '../utils/api';
import '../styles/Pages.css';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix leaflet icon path issues in React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

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
        
        const interval = setInterval(() => {
            loadData(true);
        }, 10000);
        return () => clearInterval(interval);
    }, [tailleurId]);

    const loadData = async (silent = false) => {
        if (!silent) setLoading(true);
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
                <div style={{ fontSize: '48px', marginBottom: '16px', color: 'var(--color-accent-choco)' }}><FiLoader /></div>
                <p style={{ color: 'var(--color-text-muted)' }}>Résolution de votre profil tailleur...</p>
                <p style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>Si cela persiste, déconnectez-vous et reconnectez-vous.</p>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="page-container" style={{ textAlign: 'center', padding: '80px 20px' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px', color: 'var(--color-accent-choco)' }}><FiLoader /></div>
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
                    { label: 'Modèles', value: modeles.length, icon: <FiGrid /> },
                    { label: 'Portfolio', value: portfolio.length, icon: <FiCamera /> },
                    { label: 'Note', value: tailleurData?.note_moyenne ? `${tailleurData.note_moyenne}/5` : 'N/A', icon: <FiStar /> },
                    { label: 'Atelier', value: tailleurData?.nom_atelier || 'Mon Atelier', icon: <FiHome /> }
                ].map((s, i) => (
                    <div key={i} style={{ background: 'rgba(255,255,255,0.65)', backdropFilter: 'blur(20px)', border: '1px solid rgba(139,94,60,0.12)', borderRadius: '20px', padding: '20px', textAlign: 'center' }}>
                        <div style={{ fontSize: '28px', marginBottom: '8px', color: 'var(--color-accent-choco)' }}>{s.icon}</div>
                        <div style={{ fontSize: '22px', fontWeight: '700', fontFamily: 'var(--font-heading)', color: 'var(--color-accent-choco)' }}>{s.value}</div>
                        <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', fontWeight: '600' }}>{s.label}</div>
                    </div>
                ))}
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
                {[
                    { id: 'modeles', label: 'Mes Modèles', icon: <FiGrid /> },
                    { id: 'portfolio', label: 'Portfolio', icon: <FiCamera /> },
                    { id: 'profil', label: 'Mon Profil', icon: <FiSettings /> }
                ].map(t => (
                    <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            padding: '12px 24px', borderRadius: '14px',
                            background: tab === t.id ? 'linear-gradient(135deg, var(--color-accent-choco), var(--color-accent-caramel))' : 'rgba(255,255,255,0.5)',
                            color: tab === t.id ? '#fff' : 'var(--color-text-main)',
                            border: tab === t.id ? 'none' : '1px solid rgba(139,94,60,0.12)',
                            fontWeight: '700', fontSize: '14px', cursor: 'pointer',
                            boxShadow: tab === t.id ? '0 4px 15px rgba(139,94,60,0.3)' : 'none',
                            transition: 'all 0.3s'
                        }}
                    >
                        {t.icon} {t.label}
                    </button>
                ))}
            </div>

            {/* ============ TAB: MODELES ============ */}
            {tab === 'modeles' && (
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <h3 style={{ fontFamily: 'var(--font-heading)', margin: 0, fontSize: '18px' }}>Mes Modèles ({modeles.length})</h3>
                        <button className="page-btn page-btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }} onClick={() => { setEditingModel(null); setShowModelForm(true); }}>
                            <FiPlus /> Nouveau Modèle
                        </button>
                    </div>

                    {modeles.length === 0 ? (
                        <div style={{ background: 'rgba(255,255,255,0.65)', backdropFilter: 'blur(20px)', border: '2px dashed rgba(139,94,60,0.15)', borderRadius: '24px', padding: '60px 20px', textAlign: 'center' }}>
                            <div style={{ fontSize: '48px', marginBottom: '16px', color: 'var(--color-accent-choco)' }}><FiGrid /></div>
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
                                        <div style={{ width: '100%', height: '200px', background: 'rgba(139,94,60,0.06)', color: 'var(--color-accent-choco)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '48px' }}><FiGrid /></div>
                                    )}
                                    <div style={{ padding: '16px' }}>
                                        <h4 style={{ fontFamily: 'var(--font-heading)', margin: '0 0 4px', fontSize: '16px' }}>{m.titre}</h4>
                                        <p style={{ color: 'var(--color-text-muted)', margin: '0 0 8px', fontSize: '13px', lineHeight: '1.4' }}>{m.description || 'Pas de description'}</p>
                                        <div style={{ display: 'flex', gap: '8px', fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '12px', flexWrap: 'wrap' }}>
                                            <span style={{ background: 'rgba(139,94,60,0.08)', padding: '4px 10px', borderRadius: '8px', fontWeight: '600' }}>{m.type_tenue}</span>
                                            {m.prix_base > 0 && <span style={{ background: 'rgba(139,94,60,0.08)', padding: '4px 10px', borderRadius: '8px', fontWeight: '600' }}>Confection: {Number(m.prix_base).toLocaleString()} F</span>}
                                            {Number(m.tissu_disponible) === 1 && m.prix_tissu && <span style={{ background: 'rgba(22,163,74,0.1)', color: '#16a34a', padding: '4px 10px', borderRadius: '8px', fontWeight: '600' }}>🧵 +Tissu: {Number(m.prix_tissu).toLocaleString()} F</span>}
                                            {!Number(m.tissu_disponible) && <span style={{ background: 'rgba(245,158,11,0.1)', color: '#b45309', padding: '4px 10px', borderRadius: '8px', fontWeight: '600' }}>Sans tissu</span>}
                                            {m.delai_confection && <span style={{ background: 'rgba(139,94,60,0.08)', padding: '4px 10px', borderRadius: '8px', fontWeight: '600' }}>{m.delai_confection} jours</span>}
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button className="page-btn page-btn-secondary" onClick={() => { setEditingModel(m); setShowModelForm(true); }} style={{ flex: 1, fontSize: '12px', padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                                <FiEdit /> Modifier
                                            </button>
                                            <button className="page-btn page-btn-secondary" onClick={() => deleteModel(m.id)} style={{ flex: 0, fontSize: '14px', padding: '8px', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <FiTrash2 />
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
                    <PortfolioUpload tailleurId={tailleurId} onSuccess={loadData} />

                    {portfolio.length === 0 ? (
                        <div style={{ background: 'rgba(255,255,255,0.65)', backdropFilter: 'blur(20px)', border: '2px dashed rgba(139,94,60,0.15)', borderRadius: '24px', padding: '60px 20px', textAlign: 'center' }}>
                            <div style={{ fontSize: '48px', marginBottom: '16px', color: 'var(--color-accent-choco)' }}><FiCamera /></div>
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
                                        style={{ position: 'absolute', top: '8px', right: '8px', background: 'rgba(220,38,38,0.85)', color: '#fff', border: 'none', borderRadius: '50%', width: '30px', height: '30px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                    ><FiX /></button>
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
                <ModelForm 
                    model={editingModel} 
                    tailleurId={tailleurId}
                    onClose={() => { setShowModelForm(false); setEditingModel(null); }}
                    onSuccess={() => { setShowModelForm(false); setEditingModel(null); loadData(); }} 
                />
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
    const [latitude, setLatitude] = useState(tailleurData?.latitude || null);
    const [longitude, setLongitude] = useState(tailleurData?.longitude || null);
    const [modePaiement, setModePaiement] = useState(tailleurData?.mode_paiement || 'par_etape');
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    // Composant de centrage par défaut
    const defaultCenter = tailleurData?.ville === 'Bobo-Dioulasso' ? [11.1771, -4.2974] : [12.3685, -1.5273];
    const mapCenter = (latitude && longitude) ? [latitude, longitude] : defaultCenter;

    // Composant pour capter le clic libre sur la carte
    function LocationClickPicker() {
        useMapEvents({
            async click(e) {
                const lat = e.latlng.lat;
                const lng = e.latlng.lng;
                setLatitude(lat);
                setLongitude(lng);
                setStatus('📍 Position affinée manuellement !');
                
                try {
                    await api.put(`/tailleurs/${tailleurId}`, {
                        nom_atelier: nomAtelier, adresse, quartier, specialites,
                        tarif_min: tarifMin || 0, delai_moyen: delaiMoyen || 0, statut: 'actif',
                        latitude: lat, longitude: lng, mode_paiement: modePaiement,
                    });
                    onUpdate();
                } catch (err) {
                    console.error("Erreur sauvegarde clic:", err);
                }
            },
        });
        return null; // Le marqueur est déjà rendu par ailleurs.
    }

    const handleSearchLocation = async () => {
        if (!searchQuery) return;
        setStatus('🔍 Recherche de l\'adresse...');
        try {
            // Priority to Burkina Faso results
            const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery + ', Burkina Faso')}&limit=1`);
            const data = await res.json();
            
            if (data && data.length > 0) {
                const lat = parseFloat(data[0].lat);
                const lng = parseFloat(data[0].lon);
                setLatitude(lat);
                setLongitude(lng);
                
                await api.put(`/tailleurs/${tailleurId}`, {
                    nom_atelier: nomAtelier, adresse, quartier, specialites,
                    tarif_min: tarifMin || 0, delai_moyen: delaiMoyen || 0, statut: 'actif',
                    latitude: lat, longitude: lng, mode_paiement: modePaiement,
                });
                
                setStatus('✅ Ville/Quartier trouvé et sauvegardé !');
                onUpdate();
            } else {
                setStatus('❌ Adresse introuvable, essayez un nom plus général (ex: "Bobo-Dioulasso").');
            }
        } catch (err) {
            console.error(err);
            setStatus('❌ Erreur lors de la recherche.');
        }
    };

    const handleCaptureLocation = () => {
        if (!navigator.geolocation) {
            alert("La géolocalisation n'est pas supportée par votre navigateur.");
            return;
        }
        setStatus('📍 Recherche de votre position...');
        const onSuccess = async (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            setLatitude(lat);
            setLongitude(lng);
            
            // Auto-save the location immediately to prevent user confusion
            try {
                await api.put(`/tailleurs/${tailleurId}`, {
                    nom_atelier: nomAtelier, adresse, quartier, specialites,
                    tarif_min: tarifMin || 0, delai_moyen: delaiMoyen || 0, statut: 'actif',
                    latitude: lat, longitude: lng, mode_paiement: modePaiement,
                });
                setStatus('✅ Position automatiquement sauvegardée !');
                onUpdate();
            } catch (err) {
                console.error("Erreur sauvegarde auto GPS:", err);
                setStatus('⚠️ Capturé mais non sauvegardé. Utilisez le bouton Enregistrer.');
            }
        };
        // Essayer d'abord en haute précision (GPS), sinon fallback réseau
        navigator.geolocation.getCurrentPosition(
            onSuccess,
            () => {
                setStatus('📍 Localisation par réseau...');
                // Fallback: précision réduite (Wi-Fi / IP) — fonctionne sur PC
                navigator.geolocation.getCurrentPosition(
                    onSuccess,
                    (error) => {
                        console.error("Erreur localisation:", error);
                        alert("Impossible de récupérer la position. Vérifiez que la localisation est activée dans votre navigateur.");
                        setStatus('');
                    },
                    { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 }
                );
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await api.put(`/tailleurs/${tailleurId}`, {
                nom_atelier: nomAtelier, adresse, quartier, specialites,
                tarif_min: tarifMin || 0, delai_moyen: delaiMoyen || 0, statut: 'actif',
                latitude, longitude, mode_paiement: modePaiement,
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

                <div style={{ padding: '16px', background: 'rgba(139,94,60,0.05)', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <label style={labelStyle}>Géolocalisation de l'atelier</label>
                    
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button type="button" onClick={handleCaptureLocation} className="page-btn primary" style={{ flex: '1', padding: '12px', fontSize: '14px', fontWeight: 'bold', minWidth: '200px' }}>
                            📍 Utiliser mon GPS
                        </button>
                    </div>

                    <div style={{ textAlign: 'center', color: '#666', fontSize: '12px', margin: '4px 0' }}> OU RECHERCHER MANUELLEMENT </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                        <input 
                            type="text" 
                            className="input-field" 
                            placeholder="Ex: Bobo-Dioulasso, Secteur 22" 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{ flex: 1, padding: '10px' }}
                        />
                        <button type="button" onClick={handleSearchLocation} className="page-btn page-btn-secondary" style={{ padding: '10px 16px' }}>
                            🔍 Chercher
                        </button>
                    </div>
                    
                    <div style={{ display: 'flex', justifyContent: 'center', marginTop: '8px' }}>
                        {(latitude && longitude) ? (
                            <span style={{ fontSize: '14px', color: '#16a34a', fontWeight: '600' }}>✓ Coordonnées GPS bien enregistrées et visibles par les clients !</span>
                        ) : (
                            <span style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>Position non définie</span>
                        )}
                    </div>
                    {status && <div style={{ fontSize: '13px', color: status.includes('Erreur') ? '#ef4444' : '#16a34a', background: 'rgba(22, 163, 74, 0.1)', padding: '8px 12px', borderRadius: '8px', textAlign: 'center' }}>{status}</div>}

                    {(latitude && longitude) && (
                        <div style={{ marginTop: '8px', borderRadius: '12px', overflow: 'hidden', border: '2px solid rgba(139,94,60,0.2)' }}>
                            <div style={{ padding: '8px', background: '#fffbeb', color: '#b45309', fontSize: '12px', textAlign: 'center', fontWeight: 'bold' }}>
                                💡 Cliquez directement sur la carte pour corriger/préciser l'emplacement de votre atelier !
                            </div>
                            <MapContainer center={mapCenter} zoom={15} style={{ height: '220px', width: '100%', zIndex: 1, cursor: 'crosshair' }}>
                                <TileLayer
                                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                    attribution="&copy; OpenStreetMap contributors"
                                />
                                <LocationClickPicker />
                                <Marker position={mapCenter} icon={
                                        new L.divIcon({
                                            className: 'custom-halo-marker',
                                            html: `
                                                <div class="halo-marker-container">
                                                    <div class="halo-marker-glow"></div>
                                                    <div class="halo-marker-dot">🏬</div>
                                                </div>
                                            `,
                                            iconSize: [40, 40],
                                            iconAnchor: [20, 20],
                                            popupAnchor: [0, -20]
                                        })
                                }>
                                    <Popup className="custom-gps-popup">
                                            <div className="popup-tracking-id">
                                                <span>🏬</span> VOTRE ATELIER
                                            </div>
                                            <div className="popup-location-title">
                                                <span style={{ color: '#ef4444' }}>📍</span> Affiché aux clients FITMOD
                                            </div>
                                            <div className="popup-meta" style={{ marginTop: '8px', color: '#9ca3af', fontFamily: 'monospace', fontSize: '10px' }}>
                                                GPS: {Number(mapCenter[0]).toFixed(5)}, {Number(mapCenter[1]).toFixed(5)}
                                            </div>
                                    </Popup>
                                </Marker>
                            </MapContainer>
                        </div>
                    )}
                </div>

                <InputField label="Spécialités" value={specialites} onChange={setSpecialites} placeholder="Boubou, Robe, Costume" />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <InputField label="Tarif minimum (FCFA)" value={tarifMin} onChange={setTarifMin} type="number" placeholder="5000" />
                    <InputField label="Délai moyen" value={delaiMoyen} onChange={setDelaiMoyen} placeholder="3-5 jours" />
                </div>

                {/* ── Mode de paiement ── */}
                <div style={{ padding: 16, background: 'rgba(139,94,60,0.04)', borderRadius: 14, border: '1px solid rgba(139,94,60,0.1)' }}>
                    <label style={labelStyle}>💰 Mode de réception des paiements</label>
                    <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '0 0 12px' }}>
                        Commission FITMOD : 15% — vous recevez 85% du prix total.
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        {/* Option par étape */}
                        <div
                            onClick={() => setModePaiement('par_etape')}
                            style={{
                                padding: 14, borderRadius: 12, cursor: 'pointer',
                                border: modePaiement === 'par_etape' ? '2px solid var(--color-accent-choco)' : '1px solid rgba(139,94,60,0.15)',
                                background: modePaiement === 'par_etape' ? 'rgba(139,94,60,0.08)' : 'rgba(255,255,255,0.8)',
                                transition: 'all 0.25s',
                            }}
                        >
                            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>📊 Par étape</div>
                            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
                                Recevez à chaque avancement :
                                <br />🧵 Couture : <strong>45%</strong>
                                <br />✂️ Finitions : <strong>25%</strong>
                                <br />📦 Prêt : <strong>15%</strong>
                                <br />🎉 Livré : <strong>15%</strong>
                            </div>
                        </div>
                        {/* Option après livraison */}
                        <div
                            onClick={() => setModePaiement('apres_livraison')}
                            style={{
                                padding: 14, borderRadius: 12, cursor: 'pointer',
                                border: modePaiement === 'apres_livraison' ? '2px solid var(--color-accent-choco)' : '1px solid rgba(139,94,60,0.15)',
                                background: modePaiement === 'apres_livraison' ? 'rgba(139,94,60,0.08)' : 'rgba(255,255,255,0.8)',
                                transition: 'all 0.25s',
                            }}
                        >
                            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>💰 Après livraison</div>
                            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
                                Recevez la totalité (<strong>100%</strong> de votre part) une fois la commande livrée au client.
                            </div>
                        </div>
                    </div>
                </div>

                {status && <div style={{ padding: '10px', borderRadius: '12px', background: status.startsWith('✅') || status.startsWith('📍') ? 'rgba(22,163,74,0.1)' : 'rgba(220,38,38,0.1)', fontSize: '14px', fontWeight: '600', textAlign: 'center' }}>{status}</div>}
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

// ============ EXTRACTED COMPONENTS ============

const ModelForm = ({ model = null, tailleurId, onClose, onSuccess }) => {
    const [titre, setTitre] = useState(model?.titre || '');
    const [description, setDescription] = useState(model?.description || '');
    const [typeTenue, setTypeTenue] = useState(model?.type_tenue || 'boubou');
    const [prixBase, setPrixBase] = useState(model?.prix_base || '');
    const [tissuDispo, setTissuDispo] = useState(Number(model?.tissu_disponible) === 1);
    const [prixTissu, setPrixTissu] = useState(model?.prix_tissu || '');
    const [delai, setDelai] = useState(model?.delai_confection || '');
    const initialCouleurs = Array.isArray(model?.couleurs_disponibles) ? model.couleurs_disponibles.join(', ') : (model?.couleurs_disponibles || '');
    const [couleurs, setCouleurs] = useState(initialCouleurs);
    const [photo, setPhoto] = useState(null);
    const [preview, setPreview] = useState(model?.photo_url ? api.getUploadUrl(model.photo_url) : null);
    const [submitting, setSubmitting] = useState(false);
    const [formStatus, setFormStatus] = useState('');
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
        formData.append('tissu_disponible', tissuDispo ? '1' : '0');
        if (tissuDispo && prixTissu) formData.append('prix_tissu', prixTissu);
        formData.append('delai_confection', delai ? parseInt(delai) : '');
        
        const couleursArray = couleurs ? couleurs.split(',').map(c => c.trim()).filter(Boolean) : [];
        formData.append('couleurs_disponibles', JSON.stringify(couleursArray));
        
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
            setTimeout(() => { onSuccess(); }, 1000);
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
                            <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '600', color: 'var(--color-text-main)' }}>Type de tenue</label>
                            <select value={typeTenue} onChange={e => setTypeTenue(e.target.value)} style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', border: '1px solid rgba(139,94,60,0.15)', background: 'rgba(255,255,255,0.8)', fontSize: '14px', outline: 'none' }}>
                                <option value="boubou">Boubou</option>
                                <option value="robe">Robe</option>
                                <option value="costume">Costume</option>
                                <option value="ensemble">Ensemble</option>
                                <option value="chemise">Chemise</option>
                                <option value="pantalon">Pantalon</option>
                                <option value="autre">Autre</option>
                            </select>
                        </div>
                        <InputField label="Prix confection (FCFA)" value={prixBase} onChange={setPrixBase} type="number" placeholder="15000" />
                    </div>

                    {/* ── Tissu ── */}
                    <div style={{ padding: '16px', background: 'rgba(139,94,60,0.04)', borderRadius: '14px', border: '1px solid rgba(139,94,60,0.1)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: tissuDispo ? '12px' : 0 }}>
                            <div
                                onClick={() => setTissuDispo(!tissuDispo)}
                                style={{
                                    width: '46px', height: '26px', borderRadius: '13px', cursor: 'pointer',
                                    background: tissuDispo ? 'linear-gradient(135deg, var(--color-accent-choco), var(--color-accent-caramel))' : 'rgba(139,94,60,0.15)',
                                    position: 'relative', transition: 'background 0.3s', flexShrink: 0,
                                }}
                            >
                                <div style={{
                                    width: '22px', height: '22px', borderRadius: '50%', background: '#fff',
                                    position: 'absolute', top: '2px', left: tissuDispo ? '22px' : '2px',
                                    transition: 'left 0.3s', boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
                                }} />
                            </div>
                            <div>
                                <div style={{ fontWeight: '700', fontSize: '14px' }}>🧵 Je fournis le tissu</div>
                                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                                    {tissuDispo ? 'Le client pourra choisir votre tissu' : 'Le client devra apporter son propre tissu'}
                                </div>
                            </div>
                        </div>
                        {tissuDispo && (
                            <InputField label="Prix du tissu (FCFA)" value={prixTissu} onChange={setPrixTissu} type="number" placeholder="Ex: 10000" />
                        )}
                        {tissuDispo && prixBase && prixTissu && (
                            <div style={{ marginTop: '8px', padding: '10px 14px', background: 'rgba(22,163,74,0.08)', borderRadius: '10px', fontSize: '13px', color: '#16a34a', fontWeight: '600' }}>
                                Prix total avec tissu : {(Number(prixBase) + Number(prixTissu)).toLocaleString()} FCFA
                            </div>
                        )}
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

const PortfolioUpload = ({ tailleurId, onSuccess }) => {
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
            onSuccess();
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
                style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', border: '1px solid rgba(139,94,60,0.15)', background: 'rgba(255,255,255,0.8)', fontSize: '14px', outline: 'none', flex: '1 1 200px' }}
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
