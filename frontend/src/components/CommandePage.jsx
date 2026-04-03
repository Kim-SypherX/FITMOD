/**
 * FITMOD — CommandePage (Real API)
 */
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../utils/api';
import '../styles/Pages.css';

const STATUTS = [
    { value: 'en_attente_acceptation', label: 'En attente', color: '#f59e0b' },
    { value: 'acceptee', label: 'Acceptée', color: '#10b981' },
    { value: 'refusee', label: 'Refusée', color: '#ef4444' },
    { value: 'en_mesure', label: 'Mesures', color: '#3b82f6' },
    { value: 'en_confection', label: 'Confection', color: '#8b5cf6' },
    { value: 'pret_essayage', label: 'Essayage', color: '#ec4899' },
    { value: 'livre', label: 'Livrée', color: '#14b8a6' },
    { value: 'annulee', label: 'Annulée', color: '#64748b' }
];

export default function CommandePage({ commandeContext, onNavigate }) {
    const { user } = useAuth();
    const [commandes, setCommandes] = useState([]);
    const [selectedCmd, setSelectedCmd] = useState(null);
    const [loading, setLoading] = useState(true);

    // Nouvel ordre form
    const isNew = commandeContext?.modele != null;
    const initModel = commandeContext?.modele;
    const initTailleur = commandeContext?.tailleur;

    const [tissu, setTissu] = useState('fourni_par_client');
    const [couleur, setCouleur] = useState('');
    const [notes, setNotes] = useState('');
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        if (!isNew) {
            loadCommandes();
        }
    }, [isNew]);

    const loadCommandes = async () => {
        setLoading(true);
        try {
            const endpoint = user.type_compte === 'client'
                ? `/commandes/client/${user?.client?.id}`
                : `/commandes/tailleur/${user?.tailleur?.id}`;

            const data = await api.get(endpoint);
            setCommandes(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const loadDetails = async (cmdId) => {
        setLoading(true);
        try {
            const data = await api.get(`/commandes/${cmdId}`);
            setSelectedCmd(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const createCommande = async () => {
        setCreating(true);
        try {
            if (!user?.client?.id) {
                alert("Profil client introuvable, impossible de créer la commande.");
                return;
            }

            const payload = {
                client_id: user.client.id,
                tailleur_id: initTailleur.id,
                modele_id: initModel.id,
                tissu_choisi: tissu,
                couleur,
                prix_total: initModel.prix_base,
                notes_client: notes,
                mesures_utilisees: user.client.mesures_json ? JSON.parse(user.client.mesures_json) : null
            };

            await api.post('/commandes', payload);
            alert('Commande créée avec succès !');
            onNavigate?.('catalogue');
        } catch (err) {
            alert("Erreur lors de la création : " + err.message);
        } finally {
            setCreating(false);
        }
    };

    const changeStatut = async (statutPath) => {
        try {
            await api.patch(`/commandes/${selectedCmd.id}/statut`, { statut: statutPath });
            alert('Statut mis à jour');
            loadDetails(selectedCmd.id);
        } catch (err) {
            alert(err.message);
        }
    };

    if (isNew) {
        return (
            <div className="page-container">
                <button className="page-back-btn" onClick={() => onNavigate?.('catalogue')}>Retour</button>
                <div className="page-header">
                    <h1>Nouvelle Commande</h1>
                </div>

                <div className="new-commande-summary">
                    <div className="cmd-summary-photo" style={{ width: 60, height: 60, borderRadius: 8, background: 'rgba(42,31,24,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                        {initModel.photo_url ? <img src={api.getUploadUrl(initModel.photo_url)} alt="Modele" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>Image non dispo</span>}
                    </div>
                    <div>
                        <h3>{initModel.titre}</h3>
                        <p>Chez {initTailleur.nom_atelier} • Base: {Number(initModel.prix_base).toLocaleString()} FCFA</p>
                    </div>
                </div>

                <div className="modele-detail">
                    <div className="new-commande-form">
                        <div className="auth-field">
                            <label>Fourniture de Tissu</label>
                            <select value={tissu} onChange={e => setTissu(e.target.value)}>
                                <option value="fourni_par_client">Je fournis mon propre tissu</option>
                                <option value="fourni_par_tailleur">Le tailleur fournit le tissu (frais en plus)</option>
                            </select>
                        </div>
                        {tissu === 'fourni_par_tailleur' && (
                            <div className="auth-field">
                                <label>Couleur souhaitée</label>
                                <input value={couleur} onChange={e => setCouleur(e.target.value)} placeholder="Bleu, rouge, etc." />
                            </div>
                        )}
                        <div className="auth-field">
                            <label>Notes au tailleur</label>
                            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows="3" placeholder="Ajustements spécifiques..."></textarea>
                        </div>
                    </div>
                    <div className="commande-actions">
                        <button className="page-btn page-btn-primary" onClick={createCommande} disabled={creating}>
                            {creating ? 'Création...' : 'Confirmer la Commande'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (selectedCmd) {
        const c = selectedCmd;
        const isTailleur = user.type_compte === 'tailleur';

        return (
            <div className="page-container">
                <div className="commande-detail-header">
                    <button className="page-back-btn" onClick={() => { setSelectedCmd(null); loadCommandes(); }}>Retour</button>
                    <h2>Commande #{c.id}</h2>
                </div>

                <div className="commande-detail-info">
                    <div className="cmd-info-row price">
                        <span>Prix Total</span>
                        <span>{Number(c.prix_total).toLocaleString()} F</span>
                    </div>
                    <div className="cmd-info-row">
                        <span>Modèle</span>
                        <span>{c.modele_titre}</span>
                    </div>
                    <div className="cmd-info-row">
                        <span>Partenaire</span>
                        <span>{isTailleur ? `${c.client_nom} ${c.client_prenom}` : c.tailleur_nom}</span>
                    </div>
                    <div className="cmd-info-row">
                        <span>Tissu</span>
                        <span>{c.tissu_choisi.replace(/_/g, ' ')} {c.couleur ? `(${c.couleur})` : ''}</span>
                    </div>
                </div>

                {c.notes_client && (
                    <div className="commande-notes">
                        <h4>Notes du client</h4>
                        <p>{c.notes_client}</p>
                    </div>
                )}

                <h3 className="section-title">Suivi (Timeline)</h3>
                <div className="timeline">
                    {STATUTS.filter(s => s.value !== 'annulee' && s.value !== 'refusee').map((st, idx, arr) => {
                        const histEntry = c.historique?.find(h => h.statut === st.value);
                        const isDone = !!histEntry;
                        const isCurrent = c.statut === st.value;
                        const isLast = idx === arr.length - 1;

                        return (
                            <div key={st.value} className={`timeline-item ${isDone ? 'done' : ''} ${isCurrent ? 'current' : ''}`}>
                                <div className="timeline-dot"></div>
                                {!isLast && <div className={`timeline-line ${isDone && !isCurrent ? 'done' : ''}`}></div>}
                                <div className="timeline-content">
                                    <span className="timeline-label" style={{ fontWeight: isCurrent ? 'bold' : 'normal', color: isCurrent ? st.color : 'inherit' }}>{st.label}</span>
                                    {isDone && <span className="timeline-date" style={{ marginLeft: '10px', fontSize: '12px', color: 'var(--color-text-muted)' }}>{new Date(histEntry.date).toLocaleString('fr-FR')}</span>}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {isTailleur && c.statut !== 'livre' && c.statut !== 'annulee' && c.statut !== 'refusee' && (
                    <div className="commande-actions" style={{ flexWrap: 'wrap' }}>
                        <button className="page-btn page-btn-primary" onClick={() => changeStatut('en_mesure')}>Passer → Mesure</button>
                        <button className="page-btn page-btn-primary" onClick={() => changeStatut('en_confection')}>Passer → Confection</button>
                        <button className="page-btn page-btn-primary" onClick={() => changeStatut('pret_essayage')}>Passer → Essayage</button>
                        <button className="page-btn page-btn-primary" onClick={() => changeStatut('livre')}>Marquer Livré</button>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="page-container">
            <div className="page-header">
                <h1>Mes Commandes</h1>
                <p>Suivez l'avancement de vos confections</p>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-muted)' }}>Chargement...</div>
            ) : commandes.length === 0 ? (
                <div className="empty-state">
                    <h3>Aucune commande</h3>
                    <p>Vous n'avez pas encore passé de commande via FITMOD.</p>
                </div>
            ) : (
                <div className="commandes-list">
                    {commandes.map(c => {
                        const st = STATUTS.find(s => s.value === c.statut);
                        const isTailleur = user.type_compte === 'tailleur';

                        return (
                            <div key={c.id} className="commande-card" onClick={() => loadDetails(c.id)}>
                                <div className="commande-card-left">
                                    <h4>{c.modele_titre}</h4>
                                    <span className="commande-tailleur">{isTailleur ? `Client: ${c.client_nom} ${c.client_prenom}` : `Chez ${c.tailleur_nom}`}</span>
                                    <span className="commande-date">{new Date(c.date_commande).toLocaleDateString('fr-FR')}</span>
                                </div>
                                <div className="commande-card-right">
                                    <span className="commande-price">{Number(c.prix_total).toLocaleString()} F</span>
                                    <span className="commande-status-badge-sm" style={{ background: st?.color, color: '#fff' }}>
                                        {st?.label}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
