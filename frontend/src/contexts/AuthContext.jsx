/**
 * FITMOD — AuthContext (Real API)
 * Gestion de l'état d'authentification connecté à l'API MySQL
 */
import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../utils/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    // Charger depuis localStorage au démarrage
    useEffect(() => {
        try {
            const saved = localStorage.getItem('fitmod_user');
            if (saved) setUser(JSON.parse(saved));
        } catch (e) { /* ignore */ }
        setIsLoading(false);
    }, []);

    const loginReal = async (credentials) => {
        try {
            const userData = await api.post('/auth/login', credentials);
            setUser(userData);
            localStorage.setItem('fitmod_user', JSON.stringify(userData));
            return { success: true };
        } catch (err) {
            return { error: err.message };
        }
    };

    const registerReal = async (profileData) => {
        try {
            const userData = await api.post('/auth/register', profileData);
            setUser(userData);
            localStorage.setItem('fitmod_user', JSON.stringify(userData));
            return { success: true };
        } catch (err) {
            return { error: err.message };
        }
    };

    const logout = () => {
        setUser(null);
        localStorage.removeItem('fitmod_user');
    };

    const updateProfile = (updates) => {
        const updated = { ...user, ...updates };
        setUser(updated);
        localStorage.setItem('fitmod_user', JSON.stringify(updated));
    };

    return (
        <AuthContext.Provider value={{ user, isLoading, login: loginReal, register: registerReal, logout, updateProfile }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth doit être dans AuthProvider');
    return ctx;
}
