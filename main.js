const {
  app,
  BrowserWindow,
  ipcMain,
  clipboard,
  desktopCapturer,
  safeStorage,
  shell,
} = require('electron');
const path = require('path');
const fs = require('fs');

const { transcribeAudio, verifyOpenAI } = require('./src/whisperClient');
const {
  analyzeTranscription,
  verifyAnthropic,
  SAMPLE_TRANSCRIPTION,
} = require('./src/claudeAnalysis');

// ─── Constants ────────────────────────────────────────────────────────────────
// Max chars sent to Claude per analysis — prevents O(n²) token growth.
// ~12K chars ≈ 3K tokens ≈ last 15-20 min of dense conversation.
const CLAUDE_CONTEXT_MAX_CHARS = 12000;

// ─── State ────────────────────────────────────────────────────────────────────
let mainWindow = null;
let configWindow = null;
let fullTranscription = '';
let claudeTimer = null;
let callTimer = null;
let callSeconds = 0;
let currentPhase = 1;

// Config cache — avoid fs.readFileSync on every audio chunk / analysis cycle.
let _configCache = null;

// Per-call tracking (reset on start-recording).
let currentCallAnalyses = [];
let currentCallStartAt = null;
let currentCallCostUsd = 0;

// ─── Config ───────────────────────────────────────────────────────────────────
function getConfigPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

const ENC_PREFIX = 'enc::';

function encryptSecret(plaintext) {
  if (!plaintext) return '';
  if (!safeStorage.isEncryptionAvailable()) return plaintext;
  try {
    const buf = safeStorage.encryptString(plaintext);
    return ENC_PREFIX + buf.toString('base64');
  } catch {
    return plaintext;
  }
}

function decryptSecret(value) {
  if (!value || typeof value !== 'string') return '';
  if (!value.startsWith(ENC_PREFIX)) return value; // plaintext (legacy or unencrypted)
  if (!safeStorage.isEncryptionAvailable()) return '';
  try {
    const buf = Buffer.from(value.slice(ENC_PREFIX.length), 'base64');
    return safeStorage.decryptString(buf);
  } catch (e) {
    console.error('safeStorage decrypt failed:', e.message);
    return '';
  }
}

function defaultConfig() {
  return {
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
}

function loadConfig() {
  if (_configCache) return _configCache;

  let config = defaultConfig();
  let needsMigration = false;

  try {
    const configPath = getConfigPath();
    if (fs.existsSync(configPath)) {
      const saved = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      const savedProfile = saved.profile || {};

      const rawOpenai = saved.openaiApiKey || '';
      const rawAnthropic = saved.anthropicApiKey || '';

      // Detect legacy plaintext keys and trigger migration
      if (rawOpenai && !rawOpenai.startsWith(ENC_PREFIX)) needsMigration = true;
      if (rawAnthropic && !rawAnthropic.startsWith(ENC_PREFIX)) needsMigration = true;

      config = {
        ...config,
        ...saved,
        openaiApiKey: decryptSecret(rawOpenai),
        anthropicApiKey: decryptSecret(rawAnthropic),
        profile: { ...config.profile, ...savedProfile },
      };
    }
  } catch (e) {
    console.error('Error loading config:', e.message);
  }

  _configCache = config;

  if (needsMigration) {
    console.log('[config] Migrating plaintext API keys to safeStorage');
    saveConfig(config);
  }

  return config;
}

function saveConfig(config) {
  try {
    const toPersist = {
      ...config,
      openaiApiKey: encryptSecret(config.openaiApiKey || ''),
      anthropicApiKey: encryptSecret(config.anthropicApiKey || ''),
    };
    fs.writeFileSync(getConfigPath(), JSON.stringify(toPersist, null, 2));
    _configCache = { ...config };
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

    // #2 — windowed context: only send the tail of the transcription to Claude
    // to avoid quadratic token growth over a long call.
    const windowedTranscription =
      fullTranscription.length > CLAUDE_CONTEXT_MAX_CHARS
        ? '[...transcripcion anterior truncada...]\n' + fullTranscription.slice(-CLAUDE_CONTEXT_MAX_CHARS)
        : fullTranscription;

    try {
      mainWindow.webContents.send('status-update', 'procesando');
      const analysis = await analyzeTranscription(
        windowedTranscription,
        config.anthropicApiKey,
        config.profile,
        currentPhase
      );
      if (analysis && analysis.fase_numero && analysis.fase_numero > currentPhase) {
        currentPhase = analysis.fase_numero;
      }

      // #10 — track cost
      if (analysis && analysis._usage) {
        currentCallCostUsd += analysis._usage.costUsd || 0;
        if (mainWindow) {
          mainWindow.webContents.send('cost-update', { totalUsd: currentCallCostUsd });
        }
      }

      // #6 — record for call history
      currentCallAnalyses.push({
        t: Date.now(),
        phase: currentPhase,
        analysis,
      });

      if (mainWindow) {
        mainWindow.webContents.send('analysis-update', analysis);
        mainWindow.webContents.send('status-update', 'grabando');
      }
    } catch (err) {
      console.error('Claude error:', err.message);
      if (mainWindow) {
        // #4 — surface API errors to the UI instead of swallowing them
        mainWindow.webContents.send('error-update', {
          source: 'claude',
          message: humanizeApiError(err),
        });
        mainWindow.webContents.send('status-update', 'grabando');
      }
    }
  }, 15000);
}

// #4 — friendly error messages for common API failures
function humanizeApiError(err) {
  const msg = err && err.message ? err.message : String(err);
  const lower = msg.toLowerCase();
  if (lower.includes('insufficient') || lower.includes('credit') || lower.includes('balance')) {
    return 'Sin saldo en tu cuenta. Recarga creditos en el dashboard del proveedor.';
  }
  if (lower.includes('invalid') && lower.includes('api') && lower.includes('key')) {
    return 'API Key invalida o revocada. Revisa la configuracion.';
  }
  if (lower.includes('rate limit') || lower.includes('429')) {
    return 'Limite de peticiones alcanzado. Espera unos segundos.';
  }
  if (lower.includes('network') || lower.includes('fetch')) {
    return 'Sin conexion a internet o el proveedor no responde.';
  }
  return msg;
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
app.whenReady().then(() => {
  createMainWindow();

  // #9 — auto-update from GitHub Releases
  setupAutoUpdater();
});

function setupAutoUpdater() {
  // Lazy-load: electron-updater instantiates NsisUpdater at require time,
  // which touches Electron's `app.getVersion()`. Only require it once inside
  // whenReady, and only when packaged.
  if (!app.isPackaged) return;

  let autoUpdater;
  try {
    autoUpdater = require('electron-updater').autoUpdater;
  } catch (e) {
    console.error('[autoUpdater] require failed:', e.message);
    return;
  }

  try {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('update-available', (info) => {
      console.log('[autoUpdater] update available:', info && info.version);
      if (mainWindow) {
        mainWindow.webContents.send('update-status', {
          state: 'available',
          version: info && info.version,
        });
      }
    });

    autoUpdater.on('update-downloaded', (info) => {
      console.log('[autoUpdater] update downloaded:', info && info.version);
      if (mainWindow) {
        mainWindow.webContents.send('update-status', {
          state: 'downloaded',
          version: info && info.version,
        });
      }
    });

    autoUpdater.on('error', (err) => {
      console.error('[autoUpdater] error:', err && err.message);
    });

    // Check once at startup
    autoUpdater.checkForUpdatesAndNotify().catch((e) => {
      console.error('[autoUpdater] check failed:', e.message);
    });

    // Stash for the IPC install handler
    global.__twAutoUpdater = autoUpdater;
  } catch (e) {
    console.error('[autoUpdater] setup failed:', e.message);
  }
}

ipcMain.handle('install-update-now', () => {
  try {
    if (global.__twAutoUpdater) global.__twAutoUpdater.quitAndInstall();
  } catch (e) { console.error(e); }
});

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
    const result = await transcribeAudio(buffer, config.openaiApiKey);
    const text = result.text || '';

    // #10 — track Whisper cost
    if (result.costUsd > 0) {
      currentCallCostUsd += result.costUsd;
      if (mainWindow) {
        mainWindow.webContents.send('cost-update', { totalUsd: currentCallCostUsd });
      }
    }

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
    if (mainWindow) {
      mainWindow.webContents.send('error-update', {
        source: 'whisper',
        message: humanizeApiError(err),
      });
    }
    return { error: err.message };
  }
});

ipcMain.handle('start-recording', () => {
  fullTranscription = '';
  currentPhase = 1;
  currentCallAnalyses = [];
  currentCallStartAt = new Date();
  currentCallCostUsd = 0;
  if (mainWindow) {
    mainWindow.webContents.send('cost-update', { totalUsd: 0 });
    mainWindow.webContents.send('error-update', { clear: true });
  }
  startClaudeTimer();
  startCallTimer();
  return { success: true };
});

ipcMain.handle('stop-recording', () => {
  stopClaudeTimer();
  stopCallTimer();
  // #6 — persist call transcript + analyses to disk
  const savedPath = saveCallToDisk();
  return { success: true, savedPath };
});

// #6 — Save a completed call to userData/calls/<timestamp>.json
function saveCallToDisk() {
  try {
    if (!fullTranscription.trim()) return null;

    const dir = path.join(app.getPath('userData'), 'calls');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const started = currentCallStartAt || new Date();
    const ts = started
      .toISOString()
      .replace(/[:.]/g, '-')
      .replace(/T/, '_')
      .slice(0, 19);
    const filePath = path.join(dir, `${ts}.json`);

    const payload = {
      startedAt: started.toISOString(),
      endedAt: new Date().toISOString(),
      durationSec: callSeconds,
      finalPhase: currentPhase,
      costUsd: Number(currentCallCostUsd.toFixed(4)),
      transcription: fullTranscription,
      analyses: currentCallAnalyses,
    };

    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
    return filePath;
  } catch (e) {
    console.error('Error saving call to disk:', e.message);
    return null;
  }
}

// #6 — Open the calls folder in the OS file explorer
ipcMain.handle('open-calls-folder', async () => {
  const dir = path.join(app.getPath('userData'), 'calls');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  await shell.openPath(dir);
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
