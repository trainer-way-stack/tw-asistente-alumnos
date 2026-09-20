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
const { sendSequence } = require('../instagram/client');
const { generateReply, generateReminder } = require('./llm');

/**
 * Allowlist de PRUEBAS: si ALLOWED_SENDER_IDS está definido (lista de ids de IG separados por
 * comas), el bot SOLO responde a esas cuentas y IGNORA al resto. Si está vacío, responde a todos
 * (comportamiento normal de producción). Sirve para probar con cuentas concretas sin que el bot
 * conteste a nadie más.
 */
function allowlist() {
  return (process.env.ALLOWED_SENDER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
}

async function handleIncomingMessage({ accountId, senderId, text }) {
  const allowed = allowlist();
  if (allowed.length && !allowed.includes(String(senderId))) {
    console.log(`[orq] ${accountId}/${senderId}: fuera de la allowlist de pruebas, se ignora.`);
    return;
  }

  const tenant = getTenant(accountId);
  const convo = getConversation(accountId, senderId);

  cancelFollowup(convo);              // respondió -> no mandamos recordatorio
  convo.followupCount = 0;            // respondió -> reinicia la cadencia de follow-up
  appendMessage(convo, 'user', text);

  if (!shouldBotRespond(convo)) {
    saveConversation(convo);
    console.log(`[orq] ${accountId}/${senderId}: en pausa/humano, no responde.`);
    return;
  }

  // 1) Recuperar conocimiento relevante (solo de las capas que tocan).
  const context = await retrieve({ text, stage: convo.stage });

  // 2) Generar respuesta + score.
  const isFirstBotTurn = !convo.messages.some((m) => m.role === 'assistant');
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

  // 4) Aviso de IA: en el primer turno va DESPUÉS de la respuesta nativa (claro y temprano).
  const disclosure = maybeDisclosure(convo, tenant);
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
}

module.exports = { handleIncomingMessage };
