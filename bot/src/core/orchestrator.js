/**
 * Orquestador: el "cerebro" del setter IA.
 *
 * Por cada mensaje entrante (identificado por accountId + senderId):
 *   1. Cancela cualquier recordatorio pendiente (el prospecto ha respondido).
 *   2. Comprueba pausa/propietario (¿debe responder el bot?).
 *   3. Recupera de las CAPAS solo lo relevante (RAG).
 *   4. Genera respuesta con Claude (nativa en el 1er turno) + score de cualificación.
 *   5. Aplica el scoring: si supera el umbral del tenant, pasa a proponer llamada.
 *   6. En el primer turno añade el aviso de IA DESPUÉS de la respuesta nativa.
 *   7. Envía, registra y programa el follow-up (recordatorio a las N horas de silencio).
 */

const { getConversation, saveConversation, appendMessage } = require('./state');
const { getTenant } = require('./tenants');
const { shouldBotRespond, handoverToHuman } = require('./pause');
const { maybeDisclosure } = require('./disclosure');
const { decideFromScore } = require('./scoring');
const { decideEscalation } = require('./escalation');
const { notifyHuman } = require('./notify');
const { scheduleFollowup, cancelFollowup } = require('./followup');
const { retrieve, selectLayers } = require('../knowledge/retriever');
const { sendSequence, getUsername } = require('../instagram/client');
const { generateReply, generateReminder } = require('./llm');
const control = require('./control');

// Debounce: cuando el prospecto manda varios mensajes seguidos, esperamos a que termine y
// respondemos UNA sola vez (evita respuestas duplicadas). Lock: nunca dos respuestas a la vez.
const DEBOUNCE_MS = 6000;
const debounceTimers = new Map();
const processing = new Set();
const keyOf = (a, u) => `${a}::${u}`;

/** Entrada del webhook: encola el mensaje y programa una única respuesta tras la ráfaga. */
async function handleIncomingMessage({ accountId, senderId, text }) {
  const convo = getConversation(accountId, senderId);

  // Control de captación (panel de Miguel): modo allowlist / nuevas / todas.
  if (!control.isAllowed(senderId)) {
    console.log(`[orq] ${accountId}/${senderId}: no habilitada por el control de captación, se ignora.`);
    return;
  }

  cancelFollowup(convo);
  convo.followupCount = 0;
  appendMessage(convo, 'user', text);
  saveConversation(convo);

  const key = keyOf(accountId, senderId);
  if (debounceTimers.has(key)) clearTimeout(debounceTimers.get(key));
  const t = setTimeout(() => {
    debounceTimers.delete(key);
    processConversation(accountId, senderId).catch((e) => console.error('[orq] proc:', e));
  }, DEBOUNCE_MS);
  if (typeof t.unref === 'function') t.unref();
  debounceTimers.set(key, t);
}

/**
 * Mensaje SALIENTE de la cuenta (echo de IG): o lo mandó el bot (se ignora), o lo escribió un
 * humano. Si Miguel ABRE una conversación nueva (modo 'nuevas') -> el bot la coge. Si un humano
 * interviene en una que llevaba el bot -> auto-pausa (handover).
 */
function noteOutbound({ accountId, userId, text }) {
  const convo = getConversation(accountId, userId);
  const botSentIt = convo.messages.some((m) => m.role === 'assistant' && m.text === text);
  if (botSentIt) return; // es el eco de un mensaje del propio bot
  const knownToBot = convo.messages.length > 0;
  if (!knownToBot && control.getMode() === 'nuevas') {
    control.addAllow(userId);
    convo.owner = 'bot';
    console.log(`[orq] ${accountId}/${userId}: Miguel abrió (modo nuevas) -> bot habilitado.`);
  } else if (knownToBot) {
    handoverToHuman(convo, 'un humano escribió a mano');
    console.log(`[orq] ${accountId}/${userId}: humano intervino -> bot en pausa.`);
  }
  appendMessage(convo, 'assistant', text);
  saveConversation(convo);
}

/** Genera y envía UNA respuesta considerando todo lo acumulado en la conversación. */
async function processConversation(accountId, senderId) {
  const key = keyOf(accountId, senderId);
  if (processing.has(key)) return; // ya hay una respuesta en curso
  processing.add(key);
  try {
    const tenant = getTenant(accountId);
    const convo = getConversation(accountId, senderId);

    if (!shouldBotRespond(convo)) {
      console.log(`[orq] ${accountId}/${senderId}: en pausa/humano, no responde.`);
      return;
    }

    const isFirstBotTurn = !convo.messages.some((m) => m.role === 'assistant');
    const disclosure = maybeDisclosure(convo, tenant); // una sola vez
    saveConversation(convo);

    if (!convo.username) convo.username = await getUsername(senderId).catch(() => null);

    const lastUser = [...convo.messages].reverse().find((m) => m.role === 'user');
    const text = lastUser ? lastUser.text : '';

  // 1) Recuperar conocimiento relevante (solo de las capas que tocan).
  const context = await retrieve({ text, stage: convo.stage });

  // 2) Generar respuesta + score.
  const reply = await generateReply({ convo, context, tenant });
  const { messages, nextStage, score } = reply;

  // 2b) ¿Hay que ESCALAR a un humano? (algo nuevo/fuera de guion/sensible o baja confianza)
  const escalation = decideEscalation(reply, tenant, text);
  if (escalation.escalate) {
    handoverToHuman(convo, escalation.reason);
    convo.score = score;
    // Mensaje puente opcional (no soltamos la respuesta arriesgada del modelo).
    const bridge = tenant?.bridgeMessage ? [tenant.bridgeMessage] : [];
    if (bridge.length) {
      await sendSequence(senderId, bridge);
      bridge.forEach((m) => appendMessage(convo, 'assistant', m));
    }
    saveConversation(convo);
    await notifyHuman({ tenant, convo, reason: escalation.reason });
    console.log(`[orq] ${accountId}/${senderId}: ESCALADO a humano — ${escalation.reason}. Bot en pausa.`);
    return bridge;
  }

  // 3) Scoring de cualificación: decide el siguiente paso.
  convo.score = score;
  let stage = nextStage;
  if (stage === 'calificando') {
    const decision = decideFromScore(score, tenant);
    stage = decision.stage; // p.ej. 'cierre' si score >= umbral -> proponer llamada
  }

  // 4) Aviso de IA (reservado arriba, una sola vez): en el primer turno va DESPUÉS de la respuesta.
  const outgoing = disclosure
    ? (isFirstBotTurn ? [...messages, disclosure] : [disclosure, ...messages])
    : messages;

  // 5) Enviar + registrar.
  await sendSequence(senderId, outgoing);
  outgoing.forEach((m) => appendMessage(convo, 'assistant', m));
  convo.stage = stage;
  saveConversation(convo);

  // 6) Programar recordatorio si sigue vivo (dentro de la ventana 24h).
  scheduleFollowup(convo, async (fresh, t) => {
    const reminder = await generateReminder({ convo: fresh, tenant: t });
    await sendSequence(fresh.userId, reminder);
    reminder.forEach((m) => appendMessage(fresh, 'assistant', m));
    saveConversation(fresh);
    console.log(`[orq] ${fresh.accountId}/${fresh.userId}: recordatorio enviado.`);
  });

    console.log(`[orq] ${accountId}/${senderId}: respondido (fase: ${convo.stage}, score: ${convo.score}, capas: ${selectLayers(convo.stage).join(', ')}).`);
    return outgoing;
  } finally {
    processing.delete(key);
  }
}

module.exports = { handleIncomingMessage, noteOutbound, processConversation };
