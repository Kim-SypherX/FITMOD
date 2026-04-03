/**
 * FITMOD — ChatPage.jsx (WhatsApp-Style)
 * Composant de messagerie instantanée avec vocal et Socket.IO
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../utils/api';
import { io } from 'socket.io-client';
import { FiSend, FiArrowLeft, FiMic, FiTrash2, FiMessageSquare } from 'react-icons/fi';
import '../styles/ChatPage.css';

// Lecteur audio simple
function AudioMessage({ src }) {
    return (
        <audio
            controls
            src={api.getUploadUrl(src)}
            preload="metadata"
            className="chat-audio"
        />
    );
}

export default function ChatPage({ chatContext, onNavigate }) {
    const { user } = useAuth();

    // États
    const [conversations, setConversations] = useState([]);
    const [selectedPartner, setSelectedPartner] = useState(null);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(true);

    // Vocal
    const [isRecording, setIsRecording] = useState(false);
    const [recordingDuration, setRecordingDuration] = useState(0);
    const mediaRecorderRef = useRef(null);
    const timerRef = useRef(null);
    const audioChunksRef = useRef([]);

    // Refs
    const socketRef = useRef(null);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);

    // Initialisation
    useEffect(() => {
        loadConversations();

        // ─── Setup Socket.IO ───
        const socket = io('http://localhost:3001');
        socketRef.current = socket;

        socket.on('connect', () => {
            console.log('Connecté au serveur de chat');
        });

        socket.on('new_message', (msg) => {
            // Si le message appartient à la conversation active
            setSelectedPartner(currentPartner => {
                const partnerId = currentPartner ? currentPartner.partner_id : chatContext?.partnerId;

                if (partnerId && (msg.expediteur_id === parseInt(partnerId) || msg.destinataire_id === parseInt(partnerId))) {
                    setMessages(prev => {
                        // Éviter les doublons lors des broadcasts locaux
                        if (prev.find(m => m.id === msg.id)) return prev;
                        return [...prev, msg];
                    });

                    // Marquer lu côté serveur si côté visiteur le chat est ouvert
                    if (msg.expediteur_id === parseInt(partnerId)) {
                        api.patch('/chat/messages/read', {
                            expediteur_id: parseInt(partnerId),
                            destinataire_id: user.id
                        });
                    }
                }
                return currentPartner;
            });

            // Mettre à jour la liste des conversations dans tous les cas
            loadConversations();
        });

        return () => {
            if (socket.connected) socket.disconnect();
        };
    }, []);

    // Charger/Changer de conversation
    useEffect(() => {
        if (chatContext?.partnerId) {
            openConversation({
                partner_id: chatContext.partnerId,
                partner_nom: chatContext.partnerName || 'Contact',
                partner_atelier: chatContext.partnerName || 'Contact'
            });
        }
    }, [chatContext]);

    const loadConversations = async () => {
        try {
            const data = await api.get(`/chat/conversations/${user.id}`);
            setConversations(data);
        } catch (err) {
            console.error('Erreur chargement des conversations:', err);
        } finally {
            setLoading(false);
        }
    };

    const openConversation = async (partner) => {
        // Quitter l'ancienne room si elle existe
        if (selectedPartner) {
            socketRef.current?.emit('leave_conversation', { userId: user.id, partnerId: selectedPartner.partner_id });
        }

        setSelectedPartner(partner);

        // Rejoindre la nouvelle room
        socketRef.current?.emit('join_conversation', { userId: user.id, partnerId: partner.partner_id });

        try {
            const history = await api.get(`/chat/messages/${user.id}/${partner.partner_id}`);
            setMessages(history);
            scrollToBottom();
            loadConversations(); // Update "non-lus"
        } catch (err) {
            console.error('Erreur historique:', err);
        }
    };

    const scrollToBottom = useCallback(() => {
        setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    }, []);

    useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

    // ─── Envoi Textuel ───
    const sendMessage = async (e) => {
        e.preventDefault();
        if (!input.trim() || !selectedPartner) return;

        const msgText = input.trim();
        setInput('');

        try {
            await api.post('/chat/messages', {
                expediteur_id: user.id,
                destinataire_id: selectedPartner.partner_id,
                contenu: msgText,
                type: 'TEXT'
            });
            // Le message sera retourné via Socket.IO -> 'new_message'
        } catch (err) {
            console.error('Erreur envoi message', err);
            alert('Échec envoi.');
        }
    };

    // ─── Enregistrement Vocal ───
    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            audioChunksRef.current = [];

            mediaRecorderRef.current.ondataavailable = (e) => {
                if (e.data.size > 0) audioChunksRef.current.push(e.data);
            };

            mediaRecorderRef.current.start(100); // chunking par 100ms

            setIsRecording(true);
            setRecordingDuration(0);

            timerRef.current = setInterval(() => {
                setRecordingDuration(prev => prev + 1);
            }, 1000);

        } catch (error) {
            console.error("Erreur d'accès au micro", error);
            alert("Accès au microphone refusé.");
        }
    };

    const stopRecordingAsync = () => {
        return new Promise((resolve) => {
            if (!mediaRecorderRef.current || !isRecording) {
                resolve(null);
                return;
            }
            mediaRecorderRef.current.addEventListener('stop', () => {
                const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                resolve(blob);
            }, { once: true });

            mediaRecorderRef.current.stop();
            mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
            clearInterval(timerRef.current);
            setIsRecording(false);
        });
    };

    const cancelRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
        }
        clearInterval(timerRef.current);
        setIsRecording(false);
        setRecordingDuration(0);
    };

    const sendAudioMessage = async () => {
        if (!selectedPartner) return;

        try {
            const blob = await stopRecordingAsync();
            if (!blob) return;

            const formData = new FormData();
            // multer attend 'audio' (cf backend/routes/chatRoutes.js)
            formData.append('audio', blob, `voice_${Date.now()}.webm`);
            formData.append('expediteur_id', user.id);
            formData.append('destinataire_id', selectedPartner.partner_id);

            await api.post('/chat/upload-audio', formData, {
                // IMPORTANT: formData en tant que corps, FetchAPI va gérer le multipart boundary
                body: formData
            });

            setRecordingDuration(0);
        } catch (err) {
            console.error('Erreur upload vocal', err);
            alert('Échec de l\'envoi vocal.');
        }
    };

    // ─── Formatting utils ───
    const formatTime = (d) => new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const formatDateObj = (d) => {
        const date = new Date(d);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (date.toDateString() === today.toDateString()) return "Aujourd'hui";
        if (date.toDateString() === yesterday.toDateString()) return "Hier";
        return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
    };

    // Grouper messages par date
    const groupedMessages = messages.reduce((acc, msg) => {
        const dateLabel = formatDateObj(msg.date_heure);
        if (!acc[dateLabel]) acc[dateLabel] = [];
        acc[dateLabel].push(msg);
        return acc;
    }, {});


    if (loading && !selectedPartner) {
        return <div className="page-container" style={{ textAlign: 'center', paddingTop: 100 }}>Chargement de l'espace messagerie...</div>;
    }

    return (
        <div className="chat-layout">
            {/* ─── SIDEBAR: Liste des conversations ─── */}
            <div className={`chat-sidebar ${selectedPartner ? 'hidden-mobile' : ''}`}>
                <div className="chat-sidebar-header">
                    <h2>Discussions</h2>
                </div>

                <div className="chat-conv-list">
                    {conversations.length === 0 ? (
                        <div className="empty-state">
                            <FiMessageSquare size={32} />
                            <p>Aucune conversation en cours</p>
                        </div>
                    ) : (
                        conversations.map(c => {
                            const partnerDisplay = c.partner_type === 'tailleur' ? c.partner_atelier : `${c.partner_prenom} ${c.partner_nom}`;
                            const isSelected = selectedPartner?.partner_id === c.partner_id;

                            return (
                                <div key={c.partner_id}
                                    className={`chat-conv-item ${isSelected ? 'active' : ''}`}
                                    onClick={() => openConversation(c)}>

                                    <div className="conv-avatar">
                                        {partnerDisplay.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="conv-body">
                                        <div className="conv-top">
                                            <h4>{partnerDisplay}</h4>
                                            <span className="conv-time">{new Date(c.date_dernier).toLocaleDateString('fr-FR', { day: 'numeric', month: 'numeric' })}</span>
                                        </div>
                                        <div className="conv-preview">
                                            {c.dernier_type === 'AUDIO' ? '🎤 Message vocal' : c.dernier_message}
                                        </div>
                                    </div>
                                    {c.non_lus > 0 && <div className="conv-badge">{c.non_lus}</div>}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* ─── MAIN: Zone de Chat ─── */}
            <div className={`chat-main ${!selectedPartner ? 'hidden-mobile' : ''}`}>
                {!selectedPartner ? (
                    <div className="chat-placeholder">
                        <div className="chat-placeholder-icon">💬</div>
                        <h3> FITMOD Messagerie</h3>
                        <p>Sélectionnez un tailleur ou un client pour discuter des détails de vos commandes.</p>
                    </div>
                ) : (
                    <>
                        {/* HEADER */}
                        <div className="chat-main-header">
                            <button className="chat-back-btn" onClick={() => setSelectedPartner(null)}>
                                <FiArrowLeft size={20} />
                            </button>
                            <div className="conv-avatar">
                                {(selectedPartner.partner_atelier || selectedPartner.partner_nom || '?').charAt(0).toUpperCase()}
                            </div>
                            <div className="chat-header-info">
                                <h3>{selectedPartner.partner_atelier || selectedPartner.partner_nom}</h3>
                            </div>
                        </div>

                        {/* MESSAGES */}
                        <div className="chat-main-body">
                            {Object.entries(groupedMessages).map(([date, msgs]) => (
                                <React.Fragment key={date}>
                                    <div className="chat-date-pill"><span>{date}</span></div>

                                    {msgs.map((msg, i) => {
                                        const isMe = msg.expediteur_id === user.id;
                                        const nextMsg = msgs[i + 1];
                                        const isLastInGroup = !nextMsg || nextMsg.expediteur_id !== msg.expediteur_id;

                                        return (
                                            <div key={msg.id} className={`chat-row ${isMe ? 'row-me' : 'row-other'}`}>
                                                <div className={`chat-bubble ${isMe ? 'bubble-me' : 'bubble-other'} ${isLastInGroup ? 'last' : ''}`}>
                                                    {msg.type === 'AUDIO' ? (
                                                        <AudioMessage src={msg.contenu} />
                                                    ) : (
                                                        <p className="bubble-text">{msg.contenu}</p>
                                                    )}
                                                    <span className="bubble-time">
                                                        {formatTime(msg.date_heure)}
                                                        {isMe && <span className="read-status">{msg.lu ? '✓✓' : '✓'}</span>}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </React.Fragment>
                            ))}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* INPUT ZONE */}
                        <div className="chat-main-footer">
                            {isRecording ? (
                                <div className="recording-bar">
                                    <div className="recording-pulse"></div>
                                    <span className="recording-timer">
                                        {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')}
                                    </span>
                                    <button className="cancel-record-btn" onClick={cancelRecording}>
                                        <FiTrash2 size={20} />
                                    </button>
                                    <button className="send-record-btn" onClick={sendAudioMessage}>
                                        <FiSend size={18} color="#fff" />
                                    </button>
                                </div>
                            ) : (
                                <form onSubmit={sendMessage} className="chat-input-form">
                                    <input
                                        type="text"
                                        ref={inputRef}
                                        value={input}
                                        onChange={e => setInput(e.target.value)}
                                        placeholder="Écrivez un message..."
                                        className="chat-input-field"
                                    />
                                    {input.trim() ? (
                                        <button type="submit" className="chat-send-btn">
                                            <FiSend size={18} color="#fff" />
                                        </button>
                                    ) : (
                                        <button type="button" className="chat-mic-btn" onClick={startRecording}>
                                            <FiMic size={20} color="#fff" />
                                        </button>
                                    )}
                                </form>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div >
    );
}
