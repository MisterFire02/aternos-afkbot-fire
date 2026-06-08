/**
 * NEBULA AFK CORE v3.0 - Dashboard Frontend
 * Real-time Socket.io Communication
 */

const socket = io();
let authenticated = false;
let botState = {};
let uptimeChart = null;
let commandQueue = [];

// ============================================================================
// AUTHENTICATION
// ============================================================================

function authenticate() {
  const password = document.getElementById('passwordInput').value;

  if (!password) {
    showError('Please enter a password');
    return;
  }

  fetch('/api/authenticate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.success) {
        authenticated = true;
        sessionStorage.setItem('token', data.token);
        document.getElementById('loginContainer').style.display = 'none';
        document.getElementById('dashboard').style.display = 'block';
        initDashboard();
      } else {
        showError('Invalid password');
      }
    })
    .catch((err) => showError('Authentication failed: ' + err.message));
}

function logoutDashboard() {
  sessionStorage.removeItem('token');
  authenticated = false;
  document.getElementById('dashboard').style.display = 'none';
  document.getElementById('loginContainer').style.display = 'flex';
  document.getElementById('passwordInput').value = '';
}

function showError(msg) {
  document.getElementById('loginError').textContent = msg;
  setTimeout(() => {
    document.getElementById('loginError').textContent = '';
  }, 3000);
}

// ============================================================================
// DASHBOARD INITIALIZATION
// ============================================================================

function initDashboard() {
  // Listen for bot state updates
  socket.on('botState', updateDashboardState);

  // Initialize chart
  initUptimeChart();

  // Setup sliders
  setupSettingsSliders();

  // Keyboard shortcut: Enter to authenticate
  document.getElementById('passwordInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') authenticate();
  });
}

// ============================================================================
// STATE UPDATES
// ============================================================================

function updateDashboardState(state) {
  botState = state;

  // Update status indicator
  const indicator = document.getElementById('statusIndicator');
  if (state.isConnected) {
    indicator.textContent = '● ONLINE';
    indicator.classList.remove('offline');
  } else {
    indicator.textContent = '● OFFLINE';
    indicator.classList.add('offline');
  }

  // Update status panel
  document.getElementById('serverDisplay').textContent = state.server || '-';
  document.getElementById('usernameDisplay').textContent = state.username || '-';
  document.getElementById('uptimeDisplay').textContent = formatUptime(state.uptime);
  document.getElementById('loginStatusDisplay').textContent = state.isLoggedIn ? 'YES ✓' : 'NO';

  // Update stats
  document.getElementById('pingDisplay').textContent = (state.stats?.ping || 0) + 'ms';
  document.getElementById('memoryDisplay').textContent = (state.stats?.memory || 0) + 'MB';
  document.getElementById('reconnectsDisplay').textContent = state.stats?.reconnects || 0;
  document.getElementById('messagesDisplay').textContent = state.stats?.messages || 0;
  document.getElementById('movementsDisplay').textContent = state.stats?.movements || 0;

  // Update activity log
  updateActivityLog(state.activityLog || []);

  // Update chart
  if (uptimeChart && state.uptimeHistory) {
    updateUptimeChart(state.uptimeHistory);
  }
}

function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function updateActivityLog(logs) {
  const logElement = document.getElementById('activityLog');
  logElement.innerHTML = '';

  if (logs.length === 0) {
    logElement.innerHTML = '<div class="log-entry">Waiting for activity...</div>';
    return;
  }

  logs.forEach((log) => {
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.textContent = `[${log.timestamp}] ${log.message}`;
    logElement.appendChild(entry);
  });
}

// ============================================================================
// COMMANDS
// ============================================================================

function sendCommand(command) {
  socket.emit(command);
  console.log(`Sent command: ${command}`);
}

// ============================================================================
// SETTINGS
// ============================================================================

function setupSettingsSliders() {
  const sliders = document.querySelectorAll('.slider');
  sliders.forEach((slider, index) => {
    slider.addEventListener('input', (e) => {
      const value = e.target.value;
      const labels = ['movementValue', 'chatValue', 'delayValue'];
      document.getElementById(labels[index]).textContent = value + '%';

      // Send updated behavior to socket
      const behaviors = {
        movementRandomness: parseFloat(sliders[0].value) / 100,
        chatFrequency: parseFloat(sliders[1].value) / 100,
        humanDelayIntensity: parseFloat(sliders[2].value) / 100,
      };
      socket.emit('updateBehavior', behaviors);
    });
  });
}

// ============================================================================
// CHART
// ============================================================================

function initUptimeChart() {
  const ctx = document.getElementById('uptimeChart').getContext('2d');
  uptimeChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Uptime (seconds)',
          data: [],
          borderColor: '#00d9ff',
          backgroundColor: 'rgba(0, 217, 255, 0.1)',
          tension: 0.3,
          fill: true,
          pointRadius: 0,
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false,
        },
      },
      scales: {
        x: {
          display: false,
        },
        y: {
          beginAtZero: true,
          grid: {
            color: 'rgba(0, 217, 255, 0.1)',
          },
          ticks: {
            color: '#e0e0e0',
          },
        },
      },
    },
  });
}

function updateUptimeChart(data) {
  if (!uptimeChart) return;

  uptimeChart.data.datasets[0].data = data;
  uptimeChart.data.labels = Array.from({ length: data.length }, (_, i) => i);
  uptimeChart.update('none');
}

// ============================================================================
// SOCKET EVENTS
// ============================================================================

socket.on('connect', () => {
  console.log('Connected to dashboard server');
});

socket.on('disconnect', () => {
  console.log('Disconnected from dashboard server');
});

// ============================================================================
// PAGE LOAD
// ============================================================================

window.addEventListener('load', () => {
  // Check if already authenticated
  if (sessionStorage.getItem('token')) {
    authenticated = true;
    document.getElementById('loginContainer').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    initDashboard();
  }
});
