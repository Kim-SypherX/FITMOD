/**
 * FITMOD — Serveur Express (MySQL) + Socket.IO
 * Point d'entrée principal de l'API REST + WebSocket Chat
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

// Imports des routes
const authRoutes = require('./routes/authRoutes');
const tailleursRoutes = require('./routes/tailleursRoutes');
const commandeRoutes = require('./routes/commandeRoutes');
const messageRoutes = require('./routes/messageRoutes');
const clientProfilRoutes = require('./routes/clientProfilRoutes');
const adminRoutes = require('./routes/adminRoutes');
const chatRoutes = require('./routes/chatRoutes');

const app = express();
const PORT = process.env.PORT || 3001;

// --- Créer le serveur HTTP + Socket.IO ---
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Rendre io accessible aux routes
app.set('io', io);

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
app.use('/api/chat', chatRoutes);

// --- Route de santé ---
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'FITMOD API MySQL est opérationnelle' });
});

// --- Socket.IO Events ---
io.on('connection', (socket) => {
  console.log(`🔌 Socket connecté: ${socket.id}`);

  // Rejoindre une room de conversation (paire user1_user2)
  socket.on('join_conversation', ({ userId, partnerId }) => {
    const room = [parseInt(userId), parseInt(partnerId)].sort().join('_');
    socket.join(`chat_${room}`);
    console.log(`👥 ${socket.id} a rejoint chat_${room}`);
  });

  // Quitter une room
  socket.on('leave_conversation', ({ userId, partnerId }) => {
    const room = [parseInt(userId), parseInt(partnerId)].sort().join('_');
    socket.leave(`chat_${room}`);
  });

  // Indicateur de frappe
  socket.on('typing', ({ userId, partnerId, isTyping }) => {
    const room = [parseInt(userId), parseInt(partnerId)].sort().join('_');
    socket.to(`chat_${room}`).emit('partner_typing', { userId, isTyping });
  });

  socket.on('disconnect', () => {
    console.log(`❌ Socket déconnecté: ${socket.id}`);
  });
});

// --- Démarrage avec le serveur HTTP ---
server.listen(PORT, () => {
  console.log(`✅ FITMOD API (MySQL + Socket.IO) démarrée sur http://localhost:${PORT}`);
});
