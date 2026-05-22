/**
 * FITMOD — AdminPage (Real API)
 */
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../utils/api';
import '../styles/Pages.css';
import '../styles/AdminCards.css';

export default function AdminPage({ activeTab = 'dashboard' }) {
    const { user } = useAuth();
    const [stats, setStats] = useState(null);
    const [tailleurs, setTailleurs] = useState([]);
    const [commandes, setCommandes] = useState([]);
    const [conversations, setConversations] = useState([]);
    const [selectedConversation, setSelectedConversation] = useState(null);
    const [chatHistorique, setChatHistorique] = useState([]);
    const [avertissementCible, setAvertissementCible] = useState(null);
    const [avertissementText, setAvertissementText] = useState('');
    const [favoris, setFavoris] = useState([]);
    const [loadingStats, setLoadingStats] = useState(true);
    const [loadingData, setLoadingData] = useState(false);
    const [sendingWarning, setSendingWarning] = useState(false);

    useEffect(() => {
        if (user?.type_compte === 'admin') {
            if (activeTab === 'dashboard') loadStats();
            else if (activeTab === 'tailleurs') loadTailleurs();
            else if (activeTab === 'commandes') loadCommandes();
            else if (activeTab === 'messages') loadConversations();
            else if (activeTab === 'favoris') loadFavoris();
        }
    }, [user, activeTab]);

    const loadStats = async () => {
        setLoadingStats(true);
        try {
            const data = await api.get('/admin/dashboard');
            setStats(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoadingStats(false);
        }
    };

    const loadTailleurs = async () => {
        setLoadingData(true);
        try {
            const data = await api.get('/admin/tailleurs');
            setTailleurs(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoadingData(false);
        }
    };

    const loadCommandes = async () => {
        setLoadingData(true);
        try {
            const data = await api.get('/admin/commandes');
            setCommandes(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoadingData(false);
        }
    };

    const loadConversations = async () => {
        setLoadingData(true);
        try {
            const data = await api.get('/admin/conversations_list');
            setConversations(data);
            setSelectedConversation(null);
            setChatHistorique([]);
        } catch (err) {
            console.error(err);
        } finally {
            setLoadingData(false);
        }
    };

    const loadChatHistorique = async (user1_id, user2_id) => {
        try {
            const data = await api.get(`/admin/conversations/historique/${user1_id}/${user2_id}`);
            setChatHistorique(data);
        } catch (err) {
            console.error(err);
        }
    };

    const handleSelectConversation = (conv) => {
        setSelectedConversation(conv);
        loadChatHistorique(conv.user1_id, conv.user2_id);
    };

    const handleSendWarning = async () => {
        if (!avertissementCible || !avertissementText.trim()) return;
        setSendingWarning(true);
        try {
            await api.post('/admin/conversations/avertissement', {
                cible_id: avertissementCible,
                message_texte: avertissementText
            });
            alert("Avertissement envoyé en tant que Modérateur !");
            setAvertissementText('');
            setAvertissementCible(null);
            // Recharger l'historique
            if (selectedConversation) {
                loadChatHistorique(selectedConversation.user1_id, selectedConversation.user2_id);
            }
        } catch (err) {
            console.error(err);
            alert("Erreur lors de l'envoi");
        } finally {
            setSendingWarning(false);
        }
    };

    const loadFavoris = async () => {
        setLoadingData(true);
        try {
            const data = await api.get('/admin/favoris');
            setFavoris(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoadingData(false);
        }
    };

    const handleUpdateTailleurStatut = async (id, newStatut) => {
        try {
            await api.patch(`/admin/tailleur/${id}/statut`, { statut: newStatut });
            // Rafraîchir la liste localement
            setTailleurs(tailleurs.map(t => t.id === id ? { ...t, statut: newStatut } : t));
            alert('Statut mis à jour avec succès.');
        } catch (err) {
            console.error(err);
            alert('Erreur lors de la mise à jour du statut.');
        }
    };

    if (user?.type_compte !== 'admin') {
        return (
            <div className="page-container">
                <div className="empty-state">
                    <h3>Accès Refusé</h3>
                    <p>Vous n'avez pas les droits d'administration.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="page-container">
            <div className="page-header">
                <h1>Dashboard Admin</h1>
                <p>Vue globale sur l'activité de la plateforme FITMOD</p>
            </div>

            {activeTab === 'dashboard' && (
                <>
                {loadingStats ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-muted)' }}>Chargement des données...</div>
                ) : stats ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
                        <section>
                            <h3 className="section-title">Performances Clés</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
                                <div className="premium-3d-card" style={{ textAlign: 'left', padding: '24px' }}>
                                    <span style={{ fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>Revenu Total F CFA</span>
                                    <span style={{ display: 'block', fontSize: '36px', fontWeight: '800', color: 'var(--color-accent-rust)', fontFamily: 'var(--font-heading)' }}>{Number(stats.revenu_total || stats.totalRevenu).toLocaleString()}</span>
                                </div>
                                <div className="premium-3d-card" style={{ textAlign: 'left', padding: '24px' }}>
                                    <span style={{ fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>Clients</span>
                                    <span style={{ display: 'block', fontSize: '36px', fontWeight: '800', color: 'var(--color-accent-mustard)', fontFamily: 'var(--font-heading)' }}>{stats.total_clients || stats.totalClients}</span>
                                </div>
                                <div className="premium-3d-card" style={{ textAlign: 'left', padding: '24px' }}>
                                    <span style={{ fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>Tailleurs</span>
                                    <span style={{ display: 'block', fontSize: '36px', fontWeight: '800', color: 'var(--color-accent-olive)', fontFamily: 'var(--font-heading)' }}>{stats.total_tailleurs || stats.totalTailleurs}</span>
                                </div>
                                <div className="premium-3d-card" style={{ textAlign: 'left', padding: '24px' }}>
                                    <span style={{ fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>Commandes</span>
                                    <span style={{ display: 'block', fontSize: '36px', fontWeight: '800', color: 'var(--color-text-main)', fontFamily: 'var(--font-heading)' }}>{stats.total_commandes || stats.totalCommandes}</span>
                                </div>
                            </div>
                        </section>

                        <section style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) minmax(300px, 1fr)', gap: '20px' }}>
                            <div className="premium-3d-card" style={{ padding: '24px' }}>
                                <h3 style={{ margin: '0 0 16px', fontFamily: 'var(--font-heading)' }}>Derniers Tailleurs Inscrits</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {stats.recent_tailleurs?.map(t => (
                                        <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border-light)', paddingBottom: '8px' }}>
                                            <div>
                                                <strong style={{ display: 'block', color: 'var(--color-text-main)' }}>{t.nom_atelier}</strong>
                                                <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{t.nom} {t.prenom} - {t.ville}</span>
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <span style={{ fontSize: '11px', background: 'var(--color-bg-base)', padding: '4px 8px', borderRadius: '10px', fontWeight: 'bold', display: 'inline-block', border: '2px solid var(--color-border)', marginBottom: '4px' }}>{new Date(t.date_creation).toLocaleDateString()}</span>
                                                <br/>
                                                <span style={{ fontSize: '11px', color: t.statut === 'actif' ? '#10b981' : '#f59e0b', fontWeight: 'bold' }}>{t.statut}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="premium-3d-card" style={{ padding: '24px' }}>
                                <h3 style={{ margin: '0 0 16px', fontFamily: 'var(--font-heading)' }}>Dernières Commandes</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {stats.recent_commandes?.map(c => (
                                        <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border-light)', paddingBottom: '8px' }}>
                                            <div>
                                                <strong style={{ display: 'block', color: 'var(--color-text-main)' }}>Cmd #{c.id}</strong>
                                                <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{Number(c.prix_total).toLocaleString()} F CFA</span>
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <span className="admin-badge badge-neutral" style={{ background: 'var(--color-text-main)', color: '#fff', fontSize: '10px', display: 'inline-block' }}>
                                                    {c.statut.replace(/_/g, ' ')}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </section>
                    </div>
                ) : null}
                </>
            )}

            {activeTab === 'tailleurs' && (
                <div>
                    <h3 style={{ margin: '0 0 20px', fontFamily: 'var(--font-heading)' }}>Gestion des Artisans (Tailleurs)</h3>
                    {loadingData ? <p>Chargement...</p> : (
                        <div className="admin-card-container">
                            {tailleurs.map(t => (
                                <div key={t.id} className="premium-3d-card">
                                    <div className="card-header">
                                        <h3 style={{ margin: 0, color: 'var(--color-text-main)' }}>{t.nom_atelier}</h3>
                                        <span className={`admin-badge ${t.statut === 'actif' ? 'badge-success' : t.statut === 'suspendu' ? 'badge-warning' : 'badge-neutral'}`}>
                                            {t.statut}
                                        </span>
                                    </div>
                                    <div className="card-body">
                                        <div><strong>Propriétaire:</strong> {t.nom} {t.prenom}</div>
                                        <div><strong>Emplacement:</strong> {t.ville}</div>
                                        <div><strong>Contact:</strong> {t.telephone}</div>
                                        <div style={{ color: 'var(--color-text-muted)', fontSize: '12px', marginTop: '4px' }}>Inscrit le {new Date(t.date_inscription).toLocaleDateString()}</div>
                                    </div>
                                    <div className="card-footer">
                                        <span style={{ fontSize: '13px', fontWeight: 'bold' }}>Action :</span>
                                        <select 
                                            value={t.statut} 
                                            onChange={(e) => handleUpdateTailleurStatut(t.id, e.target.value)}
                                            className="admin-select"
                                        >
                                            <option value="actif">Valider (Actif)</option>
                                            <option value="suspendu">Suspendre</option>
                                            <option value="en_conge">En Congé</option>
                                        </select>
                                    </div>
                                </div>
                            ))}
                            {tailleurs.length === 0 && (
                                <div style={{ textAlign: 'center', padding: '40px', gridColumn: '1 / -1', color: 'var(--color-text-muted)' }}>
                                    Aucun tailleur trouvé
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'commandes' && (
                <div>
                    <h3 style={{ margin: '0 0 20px', fontFamily: 'var(--font-heading)' }}>Suivi Global des Transactions</h3>
                    {loadingData ? <p>Chargement...</p> : (
                        <div className="admin-card-container">
                            {commandes.map(c => (
                                <div key={c.id} className="premium-3d-card">
                                    <div className="card-header">
                                        <h3 style={{ margin: 0, color: 'var(--color-text-main)', fontSize: '18px' }}>Commande #{c.id}</h3>
                                        <span className="admin-badge badge-neutral" style={{ background: 'var(--color-text-main)', color: '#fff' }}>
                                            {c.statut.replace(/_/g, ' ')}
                                        </span>
                                    </div>
                                    <div className="card-body">
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <div>
                                                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 'bold' }}>Client</div>
                                                <div style={{ fontWeight: 'bold' }}>{c.client_nom}</div>
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 'bold' }}>Atelier</div>
                                                <div style={{ fontWeight: 'bold' }}>{c.tailleur_nom}</div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="card-footer" style={{ borderTopStyle: 'dashed' }}>
                                        <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{new Date(c.date_commande).toLocaleString('fr-FR')}</span>
                                        <span style={{ fontSize: '20px', fontWeight: '900', color: 'var(--color-accent-rust)', fontFamily: 'var(--font-heading)' }}>
                                            {Number(c.prix_total).toLocaleString()} F
                                        </span>
                                    </div>
                                </div>
                            ))}
                            {commandes.length === 0 && (
                                <div style={{ textAlign: 'center', padding: '40px', gridColumn: '1 / -1', color: 'var(--color-text-muted)' }}>
                                    Aucune commande trouvée
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
            {activeTab === 'messages' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(250px, 350px) 1fr', gap: '24px', height: '70vh' }}>
                    {/* Colonne Gauche : Liste des Conversations */}
                    <div className="premium-3d-card" style={{ padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <div style={{ padding: '20px', borderBottom: '2px solid var(--color-border)' }}>
                            <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)' }}>Conversations</h3>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
                            {loadingData ? <p style={{ padding: '20px' }}>Chargement...</p> : conversations.map(conv => (
                                <div 
                                    key={`${conv.user1_id}-${conv.user2_id}`}
                                    onClick={() => handleSelectConversation(conv)}
                                    style={{ 
                                        padding: '16px', 
                                        border: '2px solid',
                                        borderColor: selectedConversation?.user1_id === conv.user1_id && selectedConversation?.user2_id === conv.user2_id ? 'var(--color-bg-inverse, #2c1a12)' : 'var(--color-border-light, #e5e5e5)',
                                        borderRadius: '12px',
                                        marginBottom: '10px',
                                        cursor: 'pointer',
                                        background: selectedConversation?.user1_id === conv.user1_id && selectedConversation?.user2_id === conv.user2_id ? 'var(--color-bg-base, #f9f9f9)' : 'transparent',
                                        transition: 'all 0.2s',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '6px'
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontWeight: 'bold', fontSize: '13px', color: 'var(--color-text-main)' }}>{conv.u1_prenom} ↔ {conv.u2_prenom}</span>
                                        <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{new Date(conv.last_activity).toLocaleDateString()}</span>
                                    </div>
                                    <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{conv.total_messages} messages échangés</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Colonne Droite : Historique et Avertissement */}
                    <div className="premium-3d-card" style={{ padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        {selectedConversation ? (
                            <>
                                <div style={{ padding: '20px', borderBottom: '2px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <h3 style={{ margin: 0 }}>Litige en cours de modération</h3>
                                </div>
                                <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', background: 'var(--color-bg-base)' }}>
                                    {chatHistorique.map(msg => {
                                        const isAdmin = msg.expediteur_id === user.id;
                                        const isAlert = isAdmin;
                                        const justify = 'flex-start'; // Align uniformly to show standard text flow
                                        
                                        return (
                                            <div key={msg.id} style={{ display: 'flex', justifyContent: justify }}>
                                                <div style={{ 
                                                    maxWidth: '80%', 
                                                    padding: '12px 16px', 
                                                    borderRadius: '16px',
                                                    border: '2px solid',
                                                    borderColor: isAlert ? '#ef4444' : 'var(--color-border)',
                                                    background: isAlert ? '#fee2e2' : 'var(--color-bg-card)',
                                                    color: isAlert ? '#b91c1c' : 'var(--color-text-main)',
                                                    borderBottomLeftRadius: justify === 'flex-start' ? '4px' : '16px',
                                                    borderBottomRightRadius: justify === 'flex-end' ? '4px' : '16px',
                                                    boxShadow: '4px 4px 0px rgba(0,0,0,0.05)'
                                                }}>
                                                    <div style={{ fontSize: '11px', fontWeight: 'bold', marginBottom: '4px', opacity: 0.8 }}>
                                                        {isAlert ? '🚨 Modérateur FITMOD' : `${msg.prenom} ${msg.nom} (${msg.type_compte})`}
                                                    </div>
                                                    <div style={{ fontSize: '14px', lineHeight: '1.4' }}>{msg.contenu}</div>
                                                    <div style={{ fontSize: '10px', textAlign: 'right', marginTop: '6px', opacity: 0.6 }}>
                                                        {new Date(msg.date_heure).toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'})}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div style={{ padding: '20px', borderTop: '2px solid var(--color-border)', background: 'var(--color-bg-card)' }}>
                                    <div style={{ marginBottom: '10px', fontWeight: 'bold', fontSize: '14px' }}>Envoyer un rappel à l'ordre (Sera visible par l'utilisateur ciblé) :</div>
                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        <select 
                                            value={avertissementCible || ''} 
                                            onChange={(e) => setAvertissementCible(e.target.value)}
                                            style={{ padding: '10px', borderRadius: '8px', border: '2px solid var(--color-border)', flex: '0 0 200px' }}
                                        >
                                            <option value="">Sélectionner une cible...</option>
                                            <option value={selectedConversation.user1_id}>{selectedConversation.u1_prenom} {selectedConversation.u1_nom}</option>
                                            <option value={selectedConversation.user2_id}>{selectedConversation.u2_prenom} {selectedConversation.u2_nom}</option>
                                        </select>
                                        <input 
                                            type="text" 
                                            placeholder="Tapez le motif de l'avertissement officiel..." 
                                            value={avertissementText}
                                            onChange={e => setAvertissementText(e.target.value)}
                                            style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '2px solid var(--color-border)' }}
                                        />
                                        <button 
                                            onClick={handleSendWarning}
                                            disabled={sendingWarning || !avertissementCible || !avertissementText.trim()}
                                            style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: '#ef4444', color: '#fff', fontWeight: 'bold', cursor: 'pointer', opacity: (!avertissementCible || !avertissementText.trim()) ? 0.5 : 1 }}
                                        >
                                            {sendingWarning ? 'Envoi...' : 'Avertir'}
                                        </button>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)' }}>
                                Sélectionnez une conversation pour voir les détails et modérer
                            </div>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'favoris' && (
                <div>
                    <h3 style={{ margin: '0 0 20px', fontFamily: 'var(--font-heading)' }}>Modèles les plus Aimés (Favoris)</h3>
                    {loadingData ? <p>Chargement...</p> : (
                        <div className="admin-card-container">
                            {favoris.map(fav => (
                                <div key={fav.id} className="premium-3d-card" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
                                    {fav.modele_image ? (
                                        <img src={api.getUploadUrl(fav.modele_image)} alt={fav.modele_titre} style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: '12px', border: '3px solid var(--color-border)', flexShrink: 0 }}/>
                                    ) : (
                                        <div style={{ width: 80, height: 80, background: 'var(--color-bg-base)', borderRadius: '12px', border: '3px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>👗</div>
                                    )}
                                    <div style={{ paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <h4 style={{ margin: 0, color: 'var(--color-text-main)', fontSize: '16px' }}>{fav.modele_titre}</h4>
                                            <span style={{ fontSize: '16px', color: '#ef4444' }}>❤️</span>
                                        </div>
                                        <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>Créé par <strong>{fav.nom_atelier}</strong></div>
                                        <div style={{ fontSize: '12px', marginTop: '6px', padding: '6px 10px', background: 'var(--color-bg-base)', borderRadius: '8px', border: '1px solid var(--color-border-light)', display: 'inline-block', width: 'fit-content' }}>
                                            Aimé par <strong>{fav.client_prenom} {fav.client_nom}</strong>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {favoris.length === 0 && (
                                <div style={{ textAlign: 'center', padding: '40px', gridColumn: '1 / -1', color: 'var(--color-text-muted)' }}>
                                    Aucun favori enregistré
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
