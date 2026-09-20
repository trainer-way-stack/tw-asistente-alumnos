/**
 * Cliente de envío de mensajes por la Graph API de Instagram.
 *
 * Incluye troceado en varios mensajes y el indicador "escribiendo…" para que la
 * conversación se sienta humana (dentro de lo razonable — sin abusar).
 *
 * Recuerda: solo se puede enviar dentro de la ventana de 24h desde la última
 * interacción del usuario (ver ARQUITECTURA.md §1.3).
 */

const GRAPH_URL = 'https://graph.instagram.com/v21.0';

async function apiSend(recipientId, messagePayload) {
  const token = process.env.IG_ACCESS_TOKEN;
  if (!token) {
    console.warn('[ig] IG_ACCESS_TOKEN no configurado — no se envía (modo dev).');
    return { simulated: true };
  }
  const res = await fetch(`${GRAPH_URL}/me/messages?access_token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient: { id: recipientId }, ...messagePayload }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`[ig] envío falló ${res.status}: ${body}`);
  }
  return res.json();
}

/** Indicador "escribiendo…". */
async function sendTyping(recipientId, on = true) {
  return apiSend(recipientId, { sender_action: on ? 'typing_on' : 'typing_off' });
}

/** Envía un texto simple. */
async function sendText(recipientId, text) {
  return apiSend(recipientId, { message: { text } });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Envía uno o varios mensajes en secuencia, con "escribiendo…" y pausas
 * proporcionales a la longitud, para un ritmo natural.
 * @param {string} recipientId
 * @param {string[]} messages
 */
async function sendSequence(recipientId, messages) {
  for (const msg of messages) {
    await sendTyping(recipientId, true);
    await sleep(Math.min(400 + msg.length * 25, 3500)); // ritmo de escritura acotado
    await sendText(recipientId, msg);
  }
  await sendTyping(recipientId, false);
}

/** Resuelve el @usuario (o nombre) de un IGSID que nos ha escrito. Best-effort. */
async function getUsername(igsid) {
  const token = process.env.IG_ACCESS_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch(`${GRAPH_URL}/${igsid}?fields=username,name&access_token=${token}`);
    if (!res.ok) return null;
    const j = await res.json();
    return j.username || j.name || null;
  } catch { return null; }
}

module.exports = { sendText, sendTyping, sendSequence, getUsername };
