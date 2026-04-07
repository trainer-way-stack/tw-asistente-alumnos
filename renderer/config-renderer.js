'use strict';

// ─── DOM ──────────────────────────────────────────────────────────────────────
const openaiKeyEl    = document.getElementById('openai-key');
const anthropicKeyEl = document.getElementById('anthropic-key');
const btnToggleOAI   = document.getElementById('btn-toggle-openai');
const btnToggleAnth  = document.getElementById('btn-toggle-anthropic');
const micDeviceEl    = document.getElementById('mic-device');
const systemSrcEl    = document.getElementById('system-source');
const btnTest        = document.getElementById('btn-test');
const testResult     = document.getElementById('test-result');
const btnSave        = document.getElementById('btn-save');
const saveMsg        = document.getElementById('save-msg');
const btnTestAudio   = document.getElementById('btn-test-audio');
const audioTestRes   = document.getElementById('audio-test-result');

const PROFILE_FIELDS = {
  nicho:         document.getElementById('p-nicho'),
  clienteIdeal:  document.getElementById('p-cliente'),
  precio:        document.getElementById('p-precio'),
  ofertaNombre:  document.getElementById('p-oferta-nombre'),
  ofertaPromesa: document.getElementById('p-oferta-promesa'),
  pilar1:        document.getElementById('p-pilar1'),
  pilar2:        document.getElementById('p-pilar2'),
  pilar3:        document.getElementById('p-pilar3'),
  resultados:    document.getElementById('p-resultados'),
};

const btnTestAnalysis = document.getElementById('btn-test-analysis');
const analysisResult  = document.getElementById('analysis-test-result');

// ─── Toggle show/hide API keys ───────────────────────────────────────────────
function setupToggle(btn, input) {
  btn.addEventListener('click', () => {
    if (input.type === 'password') {
      input.type = 'text';
      btn.textContent = '🔒';
    } else {
      input.type = 'password';
      btn.textContent = '👁';
    }
  });
}

setupToggle(btnToggleOAI, openaiKeyEl);
setupToggle(btnToggleAnth, anthropicKeyEl);

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  const config = await window.electronAPI.getConfig();

  openaiKeyEl.value    = config.openaiApiKey    || '';
  anthropicKeyEl.value = config.anthropicApiKey  || '';

  const profile = config.profile || {};
  Object.entries(PROFILE_FIELDS).forEach(([key, el]) => {
    if (el) el.value = profile[key] || '';
  });

  await loadMicDevices(config.micDeviceId);
  await loadDesktopSources(config.systemSourceId);
}

function collectProfile() {
  const profile = {};
  Object.entries(PROFILE_FIELDS).forEach(([key, el]) => {
    profile[key] = el ? el.value.trim() : '';
  });
  return profile;
}

async function loadMicDevices(savedId) {
  try {
    await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      .then((s) => s.getTracks().forEach((t) => t.stop()))
      .catch(() => {});

    const devices = await navigator.mediaDevices.enumerateDevices();
    const mics = devices.filter((d) => d.kind === 'audioinput');

    micDeviceEl.innerHTML = '<option value="default">Microfono por defecto</option>';
    mics.forEach((device, idx) => {
      const opt = document.createElement('option');
      opt.value = device.deviceId;
      opt.textContent = device.label || `Microfono ${idx + 1}`;
      if (device.deviceId === savedId) opt.selected = true;
      micDeviceEl.appendChild(opt);
    });
  } catch (err) {
    console.warn('Could not enumerate mic devices:', err.message);
  }
}

async function loadDesktopSources(savedId) {
  try {
    const sources = await window.electronAPI.getDesktopSources();

    systemSrcEl.innerHTML = '<option value="">Sin audio del sistema</option>';
    sources.forEach((src) => {
      const opt = document.createElement('option');
      opt.value = src.id;
      opt.textContent = src.name;
      if (src.id === savedId) opt.selected = true;
      systemSrcEl.appendChild(opt);
    });
  } catch (err) {
    console.warn('Could not get desktop sources:', err.message);
  }
}

// ─── Verificar API Keys ──────────────────────────────────────────────────────
btnTest.addEventListener('click', async () => {
  const openaiKey    = openaiKeyEl.value.trim();
  const anthropicKey = anthropicKeyEl.value.trim();

  if (!openaiKey && !anthropicKey) {
    testResult.innerHTML = '<div class="fail">Introduce al menos una API key.</div>';
    return;
  }

  testResult.innerHTML = '<span style="color:#888">Verificando...</span>';
  btnTest.disabled = true;

  try {
    const res = await window.electronAPI.testApis({
      openaiApiKey: openaiKey,
      anthropicApiKey: anthropicKey,
    });

    let html = '';

    if (openaiKey) {
      html += res.openai.connected
        ? '<div class="ok">&#10003; OpenAI conectado</div>'
        : `<div class="fail">&#10007; OpenAI: ${escHtml(res.openai.error || 'Error')}</div>`;
    }

    if (anthropicKey) {
      html += res.anthropic.connected
        ? '<div class="ok">&#10003; Anthropic conectado</div>'
        : `<div class="fail">&#10007; Anthropic: ${escHtml(res.anthropic.error || 'Error')}</div>`;
    }

    testResult.innerHTML = html;
  } catch (err) {
    testResult.innerHTML = `<div class="fail">Error: ${escHtml(err.message)}</div>`;
  } finally {
    btnTest.disabled = false;
  }
});

// ─── Test system audio ────────────────────────────────────────────────────────
btnTestAudio.addEventListener('click', async () => {
  const sourceId = systemSrcEl.value;
  if (!sourceId) {
    audioTestRes.innerHTML = '<div class="fail">Selecciona primero una pantalla.</div>';
    return;
  }

  audioTestRes.innerHTML = '<span style="color:#888">Reproduce audio por los altavoces ahora... (3s)</span>';
  btnTestAudio.disabled = true;

  const cfg = await window.electronAPI.getConfig();
  await window.electronAPI.saveConfig({ ...cfg, systemSourceId: sourceId });

  let stream = null;
  let ctx = null;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      audio: true,
      video: true,
    });

    stream.getVideoTracks().forEach((t) => t.stop());

    if (stream.getAudioTracks().length === 0) {
      const isMac = navigator.userAgent.includes('Mac');
      throw new Error(
        isMac
          ? 'Sin pistas de audio. Habilita Grabacion de Pantalla en Ajustes -> Privacidad (requiere macOS 13+).'
          : 'Sin pistas de audio del sistema. Reproduce audio por los altavoces e intentalo de nuevo.'
      );
    }

    ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    src.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);

    let maxLevel = 0;
    const t0 = Date.now();
    await new Promise((resolve) => {
      const loop = () => {
        analyser.getByteTimeDomainData(data);
        let localMax = 0;
        for (let i = 0; i < data.length; i++) {
          const v = Math.abs(data[i] - 128);
          if (v > localMax) localMax = v;
        }
        if (localMax > maxLevel) maxLevel = localMax;
        if (Date.now() - t0 < 3000) requestAnimationFrame(loop);
        else resolve();
      };
      loop();
    });

    if (maxLevel < 2) {
      audioTestRes.innerHTML =
        '<div class="fail">No se detecto audio. Reproduce sonido por los altavoces y reintenta. ' +
        'Verifica que el audio sale por el dispositivo de salida por defecto.</div>';
    } else {
      const pct = Math.min(100, Math.round((maxLevel / 64) * 100));
      audioTestRes.innerHTML =
        `<div class="ok">&#10003; Audio del sistema detectado correctamente (nivel pico: ${pct}%)</div>`;
    }
  } catch (err) {
    audioTestRes.innerHTML = `<div class="fail">&#10007; ${escHtml(err.message)}</div>`;
  } finally {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    if (ctx) ctx.close();
    btnTestAudio.disabled = false;
  }
});

// ─── Save ─────────────────────────────────────────────────────────────────────
btnSave.addEventListener('click', async () => {
  const current = await window.electronAPI.getConfig();
  const config = {
    ...current,
    openaiApiKey:    openaiKeyEl.value.trim(),
    anthropicApiKey: anthropicKeyEl.value.trim(),
    micDeviceId:     micDeviceEl.value,
    systemSourceId:  systemSrcEl.value || null,
    profile:         collectProfile(),
  };

  await window.electronAPI.saveConfig(config);

  saveMsg.textContent = '&#10003; Configuracion guardada';
  setTimeout(() => { saveMsg.textContent = ''; }, 3000);
});

// ─── Probar analisis con perfil ──────────────────────────────────────────────
btnTestAnalysis.addEventListener('click', async () => {
  const anthropicKey = anthropicKeyEl.value.trim();

  if (!anthropicKey) {
    analysisResult.innerHTML =
      '<div class="fail">Introduce tu API Key de Anthropic para probar.</div>';
    return;
  }

  analysisResult.innerHTML =
    '<span style="color:#888">Analizando transcripcion de ejemplo con tu perfil...</span>';
  btnTestAnalysis.disabled = true;

  try {
    const res = await window.electronAPI.testAnalysis({
      anthropicApiKey: anthropicKey,
      profile: collectProfile(),
    });

    if (res.error) {
      analysisResult.innerHTML = `<div class="fail">&#10007; ${escHtml(res.error)}</div>`;
      return;
    }

    const json = JSON.stringify(res.analysis, null, 2);
    analysisResult.innerHTML =
      `<div class="ok">&#10003; Analisis generado correctamente</div>` +
      `<div class="analysis-preview">` +
        `<span class="preview-label">Transcripcion de ejemplo</span>` +
        escHtml(res.sampleTranscription) +
        `<span class="preview-label">Respuesta de Claude</span>` +
        escHtml(json) +
      `</div>`;
  } catch (err) {
    analysisResult.innerHTML = `<div class="fail">&#10007; ${escHtml(err.message)}</div>`;
  } finally {
    btnTestAnalysis.disabled = false;
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

init();
