/**
 * FITMOD — Favoris & Avis (Real API)
 */
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../utils/api';
import '../styles/Pages.css';

export default function FavorisPage({ onNavigate }) {
    const { user } = useAuth();
    const [favoris, setFavoris] = useState([]);
    const [loadingFav, setLoadingFav] = useState(true);

    // Avis à laisser
    const [commandesTerminees, setCommandesTerminees] = useState([]);
    const [avisForm, setAvisForm] = useState({ commande_id: null, note: 5, commentaire: '' });

    useEffect(() => {
        if (user?.type_compte === 'client' && user?.client?.id) {
            loadFavoris();
            loadCommandesSansAvis();
        } else {
            setLoadingFav(false);
        }
    }, [user]);

    const loadFavoris = async () => {
        try {
            const data = await api.get(`/client-profil/${user.client.id}/favoris`);
            setFavoris(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoadingFav(false);
        }
    };

    const removeFavori = async (modeleId) => {
        try {
            await api.delete(`/client-profil/${user.client.id}/favoris/${modeleId}`);
            loadFavoris();
        } catch (err) {
            console.error(err);
        }
    };

    const loadCommandesSansAvis = async () => {
        try {
            const data = await api.get(`/commandes/client/${user.client.id}`);
            // Filtrer livre + sans avis
            // Ce endpoint renvoie peut être tout, filtrons côté frontend :
            // Actuellement l'API ne dit pas si l'avis est laissé, on peut simplifier en affichant toutes les "livrees"
            const livrees = data.filter(c => c.statut === 'livre');
            setCommandesTerminees(livrees);
        } catch (err) {
            console.error(err);
        }
    };

    const submitAvis = async (e) => {
        e.preventDefault();
        try {
            const cmd = commandesTerminees.find(c => c.id === Number(avisForm.commande_id));
            if (!cmd) return;

            await api.post('/tailleurs/avis', {
                tailleur_id: cmd.tailleur_id,
                client_id: user.client.id,
                commande_id: cmd.id,
                note: avisForm.note,
                commentaire: avisForm.commentaire
            });

            alert('Avis publié avec succès !');
            setAvisForm({ commande_id: null, note: 5, commentaire: '' });
            // optionnel: remove from list
        } catch (err) {
            alert("Erreur: " + err.message);
        }
    };

    if (user?.type_compte !== 'client') {
        return (
            <div className="page-container">
                <div className="empty-state">
                    <h3>Espace Client</h3>
                    <p>Cette page est réservée aux clients.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="page-container">
            <div className="page-header">
                <h1>Mes Favoris & Avis</h1>
                <p>Retrouvez vos inspirations et partagez votre expérience.</p>
            </div>

            <div style={{ display: 'flex', gap: '20px', flexDirection: 'column' }}>
                <div>
                    <h3 className="section-title">Modèles Sauvegardés ({favoris.length})</h3>
                    {loadingFav ? (
                        <p style={{ color: 'var(--color-text-muted)' }}>Chargement...</p>
                    ) : favoris.length === 0 ? (
                        <p style={{ color: 'var(--color-text-muted)' }}>Aucun favori pour le moment.</p>
                    ) : (
                        <div className="modeles-grid">
                            {favoris.map(m => (
                                <div key={m.id} className="modele-card">
                                    <button className="fav-remove-btn" onClick={(e) => { e.stopPropagation(); removeFavori(m.id); }} style={{ position: 'absolute', right: 10, top: 10, background: 'var(--color-bg-base)', border: '2px solid var(--color-border)', borderRadius: '50%', width: '30px', height: '30px', cursor: 'pointer', fontWeight: 'bold', zIndex: 10 }}>X</button>
                                    <div className="modele-card-photo" onClick={() => onNavigate?.('catalogue')} style={{ cursor: 'pointer', position: 'relative', height: '180px', borderBottom: '3px solid var(--color-border)' }}>
                                        {m.photo_url ? <img src={api.getUploadUrl(m.photo_url)} alt="Modele" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: '12px' }}>Sans image</div>}
                                    </div>
                                    <div className="modele-card-info" onClick={() => onNavigate?.('catalogue')} style={{ cursor: 'pointer', padding: '20px' }}>
                                        <h4 style={{ margin: '0 0 10px', fontSize: '18px', fontWeight: '800', fontFamily: 'var(--font-heading)' }}>{m.titre}</h4>
                                        <span className="modele-price" style={{ color: 'var(--color-accent-rust)', fontWeight: '700', fontSize: '16px' }}>{Number(m.prix_base).toLocaleString()} F</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {commandesTerminees.length > 0 && (
                    <div>
                        <h3 className="section-title">Laisser un Avis</h3>
                        <form className="avis-form-card" onSubmit={submitAvis} style={{ background: 'var(--color-bg-card)', border: '3px solid var(--color-border)', borderRadius: '20px', padding: '24px', boxShadow: '6px 6px 0px var(--color-border)' }}>
                            <div className="auth-field" style={{ marginBottom: '16px' }}>
                                <label>Sur quelle commande ?</label>
                                <select
                                    value={avisForm.commande_id || ''}
                                    onChange={e => setAvisForm({ ...avisForm, commande_id: e.target.value })}
                                    required
                                    style={{ padding: '12px', border: '3px solid var(--color-border)', borderRadius: '10px', background: 'var(--color-bg-base)', fontFamily: 'var(--font-body)' }}
                                >
                                    <option value="">Sélectionnez une commande livrée</option>
                                    {commandesTerminees.map(c => (
                                        <option key={c.id} value={c.id}>Cmd #{c.id} - {c.modele_titre} (Chez {c.tailleur_nom})</option>
                                    ))}
                                </select>
                            </div>

                            <div className="auth-field" style={{ marginBottom: '16px' }}>
                                <label>Note globale</label>
                                <div className="star-selector" style={{ display: 'flex', gap: '10px' }}>
                                    {[1, 2, 3, 4, 5].map(star => (
                                        <button
                                            type="button"
                                            key={star}
                                            className={`star-btn ${avisForm.note >= star ? 'active' : ''}`}
                                            onClick={() => setAvisForm({ ...avisForm, note: star })}
                                            style={{ fontSize: '32px', background: 'none', border: 'none', cursor: 'pointer', color: avisForm.note >= star ? 'var(--color-accent-mustard)' : 'rgba(0,0,0,0.1)' }}
                                        >
                                            ★
                                        </button>
                                    ))}
                                    <span className="star-label" style={{ alignSelf: 'center', fontWeight: 'bold', color: 'var(--color-accent-mustard)' }}>{avisForm.note}/5</span>
                                </div>
                            </div>

                            <div className="auth-field" style={{ marginBottom: '20px' }}>
                                <label>Commentaire (public)</label>
                                <textarea
                                    value={avisForm.commentaire}
                                    onChange={e => setAvisForm({ ...avisForm, commentaire: e.target.value })}
                                    rows="3"
                                    placeholder="La coupe est parfaite, le tissu de qualité..."
                                    required
                                    style={{ padding: '12px', border: '3px solid var(--color-border)', borderRadius: '10px', background: 'var(--color-bg-base)', fontFamily: 'var(--font-body)' }}
                                ></textarea>
                            </div>

                            <button type="submit" className="page-btn page-btn-primary" style={{ width: '100%' }}>
                                Publier l'avis
                            </button>
                        </form>
                    </div>
                )}
            </div>
        </div>
    );
}
