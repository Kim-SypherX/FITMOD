/**
 * FITMOD — AdminPage (Real API)
 */
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../utils/api';
import '../styles/Pages.css';

export default function AdminPage() {
    const { user } = useAuth();
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (user?.type_compte === 'admin') {
            loadStats();
        }
    }, [user]);

    const loadStats = async () => {
        try {
            const data = await api.get('/admin/dashboard');
            setStats(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
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

            {loading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-muted)' }}>Chargement des données...</div>
            ) : stats ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
                    <section>
                        <h3 className="section-title">Performances Clés</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
                            <div className="stat-card" style={{ background: 'var(--color-bg-card)', border: '3px solid var(--color-border)', borderRadius: '20px', padding: '24px', boxShadow: '6px 6px 0px var(--color-border)', textAlign: 'left' }}>
                                <span style={{ fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>Revenu Total F CFA</span>
                                <span style={{ display: 'block', fontSize: '36px', fontWeight: '800', color: 'var(--color-accent-rust)', fontFamily: 'var(--font-heading)' }}>{Number(stats.revenu_total).toLocaleString()}</span>
                            </div>
                            <div className="stat-card" style={{ background: 'var(--color-bg-card)', border: '3px solid var(--color-border)', borderRadius: '20px', padding: '24px', boxShadow: '6px 6px 0px var(--color-border)', textAlign: 'left' }}>
                                <span style={{ fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>Clients</span>
                                <span style={{ display: 'block', fontSize: '36px', fontWeight: '800', color: 'var(--color-accent-mustard)', fontFamily: 'var(--font-heading)' }}>{stats.total_clients}</span>
                            </div>
                            <div className="stat-card" style={{ background: 'var(--color-bg-card)', border: '3px solid var(--color-border)', borderRadius: '20px', padding: '24px', boxShadow: '6px 6px 0px var(--color-border)', textAlign: 'left' }}>
                                <span style={{ fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>Tailleurs</span>
                                <span style={{ display: 'block', fontSize: '36px', fontWeight: '800', color: 'var(--color-accent-olive)', fontFamily: 'var(--font-heading)' }}>{stats.total_tailleurs}</span>
                            </div>
                            <div className="stat-card" style={{ background: 'var(--color-bg-card)', border: '3px solid var(--color-border)', borderRadius: '20px', padding: '24px', boxShadow: '6px 6px 0px var(--color-border)', textAlign: 'left' }}>
                                <span style={{ fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>Commandes</span>
                                <span style={{ display: 'block', fontSize: '36px', fontWeight: '800', color: 'var(--color-text-main)', fontFamily: 'var(--font-heading)' }}>{stats.total_commandes}</span>
                            </div>
                        </div>
                    </section>

                    <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                        <div style={{ background: 'var(--color-bg-card)', border: '3px solid var(--color-border)', borderRadius: '20px', padding: '24px', boxShadow: '6px 6px 0px var(--color-border)' }}>
                            <h3 style={{ margin: '0 0 16px', fontFamily: 'var(--font-heading)' }}>Derniers Tailleurs Inscrits</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {stats.recent_tailleurs.map(t => (
                                    <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border-light)', paddingBottom: '8px' }}>
                                        <div>
                                            <strong style={{ display: 'block', color: 'var(--color-text-main)' }}>{t.nom_atelier}</strong>
                                            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{t.nom} {t.prenom} - {t.ville}</span>
                                        </div>
                                        <div>
                                            <span style={{ fontSize: '11px', background: 'var(--color-bg-base)', padding: '4px 8px', borderRadius: '10px', fontWeight: 'bold', display: 'inline-block', border: '2px solid var(--color-border)' }}>{new Date(t.date_creation).toLocaleDateString()}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div style={{ background: 'var(--color-bg-card)', border: '3px solid var(--color-border)', borderRadius: '20px', padding: '24px', boxShadow: '6px 6px 0px var(--color-border)' }}>
                            <h3 style={{ margin: '0 0 16px', fontFamily: 'var(--font-heading)' }}>Dernières Commandes</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {stats.recent_commandes.map(c => (
                                    <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border-light)', paddingBottom: '8px' }}>
                                        <div>
                                            <strong style={{ display: 'block', color: 'var(--color-text-main)' }}>Cmd #{c.id}</strong>
                                            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{Number(c.prix_total).toLocaleString()} F CFA</span>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <span style={{ fontSize: '11px', background: 'var(--color-accent-rust)', color: '#fff', padding: '4px 8px', borderRadius: '10px', fontWeight: 'bold', display: 'inline-block' }}>
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
        </div>
    );
}
