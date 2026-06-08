#!/usr/bin/env node

/**
 * NEBULA AFK CORE v3.0 - Premium Web Dashboard
 * Express + Socket.io Backend
 */

const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: { origin: '*' },
});

const DASHBOARD_PORT = process.env.DASHBOARD_PORT || 3000;
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || 'nebula2024';

// ============================================================================
// MOCK BOT STATE (In production, connect to actual bot via IPC)
// ============================================================================

let botState = {
  isConnected: false,
  isLoggedIn: false,
  uptime: 0,
  server: 'localhost:25565',
  username: 'NebulaBotAFK',
  stats: {
    ping: 0,
    memory: 0,
    reconnects: 0,
    messages: 0,
    movements: 0,
  },
  uptimeHistory: [],
  activityLog: [],
};

// ============================================================================
// MIDDLEWARE
// ============================================================================

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ============================================================================
// ROUTES
// ============================================================================

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/authenticate', (req, res) => {
  const { password } = req.body;
  if (password === DASHBOARD_PASSWORD) {
    res.json({ success: true, token: Buffer.from(password).toString('base64') });
  } else {
    res.status(401).json({ success: false, message: 'Invalid password' });
  }
});

app.get('/api/status', (req, res) => {
  res.json(botState);
});

// ============================================================================
// SOCKET.IO EVENTS
// ============================================================================

io.on('connection', (socket) => {
  console.log('[Dashboard] Client connected:', socket.id);

  // Send initial state
  socket.emit('botState', botState);

  // Bot control commands
  socket.on('startBot', () => {
    console.log('[Command] Start Bot');
    botState.isConnected = true;
    io.emit('botState', botState);
  });

  socket.on('stopBot', () => {
    console.log('[Command] Stop Bot');
    botState.isConnected = false;
    io.emit('botState', botState);
  });

  socket.on('restartBot', () => {
    console.log('[Command] Restart Bot');
    botState.isConnected = false;
    setTimeout(() => {
      botState.isConnected = true;
      botState.stats.reconnects++;
      io.emit('botState', botState);
    }, 2000);
  });

  socket.on('forceLogin', () => {
    console.log('[Command] Force Login');
    botState.isLoggedIn = true;
    io.emit('botState', botState);
  });

  socket.on('toggleAFK', () => {
    console.log('[Command] Toggle AFK Mode');
    io.emit('botState', botState);
  });

  socket.on('updateBehavior', (data) => {
    console.log('[Config] Update Behavior:', data);
    io.emit('botState', botState);
  });

  socket.on('disconnect', () => {
    console.log('[Dashboard] Client disconnected:', socket.id);
  });
});

// ============================================================================
// MOCK DATA UPDATES (Simulating bot activity)
// ============================================================================

setInterval(() => {
  if (botState.isConnected) {
    botState.uptime += 5;
    botState.stats.ping = Math.floor(Math.random() * 100) + 20;
    botState.stats.memory = Math.floor(Math.random() * 200) + 100;

    if (Math.random() > 0.7) {
      botState.stats.messages++;
      botState.activityLog.unshift({
        type: 'chat',
        message: 'Random AFK message sent',
        timestamp: new Date().toLocaleTimeString(),
      });
    }

    if (Math.random() > 0.6) {
      botState.stats.movements++;
    }

    botState.uptimeHistory.push(botState.uptime);
    if (botState.uptimeHistory.length > 100) botState.uptimeHistory.shift();

    if (botState.activityLog.length > 50) botState.activityLog.pop();

    io.emit('botState', botState);
  }
}, 5000);

// ============================================================================
// STARTUP
// ============================================================================

server.listen(DASHBOARD_PORT, () => {
  console.log(`\n╔═══════════════════════════════════════╗`);
  console.log(`║  NEBULA AFK CORE v3.0 - Dashboard    ║`);
  console.log(`║  🌐 http://localhost:${DASHBOARD_PORT}${' '.repeat(18 - DASHBOARD_PORT.toString().length)}║`);
  console.log(`║  Password: ${DASHBOARD_PASSWORD}${' '.repeat(25 - DASHBOARD_PASSWORD.length)}║`);
  console.log(`╚═══════════════════════════════════════╝\n`);
});
