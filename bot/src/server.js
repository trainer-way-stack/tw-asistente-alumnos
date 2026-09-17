/**
 * Webhook de Instagram + arranque del servicio.
 *
 * Responsabilidades:
 *  - Verificar el webhook con Meta (GET, handshake con IG_VERIFY_TOKEN).
 *  - Recibir eventos de mensajes (POST) y validar la firma (X-Hub-Signature-256).
 *  - Pasar cada mensaje entrante al orquestador.
 *
 * IMPORTANTE: este servidor NO inicia conversaciones. Solo reacciona a mensajes
 * que la persona ha enviado (cumplimiento de las reglas de la plataforma).
 */
require('dotenv').config();
const crypto = require('crypto');
const express = require('express');

const { handleIncomingMessage } = require('./core/orchestrator');

const app = express();

// Necesitamos el body en crudo para validar la firma de Meta.
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));

const VERIFY_TOKEN = process.env.IG_VERIFY_TOKEN;
const APP_SECRET = process.env.IG_APP_SECRET;

/** Handshake de verificación del webhook (Meta lo llama una vez al configurarlo). */
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

/** Valida que el POST viene realmente de Meta (firma HMAC con el app secret). */
function isValidSignature(req) {
  if (!APP_SECRET) return true; // en desarrollo local sin secret configurado
  const signature = req.get('X-Hub-Signature-256') || '';
  const expected = 'sha256=' + crypto
    .createHmac('sha256', APP_SECRET)
    .update(req.rawBody)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

/** Recepción de eventos (mensajes entrantes). */
app.post('/webhook', async (req, res) => {
  if (!isValidSignature(req)) return res.sendStatus(403);

  // Respondemos 200 rápido; el procesamiento va async para no agotar el timeout de Meta.
  res.sendStatus(200);

  try {
    const body = req.body;
    if (body.object !== 'instagram') return;

    for (const entry of body.entry || []) {
      for (const event of entry.messaging || []) {
        // Ignorar 'echoes' (mensajes que enviamos nosotros mismos).
        if (event.message?.is_echo) continue;
        if (!event.message?.text) continue; // de momento solo texto

        await handleIncomingMessage({
          accountId: event.recipient.id, // la cuenta de IG que recibe = el tenant
          senderId: event.sender.id,     // el prospecto
          text: event.message.text,
          timestamp: event.timestamp,
        });
      }
    }
  } catch (err) {
    console.error('[webhook] error procesando evento:', err);
  }
});

app.get('/health', (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`TW Setter IA escuchando en :${PORT}`));
