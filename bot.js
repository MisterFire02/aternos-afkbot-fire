#!/usr/bin/env node

/**
 * NEBULA AFK CORE v3.0
 * Premium Minecraft AFK Bot System
 * Features: Auto-login, Human-like movement, Chat AI, 24/7 uptime, Self-healing
 */

const mineflayer = require('mineflayer');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  server: {
    host: process.env.SERVER_IP || 'localhost',
    port: process.env.SERVER_PORT || 25565,
    username: process.env.BOT_USERNAME || 'NebulaBotAFK',
  },
  auth: {
    registerPassword: process.env.REGISTER_PASSWORD || 'testing1234',
    loginPassword: process.env.LOGIN_PASSWORD || 'testing1234',
  },
  behavior: {
    movementRandomness: parseFloat(process.env.MOVEMENT_RANDOMNESS) || 0.8,
    chatFrequency: parseFloat(process.env.CHAT_FREQUENCY) || 0.7,
    humanDelayIntensity: parseFloat(process.env.HUMAN_DELAY_INTENSITY) || 0.9,
  },
  reconnect: {
    enabled: process.env.AUTO_RECONNECT !== 'false',
    delay: parseInt(process.env.RECONNECT_DELAY) || 5000,
    maxAttempts: parseInt(process.env.MAX_RECONNECT_ATTEMPTS) || 999,
  },
};

// ============================================================================
// GLOBAL STATE
// ============================================================================

const STATE = {
  bot: null,
  isConnected: false,
  isLoggedIn: false,
  uptime: { start: Date.now(), seconds: 0 },
  stats: {
    reconnects: 0,
    messagesChat: 0,
    movementsCount: 0,
    lastPing: 0,
    memoryUsage: 0,
  },
  lastActivity: Date.now(),
  watchdog: { lastHeartbeat: Date.now(), frozen: false },
  crashed: false,
};

// ============================================================================
// UTILITIES
// ============================================================================

const log = {
  title: (msg) => console.log(chalk.cyan.bold('\n[NEBULA] ') + chalk.white.bold(msg)),
  success: (msg) => console.log(chalk.green('✓ ') + chalk.white(msg)),
  error: (msg) => console.log(chalk.red('✗ ') + chalk.white(msg)),
  warning: (msg) => console.log(chalk.yellow('⚠ ') + chalk.white(msg)),
  info: (msg) => console.log(chalk.blue('ℹ ') + chalk.white(msg)),
  debug: (msg) => console.log(chalk.gray('» ') + chalk.gray(msg)),
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const randomDelay = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const humanDelay = (intensity = CONFIG.behavior.humanDelayIntensity) => {
  const base = randomDelay(50, 200);
  return Math.floor(base * intensity);
};

const updateStats = () => {
  STATE.stats.memoryUsage = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
  STATE.uptime.seconds = Math.floor((Date.now() - STATE.uptime.start) / 1000);
  if (STATE.bot && STATE.bot.player) {
    STATE.stats.lastPing = STATE.bot.player.ping || 0;
  }
};

const formatTime = (seconds) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const displayStatus = () => {
  updateStats();
  const status = STATE.isConnected ? chalk.green('ONLINE') : chalk.red('OFFLINE');
  const uptime = formatTime(STATE.uptime.seconds);
  const memory = `${STATE.stats.memoryUsage}MB`;
  const ping = `${STATE.stats.lastPing}ms`;
  const reconnects = STATE.stats.reconnects;

  console.clear();
  console.log(chalk.cyan('╔════════════════════════════════════════════════╗'));
  console.log(chalk.cyan('║') + chalk.cyan.bold('        NEBULA AFK CORE v3.0                   ') + chalk.cyan('║'));
  console.log(chalk.cyan('╠════════════════════════════════════════════════╣'));
  console.log(chalk.cyan('║') + ` Status: ${status} ${STATE.isConnected ? '🟢' : '🔴'}`.padEnd(48) + chalk.cyan('║'));
  console.log(chalk.cyan('║') + ` Uptime: ${uptime}`.padEnd(48) + chalk.cyan('║'));
  console.log(chalk.cyan('║') + ` Server: ${CONFIG.server.host}:${CONFIG.server.port}`.padEnd(48) + chalk.cyan('║'));
  console.log(chalk.cyan('║') + ` Ping: ${ping}`.padEnd(48) + chalk.cyan('║'));
  console.log(chalk.cyan('║') + ` Memory: ${memory}`.padEnd(48) + chalk.cyan('║'));
  console.log(chalk.cyan('║') + ` Reconnects: ${reconnects}`.padEnd(48) + chalk.cyan('║'));
  console.log(chalk.cyan('║') + ` Logged In: ${STATE.isLoggedIn ? 'YES ✓' : 'NO ✗'}`.padEnd(48) + chalk.cyan('║'));
  console.log(chalk.cyan('║') + ` Chat Msgs: ${STATE.stats.messagesChat}`.padEnd(48) + chalk.cyan('║'));
  console.log(chalk.cyan('║') + ` Movements: ${STATE.stats.movementsCount}`.padEnd(48) + chalk.cyan('║'));
  console.log(chalk.cyan('╚════════════════════════════════════════════════╝'));
  console.log('');
};

// ============================================================================
// WATCHDOG (Anti-Freeze & Crash Detection)
// ============================================================================

const initWatchdog = () => {
  setInterval(() => {
    const now = Date.now();
    const timeSinceHeartbeat = now - STATE.watchdog.lastHeartbeat;

    if (timeSinceHeartbeat > 30000) {
      if (!STATE.watchdog.frozen) {
        log.warning('WATCHDOG: System frozen detected! Auto-recovering...');
        STATE.watchdog.frozen = true;
        attemptReconnect();
      }
    } else {
      STATE.watchdog.frozen = false;
    }
  }, 10000);
};

const heartbeat = () => {
  STATE.watchdog.lastHeartbeat = Date.now();
};

// ============================================================================
// AUTO-LOGIN SYSTEM
// ============================================================================

const attemptRegister = async () => {
  log.info('Attempting auto-register...');
  await sleep(randomDelay(2000, 3500));

  try {
    STATE.bot.chat(`/register ${CONFIG.auth.registerPassword}`);
    log.success('Register command sent');
    STATE.stats.messagesChat++;
  } catch (e) {
    log.debug('Register may have failed (already registered)');
  }
};

const attemptLogin = async () => {
  log.info('Attempting auto-login...');
  await sleep(randomDelay(7000, 8500));

  try {
    STATE.bot.chat(`/login ${CONFIG.auth.loginPassword}`);
    log.success('Login command sent');
    STATE.stats.messagesChat++;
    STATE.isLoggedIn = true;
  } catch (e) {
    log.error('Login failed: ' + e.message);
  }
};

// ============================================================================
// HUMAN-LIKE MOVEMENT ENGINE
// ============================================================================

const randomizedMovement = async () => {
  if (!STATE.bot || !STATE.isConnected) return;

  const randomChance = Math.random();
  const intensity = CONFIG.behavior.movementRandomness;

  try {
    if (randomChance < 0.4 * intensity) {
      // Random walk (forward/backward)
      const direction = Math.random() > 0.5 ? 'forward' : 'back';
      const duration = randomDelay(100, 300);
      STATE.bot.setControlState(direction, true);
      await sleep(duration);
      STATE.bot.setControlState(direction, false);
    } else if (randomChance < 0.7 * intensity) {
      // Jump
      STATE.bot.jump();
      await sleep(randomDelay(100, 200));
    } else if (randomChance < 0.9 * intensity) {
      // Rotate camera (look around)
      const yaw = (Math.random() - 0.5) * 0.5;
      const pitch = (Math.random() - 0.5) * 0.3;
      STATE.bot.look(yaw, pitch, false);
      await sleep(randomDelay(150, 400));
    }

    STATE.stats.movementsCount++;
    heartbeat();
  } catch (e) {
    log.debug('Movement error: ' + e.message);
  }
};

const startMovementLoop = () => {
  setInterval(async () => {
    if (STATE.isConnected && STATE.isLoggedIn) {
      await randomizedMovement();
    }
  }, randomDelay(5000, 8000));
};

// ============================================================================
// AI CHAT PERSONALITY SYSTEM
// ============================================================================

const chatMessages = ['afk', 'ok', 'brb', 'loading...', '.', 'hmm', 'nice', 'lol'];

const randomChat = async () => {
  if (!STATE.bot || !STATE.isConnected || !STATE.isLoggedIn) return;

  const spamProtection = Math.random();
  if (spamProtection < 0.1) {
    // 10% chance to skip (anti-spam)
    return;
  }

  const message = chatMessages[Math.floor(Math.random() * chatMessages.length)];

  try {
    // Simulate typing delay
    await sleep(humanDelay(CONFIG.behavior.humanDelayIntensity));
    STATE.bot.chat(message);
    STATE.stats.messagesChat++;
    log.debug(`Chat: "${message}"`);
    heartbeat();
  } catch (e) {
    log.debug('Chat error: ' + e.message);
  }
};

const startChatLoop = () => {
  setInterval(async () => {
    if (STATE.isConnected && STATE.isLoggedIn) {
      await randomChat();
    }
  }, randomDelay(15 * 60 * 1000, 25 * 60 * 1000)); // 15-25 min between messages
};

// ============================================================================
// AUTO-RECONNECT SYSTEM
// ============================================================================

let reconnectAttempts = 0;

const attemptReconnect = async () => {
  if (!CONFIG.reconnect.enabled) return;
  if (reconnectAttempts >= CONFIG.reconnect.maxAttempts) {
    log.error('Max reconnect attempts reached!');
    return;
  }

  reconnectAttempts++;
  STATE.stats.reconnects++;

  const backoffDelay = Math.min(
    CONFIG.reconnect.delay * Math.pow(1.5, reconnectAttempts - 1),
    30000
  );

  log.warning(`Reconnecting in ${Math.floor(backoffDelay / 1000)}s (Attempt ${reconnectAttempts})...`);
  await sleep(backoffDelay);
  initBot();
};

// ============================================================================
// AUTO-CLEANUP & MEMORY MANAGEMENT
// ============================================================================

const initAutoCleanup = () => {
  setInterval(() => {
    if (global.gc) {
      global.gc();
      log.debug('Garbage collection triggered');
    }
    updateStats();
  }, 10 * 60 * 1000); // Every 10 minutes
};

// ============================================================================
// BOT INITIALIZATION
// ============================================================================

const initBot = async () => {
  try {
    log.title('Initializing Bot Connection...');

    STATE.bot = mineflayer.createBot({
      host: CONFIG.server.host,
      port: CONFIG.server.port,
      username: CONFIG.server.username,
      version: '1.20.1',
    });

    // ========== BOT EVENTS ==========

    STATE.bot.on('login', async () => {
      log.success('Bot logged into server');
      STATE.isConnected = true;
      STATE.isLoggedIn = false;
      reconnectAttempts = 0;
      heartbeat();

      // Auto-register/login sequence
      await attemptRegister();
      await attemptLogin();
    });

    STATE.bot.on('spawn', async () => {
      log.success('Bot spawned on server');
      STATE.isConnected = true;
      heartbeat();

      if (!STATE.isLoggedIn) {
        // If not logged in yet, attempt login
        await attemptLogin();
      }
    });

    STATE.bot.on('chat', (username, message) => {
      if (username === STATE.bot.username) return; // Ignore own messages
      log.debug(`[${username}]: ${message}`);

      // Listen for login success indicators
      if (message.toLowerCase().includes('logged in') || message.toLowerCase().includes('successfully')) {
        STATE.isLoggedIn = true;
        log.success('Login confirmed!');
      }
    });

    STATE.bot.on('kicked', (reason) => {
      log.warning(`Kicked from server: ${reason}`);
      STATE.isConnected = false;
      STATE.isLoggedIn = false;
      attemptReconnect();
    });

    STATE.bot.on('end', () => {
      log.warning('Connection ended');
      STATE.isConnected = false;
      STATE.isLoggedIn = false;
      attemptReconnect();
    });

    STATE.bot.on('error', (err) => {
      log.error(`Bot error: ${err.message}`);
      STATE.isConnected = false;
      STATE.isLoggedIn = false;
      attemptReconnect();
    });

  } catch (e) {
    log.error('Failed to initialize bot: ' + e.message);
    attemptReconnect();
  }
};

// ============================================================================
// MAIN STARTUP
// ============================================================================

const main = async () => {
  log.title('NEBULA AFK CORE v3.0 Starting...');
  log.info(`Server: ${CONFIG.server.host}:${CONFIG.server.port}`);
  log.info(`Username: ${CONFIG.server.username}`);
  log.info(`Movement Randomness: ${CONFIG.behavior.movementRandomness}`);
  log.info(`Chat Frequency: ${CONFIG.behavior.chatFrequency}`);

  // Initialize systems
  initWatchdog();
  initAutoCleanup();
  startMovementLoop();
  startChatLoop();

  // Start bot
  await initBot();

  // Display status every 5 seconds
  setInterval(displayStatus, 5000);

  // Graceful shutdown
  process.on('SIGINT', () => {
    log.warning('Shutting down gracefully...');
    if (STATE.bot) STATE.bot.quit();
    process.exit(0);
  });
};

main().catch((err) => {
  log.error('Fatal error: ' + err.message);
  process.exit(1);
});
