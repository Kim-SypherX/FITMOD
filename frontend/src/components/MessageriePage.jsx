/**
 * FITMOD — MessageriePage (Real API) 
 */
import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../utils/api';
import '../styles/Pages.css';

export default function MessageriePage({ messageContext }) {
    const { user } = useAuth();
    const [conversations, setConversations] = useState([]);
    const [selectedConv, setSelectedConv] = useState(null);
    const [messages, setMessages] = useState([]);
    const [inputMsg, setInputMsg] = useState('');
    const [loading, setLoading] = useState(true);

    const messagesEndRef = useRef(null);

    useEffect(() => {
        loadConversations();
    }, []);

    useEffect(() => {
        if (messageContext?.commande_id) {
            loadMessages(messageContext);
        }
    }, [messageContext]);

    const loadConversations = async () => {
        try {
            const data = await api.get(`/messages/user/${user.id}/conversations`);
            setConversations(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const loadMessages = async (conv) => {
        setSelectedConv(conv);
        try {
            const data = await api.get(`/messages/${conv.commande_id}`);
            setMessages(data);
            scrollToBottom();

            // Marquer lus
            await api.patch(`/messages/${conv.commande_id}/read`, { lecteur_id: user.id });
            loadConversations(); // Update count
        } catch (err) {
            console.error(err);
        }
    };

    const scrollToBottom = () => {
        setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    };

    const sendMessage = async (e) => {
        e.preventDefault();
        if (!inputMsg.trim()) return;

        try {
            const newMsg = await api.post('/messages', {
                commande_id: selectedConv.commande_id,
                expediteur_id: user.id,
                contenu: inputMsg
            });

            setMessages(prev => [...prev, newMsg]);
            setInputMsg('');
            scrollToBottom();
            loadConversations();
        } catch (err) {
            console.error(err);
        }
    };

    if (selectedConv) {
        const isTailleur = user.type_compte === 'tailleur';
        const partnerName = isTailleur ? selectedConv.client_nom : selectedConv.tailleur_nom;

        return (
            <div className="page-container messagerie-container">
                <div className="chat-header" style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingBottom: '20px', borderBottom: '2px solid var(--color-border)' }}>
                    <button className="page-back-btn" style={{ marginBottom: 0 }} onClick={() => { setSelectedConv(null); loadConversations(); }}>Retour</button>
                    <div className="conv-avatar" style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--color-accent-mustard)', border: '2px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold' }}>
                        {partnerName.charAt(0).toUpperCase()}
                    </div>
                    <div className="chat-header-info">
                        <h3 style={{ margin: 0, color: 'var(--color-text-main)' }}>{partnerName}</h3>
                        <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Commande : {selectedConv.modele_titre}</span>
                    </div>
                </div>

                <div className="chat-messages" style={{ flex: 1, overflowY: 'auto', padding: '20px 0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {messages.map(m => {
                        const isMe = m.expediteur_id === user.id;
                        return (
                            <div key={m.id} className={`chat-bubble ${isMe ? 'sent' : 'received'}`}
                                style={{
                                    alignSelf: isMe ? 'flex-end' : 'flex-start',
                                    background: isMe ? 'var(--color-accent-rust)' : 'var(--color-bg-card)',
                                    color: isMe ? '#fff' : 'var(--color-text-main)',
                                    border: isMe ? '2px solid var(--color-border)' : '2px solid var(--color-border)',
                                    padding: '10px 14px', borderRadius: '16px', maxWidth: '75%',
                                    fontWeight: '500'
                                }}>
                                <div className="bubble-content">
                                    {m.contenu}
                                    <span className="bubble-time" style={{ display: 'block', fontSize: '10px', marginTop: '4px', opacity: 0.8, textAlign: 'right' }}>
                                        {new Date(m.date_heure).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                    <div ref={messagesEndRef} />
                </div>

                <form className="chat-input" onSubmit={sendMessage} style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                    <input
                        value={inputMsg}
                        onChange={e => setInputMsg(e.target.value)}
                        placeholder="Écrivez votre message..."
                        style={{ flex: 1, padding: '12px 20px', borderRadius: '30px', border: '3px solid var(--color-border)', outline: 'none', background: 'var(--color-bg-card)', color: 'var(--color-text-main)', fontFamily: 'var(--font-body)', fontWeight: '600' }}
                    />
                    <button type="submit" disabled={!inputMsg.trim()} style={{ padding: '0 24px', borderRadius: '30px', border: '3px solid var(--color-border)', background: 'var(--color-accent-mustard)', color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}>Envoyer</button>
                </form>
            </div>
        );
    }

    return (
        <div className="page-container">
            <div className="page-header">
                <h1>Messagerie</h1>
                <p>Discutez des détails de votre confection</p>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-muted)' }}>Chargement...</div>
            ) : conversations.length === 0 ? (
                <div className="empty-state">
                    <h3>Aucun message</h3>
                    <p>Vous n'avez pas de conversation en cours.</p>
                </div>
            ) : (
                <div className="conversations-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {conversations.map(c => {
                        const partnerName = user.type_compte === 'tailleur' ? c.client_nom : c.tailleur_nom;

                        return (
                            <div key={c.commande_id} className="conversation-card" onClick={() => loadMessages(c)}
                                style={{ background: 'var(--color-bg-card)', border: '3px solid var(--color-border)', borderRadius: '20px', padding: '20px', display: 'flex', gap: '16px', alignItems: 'center', cursor: 'pointer', boxShadow: '4px 4px 0px var(--color-border)' }}>
                                <div className="conv-avatar" style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--color-accent-mustard)', border: '2px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold', flexShrink: 0 }}>
                                    {partnerName.charAt(0).toUpperCase()}
                                </div>
                                <div className="conv-info" style={{ flex: 1 }}>
                                    <div className="conv-top" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                        <h4 style={{ margin: 0, fontSize: '16px', color: 'var(--color-text-main)' }}>{partnerName}</h4>
                                        <span className="conv-time" style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{new Date(c.date_dernier_message).toLocaleDateString()}</span>
                                    </div>
                                    <p className="conv-preview" style={{ margin: '0 0 6px', fontSize: '14px', color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.dernier_message}</p>
                                    <span className="conv-commande" style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--color-accent-rust)' }}>Commande : {c.modele_titre}</span>
                                </div>
                                {c.non_lus > 0 && <div className="conv-badge" style={{ background: 'var(--color-accent-rust)', color: '#fff', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold' }}>{c.non_lus}</div>}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
