/**
 * FITMOD — CataloguePage (Redesign E-commerce Premium)
 * Style inspiré Dakingo/Mokr — Palette Chocolat/Crème
 */
import React, { useState, useEffect } from 'react';
import { FiMessageSquare, FiSearch, FiMapPin, FiStar, FiArrowRight, FiHeart, FiX, FiCamera, FiMessageCircle, FiTruck, FiCpu } from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';
import api from '../utils/api';
import '../styles/CataloguePage.css';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const VILLES = ['Ouagadougou', 'Bobo-Dioulasso', 'Koudougou', 'Banfora', 'Ouahigouya', 'Kaya'];
const SPECS = ['boubou', 'robe', 'costume', 'pagne', 'caftan', 'djellaba', 'chemise', 'pantalon', 'tenue de fête'];

const CATEGORIES = [
    { label: 'Boubou',       img: '/images/categories/boubou.png',     spec: 'boubou' },
    { label: 'Robe',         img: '/images/categories/robe.png',       spec: 'robe' },
    { label: 'Costume',      img: '/images/categories/costume.png',    spec: 'costume' },
    { label: 'Pagne',        img: '/images/categories/pagne.png',      spec: 'pagne' },
    { label: 'Caftan',       img: '/images/categories/caftan.png',     spec: 'caftan' },
    { label: 'Chemise',      img: '/images/categories/chemise.png',    spec: 'chemise' },
    { label: 'Tenue de fête', img: '/images/categories/tenue-fete.png', spec: 'tenue de fête' },
    { label: 'Tous',         img: '/images/categories/tous.png',       spec: '' },
];

export default function CataloguePage({ onNavigate, initialContext, onRequireAuth }) {
    const { user } = useAuth();
    const [tailleurs, setTailleurs] = useState([]);
    const [allModeles, setAllModeles] = useState([]);
    const [search, setSearch] = useState('');
    const [filterVille, setFilterVille] = useState('');
    const [filterSpec, setFilterSpec] = useState('');
    const [filterBudget, setFilterBudget] = useState('');
    const [userLat, setUserLat] = useState(null);
    const [userLng, setUserLng] = useState(null);
    const [isLocating, setIsLocating] = useState(false);
    const [selectedTailleur, setSelectedTailleur] = useState(null);
    const [selectedModele, setSelectedModele] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeCategory, setActiveCategory] = useState('');
    const [userFavoris, setUserFavoris] = useState({});

    useEffect(() => {
        loadData();
        const interval = setInterval(() => {
            loadData(true);
        }, 15000);
        return () => clearInterval(interval);
    }, [search, filterVille, filterSpec, filterBudget, userLat, userLng]);

    useEffect(() => {
        if (user) {
            const clientId = user.client?.id || user.id;
            api.get(`/client-profil/${clientId}/favoris`).then(data => {
                const favMap = {};
                data.forEach(f => favMap[f.modele_id] = true);
                setUserFavoris(favMap);
            }).catch(console.error);
        } else {
            setUserFavoris({});
        }
    }, [user]);

    useEffect(() => {
        if (initialContext) {
            if (initialContext.tailleur) {
                // Fetch full details instead of using shallow object
                setLoading(true);
                api.get(`/tailleurs/${initialContext.tailleur.id}`)
                    .then(data => setSelectedTailleur(data))
                    .catch(console.error)
                    .finally(() => setLoading(false));
            }
            if (initialContext.modele) setSelectedModele(initialContext.modele);
            if (initialContext.category) {
                setFilterSpec(initialContext.category);
                setActiveCategory(initialContext.category);
            }
        }
    }, [initialContext]);

    const handleGetLocation = () => {
        if (!navigator.geolocation) { alert("Géolocalisation non supportée."); return; }
        setIsLocating(true);
        const onSuccess = (pos) => { setUserLat(pos.coords.latitude); setUserLng(pos.coords.longitude); setIsLocating(false); };
        // Essayer d'abord en haute précision (GPS), sinon fallback réseau
        navigator.geolocation.getCurrentPosition(
            onSuccess,
            () => {
                // Fallback: précision réduite (Wi-Fi / IP) — fonctionne sur PC
                navigator.geolocation.getCurrentPosition(
                    onSuccess,
                    () => { alert("Impossible d'obtenir votre position. Vérifiez que la localisation est activée."); setIsLocating(false); },
                    { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 }
                );
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    };

    const loadData = async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            let tQuery = `?ville=${filterVille}&specialite=${filterSpec}&search=${search}`;
            if (userLat && userLng) tQuery += `&latitude=${userLat}&longitude=${userLng}`;
            let mQuery = `?prix_max=${filterBudget}&search=${search}`;
            if (filterSpec) mQuery += `&type_tenue=${filterSpec}`;
            const [tData, mData] = await Promise.all([
                api.get(`/tailleurs${tQuery}`),
                api.get(`/tailleurs/modeles/all${mQuery}`)
            ]);
            setTailleurs(tData);
            setAllModeles(mData);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    const loadTailleurDetails = async (tailleur) => {
        setLoading(true);
        try {
            const data = await api.get(`/tailleurs/${tailleur.id}`);
            setSelectedTailleur(data);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    const handleCategoryClick = (spec) => {
        setActiveCategory(spec);
        setFilterSpec(spec);
    };

    const toggleFavoris = async (modeleId) => {
        if (!user) {
            if (onRequireAuth) onRequireAuth();
            else alert('Veuillez vous connecter pour ajouter aux favoris.');
            return;
        }
        const clientId = user.client?.id || user.id;
        try {
            if (userFavoris[modeleId]) {
                // Delete
                setUserFavoris(prev => { const n = { ...prev }; delete n[modeleId]; return n; });
                setAllModeles(prev => prev.map(m => m.id === modeleId ? { ...m, favoris_count: Math.max(0, (Number(m.favoris_count) || 0) - 1) } : m));
                await api.delete(`/client-profil/${clientId}/favoris/${modeleId}`);
            } else {
                // Add
                setUserFavoris(prev => ({ ...prev, [modeleId]: true }));
                setAllModeles(prev => prev.map(m => m.id === modeleId ? { ...m, favoris_count: (Number(m.favoris_count) || 0) + 1 } : m));
                await api.post(`/client-profil/${clientId}/favoris`, { modele_id: modeleId });
            }
        } catch (err) {
            console.error(err);
        }
    };

    const renderStars = (note) => {
        const n = Number(note) || 0;
        return Array.from({ length: 5 }, (_, i) => (
            <FiStar key={i} className={`star-icon ${i < Math.round(n) ? 'filled' : ''}`} />
        ));
    };

    // ═══ VUE DÉTAIL MODÈLE ═══
    if (selectedModele) {
        return (
            <div className="cat-page">
                <div className="detail-container">
                    <button className="back-btn" onClick={() => {
                        if (initialContext?.from === 'landing' && !selectedTailleur) {
                            onNavigate('landing');
                        } else {
                            setSelectedModele(null);
                        }
                    }}>
                        <FiArrowRight style={{ transform: 'rotate(180deg)' }} /> Retour
                    </button>
                    <div className="detail-card">
                        <div className="detail-photo">
                            {selectedModele.photo_url ? (
                                <img src={api.getUploadUrl(selectedModele.photo_url)} alt="Modèle" />
                            ) : (
                                <div className="no-photo">Aucune photo disponible</div>
                            )}
                        </div>
                        <div className="detail-body">
                            <h2 className="detail-title">{selectedModele.titre}</h2>
                            <p className="detail-atelier">Par {selectedModele.nom_atelier}</p>
                            <p className="detail-desc">{selectedModele.description || 'Aucune description fournie.'}</p>
                            <div className="detail-meta">
                                <div className="meta-chip price-chip">
                                    <span className="meta-label">Prix</span>
                                    <span className="meta-value">{Number(selectedModele.prix_base).toLocaleString()} FCFA</span>
                                </div>
                                <div className="meta-chip">
                                    <span className="meta-label">Délai</span>
                                    <span className="meta-value">{selectedModele.delai_confection || '—'} jours</span>
                                </div>
                                {selectedModele.type_tenue && (
                                    <div className="meta-chip">
                                        <span className="meta-label">Type</span>
                                        <span className="meta-value">{selectedModele.type_tenue}</span>
                                    </div>
                                )}
                            </div>
                            <div className="detail-actions">
                                <button className="action-btn primary" onClick={() => onNavigate?.('commandes', {
                                    modele: selectedModele,
                                    tailleur: { id: selectedModele.tailleur_id, nom_atelier: selectedModele.nom_atelier }
                                })}>
                                    Commander maintenant
                                </button>
                                <button className="action-btn secondary" onClick={() => onNavigate?.('messagerie', {
                                    partnerId: selectedModele.tailleur_utilisateur_id || selectedTailleur?.utilisateur_id,
                                    partnerName: selectedModele.nom_atelier || selectedTailleur?.nom_atelier
                                })}>
                                    <FiMessageSquare /> Contacter
                                </button>
                                <button className="action-btn ghost" onClick={() => onNavigate?.('cabine')}>
                                    <FiCamera /> Essayer en Cabine
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // ═══ VUE PROFIL TAILLEUR ═══
    if (selectedTailleur) {
        const t = selectedTailleur;
        return (
            <div className="cat-page">
                <div className="detail-container">
                    <button className="back-btn" onClick={() => {
                        if (initialContext?.from === 'landing') {
                            onNavigate('landing');
                        } else {
                            setSelectedTailleur(null);
                        }
                    }}>
                        <FiArrowRight style={{ transform: 'rotate(180deg)' }} /> Retour au catalogue
                    </button>
                    <div className="tailleur-profile-card">
                        <div className="profile-header">
                            <div className="profile-avatar">{t.nom_atelier.charAt(0).toUpperCase()}</div>
                            <div className="profile-info">
                                <h2>{t.nom_atelier}</h2>
                                <p className="profile-name">{t.nom} {t.prenom}</p>
                                <div className="profile-stars">{renderStars(t.note_moyenne)} <span>{t.note_moyenne}/5</span></div>
                                <div className="profile-tags">
                                    {t.specialites?.split(',').map((s, i) => (
                                        <span key={i} className="profile-tag">{s.trim()}</span>
                                    ))}
                                </div>
                            </div>
                        </div>
                            <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                                <button className="action-btn primary" onClick={() => onNavigate?.('messagerie', {
                                    partnerId: t.utilisateur_id, partnerName: t.nom_atelier
                                })}>
                                    <FiMessageSquare /> Contacter le tailleur
                                </button>
                                {(t.latitude && t.longitude) && (
                                    <button className="action-btn ghost" onClick={() => window.open(`https://www.google.com/maps?q=${t.latitude},${t.longitude}`, '_blank')}>
                                        🗺️ Ouvrir dans Google Maps
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Map Preview Section */}
                        {(t.latitude && t.longitude) && (
                            <div style={{ marginTop: '24px', borderRadius: '16px', overflow: 'hidden', border: '3px solid var(--color-border)', boxShadow: '4px 4px 0px rgba(139,94,60,0.1)' }}>
                                <MapContainer center={[t.latitude, t.longitude]} zoom={15} style={{ height: '250px', width: '100%', zIndex: 1 }}>
                                    <TileLayer
                                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                        attribution="&copy; OpenStreetMap contributors"
                                    />
                                    <Marker position={[t.latitude, t.longitude]}>
                                        <Popup>Atelier de {t.nom_atelier}</Popup>
                                    </Marker>
                                </MapContainer>
                            </div>
                        )}

                    <h3 className="section-heading">Catalogue de {t.nom_atelier} <span className="count">({t.modeles?.length || 0})</span></h3>
                    <div className="modeles-grid">
                        {t.modeles?.map(m => (
                            <div key={m.id} className="modele-card" onClick={() => { m.nom_atelier = t.nom_atelier; setSelectedModele(m); }}>
                                <div className="card-img">
                                    {m.photo_url ? <img src={api.getUploadUrl(m.photo_url)} alt={m.titre} /> : <div className="no-img">Sans image</div>}
                                </div>
                                <div className="card-body">
                                    <h4>{m.titre}</h4>
                                    <span className="card-price">{Number(m.prix_base).toLocaleString()} FCFA</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    // ═══ VUE PRINCIPALE — CATALOGUE ═══
    return (
        <div className="cat-page">

            {/* ══ HERO BANNER ══ */}
            <section className="hero-section">
                <div className="hero-content">
                    <span className="hero-badge">✨ Plateforme N°1 au Burkina Faso</span>
                    <h1 className="hero-title">Trouvez le Tailleur<br />Parfait pour <span className="highlight">Votre Style</span></h1>
                    <p className="hero-subtitle">Couture sur mesure, essayage virtuel par IA et commande en ligne. Connectez-vous aux meilleurs artisans.</p>
                    <div className="hero-search-bar">
                        <FiSearch className="hero-search-icon" />
                        <input
                            type="text"
                            placeholder="Rechercher un tailleur, un modèle..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="hero-search-input"
                        />
                        <button className="hero-search-btn">Rechercher</button>
                    </div>
                    <div className="hero-stats">
                        <div className="stat"><strong>{tailleurs.length}+</strong><span>Tailleurs</span></div>
                        <div className="stat-divider"></div>
                        <div className="stat"><strong>{allModeles.length}+</strong><span>Modèles</span></div>
                        <div className="stat-divider"></div>
                        <div className="stat"><strong>IA</strong><span>Mesures Auto</span></div>
                    </div>
                </div>
                <div className="hero-visual">
                    <div className="hero-circle c1"></div>
                    <div className="hero-circle c2"></div>
                    <div className="hero-float-card fc1">
                        <FiStar className="fc-icon" /> Note moyenne : 4.8/5
                    </div>
                    <div className="hero-float-card fc2">
                        <FiMapPin className="fc-icon" /> Livraison partout au BF
                    </div>
                </div>
            </section>

            {/* ══ CATEGORIES ══ */}
            <section className="categories-section">
                <h2 className="section-heading">Nos Spécialités <span className="heading-line"></span></h2>
                <div className="categories-row">
                    {CATEGORIES.map(cat => (
                        <div
                            key={cat.spec}
                            className={`category-item ${activeCategory === cat.spec ? 'active' : ''}`}
                            onClick={() => handleCategoryClick(cat.spec)}
                        >
                            <div className="category-circle">
                                <img src={cat.img} alt={cat.label} loading="lazy" />
                            </div>
                            <span>{cat.label}</span>
                        </div>
                    ))}
                </div>
            </section>

            {/* ══ FILTRES AVANCÉS ══ */}
            <section className="filters-section">
                <div className="filters-row">
                    <select className="filter-select" value={filterVille} onChange={e => setFilterVille(e.target.value)}>
                    <option value="">Toutes les villes</option>
                        {VILLES.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                    <select className="filter-select" value={filterBudget} onChange={e => setFilterBudget(e.target.value)}>
                    <option value="">Budget max</option>
                        <option value="15000">≤ 15.000 FCFA</option>
                        <option value="30000">≤ 30.000 FCFA</option>
                        <option value="50000">≤ 50.000 FCFA</option>
                        <option value="100000">≤ 100.000 FCFA</option>
                    </select>
                    <button
                        className={`geo-btn ${(userLat && userLng) ? 'active' : ''}`}
                        onClick={handleGetLocation}
                        disabled={isLocating}
                    >
                        <FiMapPin /> {isLocating ? 'Recherche...' : 'Autour de moi'}
                    </button>
                    {(userLat && userLng) && (
                        <button className="geo-clear" onClick={() => { setUserLat(null); setUserLng(null); }}>
                            <FiX /> GPS
                        </button>
                    )}
                </div>
            </section>

            {loading ? (
                <div className="loading-container">
                    <div className="loading-spinner"></div>
                    <p>Chargement du catalogue...</p>
                </div>
            ) : (
                <>
                    {/* ══ TAILLEURS POPULAIRES ══ */}
                    <section className="section">
                        <div className="section-header">
                            <h2 className="section-heading">Tailleurs Populaires <span className="count">({tailleurs.length})</span></h2>
                        </div>
                        <div className="tailleurs-grid">
                            {tailleurs.map(t => (
                                <div key={t.id} className="tailleur-card" onClick={() => loadTailleurDetails(t)}>
                                    <div className="tc-avatar">{t.nom_atelier.charAt(0).toUpperCase()}</div>
                                    <div className="tc-info">
                                        <h4 className="tc-name">{t.nom_atelier}</h4>
                                        <div className="tc-location">
                                            <FiMapPin className="tc-loc-icon" /> {t.ville}
                                            {t.distance != null && (
                                                <span className="tc-distance">{Number(t.distance).toFixed(1)} km</span>
                                            )}
                                        </div>
                                        <div className="tc-stars">{renderStars(t.note_moyenne)}</div>
                                        <div className="tc-tags">
                                            {t.specialites?.split(',').slice(0, 3).map((s, i) => (
                                                <span key={i} className="tc-tag">{s.trim()}</span>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="tc-arrow"><FiArrowRight /></div>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* ══ MODÈLES TENDANCES ══ */}
                    <section className="section">
                        <div className="section-header">
                            <h2 className="section-heading">Modèles Tendances <span className="count">({allModeles.length})</span></h2>
                        </div>
                        <div className="modeles-grid">
                            {allModeles.map(m => (
                                <div key={m.id} className="modele-card" onClick={() => setSelectedModele(m)}>
                                    <div className="card-img">
                                        {m.photo_url ? (
                                            <img src={api.getUploadUrl(m.photo_url)} alt={m.titre} />
                                        ) : (
                                            <div className="no-img">
                                                <FiCamera />
                                                Sans image
                                            </div>
                                        )}
                                        <button className={`card-fav ${userFavoris[m.id] ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); toggleFavoris(m.id); }}>
                                            <FiHeart />
                                            {Number(m.favoris_count) > 0 && <span className="fav-count">{Number(m.favoris_count)}</span>}
                                        </button>
                                    </div>
                                    <div className="card-body">
                                        <h4>{m.titre}</h4>
                                        <span className="card-atelier">{m.nom_atelier}</span>
                                        <div className="card-footer">
                                            <span className="card-price">{Number(m.prix_base).toLocaleString()} FCFA</span>
                                            <button 
                                                className="card-order-btn" 
                                                onClick={(e) => { 
                                                    e.stopPropagation(); 
                                                    onNavigate?.('commandes', {
                                                        modele: m,
                                                        tailleur: { id: m.tailleur_id, nom_atelier: m.nom_atelier }
                                                    });
                                                }}
                                            >
                                                Commander
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* ══ PROMESSES ══ */}
                    <section className="promise-section">
                        <div className="promise-item">
                            <div className="promise-icon"><FiCpu /></div>
                            <strong>Mesures par IA</strong>
                            <span>Webcam + MediaPipe</span>
                        </div>
                        <div className="promise-item">
                            <div className="promise-icon"><FiCamera /></div>
                            <strong>Essayage Virtuel</strong>
                            <span>Cabine 3D en temps réel</span>
                        </div>
                        <div className="promise-item">
                            <div className="promise-icon"><FiMessageCircle /></div>
                            <strong>Chat en Direct</strong>
                            <span>Texte & Audio instantané</span>
                        </div>
                        <div className="promise-item">
                            <div className="promise-icon"><FiTruck /></div>
                            <strong>Livraison Rapide</strong>
                            <span>Partout au Burkina</span>
                        </div>
                    </section>
                </>
            )}
        </div>
    );
}
