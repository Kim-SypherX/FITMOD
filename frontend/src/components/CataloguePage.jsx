/**
 * FITMOD — CataloguePage (Real API)
 */
import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import '../styles/Pages.css';

// Constantes pour les filtres
const VILLES = ['Ouagadougou', 'Bobo-Dioulasso', 'Koudougou', 'Banfora', 'Ouahigouya', 'Kaya'];
const SPECS = ['boubou', 'robe', 'costume', 'pagne', 'caftan', 'djellaba', 'chemise', 'pantalon', 'tenue de fête'];

export default function CataloguePage({ onNavigate }) {
    const [tailleurs, setTailleurs] = useState([]);
    const [allModeles, setAllModeles] = useState([]);

    const [search, setSearch] = useState('');
    const [filterVille, setFilterVille] = useState('');
    const [filterSpec, setFilterSpec] = useState('');
    const [filterBudget, setFilterBudget] = useState('');

    const [selectedTailleur, setSelectedTailleur] = useState(null);
    const [selectedModele, setSelectedModele] = useState(null);
    const [loading, setLoading] = useState(true);

    // Charger les tailleurs et tous les modèles
    useEffect(() => {
        loadData();
    }, [search, filterVille, filterSpec, filterBudget]);

    const loadData = async () => {
        setLoading(true);
        try {
            let tQuery = `?ville=${filterVille}&specialite=${filterSpec}&search=${search}`;
            let mQuery = `?prix_max=${filterBudget}&search=${search}`;

            const [tData, mData] = await Promise.all([
                api.get(`/tailleurs${tQuery}`),
                api.get(`/tailleurs/modeles/all${mQuery}`)
            ]);
            setTailleurs(tData);
            setAllModeles(mData);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const loadTailleurDetails = async (tailleur) => {
        setLoading(true);
        try {
            const data = await api.get(`/tailleurs/${tailleur.id}`);
            setSelectedTailleur(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    // Modèle en détail
    if (selectedModele) {
        return (
            <div className="page-container">
                <button className="page-back-btn" onClick={() => setSelectedModele(null)}>Retour</button>
                <div className="modele-detail" style={{ background: 'var(--color-bg-card)', border: '3px solid var(--color-border)', borderRadius: '20px', padding: '32px', boxShadow: '6px 6px 0px var(--color-border)' }}>
                    <div className="modele-detail-photo" style={{ height: '300px', width: '100%', marginBottom: '20px', border: '3px solid var(--color-border)', borderRadius: '12px', background: 'var(--color-bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {selectedModele.photo_url ? (
                            <img src={api.getUploadUrl(selectedModele.photo_url)} alt="Modèle" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                            <div style={{ color: 'var(--color-text-muted)', fontSize: '18px', fontWeight: 'bold' }}>Aucune photo</div>
                        )}
                    </div>
                    <h2 style={{ fontSize: '36px', fontFamily: 'var(--font-heading)', color: 'var(--color-text-main)', margin: '0 0 8px' }}>{selectedModele.titre}</h2>
                    <p className="modele-detail-desc" style={{ fontSize: '16px', color: 'var(--color-text-muted)', marginBottom: '20px' }}>{selectedModele.description}</p>
                    <div className="modele-detail-info" style={{ marginBottom: '24px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        <div className="modele-info-item" style={{ background: 'var(--color-bg-base)', border: '3px solid var(--color-border)', padding: '14px 24px', borderRadius: '20px', fontWeight: 'bold' }}>
                            <span className="info-label" style={{ color: 'var(--color-text-muted)' }}>Prix</span>
                            <span className="info-value price" style={{ display: 'block', fontSize: '24px', color: 'var(--color-accent-rust)' }}>{Number(selectedModele.prix_base).toLocaleString()} F</span>
                        </div>
                        <div className="modele-info-item" style={{ background: 'var(--color-bg-base)', border: '3px solid var(--color-border)', padding: '14px 24px', borderRadius: '20px', fontWeight: 'bold' }}>
                            <span className="info-label" style={{ color: 'var(--color-text-muted)' }}>Délai</span>
                            <span className="info-value" style={{ display: 'block', fontSize: '24px', color: 'var(--color-text-main)' }}>{selectedModele.delai_confection} jrs</span>
                        </div>
                    </div>

                    <div className="modele-detail-actions" style={{ display: 'flex', gap: '12px' }}>
                        <button className="page-btn page-btn-primary" onClick={() => onNavigate?.('commandes', {
                            modele: selectedModele,
                            tailleur: { id: selectedModele.tailleur_id, nom_atelier: selectedModele.nom_atelier }
                        })}>
                            Commander
                        </button>
                        <button className="page-btn page-btn-secondary" onClick={() => onNavigate?.('cabine')} style={{ background: 'var(--color-bg-card)', color: 'var(--color-text-main)', border: '3px solid var(--color-border)', borderRadius: '30px', fontWeight: 'bold', cursor: 'pointer', padding: '12px 24px', boxShadow: '4px 4px 0px var(--color-border)' }}>
                            Essayer en Cabine
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Profil Tailleur et catalogue tailleur
    if (selectedTailleur) {
        const t = selectedTailleur;
        return (
            <div className="page-container">
                <button className="page-back-btn" onClick={() => setSelectedTailleur(null)}>Retour au catalogue</button>

                <div className="tailleur-profil" style={{ background: 'var(--color-bg-card)', border: '3px solid var(--color-border)', borderRadius: '20px', padding: '32px', boxShadow: '6px 6px 0px var(--color-border)', marginBottom: '32px' }}>
                    <div className="tailleur-profil-header" style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '20px' }}>
                        <div className="tailleur-avatar-lg" style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'var(--color-accent-mustard)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '36px', fontWeight: 'bold', border: '3px solid var(--color-border)' }}>
                            {t.nom_atelier.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <h2 style={{ fontSize: '36px', fontFamily: 'var(--font-heading)', color: 'var(--color-text-main)', margin: '0' }}>{t.nom_atelier}</h2>
                            <p className="tailleur-name" style={{ fontSize: '16px', color: 'var(--color-text-muted)', margin: '4px 0 8px' }}>{t.nom} {t.prenom}</p>
                            <div className="tailleur-meta" style={{ display: 'flex', gap: '12px', fontSize: '14px', fontWeight: 'bold' }}>
                                <span>Note: {t.note_moyenne} / 5</span>
                                <span>{t.telephone}</span>
                            </div>
                        </div>
                    </div>
                    <div className="tailleur-tags" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {t.specialites.split(',').map((s, i) => (
                            <span key={i} className="spec-tag" style={{ background: 'var(--color-accent-rust)', color: '#fff', padding: '6px 16px', borderRadius: '20px', fontWeight: 'bold', fontSize: '12px', border: '2px solid var(--color-border)' }}>{s.trim()}</span>
                        ))}
                    </div>
                </div>

                {/* Modèles du tailleur */}
                <h3 className="section-title">Catalogue ({t.modeles.length || 0})</h3>
                <div className="modeles-grid">
                    {t.modeles.map(m => (
                        <div key={m.id} className="modele-card" onClick={() => { m.nom_atelier = t.nom_atelier; setSelectedModele(m); }}>
                            <div className="modele-card-photo" style={{ background: 'var(--color-bg-base)', borderBottom: '3px solid var(--color-border)', height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {m.photo_url ? <img src={api.getUploadUrl(m.photo_url)} alt="Modèle" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ fontWeight: 'bold', color: 'var(--color-text-muted)' }}>Sans image</div>}
                            </div>
                            <div className="modele-card-info" style={{ padding: '16px' }}>
                                <h4 style={{ fontSize: '18px', fontFamily: 'var(--font-heading)', margin: '0 0 8px' }}>{m.titre}</h4>
                                <div className="modele-card-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 'bold' }}>
                                    <span className="modele-price" style={{ color: 'var(--color-accent-rust)' }}>{Number(m.prix_base).toLocaleString()} F</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // Vue Principale : Filtres + Tailleurs + Modèles
    return (
        <div className="page-container">
            <div className="page-header">
                <h1>Catalogue</h1>
                <p>Trouvez votre tailleur et choisissez votre modèle.</p>
            </div>

            <div className="filters-bar" style={{ display: 'flex', gap: '12px', marginBottom: '32px', flexWrap: 'wrap' }}>
                <input className="filter-search" placeholder="Rechercher"
                    value={search} onChange={e => setSearch(e.target.value)} />
                <select className="filter-select" value={filterVille} onChange={e => setFilterVille(e.target.value)}>
                    <option value="">Toutes les villes</option>
                    {VILLES.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
                <select className="filter-select" value={filterSpec} onChange={e => setFilterSpec(e.target.value)}>
                    <option value="">Spécialités</option>
                    {SPECS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <select className="filter-select" value={filterBudget} onChange={e => setFilterBudget(e.target.value)}>
                    <option value="">Budget max</option>
                    <option value="15000">≤ 15.000</option>
                    <option value="30000">≤ 30.000</option>
                    <option value="50000">≤ 50.000</option>
                    <option value="100000">≤ 100.000</option>
                </select>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-muted)', fontWeight: 'bold' }}>Chargement...</div>
            ) : (
                <>
                    <h3 className="section-title">Les Tailleurs ({tailleurs.length})</h3>
                    <div className="tailleurs-grid">
                        {tailleurs.map(t => (
                            <div key={t.id} className="tailleur-card" onClick={() => loadTailleurDetails(t)}>
                                <div className="tailleur-card-header" style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
                                    <div className="tailleur-avatar" style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--color-accent-mustard)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '20px', fontWeight: 'bold', border: '2px solid var(--color-border)' }}>
                                        {t.nom_atelier.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <h4 style={{ fontFamily: 'var(--font-heading)', fontSize: '20px', margin: '0' }}>{t.nom_atelier}</h4>
                                        <span className="tailleur-location" style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{t.ville}</span>
                                    </div>
                                </div>
                                <div className="tailleur-card-tags" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
                                    {t.specialites.split(',').slice(0, 3).map((s, i) => (
                                        <span key={i} className="spec-tag-sm" style={{ background: 'var(--color-bg-base)', border: '2px solid var(--color-border)', borderRadius: '10px', fontSize: '10px', padding: '4px 8px', fontWeight: 'bold' }}>{s.trim()}</span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    <h3 className="section-title">Les Modèles ({allModeles.length})</h3>
                    <div className="modeles-grid">
                        {allModeles.map(m => (
                            <div key={m.id} className="modele-card" onClick={() => setSelectedModele(m)}>
                                <div className="modele-card-photo" style={{ background: 'var(--color-bg-base)', borderBottom: '3px solid var(--color-border)', height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    {m.photo_url ? <img src={api.getUploadUrl(m.photo_url)} alt={m.titre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ fontWeight: 'bold', color: 'var(--color-text-muted)' }}>Sans image</div>}
                                </div>
                                <div className="modele-card-info" style={{ padding: '16px' }}>
                                    <h4 style={{ fontSize: '18px', fontFamily: 'var(--font-heading)', margin: '0 0 4px' }}>{m.titre}</h4>
                                    <span className="modele-tailleur" style={{ fontSize: '12px', color: 'var(--color-text-muted)', display: 'block', marginBottom: '8px' }}>{m.nom_atelier}</span>
                                    <div className="modele-card-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 'bold' }}>
                                        <span className="modele-price" style={{ color: 'var(--color-accent-rust)' }}>{Number(m.prix_base).toLocaleString()} F</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
