const {
  app,
  BrowserWindow,
  ipcMain,
  clipboard,
  desktopCapturer,
} = require('electron');
const path = require('path');
const fs = require('fs');

const { transcribeAudio, verifyOpenAI } = require('./src/whisperClient');
const {
  analyzeTranscription,
  verifyAnthropic,
  SAMPLE_TRANSCRIPTION,
} = require('./src/claudeAnalysis');

// ─── State ────────────────────────────────────────────────────────────────────
let mainWindow = null;
let configWindow = null;
let fullTranscription = '';
let claudeTimer = null;
let callTimer = null;
let callSeconds = 0;
let currentPhase = 1;

// ─── Config ───────────────────────────────────────────────────────────────────
function getConfigPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function loadConfig() {
  let config = {
    openaiApiKey: '',
    anthropicApiKey: '',
    micDeviceId: 'default',
    systemSourceId: null,
    profile: {
      nicho: '',
      clienteIdeal: '',
      precio: '',
      ofertaNombre: '',
      ofertaPromesa: '',
      pilar1: '',
      pilar2: '',
      pilar3: '',
      resultados: '',
    },
  };

  try {
    const configPath = getConfigPath();
    if (fs.existsSync(configPath)) {
      const saved = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      const savedProfile = saved.profile || {};
      config = {
        ...config,
        ...saved,
        profile: { ...config.profile, ...savedProfile },
      };
    }
  } catch (e) {
    console.error('Error loading config:', e.message);
  }

  return config;
}

function saveConfig(config) {
  try {
    fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2));
  } catch (e) {
    console.error('Error saving config:', e.message);
  }
}

// ─── Window creation ──────────────────────────────────────────────────────────
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 380,
    minWidth: 380,
    maxWidth: 380,
    height: 820,
    minHeight: 600,
    alwaysOnTop: true,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'TW Asistente Alumnos',
    backgroundColor: '#0a0a0a',
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.webContents.session.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      const allowed = ['media', 'mediaKeySystem', 'display-capture'];
      callback(allowed.includes(permission));
    }
  );

  // Intercept getDisplayMedia for cross-platform system audio loopback
  mainWindow.webContents.session.setDisplayMediaRequestHandler(
    async (request, callback) => {
      try {
        const sources = await desktopCapturer.getSources({
          types: ['screen'],
          fetchWindowIcons: false,
        });
        if (sources.length === 0) {
          callback({});
          return;
        }
        const saved = loadConfig();
        const source =
          sources.find((s) => s.id === saved.systemSourceId) || sources[0];
        callback({ video: source, audio: 'loopback' });
      } catch (err) {
        console.error('DisplayMedia handler error:', err.message);
        callback({});
      }
    }
  );

  mainWindow.on('closed', () => {
    mainWindow = null;
    stopClaudeTimer();
    stopCallTimer();
  });
}

// ─── Timers ───────────────────────────────────────────────────────────────────
function startClaudeTimer() {
  stopClaudeTimer();
  claudeTimer = setInterval(async () => {
    if (!fullTranscription.trim() || !mainWindow) return;

    const config = loadConfig();
    if (!config.anthropicApiKey) return;

    try {
      mainWindow.webContents.send('status-update', 'procesando');
      const analysis = await analyzeTranscription(
        fullTranscription,
        config.anthropicApiKey,
        config.profile,
        currentPhase
      );
      if (analysis && analysis.fase_numero && analysis.fase_numero > currentPhase) {
        currentPhase = analysis.fase_numero;
      }
      if (mainWindow) {
        mainWindow.webContents.send('analysis-update', analysis);
        mainWindow.webContents.send('status-update', 'grabando');
      }
    } catch (err) {
      console.error('Claude error:', err.message);
      if (mainWindow) mainWindow.webContents.send('status-update', 'grabando');
    }
  }, 15000);
}

function stopClaudeTimer() {
  if (claudeTimer) {
    clearInterval(claudeTimer);
    claudeTimer = null;
  }
}

function startCallTimer() {
  callSeconds = 0;
  callTimer = setInterval(() => {
    callSeconds++;
    if (mainWindow) mainWindow.webContents.send('timer-update', callSeconds);
  }, 1000);
}

function stopCallTimer() {
  if (callTimer) {
    clearInterval(callTimer);
    callTimer = null;
  }
  callSeconds = 0;
}

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(createMainWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});

// ─── IPC Handlers ─────────────────────────────────────────────────────────────
ipcMain.handle('get-config', () => loadConfig());

ipcMain.handle('save-config', (_, config) => {
  saveConfig(config);
  return { success: true };
});

ipcMain.handle('get-desktop-sources', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      fetchWindowIcons: false,
    });
    return sources.map((s, idx) => ({
      id: s.id,
      name: s.name || `Pantalla ${idx + 1}`,
    }));
  } catch (err) {
    console.error('desktopCapturer error:', err.message);
    return [];
  }
});

ipcMain.handle('process-audio-chunk', async (_, audioData, sourceLabel) => {
  const config = loadConfig();

  if (!config.openaiApiKey) {
    return { error: 'No hay API Key de OpenAI configurada' };
  }

  try {
    const buffer = Buffer.from(audioData);
    const text = await transcribeAudio(buffer, config.openaiApiKey);

    if (text && text.trim()) {
      const entry = `${sourceLabel}: ${text.trim()}`;
      fullTranscription += entry + '\n';

      if (mainWindow) {
        mainWindow.webContents.send('transcription-update', {
          text: entry,
          source: sourceLabel,
        });
      }
    }

    return { success: true };
  } catch (err) {
    console.error('Whisper error:', err.message);
    return { error: err.message };
  }
});

ipcMain.handle('start-recording', () => {
  fullTranscription = '';
  currentPhase = 1;
  startClaudeTimer();
  startCallTimer();
  return { success: true };
});

ipcMain.handle('stop-recording', () => {
  stopClaudeTimer();
  stopCallTimer();
  return { success: true };
});

ipcMain.handle('reset-transcription', () => {
  fullTranscription = '';
  return { success: true };
});

ipcMain.handle('copy-transcription', () => {
  clipboard.writeText(fullTranscription);
  return { success: true };
});

ipcMain.handle('test-apis', async (_, { openaiApiKey, anthropicApiKey }) => {
  const results = { openai: null, anthropic: null };

  // Test OpenAI
  try {
    await verifyOpenAI(openaiApiKey);
    results.openai = { connected: true };
  } catch (err) {
    results.openai = { connected: false, error: err.message };
  }

  // Test Anthropic
  try {
    await verifyAnthropic(anthropicApiKey);
    results.anthropic = { connected: true };
  } catch (err) {
    results.anthropic = { connected: false, error: err.message };
  }

  return results;
});

ipcMain.handle('test-analysis', async (_, payload) => {
  const config = loadConfig();
  const anthropicApiKey = (payload && payload.anthropicApiKey) || config.anthropicApiKey;

  if (!anthropicApiKey) {
    return { error: 'Falta la API Key de Anthropic' };
  }

  try {
    const analysis = await analyzeTranscription(
      SAMPLE_TRANSCRIPTION,
      anthropicApiKey,
      (payload && payload.profile) || config.profile
    );
    return {
      success: true,
      analysis,
      sampleTranscription: SAMPLE_TRANSCRIPTION,
    };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('open-config', () => {
  if (configWindow) {
    configWindow.focus();
    return;
  }

  configWindow = new BrowserWindow({
    width: 520,
    height: 640,
    parent: mainWindow,
    modal: true,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'Configuracion',
    backgroundColor: '#0a0a0a',
  });

  configWindow.loadFile(path.join(__dirname, 'renderer', 'config.html'));
  configWindow.on('closed', () => {
    configWindow = null;
  });
});
