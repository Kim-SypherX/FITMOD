/**
 * FITMOD — AuthPage (Real API)
 */
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import '../styles/AuthPage.css';

export default function AuthPage({ onBackToLanding, initialResetToken }) {
    const { login, register, error, loading } = useAuth();
    const [mode, setMode] = useState(initialResetToken ? 'reset_password' : 'login'); // 'login', 'register', 'forgot_password', 'reset_password'
    const [typeCompte, setTypeCompte] = useState('client');
    const [localError, setLocalError] = useState('');
    const [localSuccess, setLocalSuccess] = useState('');

    const [formData, setFormData] = useState({
        email: '',
        mot_de_passe: '',
        nom: '',
        prenom: '',
        telephone: '',
        ville: 'Ouagadougou',
        sexe: 'homme', // profil client
        nom_atelier: '', // profil tailleur
        specialites: '', // profil tailleur
        quartier: ''    // profil tailleur
    });

    const [resetData, setResetData] = useState({ newPassword: '', confirmPassword: '' });

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLocalError('');
        setLocalSuccess('');
        
        if (mode === 'login') {
            await login({ email: formData.email, mot_de_passe: formData.mot_de_passe });
        } else if (mode === 'register') {
            const dataToSubmit = {
                ...formData,
                type_compte: typeCompte
            };
            await register(dataToSubmit);
        } else if (mode === 'forgot_password') {
            try {
                const res = await fetch('http://localhost:3001/api/auth/forgot-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: formData.email })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Erreur inconnue');
                setLocalSuccess(data.message);
            } catch (err) {
                setLocalError(err.message);
            }
        } else if (mode === 'reset_password') {
            if (resetData.newPassword !== resetData.confirmPassword) {
                setLocalError('Les mots de passe ne correspondent pas.');
                return;
            }
            try {
                const res = await fetch('http://localhost:3001/api/auth/reset-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: initialResetToken, newPassword: resetData.newPassword })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Erreur inconnue');
                setLocalSuccess(data.message);
                setTimeout(() => setMode('login'), 3000);
            } catch (err) {
                setLocalError(err.message);
            }
        }
    };

    return (
        <div className="auth-page">
            <div className="auth-card">
                <div className="auth-logo" style={{ fontSize: '48px', fontWeight: '800', textAlign: 'center', color: 'var(--color-accent-rust)', fontFamily: 'var(--font-heading)' }}>FITMOD</div>
                <h1 className="auth-title">
                    {mode === 'login' && 'Connexion'}
                    {mode === 'register' && 'Créer un compte'}
                    {mode === 'forgot_password' && 'Mot de passe oublié'}
                    {mode === 'reset_password' && 'Nouveau mot de passe'}
                </h1>
                <p className="auth-subtitle">
                    {mode === 'login' && 'Bienvenue sur la plateforme'}
                    {mode === 'register' && 'Rejoignez FITMOD'}
                    {mode === 'forgot_password' && 'Saisissez votre e-mail pour recevoir un lien'}
                    {mode === 'reset_password' && 'Choisissez un nouveau mot de passe'}
                </p>

                {(mode === 'login' || mode === 'register') && (
                    <div className="auth-toggle">
                        <button
                            className={`auth-toggle-btn ${mode === 'login' ? 'active' : ''}`}
                            onClick={() => setMode('login')}
                        >
                            Se connecter
                        </button>
                        <button
                            className={`auth-toggle-btn ${mode === 'register' ? 'active' : ''}`}
                            onClick={() => setMode('register')}
                        >
                            S'inscrire
                        </button>
                    </div>
                )}

                {(error || localError) && <div className="auth-error">{error || localError}</div>}
                {localSuccess && <div style={{ background: 'rgba(16,185,129,0.1)', color: '#059669', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '14px', textAlign: 'center' }}>{localSuccess}</div>}

                <form className="auth-form" onSubmit={handleSubmit}>
                    {mode === 'register' && (
                        <>
                            <div className="auth-type-selector">
                                <button
                                    type="button"
                                    className={`auth-type-btn ${typeCompte === 'client' ? 'active' : ''}`}
                                    onClick={() => setTypeCompte('client')}
                                >
                                    Client
                                </button>
                                <button
                                    type="button"
                                    className={`auth-type-btn ${typeCompte === 'tailleur' ? 'active' : ''}`}
                                    onClick={() => setTypeCompte('tailleur')}
                                >
                                    Tailleur
                                </button>
                            </div>

                            <div className="auth-row">
                                <div className="auth-field">
                                    <label>Nom</label>
                                    <input type="text" name="nom" value={formData.nom} onChange={handleChange} required />
                                </div>
                                <div className="auth-field">
                                    <label>Prénom</label>
                                    <input type="text" name="prenom" value={formData.prenom} onChange={handleChange} required />
                                </div>
                            </div>

                            <div className="auth-field">
                                <label>Téléphone</label>
                                <input type="tel" name="telephone" value={formData.telephone} onChange={handleChange} required />
                            </div>

                            <div className="auth-row">
                                <div className="auth-field">
                                    <label>Ville</label>
                                    <select name="ville" value={formData.ville} onChange={handleChange}>
                                        <option value="Ouagadougou">Ouagadougou</option>
                                        <option value="Bobo-Dioulasso">Bobo-Dioulasso</option>
                                        <option value="Koudougou">Koudougou</option>
                                    </select>
                                </div>
                                {typeCompte === 'client' && (
                                    <div className="auth-field">
                                        <label>Sexe</label>
                                        <select name="sexe" value={formData.sexe} onChange={handleChange}>
                                            <option value="homme">Homme</option>
                                            <option value="femme">Femme</option>
                                        </select>
                                    </div>
                                )}
                            </div>

                            {typeCompte === 'tailleur' && (
                                <div className="auth-tailleur-fields">
                                    <div className="auth-field">
                                        <label>Nom de l'atelier</label>
                                        <input type="text" name="nom_atelier" value={formData.nom_atelier} onChange={handleChange} required />
                                    </div>
                                    <div className="auth-field">
                                        <label>Quartier</label>
                                        <input type="text" name="quartier" value={formData.quartier} onChange={handleChange} required />
                                    </div>
                                    <div className="auth-field">
                                        <label>Spécialités (séparées par des virgules)</label>
                                        <input type="text" name="specialites" value={formData.specialites} onChange={handleChange} placeholder="Boubou, Robe basin, Costume..." required />
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {mode === 'forgot_password' && (
                        <>
                            <div className="auth-field">
                                <label>Email</label>
                                <input type="email" name="email" value={formData.email} onChange={handleChange} required />
                            </div>
                            <button type="submit" className="auth-submit" style={{ marginTop: 16 }}>
                                Envoyer le lien
                            </button>
                            <div style={{ textAlign: 'center', marginTop: 16 }}>
                                <button type="button" onClick={() => setMode('login')} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: 13 }}>
                                    ← Retour à la connexion
                                </button>
                            </div>
                        </>
                    )}

                    {mode === 'reset_password' && (
                        <>
                            <div className="auth-field">
                                <label>Nouveau mot de passe</label>
                                <input type="password" value={resetData.newPassword} onChange={e => setResetData({...resetData, newPassword: e.target.value})} required />
                            </div>
                            <div className="auth-field">
                                <label>Confirmer le mot de passe</label>
                                <input type="password" value={resetData.confirmPassword} onChange={e => setResetData({...resetData, confirmPassword: e.target.value})} required />
                            </div>
                            <button type="submit" className="auth-submit" style={{ marginTop: 16 }}>
                                Enregistrer
                            </button>
                        </>
                    )}

                    {(mode === 'login' || mode === 'register') && (
                        <>
                            <div className="auth-field">
                                <label>Email</label>
                                <input type="email" name="email" value={formData.email} onChange={handleChange} required />
                            </div>

                            <div className="auth-field">
                                <label>Mot de passe</label>
                                <input type="password" name="mot_de_passe" value={formData.mot_de_passe} onChange={handleChange} required />
                            </div>

                            <button type="submit" className="auth-submit" disabled={loading}>
                                {loading ? 'Patientez...' : mode === 'login' ? 'Connexion' : 'Créer le compte'}
                            </button>

                            {mode === 'login' && (
                                <div style={{ textAlign: 'center', marginTop: 16 }}>
                                    <button type="button" onClick={() => setMode('forgot_password')} style={{ background: 'none', border: 'none', color: '#d97706', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                                        Mot de passe oublié ?
                                    </button>
                                </div>
                            )}

                            {mode === 'login' && (
                                <div className="auth-demo-hint">
                                    Pour tester : <br />
                                    Client: <code>client@demo.com</code> / <code>123456</code><br />
                                    Tailleur: <code>tailleur1@demo.com</code> / <code>123456</code><br />
                                    Admin: <code>admin@demo.com</code> / <code>123456</code>
                                </div>
                            )}
                        </>
                    )}
                </form>
            </div>
        </div>
    );
}
