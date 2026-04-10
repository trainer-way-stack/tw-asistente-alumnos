/**
 * Transcribe audio directly via OpenAI Whisper API.
 * Alumno mode — uses the student's own OpenAI API key.
 *
 * @param {Buffer} audioBuffer  - Audio bytes (webm/opus)
 * @param {string} openaiApiKey - Student's OpenAI API key
 * @returns {Promise<string>}   - Transcribed text
 */
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Pricing (USD per minute) — Whisper
const WHISPER_PRICE_PER_MIN = 0.006;

async function transcribeAudio(audioBuffer, openaiApiKey) {
  if (!openaiApiKey) throw new Error('Falta API Key de OpenAI');

  const client = new OpenAI({ apiKey: openaiApiKey });

  // OpenAI SDK needs a file-like object — write buffer to temp file
  const tmpPath = path.join(os.tmpdir(), `tw-audio-${Date.now()}.webm`);
  fs.writeFileSync(tmpPath, audioBuffer);

  try {
    const transcription = await client.audio.transcriptions.create({
      model: 'whisper-1',
      file: fs.createReadStream(tmpPath),
      language: 'es',
      response_format: 'verbose_json',
    });

    const text = (transcription.text || '').trim();
    const durationSec = typeof transcription.duration === 'number' ? transcription.duration : 0;
    const costUsd = (durationSec / 60) * WHISPER_PRICE_PER_MIN;

    return {
      text,
      durationSec,
      costUsd,
    };
  } finally {
    try { fs.unlinkSync(tmpPath); } catch {}
  }
}

/**
 * Quick test: list models to verify the key works.
 */
async function verifyOpenAI(openaiApiKey) {
  if (!openaiApiKey) throw new Error('Falta API Key de OpenAI');
  const client = new OpenAI({ apiKey: openaiApiKey });
  await client.models.retrieve('whisper-1');
  return true;
}

module.exports = { transcribeAudio, verifyOpenAI, WHISPER_PRICE_PER_MIN };
