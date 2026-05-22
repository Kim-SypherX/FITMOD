/**
 * FITMOD — PaiementModal
 * Modal de paiement LigdiCash — Flux OTP en 3 étapes
 * Étape 1 : Choix opérateur + numéro de téléphone
 * Étape 2 : Saisie code OTP
 * Étape 3 : Confirmation (succès / échec)
 */
import React, { useState, useEffect, useRef } from 'react';
import { FiX, FiSmartphone, FiCheck, FiAlertCircle, FiClock, FiRefreshCw, FiLock } from 'react-icons/fi';
import '../styles/PaiementModal.css';

const API_BASE = 'http://localhost:3001/api';

const OPERATEURS = [
    {
        id: 'orange',
        nom: 'Orange Money',
        color: '#FF6600',
        bg: '#FFF3E8',
        logo: '🟠',
        prefix: '07',
    },
    {
        id: 'ligdicash',
        nom: 'Wallet LigdiCash',
        color: '#2563EB',
        bg: '#EEF2FF',
        logo: '💳',
        prefix: 'tous',
    },
];

const OTP_TIMER = 5 * 60; // 5 minutes en secondes

export default function PaiementModal({ commande, onClose, onSuccess }) {
    const [etape, setEtape] = useState(1); // 1, 2, 3
    const [operateur, setOperateur] = useState('orange');
    const [telephone, setTelephone] = useState('');
    const [otp, setOtp] = useState(['', '', '', '', '', '']);
    const [loading, setLoading] = useState(false);
    const [erreur, setErreur] = useState('');
    const [succes, setSucces] = useState(false);
    const [transactionId, setTransactionId] = useState('');
    const [timer, setTimer] = useState(OTP_TIMER);
    const [timerActif, setTimerActif] = useState(false);
    const otpRefs = useRef([]);
    const timerRef = useRef(null);

    useEffect(() => {
        if (timerActif && timer > 0) {
            timerRef.current = setInterval(() => {
                setTimer(t => {
                    if (t <= 1) { clearInterval(timerRef.current); setTimerActif(false); return 0; }
                    return t - 1;
                });
            }, 1000);
        }
        return () => clearInterval(timerRef.current);
    }, [timerActif]);

    const formatTimer = (s) => {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m}:${sec.toString().padStart(2, '0')}`;
    };

    const montant = commande?.prix_total || 0;
    const commandeId = commande?.id;

    // ─── Étape 1 → 2 : Envoyer l'OTP ─────────────────────────
    const envoyerOTP = async () => {
        setErreur('');
        if (!telephone || telephone.length < 8) {
            setErreur('Veuillez saisir un numéro valide (ex: 70 00 00 00)');
            return;
        }

        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/paiement/initier`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    commande_id: commandeId,
                    telephone: telephone.replace(/\s/g, ''),
                    montant,
                    operateur,
                }),
            });
            const data = await res.json();

            if (!res.ok) {
                setErreur(data.error || 'Erreur lors de l\'envoi de l\'OTP');
                return;
            }

            setEtape(2);
            setTimer(OTP_TIMER);
            setTimerActif(true);
            setTimeout(() => otpRefs.current[0]?.focus(), 300);
        } catch {
            setErreur('Impossible de contacter le serveur de paiement');
        } finally {
            setLoading(false);
        }
    };

    // ─── Gestion saisie OTP ───────────────────────────────────
    const handleOtpChange = (index, value) => {
        if (!/^\d*$/.test(value)) return;
        const newOtp = [...otp];
        newOtp[index] = value.slice(-1); // 1 seul chiffre
        setOtp(newOtp);
        if (value && index < 5) {
            otpRefs.current[index + 1]?.focus();
        }
    };

    const handleOtpKeyDown = (index, e) => {
        if (e.key === 'Backspace' && !otp[index] && index > 0) {
            otpRefs.current[index - 1]?.focus();
        }
    };

    const handleOtpPaste = (e) => {
        const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
        if (text.length === 6) {
            setOtp(text.split(''));
            otpRefs.current[5]?.focus();
        }
    };

    // ─── Étape 2 → 3 : Valider l'OTP ─────────────────────────
    const validerPaiement = async () => {
        const otpCode = otp.join('');
        if (otpCode.length < 6) {
            setErreur('Veuillez saisir les 6 chiffres du code OTP');
            return;
        }

        setErreur('');
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/paiement/valider`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    commande_id: commandeId,
                    otp: otpCode,
                    telephone: telephone.replace(/\s/g, ''),
                    montant,
                }),
            });
            const data = await res.json();

            setEtape(3);
            clearInterval(timerRef.current);
            setTimerActif(false);

            if (res.ok && data.success) {
                setSucces(true);
                setTransactionId(data.transaction_id || '');
                onSuccess?.({ transaction_id: data.transaction_id, commande_id: commandeId });
            } else {
                setSucces(false);
                setErreur(data.message || 'Paiement refusé. Vérifiez votre OTP et votre solde.');
            }
        } catch {
            setEtape(3);
            setSucces(false);
            setErreur('Erreur de connexion. Réessayez.');
        } finally {
            setLoading(false);
        }
    };

    const renvoyerOTP = () => {
        setOtp(['', '', '', '', '', '']);
        setErreur('');
        setEtape(1);
        clearInterval(timerRef.current);
    };

    return (
        <div className="pm-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="pm-modal">

                {/* ── Header ── */}
                <div className="pm-header">
                    <div className="pm-header-left">
                        <div className="pm-lock-icon"><FiLock /></div>
                        <div>
                            <h2 className="pm-title">Paiement sécurisé</h2>
                            <p className="pm-subtitle">via LigdiCash Mobile Money</p>
                        </div>
                    </div>
                    <button className="pm-close" onClick={onClose}><FiX /></button>
                </div>

                {/* ── Steps Indicator ── */}
                <div className="pm-steps">
                    {['Numéro', 'Code OTP', 'Confirmation'].map((s, i) => (
                        <React.Fragment key={i}>
                            <div className={`pm-step ${etape > i + 1 ? 'done' : ''} ${etape === i + 1 ? 'active' : ''}`}>
                                <div className="pm-step-dot">
                                    {etape > i + 1 ? <FiCheck /> : i + 1}
                                </div>
                                <span>{s}</span>
                            </div>
                            {i < 2 && <div className={`pm-step-line ${etape > i + 1 ? 'done' : ''}`} />}
                        </React.Fragment>
                    ))}
                </div>

                {/* ── Résumé montant ── */}
                <div className="pm-amount-bar">
                    <span className="pm-amount-label">Total à payer</span>
                    <span className="pm-amount-value">{Number(montant).toLocaleString('fr-FR')} FCFA</span>
                </div>

                {/* ════ ÉTAPE 1 : Téléphone ════ */}
                {etape === 1 && (
                    <div className="pm-body">
                        <p className="pm-intro">Choisissez votre opérateur et saisissez votre numéro de téléphone pour recevoir le code de validation.</p>

                        {/* Choix opérateur */}
                        <div className="pm-operators">
                            {OPERATEURS.map(op => (
                                <button
                                    key={op.id}
                                    className={`pm-operator-btn ${operateur === op.id ? 'selected' : ''}`}
                                    style={operateur === op.id ? { borderColor: op.color, background: op.bg } : {}}
                                    onClick={() => setOperateur(op.id)}
                                >
                                    <span className="pm-op-logo">{op.logo}</span>
                                    <span className="pm-op-name">{op.nom}</span>
                                    {operateur === op.id && <div className="pm-op-check" style={{ background: op.color }}><FiCheck /></div>}
                                </button>
                            ))}
                        </div>

                        {/* Saisie téléphone */}
                        <div className="pm-field">
                            <label>Numéro de téléphone</label>
                            <div className="pm-phone-input">
                                <span className="pm-phone-prefix">🇧🇫 +226</span>
                                <input
                                    type="tel"
                                    placeholder="07 00 00 00"
                                    value={telephone}
                                    onChange={e => setTelephone(e.target.value.replace(/[^\d\s]/g, ''))}
                                    maxLength={10}
                                    onKeyDown={e => e.key === 'Enter' && envoyerOTP()}
                                />
                            </div>
                        </div>

                        {erreur && <div className="pm-error"><FiAlertCircle /> {erreur}</div>}

                        <button
                            className="pm-btn-primary"
                            onClick={envoyerOTP}
                            disabled={loading}
                        >
                            {loading ? <span className="pm-spinner" /> : <FiSmartphone />}
                            {loading ? 'Envoi en cours...' : 'Recevoir le code OTP'}
                        </button>

                        <p className="pm-secure-note"><FiLock /> Paiement sécurisé — Vos données sont chiffrées</p>
                    </div>
                )}

                {/* ════ ÉTAPE 2 : OTP ════ */}
                {etape === 2 && (
                    <div className="pm-body">
                        <div className="pm-otp-header">
                            <div className="pm-otp-icon">📱</div>
                            <p>Code envoyé au <strong>+226 {telephone}</strong></p>
                            <p className="pm-otp-hint">Saisissez le code à 6 chiffres reçu par SMS</p>
                        </div>

                        {/* Champs OTP */}
                        <div className="pm-otp-grid" onPaste={handleOtpPaste}>
                            {otp.map((digit, i) => (
                                <input
                                    key={i}
                                    ref={el => otpRefs.current[i] = el}
                                    className={`pm-otp-input ${digit ? 'filled' : ''}`}
                                    type="text"
                                    inputMode="numeric"
                                    maxLength={1}
                                    value={digit}
                                    onChange={e => handleOtpChange(i, e.target.value)}
                                    onKeyDown={e => handleOtpKeyDown(i, e)}
                                />
                            ))}
                        </div>

                        {/* Timer */}
                        <div className={`pm-timer ${timer === 0 ? 'expired' : ''}`}>
                            <FiClock />
                            {timer > 0
                                ? `Code valide encore ${formatTimer(timer)}`
                                : 'Code expiré'}
                        </div>

                        {erreur && <div className="pm-error"><FiAlertCircle /> {erreur}</div>}

                        <button
                            className="pm-btn-primary"
                            onClick={validerPaiement}
                            disabled={loading || otp.join('').length < 6}
                        >
                            {loading ? <span className="pm-spinner" /> : <FiCheck />}
                            {loading ? 'Validation...' : 'Valider le paiement'}
                        </button>

                        <button className="pm-btn-ghost" onClick={renvoyerOTP}>
                            <FiRefreshCw /> Renvoyer le code
                        </button>
                    </div>
                )}

                {/* ════ ÉTAPE 3 : Confirmation ════ */}
                {etape === 3 && (
                    <div className="pm-body pm-result">
                        {succes ? (
                            <>
                                <div className="pm-success-anim">
                                    <div className="pm-success-circle">
                                        <FiCheck />
                                    </div>
                                </div>
                                <h3 className="pm-result-title success">Paiement réussi !</h3>
                                <p className="pm-result-desc">
                                    Votre commande a été confirmée. Le tailleur va commencer la confection.
                                </p>
                                {transactionId && (
                                    <div className="pm-txn-id">
                                        <span>Réf. transaction</span>
                                        <code>{transactionId}</code>
                                    </div>
                                )}
                                <button className="pm-btn-primary" onClick={onClose}>
                                    <FiCheck /> Voir ma commande
                                </button>
                            </>
                        ) : (
                            <>
                                <div className="pm-fail-anim">
                                    <div className="pm-fail-circle">
                                        <FiAlertCircle />
                                    </div>
                                </div>
                                <h3 className="pm-result-title fail">Paiement échoué</h3>
                                <p className="pm-result-desc">{erreur || 'Le paiement n\'a pas pu être traité.'}</p>
                                <button className="pm-btn-primary" onClick={renvoyerOTP}>
                                    <FiRefreshCw /> Réessayer
                                </button>
                                <button className="pm-btn-ghost" onClick={onClose}>
                                    Annuler
                                </button>
                            </>
                        )}
                    </div>
                )}

            </div>
        </div>
    );
}
