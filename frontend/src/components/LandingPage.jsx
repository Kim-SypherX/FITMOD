/**
 * FITMOD — Landing Page Publique (Page Vitrine)
 * La première impression qui donne envie de s'inscrire !
 */
import React, { useState, useEffect, useRef } from 'react';
import { FiSearch, FiStar, FiMapPin, FiArrowRight, FiCamera, FiMessageCircle, FiTruck, FiCpu, FiCheck, FiPlay, FiChevronRight, FiUser, FiShield, FiZap, FiList, FiTrendingUp } from 'react-icons/fi';
import api from '../utils/api';
import '../styles/LandingPage.css';

const API_BASE = 'http://localhost:3001/api';

const CATEGORIES = [
    { label: 'Boubou', img: '/images/categories/boubou.png', spec: 'boubou' },
    { label: 'Robe', img: '/images/categories/robe.png', spec: 'robe' },
    { label: 'Costume', img: '/images/categories/costume.png', spec: 'costume' },
    { label: 'Pagne', img: '/images/categories/pagne.png', spec: 'pagne' },
    { label: 'Caftan', img: '/images/categories/caftan.png', spec: 'caftan' },
    { label: 'Chemise', img: '/images/categories/chemise.png', spec: 'chemise' },
    { label: 'Tenue de fête', img: '/images/categories/tenue-fete.png', spec: 'tenue de fête' },
];

export default function LandingPage({ onGoToAuth, onNavigate }) {
    const [tailleurs, setTailleurs] = useState([]);
    const [modeles, setModeles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [visibleSections, setVisibleSections] = useState(new Set());
    const observerRef = useRef(null);

    // Charger les données publiques
    useEffect(() => {
        loadPublicData();
        setupScrollAnimations();
        return () => observerRef.current?.disconnect();
    }, []);

    const loadPublicData = async () => {
        try {
            const [tRes, mRes] = await Promise.all([
                fetch(`${API_BASE}/tailleurs`).then(r => r.json()).catch(() => []),
                fetch(`${API_BASE}/tailleurs/modeles/all`).then(r => r.json()).catch(() => [])
            ]);
            setTailleurs(Array.isArray(tRes) ? tRes : []);
            setModeles(Array.isArray(mRes) ? mRes : []);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    const setupScrollAnimations = () => {
        observerRef.current = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    setVisibleSections(prev => new Set([...prev, entry.target.dataset.section]));
                }
            });
        }, { threshold: 0.15 });

        setTimeout(() => {
            document.querySelectorAll('[data-section]').forEach(el => {
                observerRef.current?.observe(el);
            });
        }, 100);
    };

    const isVisible = (name) => visibleSections.has(name);

    const renderStars = (note) => {
        const n = Number(note) || 0;
        return Array.from({ length: 5 }, (_, i) => (
            <FiStar key={i} className={`lp-star ${i < Math.round(n) ? 'filled' : ''}`} />
        ));
    };

    return (
        <div className="landing-page">

            {/* ══ NAVBAR ══ */}
            <nav className="lp-nav">
                <div className="lp-nav-inner">
                    <span className="lp-logo">FITMOD</span>
                    <div className="lp-nav-links">
                        <button onClick={() => onNavigate?.('catalogue')} style={{background:'transparent', border:'none', color:'#fff', cursor:'pointer', fontSize:'14px', fontWeight:'600'}}>Catalogue</button>
                        <a href="#features">Fonctionnalités</a>
                        <a href="#tailleurs">Tailleurs</a>
                        <a href="#contact">Contact</a>
                    </div>
                    <div className="lp-nav-actions">
                        <button className="lp-nav-login" onClick={() => onGoToAuth?.('login')}>Connexion</button>
                        <button className="lp-nav-register" onClick={() => onGoToAuth?.('register')}>Créer un compte</button>
                    </div>
                </div>
            </nav>

            {/* ══ HERO ══ */}
            <section className="lp-hero">
                <div className="lp-hero-bg">
                    <div className="hero-orb orb1"></div>
                    <div className="hero-orb orb2"></div>
                    <div className="hero-orb orb3"></div>
                    <div className="hero-pattern"></div>
                </div>
                <div className="lp-hero-content">
                    <div className="lp-hero-left">
                        <div className="hero-chip">
                            <span className="chip-dot"></span>
                            Plateforme de couture N°1 au Burkina Faso
                        </div>
                        <h1 className="lp-hero-title">
                            Votre <span className="title-accent">Style</span>,
                            <br />Votre <span className="title-accent">Tailleur</span>,
                            <br />En un <span className="title-highlight">Clic</span>.
                        </h1>
                        <p className="lp-hero-desc">
                            Découvrez les meilleurs tailleurs du Burkina Faso. Prenez vos mesures par IA,
                            essayez virtuellement et commandez en ligne.
                        </p>
                        <div className="lp-hero-cta">
                            <button className="cta-primary" onClick={() => onGoToAuth?.('register')}>
                                Commencer gratuitement <FiArrowRight />
                            </button>
                            <button className="cta-secondary">
                                <div className="play-circle"><FiPlay /></div>
                                Voir la démo
                            </button>
                        </div>
                        <div className="lp-hero-trust">
                            <div className="trust-avatars">
                                <div className="trust-av" style={{background: '#C68B59'}}>K</div>
                                <div className="trust-av" style={{background: '#8B5E3C'}}>A</div>
                                <div className="trust-av" style={{background: '#D4A76A'}}>S</div>
                                <div className="trust-av" style={{background: '#a0765a'}}>M</div>
                            </div>
                            <div className="trust-text">
                                <strong>500+ utilisateurs</strong>
                                <span>font déjà confiance à FITMOD</span>
                            </div>
                        </div>
                    </div>
                    <div className="lp-hero-right">
                        <div className="hero-card-stack">
                            <div className="hero-showcase-card sc1">
                                <div className="sc-icon"><FiCamera /></div>
                                <div className="sc-text">
                                    <strong>Mesures IA</strong>
                                    <span>Webcam + MediaPipe</span>
                                </div>
                            </div>
                            <div className="hero-showcase-card sc2">
                                <div className="sc-icon"><FiCpu /></div>
                                <div className="sc-text">
                                    <strong>Essayage Virtuel</strong>
                                    <span>Cabine 3D temps réel</span>
                                </div>
                            </div>
                            <div className="hero-showcase-card sc3">
                                <div className="sc-icon"><FiMessageCircle /></div>
                                <div className="sc-text">
                                    <strong>Chat en Direct</strong>
                                    <span>Texte & Vocal</span>
                                </div>
                            </div>
                            <div className="hero-big-circle"></div>
                            <div className="hero-small-circle"></div>
                        </div>
                    </div>
                </div>

                {/* Stats bar */}
                <div className="lp-stats-bar">
                    <div className="lp-stat">
                        <strong>{tailleurs.length || '50'}+</strong>
                        <span>Tailleurs vérifiés</span>
                    </div>
                    <div className="lp-stat-sep"></div>
                    <div className="lp-stat">
                        <strong>{modeles.length || '200'}+</strong>
                        <span>Modèles disponibles</span>
                    </div>
                    <div className="lp-stat-sep"></div>
                    <div className="lp-stat">
                        <strong>6+</strong>
                        <span>Villes couvertes</span>
                    </div>
                    <div className="lp-stat-sep"></div>
                    <div className="lp-stat">
                        <strong>4.8</strong>
                        <span>Note moyenne</span>
                    </div>
                </div>
            </section>

            {/* ══ CATEGORIES ══ */}
            <section className={`lp-section lp-categories ${isVisible('cats') ? 'visible' : ''}`} data-section="cats" id="catalogue">
                <h2 className="lp-section-title">Que cherchez-vous ?</h2>
                <p className="lp-section-sub">Explorez nos spécialités de couture africaine</p>
                <div className="lp-cats-grid">
                    {CATEGORIES.map(cat => (
                        <div key={cat.spec} className="lp-cat-item" onClick={() => onNavigate?.('catalogue', { category: cat.spec, from: 'landing' })}>
                            <div className="lp-cat-circle">
                                <img src={cat.img} alt={cat.label} />
                            </div>
                            <span>{cat.label}</span>
                        </div>
                    ))}
                </div>
            </section>

            {/* ══ FEATURES ══ */}
            <section className={`lp-section lp-features ${isVisible('features') ? 'visible' : ''}`} data-section="features" id="features">
                <div className="lp-features-header">
                    <span className="lp-pill"><FiZap /> Fonctionnalités</span>
                    <h2 className="lp-section-title">Pourquoi choisir FITMOD ?</h2>
                    <p className="lp-section-sub">Une expérience de couture révolutionnaire, propulsée par l'intelligence artificielle</p>
                </div>
                <div className="lp-features-grid">
                    <div className="lp-feature-card">
                        <div className="feat-img-wrap">
                            <img src="/images/features/mesures-ia.png" alt="Mesures par IA" />
                        </div>
                        <h3>Mesures par IA</h3>
                        <p>Prenez vos mensurations en 30 secondes avec votre webcam grâce à MediaPipe. Plus besoin de mètre-ruban !</p>
                        <div className="feat-tag">Intelligence Artificielle</div>
                    </div>
                    <div className="lp-feature-card">
                        <div className="feat-img-wrap">
                            <img src="/images/features/essayage-virtuel.png" alt="Essayage Virtuel" />
                        </div>
                        <h3>Essayage Virtuel</h3>
                        <p>Visualisez les vêtements sur votre corps en temps réel grâce à notre cabine d'essayage 3D.</p>
                        <div className="feat-tag">Réalité Augmentée</div>
                    </div>
                    <div className="lp-feature-card">
                        <div className="feat-img-wrap">
                            <img src="/images/features/chat-direct.png" alt="Chat en Direct" />
                        </div>
                        <h3>Chat en Direct</h3>
                        <p>Discutez avec votre tailleur en temps réel. Envoyez des messages texte ou vocaux.</p>
                        <div className="feat-tag">Temps réel</div>
                    </div>
                    <div className="lp-feature-card">
                        <div className="feat-img-wrap">
                            <img src="/images/features/geolocalisation.png" alt="Géolocalisation" />
                        </div>
                        <h3>Géolocalisation</h3>
                        <p>Trouvez les tailleurs les plus proches de chez vous. Filtrez par ville et par distance.</p>
                        <div className="feat-tag">GPS</div>
                    </div>
                    <div className="lp-feature-card">
                        <div className="feat-img-wrap">
                            <img src="/images/features/paiement.png" alt="Paiement Sécurisé" />
                        </div>
                        <h3>Paiement Sécurisé</h3>
                        <p>Commandez en toute confiance. Suivi complet de votre commande étape par étape.</p>
                        <div className="feat-tag">Sécurité</div>
                    </div>
                    <div className="lp-feature-card">
                        <div className="feat-img-wrap">
                            <img src="/images/features/paiement.png" alt="Livraison Rapide" />
                        </div>
                        <h3>Livraison Rapide</h3>
                        <p>Récupérez votre tenue dans les délais. Disponible dans 6+ villes du Burkina.</p>
                        <div className="feat-tag">Livraison</div>
                    </div>
                </div>
            </section>

            {/* ══ TAILLEURS VEDETTES ══ */}
            <section className={`lp-section lp-tailleurs-section ${isVisible('tailleurs') ? 'visible' : ''}`} data-section="tailleurs" id="tailleurs">
                <span className="lp-pill"><FiStar /> Top Tailleurs</span>
                <h2 className="lp-section-title">Nos Artisans d'Excellence</h2>
                <p className="lp-section-sub">Des tailleurs vérifiés et notés par la communauté</p>

                {tailleurs.length > 0 ? (
                    <div className="lp-tailleurs-grid">
                        {tailleurs.slice(0, 6).map(t => (
                            <div key={t.id} className="lp-tailleur-card" onClick={() => onNavigate?.('catalogue', { tailleur: t, from: 'landing' })}>
                                <div className="lpt-avatar">{t.nom_atelier?.charAt(0).toUpperCase()}</div>
                                <h4 className="lpt-name">{t.nom_atelier}</h4>
                                <div className="lpt-location"><FiMapPin /> {t.ville || 'Burkina Faso'}</div>
                                <div className="lpt-stars">{renderStars(t.note_moyenne)} <span className="lpt-note">{t.note_moyenne || '—'}</span></div>
                                <div className="lpt-specs">
                                    {t.specialites?.split(',').slice(0, 3).map((s, i) => (
                                        <span key={i} className="lpt-spec">{s.trim()}</span>
                                    ))}
                                </div>
                                <button className="lpt-btn" onClick={(e) => { e.stopPropagation(); onNavigate?.('catalogue', { tailleur: t, from: 'landing' }); }}>
                                    Voir le profil <FiChevronRight />
                                </button>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="lp-empty">
                        <p>Les tailleurs apparaîtront ici une fois inscrits sur la plateforme.</p>
                    </div>
                )}
            </section>

            {/* ══ MODÈLES TENDANCES ══ */}
            <section className={`lp-section lp-modeles-section ${isVisible('modeles') ? 'visible' : ''}`} data-section="modeles">
                <span className="lp-pill"><FiTrendingUp /> Tendances</span>
                <h2 className="lp-section-title">Modèles Populaires</h2>
                <p className="lp-section-sub">Les créations les plus demandées du moment</p>

                {modeles.length > 0 ? (
                    <div className="lp-modeles-grid">
                        {modeles.slice(0, 8).map(m => (
                            <div key={m.id} className="lp-modele-card" onClick={() => onNavigate?.('catalogue', { modele: m, from: 'landing' })}>
                                <div className="lpm-img">
                                    {m.photo_url ? (
                                        <img src={api.getUploadUrl(m.photo_url)} alt={m.titre} />
                                    ) : (
                                        <div className="lpm-placeholder"><FiCamera /></div>
                                    )}
                                    <div className="lpm-overlay">
                                        <span>Voir détails</span>
                                    </div>
                                </div>
                                <div className="lpm-body">
                                    <h4>{m.titre}</h4>
                                    <span className="lpm-atelier">{m.nom_atelier}</span>
                                    <div className="lpm-footer">
                                        <span className="lpm-price">{Number(m.prix_base).toLocaleString()} FCFA</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="lp-empty"><p>Les modèles apparaîtront bientôt.</p></div>
                )}
            </section>

            {/* ══ HOW IT WORKS ══ */}
            <section className={`lp-section lp-steps ${isVisible('steps') ? 'visible' : ''}`} data-section="steps">
                <span className="lp-pill"><FiList /> Comment ça marche ?</span>
                <h2 className="lp-section-title">Simple comme 1, 2, 3</h2>
                <div className="lp-steps-grid">
                    <div className="lp-step">
                        <div className="step-num">1</div>
                        <h3>Créez votre compte</h3>
                        <p>Inscription gratuite en 30 secondes. Client ou Tailleur, choisissez votre profil.</p>
                    </div>
                    <div className="step-arrow">→</div>
                    <div className="lp-step">
                        <div className="step-num">2</div>
                        <h3>Prenez vos mesures</h3>
                        <p>Utilisez votre webcam pour prendre vos mensurations automatiquement grâce à notre IA.</p>
                    </div>
                    <div className="step-arrow">→</div>
                    <div className="lp-step">
                        <div className="step-num">3</div>
                        <h3>Commandez !</h3>
                        <p>Choisissez un modèle, essayez-le en cabine virtuelle, et passez commande directement.</p>
                    </div>
                </div>
            </section>

            {/* ══ CTA FINAL ══ */}
            <section className={`lp-cta-section ${isVisible('cta') ? 'visible' : ''}`} data-section="cta">
                <div className="lp-cta-inner">
                    <div className="cta-bg-pattern"></div>
                    <h2>Prêt à révolutionner<br />votre expérience couture ?</h2>
                    <p>Rejoignez FITMOD gratuitement et découvrez la couture sur mesure du futur.</p>
                    <div className="cta-buttons">
                        <button className="cta-btn-main" onClick={() => onGoToAuth?.('register')}>
                            Créer mon compte gratuit <FiArrowRight />
                        </button>
                        <button className="cta-btn-alt" onClick={() => onGoToAuth?.('login')}>
                            J'ai déjà un compte
                        </button>
                    </div>
                    <div className="cta-checks">
                        <span><FiCheck /> Gratuit</span>
                        <span><FiCheck /> Sans engagement</span>
                        <span><FiCheck /> Accès instantané</span>
                    </div>
                </div>
            </section>

            {/* ══ FOOTER ══ */}
            <footer className="lp-footer" id="contact">
                <div className="lp-footer-inner">
                    <div className="footer-brand">
                        <span className="footer-logo">FITMOD</span>
                        <p>La plateforme de couture sur mesure N°1 au Burkina Faso. Technologie, artisanat et tradition réunis.</p>
                        <div className="footer-social">
                            <a href="#" className="social-link">FB</a>
                            <a href="#" className="social-link">IG</a>
                            <a href="#" className="social-link">TW</a>
                        </div>
                    </div>
                    <div className="footer-links">
                        <h4>Plateforme</h4>
                        <a href="#">Catalogue</a>
                        <a href="#">Tailleurs</a>
                        <a href="#">Essayage virtuel</a>
                        <a href="#">Tarifs</a>
                    </div>
                    <div className="footer-links">
                        <h4>Entreprise</h4>
                        <a href="#">À propos</a>
                        <a href="#">Carrières</a>
                        <a href="#">Blog</a>
                        <a href="#">Contact</a>
                    </div>
                    <div className="footer-links">
                        <h4>Légal</h4>
                        <a href="#">Conditions d'utilisation</a>
                        <a href="#">Politique de confidentialité</a>
                        <a href="#">Mentions légales</a>
                    </div>
                </div>
                <div className="footer-bottom">
                    <span>© 2026 FITMOD. Tous droits réservés.</span>
                </div>
            </footer>
        </div>
    );
}
