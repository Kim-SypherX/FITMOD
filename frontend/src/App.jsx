/**
 * FITMOD — App Shell
 * Navigation entre modules + authentification
 */
import React, { useState } from 'react';
import { useAuth, AuthProvider } from './contexts/AuthContext';
import AuthPage from './components/AuthPage';
import MesuresCapture from './components/MesuresCapture';
import CabineEssayage from './components/CabineEssayage';
import CataloguePage from './components/CataloguePage';
import CommandePage from './components/CommandePage';
import MessageriePage from './components/MessageriePage';
import FavorisPage from './components/FavorisPage';
import AdminPage from './components/AdminPage';
import TailleurDashboard from './components/TailleurDashboard';
import './App.css';

const PAGES = [
  { id: 'catalogue', label: 'Catalogue', roles: ['client', 'tailleur', 'admin'] },
  { id: 'mesures', label: 'Mesures', roles: ['client', 'admin'] },
  { id: 'cabine', label: 'Cabine', roles: ['client', 'admin'] },
  { id: 'commandes', label: 'Commandes', roles: ['client', 'tailleur', 'admin'] },
  { id: 'messagerie', label: 'Messages', roles: ['client', 'tailleur', 'admin'] },
  { id: 'favoris', label: 'Favoris', roles: ['client', 'admin'] },
  { id: 'admin', label: 'Admin', roles: ['admin'] },
  { id: 'atelier', label: 'Mon Atelier', roles: ['tailleur'] },
];

function AppContent() {
  const { user, logout } = useAuth();
  const [currentPage, setCurrentPage] = useState('catalogue');
  const [pageContext, setPageContext] = useState(null); // contexte partagé entre pages

  // Si pas connecté -> page d'auth
  if (!user) return <AuthPage />;

  const navigate = (page, context = null) => {
    setPageContext(context);
    setCurrentPage(page);
    window.scrollTo(0, 0);
  };

  const visiblePages = PAGES.filter(p => p.roles.includes(user.type_compte));

  const renderPage = () => {
    switch (currentPage) {
      case 'catalogue':
        return <CataloguePage onNavigate={(page, ctx) => navigate(page, ctx)} />;
      case 'mesures':
        return <MesuresCapture />;
      case 'cabine':
        return <CabineEssayage />;
      case 'commandes':
        return <CommandePage commandeContext={pageContext} onNavigate={(page, ctx) => navigate(page, ctx)} />;
      case 'messagerie':
        return <MessageriePage messageContext={pageContext} />;
      case 'favoris':
        return <FavorisPage onNavigate={(page, ctx) => navigate(page, ctx)} />;
      case 'admin':
        return <AdminPage />;
      case 'atelier':
        return <TailleurDashboard />;
      default:
        return <CataloguePage onNavigate={(page, ctx) => navigate(page, ctx)} />;
    }
  };

  return (
    <div className="fitmod-app">
      {/* Navigation */}
      <nav className="fitmod-nav">
        <div className="nav-brand" onClick={() => navigate('catalogue')}>
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
            </button>
          ))}
        </div>

        <div className="nav-user">
          <span className="nav-user-name">{user.prenom}</span>
          <span className="nav-user-type">{user.type_compte}</span>
          <button className="nav-logout" onClick={logout}>X</button>
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
