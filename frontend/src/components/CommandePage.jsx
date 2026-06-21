/**
 * FITMOD — CommandePage (v2 — Escrow + Photo preuve)
 * ====================================================
 * - Liste des commandes avec status paiement
 * - Détail avec barre progression escrow
 * - Upload photo preuve pour changer d'étape
 * - Historique des versements
 */
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../contexts/AuthContext';
import api, { fetchApi } from '../utils/api';
import PaiementModal from './PaiementModal';
import '../styles/Pages.css';

const STATUTS = [
    { value: 'en_attente_acceptation', label: 'En attente', color: '#f59e0b', icon: '⏳' },
    { value: 'acceptee', label: 'Acceptée', color: '#10b981', icon: '✅' },
    { value: 'couture_en_cours', label: 'Couture', color: '#8b5cf6', icon: '🧵', pct: 45 },
    { value: 'finitions', label: 'Finitions', color: '#ec4899', icon: '✂️', pct: 25 },
    { value: 'pret_a_recuperer', label: 'Prêt', color: '#3b82f6', icon: '📦', pct: 15 },
    { value: 'livre', label: 'Livrée', color: '#14b8a6', icon: '🎉', pct: 15 },
    { value: 'annulee', label: 'Annulée', color: '#64748b', icon: '❌' },
];

const ETAPES_AVEC_PREUVE = ['couture_en_cours', 'finitions', 'pret_a_recuperer', 'livre'];

export default function CommandePage({ commandeContext, onNavigate }) {
    const { user } = useAuth();
    const [commandes, setCommandes] = useState([]);
    const [selectedCmd, setSelectedCmd] = useState(null);
    const [loading, setLoading] = useState(true);
    const [paiementCmd, setPaiementCmd] = useState(null);
    const [uploadingStatut, setUploadingStatut] = useState(null);
    const [preuveComment, setPreuveComment] = useState('');
    const [toast, setToast] = useState(null); // { msg, type: 'success'|'error'|'warn' }
    const [confirmCancel, setConfirmCancel] = useState(false);
    const [avisNote, setAvisNote] = useState(5);
    const [avisComment, setAvisComment] = useState('');
    const [avisSubmitting, setAvisSubmitting] = useState(false);
    const fileInputRef = useRef(null);
    const toastTimerRef = useRef(null);

    const showToast = (msg, type = 'success') => {
        setToast({ msg, type });
        clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => setToast(null), 4000);
    };

    const isNew = commandeContext?.modele != null;
    const initModel = commandeContext?.modele;
    const initTailleur = commandeContext?.tailleur;
    const [tissu, setTissu] = useState('client_fournit');
    const [couleur, setCouleur] = useState('');
    const [notes, setNotes] = useState('');
    const [creating, setCreating] = useState(false);

    const isTailleur = user?.type_compte === 'tailleur';

    // Calcul dynamique du prix selon le choix du tissu
    const hasTissu = initModel && Number(initModel.tissu_disponible) === 1 && initModel.prix_tissu;
    const prixConfection = initModel ? Number(initModel.prix_base) : 0;
    const prixTissu = hasTissu ? Number(initModel.prix_tissu) : 0;
    const prixTotal = tissu === 'tailleur_fournit' && hasTissu ? prixConfection + prixTissu : prixConfection;
    const commission = Math.round(prixTotal * 0.15);
    const partTailleur = prixTotal - commission;

    useEffect(() => { 
        if (!isNew) {
            loadCommandes();
            const interval = setInterval(() => {
                loadCommandes(true);
                if (selectedCmd) loadDetails(selectedCmd.id, true);
            }, 10000);
            return () => clearInterval(interval);
        }
    }, [isNew, selectedCmd?.id]);

    const loadCommandes = async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const endpoint = isTailleur
                ? `/commandes/tailleur/${user.id}`
                : `/commandes/client/${user.id}`;
            const data = await api.get(endpoint);
            setCommandes(data);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    const loadDetails = async (cmdId) => {
        setLoading(true);
        try {
            const data = await api.get(`/commandes/${cmdId}`);
            setSelectedCmd(data);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    const createCommande = async () => {
        setCreating(true);
        try {
            const payload = {
                client_id: user.id,
                tailleur_id: initTailleur.utilisateur_id || initTailleur.id,
                modele_id: initModel.id,
                tissu_option: tissu,
                couleur,
                notes_client: notes,
                mesures_utilisees: {}
            };
            await api.post('/commandes', payload);
            showToast('Commande créée ! Le tailleur va la réviser.');
            onNavigate?.('commandes');
        } catch (err) { showToast('Erreur : ' + err.message, 'error'); }
        finally { setCreating(false); }
    };

    // ── Changement de statut avec photo preuve ──
    const initiateStatusChange = (statut) => {
        if (ETAPES_AVEC_PREUVE.includes(statut)) {
            setUploadingStatut(statut);
            setPreuveComment('');
        } else {
            changeStatut(statut, null);
        }
    };

    const changeStatut = async (statut, file) => {
        try {
            if (ETAPES_AVEC_PREUVE.includes(statut) && !file) {
                showToast('📸 Photo preuve obligatoire pour cette étape', 'warn');
                return;
            }

            const formData = new FormData();
            formData.append('statut', statut);
            if (file) formData.append('preuve', file);
            if (preuveComment) formData.append('commentaire', preuveComment);

            // Utiliser fetchApi pour gérer correctement le FormData
            const data = await fetchApi(`/commandes/${selectedCmd.id}/statut`, {
                method: 'PATCH',
                body: formData,
            });

            showToast(data.message || 'Statut mis à jour', 'success');
            setUploadingStatut(null);
            loadDetails(selectedCmd.id);
        } catch (err) { showToast(err.message, 'error'); }
    };

    const [validatingEtape, setValidatingEtape] = useState(null);
    const [zoomedImage, setZoomedImage] = useState(null);

    const validerEtape = async (etape, preuve_id, action = 'valider') => {
        setValidatingEtape(preuve_id);
        try {
            const res = await api.post(`/commandes/${selectedCmd.id}/valider-etape`, {
                etape,
                preuve_id,
                action
            });
            showToast(res.message || "Opération réussie !", "success");
            loadDetails(selectedCmd.id);
        } catch (err) {
            showToast(err.message || 'Erreur lors de la validation', 'error');
        } finally {
            setValidatingEtape(null);
        }
    };

    const handleFileSelect = (e) => {
        const file = e.target.files?.[0];
        if (file && uploadingStatut) {
            changeStatut(uploadingStatut, file);
        }
    };

    // ── Soumission d'un avis ──
    const submitAvis = async () => {
        if (!selectedCmd) return;
        setAvisSubmitting(true);
        try {
            await api.post('/client-profil/avis', {
                commande_id: selectedCmd.id,
                client_id: user.id,
                tailleur_id: selectedCmd.tailleur_id,
                note: avisNote,
                commentaire: avisComment,
            });
            showToast('Merci pour votre avis ! ⭐', 'success');
            setAvisComment('');
            setAvisNote(5);
            loadDetails(selectedCmd.id);
        } catch (err) {
            showToast(err.message || 'Erreur lors de la soumission', 'error');
        } finally {
            setAvisSubmitting(false);
        }
    };

    // ══════════════════════════════════════════════════════
    // RENDU — Nouvelle commande
    // ══════════════════════════════════════════════════════
    if (isNew) {
        return (
            <div className="page-container">
                {/* ── Toast ── */}
                <ToastBanner toast={toast} onClose={() => setToast(null)} />
                <button className="page-back-btn" onClick={() => onNavigate?.('catalogue')}>← Retour</button>
                <div className="page-header"><h1>Nouvelle Commande</h1></div>

                <div className="new-commande-summary">
                    <div style={{ width: 60, height: 60, borderRadius: 8, background: 'rgba(42,31,24,0.1)', overflow: 'hidden', flexShrink: 0 }}>
                        {initModel.photo_url && <img src={api.getUploadUrl(initModel.photo_url)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                    </div>
                    <div>
                        <h3>{initModel.titre}</h3>
                        <p>Chez {initTailleur.nom_atelier}</p>
                    </div>
                </div>

                <div className="modele-detail">
                    <div className="new-commande-form">
                        {/* ── Choix du tissu ── */}
                        <div className="auth-field">
                            <label style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>🧵 Fourniture du tissu</label>
                            
                            {/* Option 1 : Client fournit son tissu */}
                            <div
                                onClick={() => setTissu('client_fournit')}
                                style={{
                                    padding: '14px 16px', borderRadius: 12, cursor: 'pointer', marginBottom: 8,
                                    border: tissu === 'client_fournit' ? '2px solid var(--color-accent-choco)' : '1px solid rgba(139,94,60,0.15)',
                                    background: tissu === 'client_fournit' ? 'rgba(139,94,60,0.06)' : 'rgba(255,255,255,0.8)',
                                    transition: 'all 0.25s',
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <div style={{
                                            width: 20, height: 20, borderRadius: '50%',
                                            border: tissu === 'client_fournit' ? '6px solid var(--color-accent-choco)' : '2px solid rgba(139,94,60,0.3)',
                                            transition: 'all 0.25s',
                                        }} />
                                        <span style={{ fontWeight: 600, fontSize: 14 }}>J'apporte mon propre tissu</span>
                                    </div>
                                    <strong style={{ color: 'var(--color-accent-choco)', fontSize: 16 }}>
                                        {prixConfection.toLocaleString()} FCFA
                                    </strong>
                                </div>
                                <div style={{ marginLeft: 30, fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>
                                    Prix de la confection uniquement
                                </div>
                            </div>

                            {/* Option 2 : Tailleur fournit le tissu */}
                            {hasTissu ? (
                                <div
                                    onClick={() => setTissu('tailleur_fournit')}
                                    style={{
                                        padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
                                        border: tissu === 'tailleur_fournit' ? '2px solid #16a34a' : '1px solid rgba(139,94,60,0.15)',
                                        background: tissu === 'tailleur_fournit' ? 'rgba(22,163,74,0.06)' : 'rgba(255,255,255,0.8)',
                                        transition: 'all 0.25s',
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <div style={{
                                                width: 20, height: 20, borderRadius: '50%',
                                                border: tissu === 'tailleur_fournit' ? '6px solid #16a34a' : '2px solid rgba(139,94,60,0.3)',
                                                transition: 'all 0.25s',
                                            }} />
                                            <span style={{ fontWeight: 600, fontSize: 14 }}>🧵 Le tailleur fournit le tissu</span>
                                        </div>
                                        <strong style={{ color: '#16a34a', fontSize: 16 }}>
                                            {(prixConfection + prixTissu).toLocaleString()} FCFA
                                        </strong>
                                    </div>
                                    <div style={{ marginLeft: 30, fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>
                                        Confection ({prixConfection.toLocaleString()}) + Tissu ({prixTissu.toLocaleString()})
                                    </div>
                                </div>
                            ) : (
                                <div style={{
                                    padding: '12px 16px', borderRadius: 12, fontSize: 13,
                                    background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
                                    color: '#b45309',
                                }}>
                                    ⚠️ Ce tailleur ne fournit pas de tissu pour ce modèle — apportez votre propre tissu.
                                </div>
                            )}
                        </div>

                        {/* Couleur (si tailleur fournit le tissu) */}
                        {tissu === 'tailleur_fournit' && (
                            <div className="auth-field">
                                <label>Couleur souhaitée</label>
                                <input value={couleur} onChange={e => setCouleur(e.target.value)} placeholder="Bleu, rouge..." />
                            </div>
                        )}
                        <div className="auth-field">
                            <label>Notes au tailleur</label>
                            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows="3" placeholder="Ajustements..." />
                        </div>
                    </div>

                    {/* Détail prix */}
                    <div style={{ background: 'rgba(139,94,60,0.04)', borderRadius: 12, padding: 16, margin: '12px 0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 14 }}>
                            <span>Confection</span>
                            <span>{prixConfection.toLocaleString()} FCFA</span>
                        </div>
                        {tissu === 'tailleur_fournit' && hasTissu && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 14, color: '#16a34a' }}>
                                <span>🧵 Tissu</span>
                                <span>+{prixTissu.toLocaleString()} FCFA</span>
                            </div>
                        )}
                        <div style={{ borderTop: '1px solid rgba(139,94,60,0.1)', paddingTop: 8, marginTop: 8 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 700 }}>
                                <span>Prix total</span>
                                <strong>{prixTotal.toLocaleString()} FCFA</strong>
                            </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--color-text-muted)', marginTop: 6 }}>
                            <span>Commission FITMOD (15%)</span>
                            <span>{commission.toLocaleString()} FCFA</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--color-text-muted)' }}>
                            <span>Part tailleur (85%)</span>
                            <span>{partTailleur.toLocaleString()} FCFA</span>
                        </div>
                    </div>

                    <div className="commande-actions">
                        <button className="page-btn page-btn-primary" onClick={createCommande} disabled={creating}>
                            {creating ? 'Création...' : `Confirmer — ${prixTotal.toLocaleString()} FCFA`}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ══════════════════════════════════════════════════════
    // RENDU — Détail commande
    // ══════════════════════════════════════════════════════
    if (selectedCmd) {
        const c = selectedCmd;
        const escrow = c.escrow || {};
        const paiement = escrow.paiement;
        const versements = escrow.versements || [];
        const preuves = escrow.preuves || [];
        const progression = escrow.progression || 0;
        const isPaid = paiement?.statut === 'valide';

        return (
            <div className="page-container">
                {/* ── Toast ── */}
                <ToastBanner toast={toast} onClose={() => setToast(null)} />

                <div className="commande-detail-header">
                    <button className="page-back-btn" onClick={() => { setSelectedCmd(null); loadCommandes(); }}>← Retour</button>
                    <h2>Commande #{c.id}</h2>
                </div>

                {/* ── Infos générales ── */}
                <div className="commande-detail-info">
                    <div className="cmd-info-row price">
                        <span>Prix Total</span>
                        <span>{Number(c.prix_total).toLocaleString()} FCFA</span>
                    </div>
                    <div className="cmd-info-row">
                        <span>Modèle</span><span>{c.modele_titre}</span>
                    </div>
                    <div className="cmd-info-row">
                        <span>Partenaire</span>
                        <span>{isTailleur ? `${c.client_nom} ${c.client_prenom}` : c.tailleur_nom}</span>
                    </div>
                    {c.mode_paiement && (
                        <div className="cmd-info-row">
                            <span>Mode paiement</span>
                            <span style={{ fontWeight: 600 }}>
                                {c.mode_paiement === 'par_etape' ? '📊 Par étape' : '💰 Après livraison'}
                            </span>
                        </div>
                    )}
                </div>

                {/* ── ESCROW — Barre de progression paiement ── */}
                {isPaid && (
                    <div style={{
                        background: 'rgba(139,94,60,0.04)', borderRadius: 14, padding: 16, margin: '12px 0',
                        border: '1px solid rgba(139,94,60,0.1)',
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                            <span style={{ fontWeight: 700, fontSize: 14 }}>💰 Fonds Escrow</span>
                            <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                                {progression}% libéré
                            </span>
                        </div>

                        {/* Barre progression */}
                        <div style={{
                            height: 10, borderRadius: 5,
                            background: 'rgba(139,94,60,0.1)', overflow: 'hidden', marginBottom: 10,
                        }}>
                            <div style={{
                                height: '100%', borderRadius: 5,
                                width: `${progression}%`,
                                background: progression === 100
                                    ? 'linear-gradient(90deg, #10b981, #14b8a6)'
                                    : 'linear-gradient(90deg, var(--color-accent-choco), var(--color-accent-caramel))',
                                transition: 'width 0.6s ease',
                            }} />
                        </div>

                        {/* Montants */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, fontSize: 12 }}>
                            <div style={{ textAlign: 'center', padding: 8, borderRadius: 8, background: 'rgba(16,185,129,0.08)' }}>
                                <div style={{ fontWeight: 700, color: '#10b981', fontSize: 15 }}>
                                    {Number(paiement.montant_libere || 0).toLocaleString()}
                                </div>
                                <div style={{ color: 'var(--color-text-muted)' }}>Libéré</div>
                            </div>
                            <div style={{ textAlign: 'center', padding: 8, borderRadius: 8, background: 'rgba(245,158,11,0.08)' }}>
                                <div style={{ fontWeight: 700, color: '#f59e0b', fontSize: 15 }}>
                                    {Number(paiement.montant_bloque || 0).toLocaleString()}
                                </div>
                                <div style={{ color: 'var(--color-text-muted)' }}>Bloqué</div>
                            </div>
                            <div style={{ textAlign: 'center', padding: 8, borderRadius: 8, background: 'rgba(139,94,60,0.06)' }}>
                                <div style={{ fontWeight: 700, fontSize: 15 }}>
                                    {Number(paiement.commission_fitmod || 0).toLocaleString()}
                                </div>
                                <div style={{ color: 'var(--color-text-muted)' }}>Commission</div>
                            </div>
                        </div>

                        {/* Historique versements */}
                        {versements.length > 0 && (
                            <div style={{ marginTop: 12 }}>
                                <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6 }}>📜 Versements</div>
                                {versements.map((v, i) => (
                                    <div key={i} style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        padding: '4px 8px', fontSize: 12, borderRadius: 6,
                                        background: i % 2 === 0 ? 'rgba(139,94,60,0.03)' : 'transparent',
                                    }}>
                                        <span>{STATUTS.find(s => s.value === v.etape)?.icon} {STATUTS.find(s => s.value === v.etape)?.label}</span>
                                        <span style={{ fontWeight: 600 }}>+{Number(v.montant).toLocaleString()} F ({v.pourcentage}%)</span>
                                        <span style={{ color: 'var(--color-text-muted)' }}>{new Date(v.date_versement).toLocaleDateString('fr-FR')}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ── Bouton payer (client, si pas encore payé) ── */}
                {!isTailleur && !isPaid && c.statut === 'acceptee' && (
                    <button
                        className="page-btn page-btn-primary"
                        style={{ width: '100%', margin: '12px 0', padding: 14, fontSize: 15 }}
                        onClick={() => setPaiementCmd(c)}
                    >
                        💳 Payer {Number(c.prix_total).toLocaleString()} FCFA
                    </button>
                )}

                {/* ── Timeline suivi ── */}
                <h3 className="section-title">Suivi (Timeline)</h3>
                <div className="timeline">
                    {STATUTS.filter(s => s.value !== 'annulee').map((st, idx, arr) => {
                        const histEntry = c.historique?.find(h => h.statut === st.value);
                        const isDone = !!histEntry;
                        const isCurrent = c.statut === st.value;
                        const isLast = idx === arr.length - 1;
                        const preuve = preuves.find(p => p.etape === st.value);

                        return (
                            <div key={st.value} className={`timeline-item ${isDone ? 'done' : ''} ${isCurrent ? 'current' : ''}`}>
                                <div className="timeline-dot">{st.icon}</div>
                                {!isLast && <div className={`timeline-line ${isDone && !isCurrent ? 'done' : ''}`} />}
                                <div className="timeline-content" style={{ flex: 1 }}>
                                    <span className="timeline-label" style={{
                                        fontWeight: isCurrent ? 'bold' : 'normal',
                                        color: isCurrent ? st.color : 'inherit',
                                    }}>
                                        {st.label}
                                        {st.pct && <span style={{ fontSize: 11, opacity: 0.6, marginLeft: 6 }}>({st.pct}%)</span>}
                                    </span>
                                    {isDone && histEntry.date && (
                                        <span className="timeline-date" style={{ marginLeft: 10, fontSize: 11, color: 'var(--color-text-muted)' }}>
                                            {new Date(histEntry.date).toLocaleString('fr-FR')}
                                        </span>
                                    )}
                                    {/* Photo preuve */}
                                    {preuve && (
                                        <div style={{ marginTop: 4 }}>
                                            <img src={api.getUploadUrl(preuve.photo_url)} alt="Preuve"
                                                style={{ width: 60, height: 60, borderRadius: 8, objectFit: 'cover', cursor: 'zoom-in' }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    console.log("Zooming image:", api.getUploadUrl(preuve.photo_url));
                                                    setZoomedImage(api.getUploadUrl(preuve.photo_url));
                                                }}
                                            />
                                            {preuve.commentaire && (
                                                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
                                                    {preuve.commentaire}
                                                </div>
                                            )}
                                            {!isTailleur && preuve.client_valide === 0 && ['couture_en_cours', 'finitions', 'pret_a_recuperer', 'livre'].includes(preuve.etape) && (
                                                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                                    <button
                                                        style={{ padding: '6px 12px', fontSize: 12, background: '#10b981', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                                                        onClick={() => validerEtape(preuve.etape, preuve.id, 'valider')}
                                                        disabled={validatingEtape === preuve.id}
                                                    >
                                                        {validatingEtape === preuve.id ? '⏳' : '✅'} Valider
                                                    </button>
                                                    <button
                                                        style={{ padding: '6px 12px', fontSize: 12, background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid currentColor', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                                                        onClick={() => { if(window.confirm('Refuser cette preuve de travail ?')) validerEtape(preuve.etape, preuve.id, 'rejeter'); }}
                                                        disabled={validatingEtape === preuve.id}
                                                    >
                                                        ❌ Rejeter
                                                    </button>
                                                </div>
                                            )}
                                            {isTailleur && preuve.client_valide === 0 && ['couture_en_cours', 'finitions', 'pret_a_recuperer', 'livre'].includes(preuve.etape) && (
                                                <div style={{ marginTop: 8, padding: '8px', fontSize: 11, background: 'rgba(245,158,11,0.1)', color: '#b45309', borderRadius: 6, fontWeight: 'bold' }}>
                                                    ⏳ En attente de la validation du client
                                                </div>
                                            )}
                                            {preuve.client_valide === 1 && (
                                                <div style={{ marginTop: 4, fontSize: 11, color: '#10b981', fontWeight: 'bold' }}>
                                                    ✅ Travail validé par le client
                                                </div>
                                            )}
                                            {preuve.client_valide === 2 && (
                                                <div style={{ marginTop: 4, fontSize: 11, color: '#ef4444', fontWeight: 'bold' }}>
                                                    ❌ Preuve rejetée par le client
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* ── Actions du tailleur ── */}
                {isTailleur && c.statut !== 'livre' && c.statut !== 'annulee' && (
                    <div className="commande-actions" style={{ flexWrap: 'wrap', gap: 8 }}>
                        {c.statut === 'en_attente_acceptation' && (
                            <>
                                <button className="page-btn page-btn-primary" style={{ backgroundColor: '#10b981' }}
                                    onClick={() => initiateStatusChange('acceptee')}>✅ Accepter</button>
                                <button className="page-btn" style={{ backgroundColor: '#ef4444', color: '#fff' }}
                                    onClick={() => changeStatut('annulee', null)}>❌ Refuser</button>
                            </>
                        )}
                        {c.statut === 'acceptee' && isPaid && (
                            <button className="page-btn page-btn-primary" onClick={() => initiateStatusChange('couture_en_cours')}>
                                🧵 Couture en cours (+45%)
                            </button>
                        )}
                        {c.statut === 'acceptee' && !isPaid && (
                            <div style={{ padding: 12, background: 'rgba(245,158,11,0.1)', borderRadius: 10, fontSize: 13, color: '#b45309' }}>
                                ⏳ En attente du paiement client avant de commencer
                            </div>
                        )}
                        {c.statut === 'couture_en_cours' && (
                            <button className="page-btn page-btn-primary" onClick={() => initiateStatusChange('finitions')}>
                                ✂️ Finitions (+25%)
                            </button>
                        )}
                        {c.statut === 'finitions' && (
                            <button className="page-btn page-btn-primary" onClick={() => initiateStatusChange('pret_a_recuperer')}>
                                📦 Prêt à récupérer (+15%)
                            </button>
                        )}
                        {c.statut === 'pret_a_recuperer' && (
                            <button className="page-btn page-btn-primary" style={{ backgroundColor: '#14b8a6' }}
                                onClick={() => initiateStatusChange('livre')}>
                                🎉 Marquer livré (+15%)
                            </button>
                        )}
                    </div>
                )}

                {/* ── Annulation (client) ── */}
                {!isTailleur && c.peut_annuler && c.statut !== 'annulee' && c.statut !== 'livre' && (
                    confirmCancel ? (
                        <div style={{
                            marginTop: 12, padding: 16, borderRadius: 12,
                            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                        }}>
                            <p style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: '#dc2626' }}>
                                Confirmer l'annulation de cette commande ?
                            </p>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button className="page-btn" style={{ background: '#ef4444', color: '#fff', borderColor: '#ef4444', flex: 1 }}
                                    onClick={() => { setConfirmCancel(false); changeStatut('annulee', null); }}>
                                    Oui, annuler
                                </button>
                                <button className="page-btn" onClick={() => setConfirmCancel(false)} style={{ flex: 1 }}>
                                    Non, garder
                                </button>
                            </div>
                        </div>
                    ) : (
                        <button className="page-btn" style={{
                            marginTop: 12, color: '#ef4444', borderColor: '#ef4444', width: '100%',
                        }} onClick={() => setConfirmCancel(true)}>
                            Annuler la commande
                        </button>
                    )
                )}

                {/* ── Avis — Commande livrée ── */}
                {c.statut === 'livre' && !isTailleur && (
                    c.avis ? (
                        /* Avis déjà laissé — affichage */
                        <div style={{
                            marginTop: 16, padding: 20, borderRadius: 16,
                            background: 'linear-gradient(135deg, rgba(245,158,11,0.08), rgba(139,94,60,0.04))',
                            border: '1px solid rgba(245,158,11,0.15)',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                <span style={{ fontSize: 18 }}>⭐</span>
                                <span style={{ fontWeight: 700, fontSize: 15 }}>Votre avis</span>
                                <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--color-text-muted)' }}>
                                    {new Date(c.avis.date_avis).toLocaleDateString('fr-FR')}
                                </span>
                            </div>
                            <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                                {[1, 2, 3, 4, 5].map(s => (
                                    <span key={s} style={{ fontSize: 22, color: s <= c.avis.note ? '#f59e0b' : 'rgba(0,0,0,0.1)' }}>★</span>
                                ))}
                                <span style={{ marginLeft: 8, fontWeight: 700, color: '#f59e0b' }}>{c.avis.note}/5</span>
                            </div>
                            {c.avis.commentaire && (
                                <p style={{ margin: 0, fontSize: 14, color: 'var(--color-text-main)', lineHeight: 1.5, fontStyle: 'italic' }}>
                                    « {c.avis.commentaire} »
                                </p>
                            )}
                        </div>
                    ) : (
                        /* Formulaire pour laisser un avis */
                        <div style={{
                            marginTop: 16, padding: 20, borderRadius: 16,
                            background: 'rgba(139,94,60,0.04)',
                            border: '1px solid rgba(139,94,60,0.1)',
                        }}>
                            <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700 }}>⭐ Laissez un avis</h3>
                            <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--color-text-muted)' }}>
                                Votre commande est livrée ! Partagez votre expérience avec {c.tailleur_nom}.
                            </p>

                            {/* Étoiles */}
                            <div style={{ display: 'flex', gap: 6, marginBottom: 14, alignItems: 'center' }}>
                                {[1, 2, 3, 4, 5].map(star => (
                                    <button
                                        key={star}
                                        type="button"
                                        onClick={() => setAvisNote(star)}
                                        style={{
                                            fontSize: 30, background: 'none', border: 'none', cursor: 'pointer',
                                            color: avisNote >= star ? '#f59e0b' : 'rgba(0,0,0,0.1)',
                                            transition: 'transform 0.15s, color 0.2s',
                                            transform: avisNote >= star ? 'scale(1.15)' : 'scale(1)',
                                            padding: 0,
                                        }}
                                    >
                                        ★
                                    </button>
                                ))}
                                <span style={{ marginLeft: 8, fontWeight: 700, fontSize: 16, color: '#f59e0b' }}>
                                    {avisNote}/5
                                </span>
                            </div>

                            {/* Commentaire */}
                            <textarea
                                value={avisComment}
                                onChange={e => setAvisComment(e.target.value)}
                                rows="3"
                                placeholder="La coupe est parfaite, le tissu de qualité..."
                                style={{
                                    width: '100%', borderRadius: 12, border: '1px solid rgba(139,94,60,0.15)',
                                    padding: 12, fontSize: 14, marginBottom: 12, resize: 'none',
                                    background: 'rgba(255,255,255,0.8)', outline: 'none',
                                    fontFamily: 'inherit',
                                }}
                            />

                            <button
                                className="page-btn page-btn-primary"
                                style={{ width: '100%', padding: 14, fontSize: 15 }}
                                onClick={submitAvis}
                                disabled={avisSubmitting || !avisComment.trim()}
                            >
                                {avisSubmitting ? 'Publication...' : '⭐ Publier mon avis'}
                            </button>
                        </div>
                    )
                )}

                {/* Avis affiché pour le tailleur aussi */}
                {c.statut === 'livre' && isTailleur && c.avis && (
                    <div style={{
                        marginTop: 16, padding: 20, borderRadius: 16,
                        background: 'linear-gradient(135deg, rgba(245,158,11,0.08), rgba(139,94,60,0.04))',
                        border: '1px solid rgba(245,158,11,0.15)',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                            <span style={{ fontSize: 18 }}>⭐</span>
                            <span style={{ fontWeight: 700, fontSize: 15 }}>Avis du client</span>
                        </div>
                        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                            {[1, 2, 3, 4, 5].map(s => (
                                <span key={s} style={{ fontSize: 22, color: s <= c.avis.note ? '#f59e0b' : 'rgba(0,0,0,0.1)' }}>★</span>
                            ))}
                            <span style={{ marginLeft: 8, fontWeight: 700, color: '#f59e0b' }}>{c.avis.note}/5</span>
                        </div>
                        {c.avis.commentaire && (
                            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, fontStyle: 'italic' }}>
                                « {c.avis.commentaire} »
                            </p>
                        )}
                    </div>
                )}
                {uploadingStatut && (
                    <div style={{
                        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
                    }}>
                        <div style={{
                            background: '#fff', borderRadius: 16, padding: 24, maxWidth: 400, width: '90%',
                            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
                        }}>
                            <h3 style={{ margin: '0 0 8px', fontSize: 18 }}>
                                📸 Photo preuve — {STATUTS.find(s => s.value === uploadingStatut)?.label}
                            </h3>
                            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 16px' }}>
                                Prenez une photo de l'avancement pour débloquer les fonds de cette étape.
                            </p>
                            <textarea
                                value={preuveComment}
                                onChange={e => setPreuveComment(e.target.value)}
                                placeholder="Commentaire (optionnel)..."
                                rows="2"
                                style={{
                                    width: '100%', borderRadius: 10, border: '1px solid rgba(139,94,60,0.2)',
                                    padding: 10, fontSize: 13, marginBottom: 12, resize: 'none',
                                }}
                            />
                            <input ref={fileInputRef} type="file" accept="image/*" capture="environment"
                                onChange={handleFileSelect} style={{ display: 'none' }} />

                            <div style={{ display: 'flex', gap: 8 }}>
                                <button className="page-btn page-btn-primary" style={{ flex: 1 }}
                                    onClick={() => fileInputRef.current?.click()}>
                                    📷 Choisir / Prendre photo
                                </button>
                                <button className="page-btn" onClick={() => setUploadingStatut(null)}>
                                    Annuler
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {paiementCmd && (
                    <PaiementModal commande={paiementCmd}
                        onClose={() => setPaiementCmd(null)}
                        onSuccess={() => { setPaiementCmd(null); loadDetails(c.id); }}
                    />
                )}
            {zoomedImage && createPortal(
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 999999,
                    display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 20
                }} onClick={() => setZoomedImage(null)}>
                    <button style={{
                        position: 'absolute', top: 20, right: 20,
                        background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff',
                        width: 40, height: 40, borderRadius: '50%', fontSize: 24, cursor: 'pointer',
                        display: 'flex', justifyContent: 'center', alignItems: 'center'
                    }} onClick={() => setZoomedImage(null)}>×</button>
                    <img src={zoomedImage} alt="Zoomed Preuve" style={{
                        maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8,
                        boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
                    }} onClick={e => e.stopPropagation()} />
                </div>,
                document.body
            )}
            </div>
        );
    }

    // ══════════════════════════════════════════════════════
    // RENDU — Liste des commandes
    // ══════════════════════════════════════════════════════
    return (
        <div className="page-container">
            <div className="page-header">
                <h1>Mes Commandes</h1>
                <p>Suivez l'avancement de vos confections</p>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-muted)' }}>Chargement...</div>
            ) : commandes.length === 0 ? (
                <div className="empty-state">
                    <h3>Aucune commande</h3>
                    <p>Parcourez le catalogue pour commander.</p>
                </div>
            ) : (
                <div className="commandes-list">
                    {commandes.map(c => {
                        const st = STATUTS.find(s => s.value === c.statut);
                        const isPaid = c.paiement_statut === 'valide';
                        const progression = c.montant_tailleur > 0
                            ? Math.round((parseFloat(c.montant_libere || 0) / parseFloat(c.montant_tailleur)) * 100)
                            : 0;

                        return (
                            <div key={c.id} className="commande-card" onClick={() => loadDetails(c.id)} style={{ cursor: 'pointer' }}>
                                <div className="commande-card-left">
                                    <h4>{c.modele_titre}</h4>
                                    <span className="commande-tailleur">
                                        {isTailleur ? `Client: ${c.client_nom} ${c.client_prenom}` : `Chez ${c.tailleur_nom}`}
                                    </span>
                                    <span className="commande-date">{new Date(c.date_commande).toLocaleDateString('fr-FR')}</span>
                                    {/* Mini barre progression */}
                                    {isPaid && (
                                        <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                                            <div style={{
                                                width: 60, height: 5, borderRadius: 3,
                                                background: 'rgba(139,94,60,0.1)', overflow: 'hidden',
                                            }}>
                                                <div style={{
                                                    height: '100%', width: `${progression}%`, borderRadius: 3,
                                                    background: progression === 100 ? '#10b981' : 'var(--color-accent-choco)',
                                                }} />
                                            </div>
                                            <span style={{ color: 'var(--color-text-muted)' }}>{progression}%</span>
                                        </div>
                                    )}
                                </div>
                                <div className="commande-card-right">
                                    <span className="commande-price">{Number(c.prix_total).toLocaleString()} F</span>
                                    <span className="commande-status-badge-sm" style={{ background: st?.color, color: '#fff' }}>
                                        {st?.icon} {st?.label}
                                    </span>
                                    {!isTailleur && c.statut === 'acceptee' && !isPaid && (
                                        <button className="page-btn page-btn-primary"
                                            style={{ marginTop: 6, padding: '6px 14px', fontSize: 12 }}
                                            onClick={(e) => { e.stopPropagation(); setPaiementCmd(c); }}>
                                            💳 Payer
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {paiementCmd && (
                <PaiementModal commande={paiementCmd}
                    onClose={() => setPaiementCmd(null)}
                    onSuccess={() => { setPaiementCmd(null); loadCommandes(); }}
                />
            )}
        </div>
    );
}// ──────────────────────────────────────────────────────────
// Composant Toast Banner
// ──────────────────────────────────────────────────────────
function ToastBanner({ toast, onClose }) {
    if (!toast) return null;

    const colors = {
        success: { bg: 'rgba(16,185,129,0.12)', border: '#10b981', icon: '✅', text: '#065f46' },
        error:   { bg: 'rgba(239,68,68,0.10)',  border: '#ef4444', icon: '❌', text: '#991b1b' },
        warn:    { bg: 'rgba(245,158,11,0.12)', border: '#f59e0b', icon: '⚠️', text: '#92400e' },
    };
    const c = colors[toast.type] || colors.success;

    return (
        <div style={{
            position: 'sticky', top: 0, zIndex: 999,
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '12px 16px', borderRadius: 12, marginBottom: 12,
            background: c.bg,
            border: `1px solid ${c.border}`,
            animation: 'slideDown 0.3s ease',
        }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>{c.icon}</span>
            <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: c.text }}>
                {toast.msg}
            </span>
            <button onClick={onClose} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 18, color: c.text, lineHeight: 1, padding: '0 4px',
            }}>×</button>
            <style>{`
                @keyframes slideDown {
                    from { opacity: 0; transform: translateY(-10px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
}
