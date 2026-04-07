const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Config ──────────────────────────────────────────────────────────────────
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),

  // ── Audio sources ────────────────────────────────────────────────────────────
  getDesktopSources: () => ipcRenderer.invoke('get-desktop-sources'),

  // ── Audio processing ─────────────────────────────────────────────────────────
  // audioData is passed as a plain Array (converted from Uint8Array) for safe IPC transfer
  processAudioChunk: (audioData, sourceLabel) =>
    ipcRenderer.invoke('process-audio-chunk', audioData, sourceLabel),

  // ── Recording lifecycle ───────────────────────────────────────────────────────
  startRecording: () => ipcRenderer.invoke('start-recording'),
  stopRecording: () => ipcRenderer.invoke('stop-recording'),

  // ── Utils ─────────────────────────────────────────────────────────────────────
  copyTranscription: () => ipcRenderer.invoke('copy-transcription'),
  resetTranscription: () => ipcRenderer.invoke('reset-transcription'),
  openConfig: () => ipcRenderer.invoke('open-config'),
  testApis: (config) => ipcRenderer.invoke('test-apis', config),
  testAnalysis: (payload) => ipcRenderer.invoke('test-analysis', payload),

  // ── Main → Renderer events ────────────────────────────────────────────────────
  onTranscriptionUpdate: (cb) =>
    ipcRenderer.on('transcription-update', (_, data) => cb(data)),
  onAnalysisUpdate: (cb) =>
    ipcRenderer.on('analysis-update', (_, data) => cb(data)),
  onStatusUpdate: (cb) =>
    ipcRenderer.on('status-update', (_, status) => cb(status)),
  onTimerUpdate: (cb) =>
    ipcRenderer.on('timer-update', (_, seconds) => cb(seconds)),

  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
});
