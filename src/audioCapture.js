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
   * Single long-running MediaRecorder with timeslice.
   *
   * MediaRecorder.start(timeslice) emits ondataavailable every `timeslice` ms
   * WITHOUT stopping. This removes the start/stop gap that cut words at the
   * boundary in the previous implementation.
   *
   * Quirk: only the first ondataavailable blob contains the WebM container
   * headers (EBML + Segment init). Subsequent blobs are cluster-only data and
   * won't decode standalone. We keep the first blob as `headerBlob` and
   * prepend it to each subsequent chunk before sending to Whisper.
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

    // Holds the init segment (EBML header + tracks) from the first chunk.
    // All later chunks get this prepended so they form valid, decodable WebM.
    let headerBlob = null;

    recorder.ondataavailable = async (e) => {
      if (!e.data || e.data.size === 0) return;
      try {
        let sendBlob;
        if (!headerBlob) {
          // First chunk — contains the WebM init segment. Send as-is and keep it.
          headerBlob = e.data;
          sendBlob = e.data;
        } else {
          // Continuation chunk — prepend the saved header so Whisper can decode it.
          sendBlob = new Blob([headerBlob, e.data], { type: mimeType || 'audio/webm' });
        }
        const arrayBuffer = await sendBlob.arrayBuffer();
        onChunk(new Uint8Array(arrayBuffer));
      } catch (err) {
        console.error('[AudioCapture] Chunk emit error:', err);
      }
    };

    recorder.onerror = (e) => console.error('[AudioCapture] Recorder error:', e.error);

    // Persist reference so stop() can actually stop it.
    this._recorders = this._recorders || [];
    this._recorders.push(recorder);

    // start(timeslice) — one recorder, continuous, fires every CHUNK_DURATION ms.
    recorder.start(this.CHUNK_DURATION);
  }

  stop() {
    this.isRecording = false;

    this._activeTimeouts.forEach((t) => clearTimeout(t));
    this._activeTimeouts = [];

    if (this._recorders) {
      this._recorders.forEach((r) => {
        try { if (r.state === 'recording') r.stop(); } catch {}
      });
      this._recorders = [];
    }

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
