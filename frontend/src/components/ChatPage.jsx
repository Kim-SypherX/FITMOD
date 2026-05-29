/**
 * FITMOD — ChatPage.jsx (WhatsApp-Style)
 * Composant de messagerie instantanée avec vocal et Socket.IO
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../utils/api';
import { io } from 'socket.io-client';
import { FiSend, FiArrowLeft, FiMic, FiTrash2, FiMessageSquare, FiPlay, FiPause, FiEdit2, FiX, FiChevronDown, FiCornerUpLeft, FiCopy, FiInfo, FiSmile } from 'react-icons/fi';
import '../styles/ChatPage.css';

// Lecteur audio style WhatsApp
function AudioMessage({ src, msg, isMe, avatarInitial, formatTimeOuter }) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const audioRef = useRef(null);

    const [waveform] = useState(() => Array.from({length: 34}, () => Math.floor(Math.random() * 60) + 20));

    const togglePlayPause = () => {
        if (!audioRef.current) return;
        if (isPlaying) {
            audioRef.current.pause();
        } else {
            audioRef.current.play();
        }
        setIsPlaying(!isPlaying);
    };

    const handleLoadedMetadata = () => {
        if (audioRef.current) {
            if (audioRef.current.duration === Infinity) {
                audioRef.current.currentTime = 1e101;
                audioRef.current.ontimeupdate = () => {
                    audioRef.current.ontimeupdate = null;
                    audioRef.current.currentTime = 0;
                    setDuration(audioRef.current.duration);
                };
            } else {
                setDuration(audioRef.current.duration);
            }
        }
    };

    const handleTimeUpdate = () => {
        if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
    };

    const handleEnded = () => {
        setIsPlaying(false);
        setCurrentTime(0);
        if (audioRef.current) audioRef.current.currentTime = 0;
    };

    const handleSeek = (e) => {
        if (!audioRef.current || !duration) return;
        const bounds = e.currentTarget.getBoundingClientRect();
        const percent = (e.clientX - bounds.left) / bounds.width;
        audioRef.current.currentTime = percent * duration;
        setCurrentTime(percent * duration);
    };

    const formatSeconds = (time) => {
        if (!time || isNaN(time) || time === Infinity) return "0:00";
        const m = Math.floor(time / 60);
        const s = Math.floor(time % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const progressPercent = duration ? (currentTime / duration) * 100 : 0;

    return (
        <div className={`wa-audio-player ${isMe ? 'wa-me' : 'wa-other'}`}>
            <audio
                ref={audioRef}
                src={api.getUploadUrl(src)}
                onLoadedMetadata={handleLoadedMetadata}
                onTimeUpdate={handleTimeUpdate}
                onEnded={handleEnded}
                preload="metadata"
            />
            
            <button className="wa-play-btn" onClick={togglePlayPause}>
                {isPlaying ? <FiPause size={24} style={{ fill: 'currentColor' }} /> : <FiPlay size={24} style={{ fill: 'currentColor', marginLeft: 3 }} />}
            </button>

            <div className="wa-content">
                <div className="wa-waveform-container" onClick={handleSeek}>
                    <div className="wa-waveform">
                        {waveform.map((h, i) => {
                            const isPassed = (i / 34 * 100) <= progressPercent;
                            return <div key={i} className={`wa-wave-bar ${isPassed ? 'passed' : ''}`} style={{ height: `${h}%` }}></div>
                        })}
                    </div>
                    <div className="wa-progress-thumb" style={{ left: `${progressPercent}%` }}></div>
                </div>

                <div className="wa-meta">
                    <span className="wa-time-left">
                        {isPlaying || currentTime > 0 ? formatSeconds(currentTime) : formatSeconds(duration)}
                    </span>
                    <span className="wa-timestamp">
                        {formatTimeOuter(msg.date_heure)}
                        {isMe && <span className="wa-read-status">{msg.lu ? '✓✓' : '✓'}</span>}
                    </span>
                </div>
            </div>

            <div className="wa-avatar-container">
                <div className="wa-avatar">{avatarInitial}</div>
                <div className="wa-mic-icon"><FiMic size={10} color="#fff" /></div>
            </div>
        </div>
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
    const [editModeId, setEditModeId] = useState(null);
    const [activeMenuId, setActiveMenuId] = useState(null);
    const [activeMenuPos, setActiveMenuPos] = useState({x: 0, y: 0});
    const [showEmojiPicker, setShowEmojiPicker] = useState(null);
    const [replyingTo, setReplyingTo] = useState(null);

    // Emojis array for the picker
    const EMOJIS = ['😂','🙂','↕️','🫳🏾','🤧','😭','👍🏾','🤌🏾','🫴🏾','😻','👎🏾','🙆🏾‍♂️','🙅🏾‍♂️','🚶🏾','🔥','🎊','🎉','❤️','💔','💙','💯'];

    useEffect(() => {
        loadConversations();

        // ─── Setup Socket.IO ───
        const socket = io('http://localhost:3001');
        socketRef.current = socket;

        socket.on('connect', () => {
            console.log('Connecté au serveur de chat');
            if (user?.id) socket.emit('register_user', user.id);
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

        socket.on('message_edited', (editedMsg) => {
            setMessages(prev => prev.map(m => m.id === editedMsg.id ? editedMsg : m));
            loadConversations();
        });

        socket.on('message_deleted', ({id}) => {
            setMessages(prev => prev.map(m => m.id === id ? { ...m, is_deleted: 1 } : m));
            loadConversations();
        });

        socket.on('message_reacted', ({id, reactions}) => {
            setMessages(prev => prev.map(m => m.id === id ? { ...m, reactions } : m));
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

    // Système de fallback (auto-refresh)
    useEffect(() => {
        const interval = setInterval(() => {
            loadConversations();
            if (selectedPartner) {
                api.get(`/chat/messages/${user.id}/${selectedPartner.partner_id}`)
                   .then(history => setMessages(history))
                   .catch(console.error);
            }
        }, 5000);
        return () => clearInterval(interval);
    }, [selectedPartner]);

    // ─── Envoi & Actions ───
    const sendMessage = async (e) => {
        e.preventDefault();
        if (!input.trim() || !selectedPartner) return;

        const msgText = input.trim();
        setInput('');

        try {
            if (editModeId) {
                await api.put(`/chat/messages/${editModeId}`, {
                    expediteur_id: user.id,
                    contenu: msgText
                });
                setEditModeId(null);
            } else {
                await api.post('/chat/messages', {
                    expediteur_id: user.id,
                    destinataire_id: selectedPartner.partner_id,
                    contenu: msgText,
                    type: 'TEXT',
                    reponse_a_id: replyingTo ? replyingTo.id : null
                });
                if (replyingTo) setReplyingTo(null);
            }
        } catch (err) {
            console.error('Erreur envoi message', err);
            alert(err.response?.data?.error || 'Échec envoi.');
        }
    };

    const startEditMessage = (msg) => {
        setEditModeId(msg.id);
        setInput(msg.contenu);
        setActiveMenuId(null);
        inputRef.current?.focus();
    };

    const startReply = (msg) => {
        setReplyingTo(msg);
        setActiveMenuId(null);
        inputRef.current?.focus();
    };

    const handleReaction = async (msgId, emoji) => {
        try {
            await api.put(`/chat/messages/${msgId}/react`, { expediteur_id: user.id, emoji });
            setShowEmojiPicker(null);
            setActiveMenuId(null);
        } catch (err) {
            console.error('Erreur réaction', err);
        }
    };

    // Fermer le menu si on clique ailleurs
    useEffect(() => {
        const handleClick = (e) => {
            if (!e.target.closest('.chat-bubble-toggle') && !e.target.closest('.wa-context-menu')) {
                setActiveMenuId(null);
                setShowEmojiPicker(null);
            }
        };
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, []);

    const toggleMenu = (e, msgId) => {
        e.stopPropagation();
        if (activeMenuId === msgId) {
            setActiveMenuId(null);
            setShowEmojiPicker(null);
        } else {
            setActiveMenuId(msgId);
            setShowEmojiPicker(null);
            // Calcul basique de position : le composant se positionne via CSS, mais on peut forcer la vue
            const rect = e.currentTarget.getBoundingClientRect();
            setActiveMenuPos({ x: rect.right, y: rect.bottom });
        }
    };

    const cancelEditMode = () => {
        setEditModeId(null);
        setInput('');
    };

    const cancelReplyMode = () => {
        setReplyingTo(null);
    };

    const deleteMessage = async (msgId) => {
        if (!window.confirm("Voulez-vous supprimer ce message ?")) return;
        try {
            await api.delete(`/chat/messages/${msgId}?expediteur_id=${user.id}`);
            setActiveMenuId(null);
        } catch(err) {
            alert(err.response?.data?.error || "Erreur de suppression");
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

    const renderQuotePreview = (msg) => {
        if (!msg.reponse_a_contenu && msg.reponse_a_type !== 'AUDIO') return null;
        return (
            <div className="wa-quote">
                <span className="wa-quote-author">{msg.reponse_a_prenom || 'Contact'}</span>
                {msg.reponse_a_is_deleted === 1 ? (
                    <span className="wa-quote-text" style={{ fontStyle: 'italic', color: '#888' }}>🚫 Ce message a été supprimé</span>
                ) : msg.reponse_a_type === 'AUDIO' ? (
                    <span className="wa-quote-text">🎤 Message vocal</span>
                ) : (
                    <span className="wa-quote-text">{msg.reponse_a_contenu}</span>
                )}
            </div>
        );
    };

    const renderReactionsComponent = (msg) => {
        let reactions = msg.reactions;
        if (typeof reactions === 'string') {
            try { reactions = JSON.parse(reactions); } catch(e) { reactions = {}; }
        }
        if (!reactions || Object.keys(reactions).length === 0) return null;
        
        const emojis = Object.values(reactions);
        return (
            <div className="wa-reactions-pill">
                {emojis.map((emoji, idx) => <span key={idx} className="react-emoji">{emoji}</span>)}
            </div>
        );
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

                                        const isDeleted = msg.is_deleted === 1;
                                        // Modification autorisée pour tous selon votre demande, mais dans la limite de 15 minutes
                                        const msgDateMs = new Date(msg.date_heure).getTime();
                                        const canModify = !isDeleted && (msg.type === 'TEXT' || msg.type === 'texte') && (Date.now() - msgDateMs <= 15 * 60 * 1000);
                                        // L'utilisateur peut supprimer tous les messages de son historique (Soft delete)
                                        const canDelete = !isDeleted;

                                        return (
                                            <div key={msg.id} className={`chat-row ${isMe ? 'row-me' : 'row-other'}`}>
                                                <div className={`chat-bubble ${isMe ? 'bubble-me' : 'bubble-other'} ${isLastInGroup ? 'last' : ''} ${msg.type === 'AUDIO' && !isDeleted ? 'audio-bubble' : ''}`}>
                                                    {isDeleted ? (
                                                        <p className="bubble-text deleted-msg">🚫 Ce message a été supprimé</p>
                                                    ) : (
                                                        <>
                                                            {renderQuotePreview(msg)}
                                                            
                                                            {msg.type === 'AUDIO' ? (
                                                                <AudioMessage 
                                                                    src={msg.contenu} 
                                                                    msg={msg} 
                                                                    isMe={isMe} 
                                                                    avatarInitial={isMe ? (user.nom_atelier || user.nom).charAt(0).toUpperCase() : (selectedPartner.partner_atelier || selectedPartner.partner_nom || '?').charAt(0).toUpperCase()}
                                                                    formatTimeOuter={formatTime}
                                                                />
                                                            ) : (
                                                                <>
                                                                    <p className="bubble-text">
                                                                        {msg.contenu}
                                                                        {msg.is_edited === 1 && <span className="edited-flag">(modifié)</span>}
                                                                    </p>
                                                                    <span className="bubble-time">
                                                                        {formatTime(msg.date_heure)}
                                                                        {isMe && <span className="read-status">{msg.lu ? '✓✓' : '✓'}</span>}
                                                                    </span>
                                                                </>
                                                            )}
                                                            
                                                            <div className="chat-bubble-toggle" onClick={(e) => toggleMenu(e, msg.id)}>
                                                                <FiChevronDown />
                                                            </div>

                                                            {activeMenuId === msg.id && (
                                                                <div className={`wa-context-menu ${isMe ? 'menu-me' : 'menu-other'}`}>
                                                                    {showEmojiPicker === msg.id ? (
                                                                        <div className="wa-emoji-picker">
                                                                            <div className="emoji-row">
                                                                                {EMOJIS.map(em => (
                                                                                    <button key={em} onClick={(e) => { e.stopPropagation(); handleReaction(msg.id, em); }} className="emoji-btn">{em}</button>
                                                                                ))}
                                                                            </div>
                                                                            {msg.reactions && msg.reactions[user.id] && (
                                                                                <button className="remove-react-btn" onClick={(e) => { e.stopPropagation(); handleReaction(msg.id, null); }}><FiX/> Retirer ma réaction</button>
                                                                            )}
                                                                        </div>
                                                                    ) : (
                                                                        <div className="wa-menu-items">
                                                                            <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(msg.contenu); setActiveMenuId(null); }}><FiCopy size={16}/> Copier</button>
                                                                            <button onClick={(e) => { e.stopPropagation(); startReply(msg); }}><FiCornerUpLeft size={16}/> Répondre</button>
                                                                            <button onClick={(e) => { e.stopPropagation(); setShowEmojiPicker(msg.id); }}><FiSmile size={16}/> Réagir</button>
                                                                            {canModify && <button onClick={(e) => { e.stopPropagation(); startEditMessage(msg); }}><FiEdit2 size={16}/> Modifier</button>}
                                                                            {canDelete && <button className="menu-btn-danger" onClick={(e) => { e.stopPropagation(); deleteMessage(msg.id); }}><FiTrash2 size={16}/> Supprimer</button>}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}

                                                            {renderReactionsComponent(msg)}
                                                        </>
                                                    )}
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
                                <>
                                    {replyingTo && (
                                        <div className="edit-mode-banner reply-banner">
                                            <div className="reply-preview-content">
                                                <span className="reply-title">Réponse à {replyingTo.expediteur_id === user.id ? 'vous-même' : 'Contact'}</span>
                                                <span className="reply-preview-text">{replyingTo.type === 'AUDIO' ? '🎤 Vocal' : replyingTo.contenu}</span>
                                            </div>
                                            <button type="button" onClick={cancelReplyMode} title="Annuler">
                                                <FiX size={16} />
                                            </button>
                                        </div>
                                    )}
                                    {editModeId && (
                                        <div className="edit-mode-banner">
                                            <span>✏️ Modification du message en cours...</span>
                                            <button type="button" onClick={cancelEditMode} title="Annuler">
                                                <FiX size={16} />
                                            </button>
                                        </div>
                                    )}
                                    <form onSubmit={sendMessage} className="chat-input-form">
                                        <input
                                            type="text"
                                            ref={inputRef}
                                            value={input}
                                            onChange={e => setInput(e.target.value)}
                                            placeholder={editModeId ? "Modifiez votre message..." : "Écrivez un message..."}
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
                                </>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div >
    );
}
