/**
 * AudioCapture — Dual audio capture (mic + system audio)
 * Browser-compatible class loaded in the Electron renderer process.
 *
 * Uses two independent MediaRecorder loops:
 *  - Mic stream  → onMicChunk callback every CHUNK_DURATION ms
 *  - System stream → onSystemChunk callback every CHUNK_DURATION ms
 *
 * System audio is captured via Electron's desktopCapturer (chromeMediaSource: 'desktop').
 * The caller must provide a systemSourceId obtained from electronAPI.getDesktopSources().
 */
class AudioCapture {
  constructor(options = {}) {
    this.CHUNK_DURATION = options.chunkDuration || 15000;
    this.isRecording = false;
    this.micStream = null;
    this.systemStream = null;
    this.onMicChunk = null;
    this.onSystemChunk = null;
    this._activeTimeouts = [];
  }

  /**
   * Start capturing audio from mic and (optionally) system audio.
   * System audio source selection is handled by main process via
   * setDisplayMediaRequestHandler (it reads config.systemSourceId).
   * @param {object} opts
   * @param {string}   opts.micDeviceId    - deviceId for mic (or 'default')
   * @param {function} opts.onMicChunk     - called with Uint8Array for each mic chunk
   * @param {function} opts.onSystemChunk  - called with Uint8Array for each system chunk
   */
  async start({ micDeviceId, onMicChunk, onSystemChunk }) {
    this.onMicChunk = onMicChunk;
    this.onSystemChunk = onSystemChunk;
    this.isRecording = true;

    // ── Microphone ────────────────────────────────────────────────────────────
    try {
      const audioConstraint =
        micDeviceId && micDeviceId !== 'default'
          ? { deviceId: { exact: micDeviceId } }
          : true;

      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraint,
        video: false,
      });

      this._startChunkLoop(this.micStream, this.onMicChunk);
    } catch (err) {
      throw new Error(`No se pudo acceder al micrófono: ${err.message}`);
    }

    // ── System audio (loopback via getDisplayMedia) ───────────────────────────
    // Intercepted in main process by setDisplayMediaRequestHandler, which returns
    // the configured screen source with audio:'loopback'. Works on both
    // Windows 10+ (WASAPI loopback) and macOS 13+ (ScreenCaptureKit).
    this.systemAudioActive = false;
    if (this.onSystemChunk) {
      try {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          audio: true,
          video: true, // required by spec; we discard the track
        });

        // Discard video tracks — we only need audio
        displayStream.getVideoTracks().forEach((t) => t.stop());

        const audioTracks = displayStream.getAudioTracks();
        if (audioTracks.length === 0) {
          throw new Error(
            'No se obtuvo audio del sistema. ' +
            (navigator.userAgent.includes('Mac')
              ? 'En macOS: habilita el permiso de Grabación de Pantalla en Ajustes → Privacidad. Requiere macOS 13+.'
              : 'Asegúrate de que hay audio reproduciéndose por el dispositivo de salida por defecto.')
          );
        }

        this.systemStream = new MediaStream(audioTracks);
        this.systemAudioActive = true;
        this._startChunkLoop(this.systemStream, this.onSystemChunk);
      } catch (err) {
        console.error('[AudioCapture] System audio FAILED:', err.message);
        const warning = new Error(
          `No se pudo capturar audio del sistema (voz del cliente): ${err.message}`
        );
        warning.code = 'SYSTEM_AUDIO_FAILED';
        throw warning;
      }
    }
  }

  /**
   * Recursive chunk recording loop for a given stream.
   * Creates a new MediaRecorder each cycle to produce clean chunks.
   */
  _startChunkLoop(stream, onChunk) {
    if (!this.isRecording || !stream.active || !onChunk) return;

    const mimeType = this._bestMimeType();
    let recorder;

    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
    } catch (err) {
      console.error('[AudioCapture] MediaRecorder init error:', err);
      return;
    }

    const chunks = [];

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = async () => {
      if (chunks.length > 0) {
        try {
          const blob = new Blob(chunks, { type: mimeType || 'audio/webm' });
          const arrayBuffer = await blob.arrayBuffer();
          onChunk(new Uint8Array(arrayBuffer));
        } catch (err) {
          console.error('[AudioCapture] Chunk error:', err);
        }
      }
      // Start next cycle
      if (this.isRecording && stream.active) {
        this._startChunkLoop(stream, onChunk);
      }
    };

    recorder.onerror = (e) => console.error('[AudioCapture] Recorder error:', e.error);

    recorder.start();

    const t = setTimeout(() => {
      if (recorder.state === 'recording') recorder.stop();
    }, this.CHUNK_DURATION);

    this._activeTimeouts.push(t);
  }

  stop() {
    this.isRecording = false;

    this._activeTimeouts.forEach((t) => clearTimeout(t));
    this._activeTimeouts = [];

    [this.micStream, this.systemStream].forEach((stream) => {
      if (stream) stream.getTracks().forEach((t) => t.stop());
    });

    this.micStream = null;
    this.systemStream = null;
  }

  _bestMimeType() {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
    ];
    return candidates.find((t) => MediaRecorder.isTypeSupported(t)) || '';
  }

  /** Returns available audio input devices (requires prior getUserMedia permission). */
  async getAudioInputDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((d) => d.kind === 'audioinput');
    } catch {
      return [];
    }
  }
}
