/**
 * FITMOD — App Shell
 * Landing Page publique → Auth → Dashboard
 */
import React, { useState } from 'react';
import { useAuth, AuthProvider } from './contexts/AuthContext';
import LandingPage from './components/LandingPage';
import AuthPage from './components/AuthPage';
import MesuresCapture from './components/MesuresCapture';
import CabineEssayage from './components/CabineEssayage';
import CabineSnapAR from './components/CabineSnapAR';
import CataloguePage from './components/CataloguePage';
import CommandePage from './components/CommandePage';
import ChatPage from './components/ChatPage';
import FavorisPage from './components/FavorisPage';
import AdminPage from './components/AdminPage';
import TailleurDashboard from './components/TailleurDashboard';
import api from './utils/api';
import './App.css';

const PAGES = [
  { id: 'catalogue', label: 'Catalogue', roles: ['client', 'tailleur', 'admin'] },
  { id: 'mesures', label: 'Mesures', roles: ['client', 'tailleur', 'admin'] },
  { id: 'cabine', label: 'Cabine', roles: ['client', 'tailleur', 'admin'] },
  { id: 'commandes', label: 'Commandes', roles: ['client', 'tailleur', 'admin'] },
  { id: 'messagerie', label: 'Messages', roles: ['client', 'tailleur', 'admin'] },
  { id: 'favoris', label: 'Favoris', roles: ['client', 'tailleur', 'admin'] },
  { id: 'admin', label: 'Admin', roles: ['admin'] },
  { id: 'atelier', label: 'Mon Atelier', roles: ['tailleur'] },
];

function AppContent() {
  const { user, logout } = useAuth();
  const [currentPage, setCurrentPage] = useState('landing');
  const [pageContext, setPageContext] = useState(null);
  const [showAuth, setShowAuth] = useState(false);
  
  const currentPageRef = React.useRef(currentPage);
  React.useEffect(() => {
      currentPageRef.current = currentPage;
  }, [currentPage]);

  // Stats Counters
  const [unreadCounts, setUnreadCounts] = React.useState({ messages: 0, commandes: 0, catalogue: 0, favoris: 0 });
  const [resetTokenUrl, setResetTokenUrl] = useState(null);

  React.useEffect(() => {
    // Check URL for resetToken
    const searchParams = new URLSearchParams(window.location.search);
    const token = searchParams.get('resetToken');
    if (token) {
        setResetTokenUrl(token);
        setShowAuth(true);
        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  React.useEffect(() => {
    if (!user) return;
    
    // Automatically leave landing page on login if needed
    if (currentPage === 'landing') {
        if (user.type_compte === 'admin') setCurrentPage('admin-dashboard');
        else setCurrentPage('catalogue');
    }
    setShowAuth(false);

    const fetchCounts = async () => {
        let msgs = 0, cmds = 0, cata = 0, favs = 0;
        
        // --- Messages ---
        try {
            const chats = await api.get(`/chat/conversations/${user.id}`);
            msgs = chats.reduce((acc, c) => acc + (parseInt(c.non_lus) || 0), 0);
        } catch(e) {}
        
        // --- Commandes ---
        try {
            let pendingOrders = 0;
            if (user.type_compte === 'tailleur' && user.tailleur?.id) {
                const orders = await api.get(`/commandes/tailleur/${user.tailleur.id}`);
                pendingOrders = orders.filter(o => o.statut === 'en_attente_acceptation' || o.statut === 'fabrication_terminee').length;
            } else if (user.type_compte === 'client' && user.client?.id) {
                const orders = await api.get(`/commandes/client/${user.client.id}`);
                pendingOrders = orders.filter(o => o.statut === 'acceptee' || (o.statut === 'livre' && !o.date_livraison_reelle)).length;
            }
            
            if (actualPage === 'commandes') {
                localStorage.setItem('fitmod_last_seen_commandes', pendingOrders);
                cmds = 0;
            } else {
                const lastSeenCmds = parseInt(localStorage.getItem('fitmod_last_seen_commandes') || '0', 10);
                if (pendingOrders > lastSeenCmds) cmds = pendingOrders - lastSeenCmds;
            }
        } catch(e) {}
        
        const actualPage = currentPageRef.current;
        // --- Catalogue / Nouveautés ---
        try {
            const models = await api.get('/tailleurs/modeles/all');
            const totalModels = models.length;
            if (actualPage === 'catalogue') {
                localStorage.setItem('fitmod_last_seen_catalogue', totalModels);
                cata = 0;
            } else {
                const lastSeenCata = parseInt(localStorage.getItem('fitmod_last_seen_catalogue') || '0', 10);
                if (totalModels > lastSeenCata) {
                    cata = totalModels - lastSeenCata;
                    if (cata > 5) cata = 5;
                }
            }
        } catch(e) {}

        // --- Favoris ---
        try {
            if (user.type_compte === 'client' && user.client?.id) {
                 const favoris = await api.get(`/client-profil/${user.client.id}/favoris`);
                 const totalFavs = favoris.length;
                 if (actualPage === 'favoris') {
                     localStorage.setItem('fitmod_last_seen_favoris', totalFavs);
                     favs = 0;
                 } else {
                     const lastSeenFav = parseInt(localStorage.getItem('fitmod_last_seen_favoris') || '0', 10);
                     if (totalFavs > lastSeenFav && totalFavs > 0) favs = totalFavs - lastSeenFav;
                 }
            }
        } catch(e) {}

        setUnreadCounts({ 
            messages: actualPage !== 'messagerie' ? msgs : 0, 
            commandes: actualPage !== 'commandes' ? cmds : 0, 
            catalogue: actualPage !== 'catalogue' ? cata : 0, 
            favoris: actualPage !== 'favoris' ? favs : 0 
        });
    };

    fetchCounts();
    const interval = setInterval(fetchCounts, 15000);
    return () => clearInterval(interval);
  }, [user, currentPage]);

  const navigate = (page, context = null) => {
    // Visitor Mode protection
    const publicPages = ['landing', 'catalogue'];
    if (!user && !publicPages.includes(page)) {
      setShowAuth(true);
      return;
    }

    // Badges update handled directly in fetchData now!
    // But we trigger an immediate reset by pushing it into navigate so it visually snaps off fast:
    if (page === 'catalogue') setUnreadCounts(prev => ({...prev, catalogue: 0}));
    if (page === 'favoris') setUnreadCounts(prev => ({...prev, favoris: 0}));
    if (page === 'commandes') setUnreadCounts(prev => ({...prev, commandes: 0}));
    if (page === 'messagerie') setUnreadCounts(prev => ({...prev, messages: 0}));

    setPageContext(context);
    setCurrentPage(page);
    setShowAuth(false);
    window.scrollTo(0, 0);
  };

  // Auth Overlay
  if (showAuth) {
    return <AuthPage 
              initialResetToken={resetTokenUrl}
              onBackToLanding={() => { 
                  setShowAuth(false); 
                  setResetTokenUrl(null);
                  if (!user && currentPage !== 'catalogue') setCurrentPage('landing'); 
              }} 
           />;
  }

  // Landing Page without shell
  if (currentPage === 'landing' && !user) {
    return <LandingPage onGoToAuth={(mode) => setShowAuth(true)} onNavigate={navigate} />;
  }

  const visiblePages = user 
    ? (user.type_compte === 'admin' 
        ? [
            { id: 'admin-dashboard', label: 'Tableau de Bord' },
            { id: 'admin-tailleurs', label: 'Gestion Tailleurs' },
            { id: 'admin-commandes', label: 'Transactions' },
            { id: 'admin-messages', label: 'Messages & Litiges' },
            { id: 'admin-favoris', label: 'Activité Favoris' }
          ]
        : PAGES.filter(p => p.roles.includes(user.type_compte) && p.id !== 'admin')
      )
    : [{ id: 'catalogue', label: 'Catalogue', roles: [] }];

  const renderPage = () => {
    switch (currentPage) {
      case 'landing':
        return <LandingPage onGoToAuth={(mode) => setShowAuth(true)} onNavigate={navigate} />;
      case 'catalogue':
        return <CataloguePage initialContext={pageContext} onNavigate={navigate} onRequireAuth={() => setShowAuth(true)} />;
      case 'mesures':
        return <MesuresCapture />;
      case 'cabine':
        return <CabineEssayage />;
      case 'commandes':
        return <CommandePage commandeContext={pageContext} onNavigate={navigate} />;
      case 'messagerie':
        return <ChatPage chatContext={pageContext} onNavigate={navigate} />;
      case 'favoris':
        return <FavorisPage onNavigate={navigate} />;
      case 'admin-dashboard':
      case 'admin-tailleurs':
      case 'admin-commandes':
      case 'admin-messages':
      case 'admin-favoris':
        return <AdminPage activeTab={currentPage.replace('admin-', '')} />;
      case 'atelier':
        return <TailleurDashboard onNavigate={navigate} />;
      default:
        return <CataloguePage initialContext={pageContext} onNavigate={navigate} onRequireAuth={() => setShowAuth(true)} />;
    }
  };

  return (
    <div className="fitmod-app">
      {/* Navigation */}
      <nav className="fitmod-nav">
        <div className="nav-brand" onClick={() => navigate(user ? (user.type_compte === 'admin' ? 'admin-dashboard' : 'catalogue') : 'landing')}>
          <span className="nav-title">FITMOD</span>
        </div>

        <div className="nav-links">
          {visiblePages.map(p => (
            <button
              key={p.id}
              className={`nav-link ${currentPage === p.id ? 'active' : ''}`}
              onClick={() => navigate(p.id)}
            >
              <span className="nav-label">{p.label}</span>
              {p.id === 'messagerie' && unreadCounts.messages > 0 && (
                <span className="nav-badge">{unreadCounts.messages}</span>
              )}
              {p.id === 'commandes' && unreadCounts.commandes > 0 && (
                <span className="nav-badge">{unreadCounts.commandes}</span>
              )}
              {p.id === 'catalogue' && unreadCounts.catalogue > 0 && (
                <span className="nav-badge">{unreadCounts.catalogue}</span>
              )}
              {p.id === 'favoris' && unreadCounts.favoris > 0 && (
                <span className="nav-badge">{unreadCounts.favoris}</span>
              )}
            </button>
          ))}
        </div>

        <div className="nav-user">
          {user ? (
            <>
              <span className="nav-user-name">{user.prenom}</span>
              <span className="nav-user-type">{user.type_compte}</span>
              <button className="nav-logout" onClick={() => { logout(); setCurrentPage('landing'); }}>X</button>
            </>
          ) : (
            <button className="page-btn page-btn-primary" style={{ padding: '6px 16px', fontSize: '13px' }} onClick={() => setShowAuth(true)}>Connexion</button>
          )}
        </div>
      </nav>

      {/* Page Content */}
      <main className="fitmod-main">
        {renderPage()}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
