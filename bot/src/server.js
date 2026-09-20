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

// --- Páginas legales requeridas por Meta (política de privacidad + borrado de datos) ---
const OWNER = process.env.BRAND_NAME || 'Trainer Way';
const CONTACT_EMAIL = process.env.PRIVACY_CONTACT || 'hola@trainerway.es';
const pageStyle = 'max-width:760px;margin:40px auto;padding:0 20px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.6;color:#1a1a1a}h1{font-size:1.6rem}h2{font-size:1.15rem;margin-top:1.6em}small{color:#666}';

app.get('/privacidad', (_req, res) => {
  res.type('html').send(`<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Política de privacidad — ${OWNER}</title>
<style>body{${pageStyle}</style></head><body>
<h1>Política de privacidad</h1>
<small>Asistente de mensajería de ${OWNER} en Instagram · última actualización: 2026-09-20</small>
<h2>Quiénes somos</h2>
<p>Este asistente de mensajería lo opera <strong>${OWNER}</strong>. A través de los mensajes directos de Instagram
atendemos y cualificamos a personas interesadas en nuestros servicios de mentoría para profesionales del sector.</p>
<h2>Qué datos tratamos</h2>
<p>Cuando nos escribes por Instagram tratamos tu <strong>nombre de usuario e identificador de Instagram</strong> y el
<strong>contenido de los mensajes</strong> que intercambias con nosotros, con el fin de responderte, resolver tus dudas y,
si encaja, ayudarte a agendar una llamada. No recopilamos datos especiales ni datos de pago por este canal.</p>
<h2>Uso de inteligencia artificial</h2>
<p>Las respuestas se generan con ayuda de un asistente de IA <strong>supervisado por nuestro equipo humano</strong>. Te
informamos de ello en la propia conversación.</p>
<h2>Base legal y finalidad</h2>
<p>Tratamos tus datos sobre la base de tu <strong>consentimiento</strong> al iniciar la conversación y de nuestro
<strong>interés legítimo</strong> en atender solicitudes comerciales. La finalidad es la atención y gestión de tu interés.</p>
<h2>Con quién los compartimos</h2>
<p>Solo con los proveedores que hacen posible el servicio: <strong>Meta/Instagram</strong> (mensajería), nuestro
<strong>alojamiento</strong>, nuestro <strong>CRM</strong> (GoHighLevel) y el <strong>proveedor de IA</strong> (Anthropic),
actuando como encargados del tratamiento. <strong>No vendemos tus datos.</strong></p>
<h2>Conservación</h2>
<p>Conservamos la conversación el tiempo necesario para gestionar tu interés y cumplir obligaciones legales; después se
suprime o anonimiza.</p>
<h2>Tus derechos</h2>
<p>Puedes ejercer tus derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad escribiendo a
<a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>. También puedes reclamar ante la autoridad de control competente.</p>
<h2>Borrado de datos</h2>
<p>Consulta cómo solicitar la eliminación de tus datos en <a href="/borrado-datos">/borrado-datos</a>.</p>
<h2>Contacto</h2>
<p>${OWNER} · <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>
</body></html>`);
});

app.get('/borrado-datos', (_req, res) => {
  res.type('html').send(`<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Borrado de datos — ${OWNER}</title>
<style>body{${pageStyle}</style></head><body>
<h1>Instrucciones para el borrado de datos</h1>
<small>Asistente de mensajería de ${OWNER} en Instagram</small>
<p>Si has hablado con nuestro asistente por Instagram y quieres que eliminemos los datos asociados a tu conversación
(tu identificador de Instagram y los mensajes intercambiados), tienes dos opciones:</p>
<h2>1. Por mensaje</h2>
<p>Escríbenos por el mismo chat de Instagram el texto <strong>"BORRAR MIS DATOS"</strong> y lo tramitaremos.</p>
<h2>2. Por email</h2>
<p>Envía un correo a <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> desde el que puedas identificarte, indicando
tu usuario de Instagram y la solicitud de borrado.</p>
<p>Eliminaremos tus datos en un plazo máximo de <strong>30 días</strong> y te confirmaremos cuando esté hecho, salvo que
debamos conservarlos por una obligación legal.</p>
<h2>Contacto</h2>
<p>${OWNER} · <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>
</body></html>`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`TW Setter IA escuchando en :${PORT}`));
