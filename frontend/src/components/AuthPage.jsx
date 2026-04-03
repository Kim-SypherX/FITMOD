/**
 * FITMOD — AuthPage (Real API)
 */
import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import '../styles/AuthPage.css';

export default function AuthPage() {
    const { login, register, error, loading } = useAuth();
    const [mode, setMode] = useState('login'); // 'login' ou 'register'
    const [typeCompte, setTypeCompte] = useState('client');

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

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (mode === 'login') {
            await login({ email: formData.email, mot_de_passe: formData.mot_de_passe });
        } else {
            const dataToSubmit = {
                ...formData,
                type_compte: typeCompte
            };
            await register(dataToSubmit);
        }
    };

    return (
        <div className="auth-page">
            <div className="auth-card">
                <div className="auth-logo" style={{ fontSize: '48px', fontWeight: '800', textAlign: 'center', color: 'var(--color-accent-rust)', fontFamily: 'var(--font-heading)' }}>FITMOD</div>
                <h1 className="auth-title">
                    {mode === 'login' ? 'Connexion' : 'Créer un compte'}
                </h1>
                <p className="auth-subtitle">
                    {mode === 'login' ? 'Bienvenue sur la plateforme' : 'Rejoignez FITMOD'}
                </p>

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

                {error && <div className="auth-error">{error}</div>}

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
                        <div className="auth-demo-hint">
                            Pour tester : <br />
                            Client: <code>client@demo.com</code> / <code>123456</code><br />
                            Tailleur: <code>tailleur1@demo.com</code> / <code>123456</code><br />
                            Admin: <code>admin@demo.com</code> / <code>123456</code>
                        </div>
                    )}
                </form>
            </div>
        </div>
    );
}
