'use strict';

// ─── State ────────────────────────────────────────────────────────────────────
let isRecording = false;
let audioCapture = null;
let alertDismissTimeout = null;

// ─── DOM ──────────────────────────────────────────────────────────────────────
const btnToggle           = document.getElementById('btn-toggle');
const btnConfig           = document.getElementById('btn-config');
const btnAlertClose       = document.getElementById('btn-alert-close');
const btnCopy             = document.getElementById('btn-copy');
const btnTranscriptToggle = document.getElementById('btn-transcript-toggle');
const secTranscription    = document.getElementById('sec-transcription');

const faseNombre       = document.getElementById('fase-nombre');
const faseDesc         = document.getElementById('fase-desc');
const progressFill     = document.getElementById('progress-fill');
const progressPct      = document.getElementById('progress-pct');
const suggestionText   = document.getElementById('suggestion-text');
const secAlerta        = document.getElementById('sec-alerta');
const alertTitle       = document.getElementById('alert-title');
const alertBody        = document.getElementById('alert-body');
const transcriptionArea = document.getElementById('transcription-area');
const timerEl          = document.getElementById('timer');
const statusDot        = document.getElementById('status-dot');
const statusText       = document.getElementById('status-text');

// ─── Button handlers ──────────────────────────────────────────────────────────
btnToggle.addEventListener('click', toggleRecording);
btnConfig.addEventListener('click', () => window.electronAPI.openConfig());
btnAlertClose.addEventListener('click', dismissAlert);

btnTranscriptToggle.addEventListener('click', () => {
  secTranscription.classList.toggle('hidden');
});

btnCopy.addEventListener('click', async () => {
  await window.electronAPI.copyTranscription();
  const prev = btnCopy.title;
  btnCopy.textContent = '✓';
  btnCopy.title = '¡Copiado!';
  setTimeout(() => {
    btnCopy.textContent = '📋';
    btnCopy.title = prev;
  }, 2000);
});

// ─── IPC listeners (main → renderer) ─────────────────────────────────────────
window.electronAPI.onTranscriptionUpdate((data) => {
  appendTranscriptLine(data.text, data.source);
});

window.electronAPI.onAnalysisUpdate((analysis) => {
  applyAnalysis(analysis);
});

window.electronAPI.onStatusUpdate((status) => {
  setStatus(status);
});

window.electronAPI.onTimerUpdate((seconds) => {
  timerEl.textContent = formatTime(seconds);
});

// ─── Recording control ────────────────────────────────────────────────────────
async function toggleRecording() {
  if (isRecording) {
    await stopRecording();
  } else {
    await startRecording();
  }
}

async function startRecording() {
  const config = await window.electronAPI.getConfig();

  if (!config.openaiApiKey || !config.anthropicApiKey) {
    // Show inline warning instead of bare alert
    const msg = 'Configura tus API keys antes de empezar';
    const doOpen = confirm(msg + '\n\n¿Abrir configuracion?');
    if (doOpen) window.electronAPI.openConfig();
    return;
  }

  // Ensure a screen source is configured (used by main process's display media handler)
  if (!config.systemSourceId) {
    const sources = await window.electronAPI.getDesktopSources();
    if (sources.length === 0) {
      alert(
        'No se encontro ninguna pantalla para capturar audio del sistema.\n\n' +
        'No se puede iniciar la grabacion sin audio del cliente.'
      );
      return;
    }
    // Auto-pick first available screen and persist
    await window.electronAPI.saveConfig({ ...config, systemSourceId: sources[0].id });
  }

  try {
    audioCapture = new AudioCapture({ chunkDuration: 15000 });

    await audioCapture.start({
      micDeviceId: config.micDeviceId || 'default',
      onMicChunk: (chunk) => sendChunk(chunk, 'CLOSER'),
      onSystemChunk: (chunk) => sendChunk(chunk, 'CLIENTE'),
    });

    await window.electronAPI.startRecording();

    isRecording = true;
    btnToggle.textContent = 'STOP';
    btnToggle.classList.add('active');
    setStatus('grabando');

    const placeholder = document.getElementById('transcript-placeholder');
    if (placeholder) placeholder.remove();
  } catch (err) {
    if (audioCapture) { audioCapture.stop(); audioCapture = null; }

    // System audio failure is fatal — the closer must know about it
    if (err.code === 'SYSTEM_AUDIO_FAILED') {
      const isMac = navigator.userAgent.includes('Mac');
      alert(
        'No se pudo capturar audio del sistema (voz del cliente).\n\n' +
        err.message + '\n\n' +
        (isMac
          ? 'En macOS:\n' +
            '  - Ve a Ajustes -> Privacidad y Seguridad -> Grabacion de Pantalla\n' +
            '  - Activa el permiso para TW Asistente Alumnos\n' +
            '  - Reinicia la aplicacion\n' +
            '  - Requiere macOS 13 (Ventura) o superior'
          : 'En Windows:\n' +
            '  - Verifica que Zoom/Meet reproduce por el dispositivo de audio por defecto\n' +
            '  - Comprueba que hay sonido saliendo por los altavoces\n' +
            '  - Si tienes varios monitores, prueba a cambiar la pantalla en Configuracion')
      );
    } else {
      alert(`Error al iniciar grabacion: ${err.message}`);
    }
  }
}

async function stopRecording() {
  isRecording = false;

  if (audioCapture) {
    audioCapture.stop();
    audioCapture = null;
  }

  await window.electronAPI.stopRecording();

  btnToggle.textContent = 'START';
  btnToggle.classList.remove('active');
  setStatus('pausa');
}

// ─── Send audio chunk to main process ────────────────────────────────────────
async function sendChunk(chunk, sourceLabel) {
  // Convert Uint8Array → plain Array for safe contextBridge transfer
  const chunkArray = Array.from(chunk);
  try {
    const result = await window.electronAPI.processAudioChunk(chunkArray, sourceLabel);
    if (result && result.error) {
      console.warn('Chunk error:', result.error);
    }
  } catch (err) {
    console.error('IPC chunk error:', err);
  }
}

// ─── Apply Claude analysis ────────────────────────────────────────────────────
function applyAnalysis(analysis) {
  if (!analysis) return;

  // Fase
  if (analysis.fase_numero && analysis.fase_actual) {
    const checkMark = analysis.fase_objetivo_cumplido ? ' ✓' : '';
    faseNombre.textContent = `${analysis.fase_numero} · ${analysis.fase_actual.toUpperCase()}${checkMark}`;
  }
  if (analysis.fase_descripcion) {
    faseDesc.textContent = analysis.fase_objetivo_cumplido
      ? 'Objetivo cumplido — avanza a la siguiente fase'
      : analysis.fase_descripcion;
  }

  // Progress bar
  if (typeof analysis.progreso === 'number') {
    const pct = Math.max(0, Math.min(100, analysis.progreso));
    progressFill.style.width = `${pct}%`;
    progressPct.textContent = `${pct}%`;
  }

  // Sugerencia
  if (analysis.sugerencia) {
    suggestionText.textContent = `"${analysis.sugerencia}"`;
    suggestionText.style.fontStyle = 'italic';
  }

  // Alerta objecion
  if (analysis.alerta && analysis.alerta_tipo) {
    showAlert(analysis.alerta_tipo, analysis.alerta);
  }
}

// ─── Transcription ────────────────────────────────────────────────────────────
function appendTranscriptLine(text, source) {
  // text format: "CLOSER: ..." or "CLIENTE: ..."
  const colonIdx = text.indexOf(': ');
  const speaker = colonIdx !== -1 ? text.slice(0, colonIdx) : source;
  const content = colonIdx !== -1 ? text.slice(colonIdx + 2) : text;

  const line = document.createElement('div');
  line.className = 'transcript-line';

  const speakerEl = document.createElement('span');
  speakerEl.className = `speaker ${source === 'CLOSER' ? 'speaker-closer' : 'speaker-cliente'}`;
  speakerEl.textContent = speaker + ': ';

  line.appendChild(speakerEl);
  line.appendChild(document.createTextNode(content));
  transcriptionArea.appendChild(line);

  // Auto-scroll
  transcriptionArea.scrollTop = transcriptionArea.scrollHeight;
}

// ─── Alert ────────────────────────────────────────────────────────────────────
const ALERT_LABELS = {
  pensar:    'PENSAR',
  precio:    'PRECIO',
  consultar: 'CONSULTAR',
  tiempo:    'TIEMPO',
  duda:      'DUDA',
};

function showAlert(tipo, texto) {
  alertTitle.textContent = `OBJECION: ${ALERT_LABELS[tipo] || tipo.toUpperCase()}`;
  alertBody.textContent = texto;
  secAlerta.classList.remove('hidden');

  clearTimeout(alertDismissTimeout);
  alertDismissTimeout = setTimeout(dismissAlert, 60000);
}

function dismissAlert() {
  secAlerta.classList.add('hidden');
  clearTimeout(alertDismissTimeout);
}

// ─── Status ───────────────────────────────────────────────────────────────────
const STATUS_MAP = {
  grabando:   { dot: 'recording',  label: 'Grabando' },
  procesando: { dot: 'processing', label: 'Procesando...' },
  pausa:      { dot: 'paused',     label: 'En pausa' },
};

function setStatus(key) {
  const s = STATUS_MAP[key] || STATUS_MAP.pausa;
  statusDot.className = `status-dot ${s.dot}`;
  statusText.textContent = s.label;
}

// ─── Timer ────────────────────────────────────────────────────────────────────
function formatTime(seconds) {
  const m = String(Math.floor(seconds / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  return `${m}:${s}`;
}
