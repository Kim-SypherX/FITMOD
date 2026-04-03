/**
 * FITMOD — Serveur Express (MySQL)
 * Point d'entrée principal de l'API REST
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Imports des routes
const authRoutes = require('./routes/authRoutes');
const tailleursRoutes = require('./routes/tailleursRoutes');
const commandeRoutes = require('./routes/commandeRoutes');
const messageRoutes = require('./routes/messageRoutes');
const clientProfilRoutes = require('./routes/clientProfilRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();
const PORT = process.env.PORT || 3001;

// --- Middlewares ---
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// --- Fichiers statiques (Uploads) ---
app.use('/uploads', (req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static(path.join(__dirname, process.env.UPLOAD_DIR || 'uploads')));

// --- Routes de l'API ---
app.use('/api/auth', authRoutes);
app.use('/api/tailleurs', tailleursRoutes);
app.use('/api/commandes', commandeRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/client-profil', clientProfilRoutes);
app.use('/api/admin', adminRoutes);

// --- Route de santé ---
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'FITMOD API MySQL est opérationnelle' });
});

// --- Démarrage ---
app.listen(PORT, () => {
  console.log(`✅ FITMOD API (MySQL) démarrée sur http://localhost:${PORT}`);
});
