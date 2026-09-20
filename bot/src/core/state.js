/**
 * Estado por conversación.
 *
 * Multi-cuenta: la conversación se identifica por (accountId, userId), de forma que
 * nunca se mezclan prospectos de distintos dueños (clave para revender el producto).
 *
 * SCAFFOLD: implementación en memoria para probar en local / simulador. En
 * producción va a base de datos (Postgres para historial + Redis para estado
 * caliente). La interfaz pública (get/save) no cambia.
 */

const store = new Map();

const key = (accountId, userId) => `${accountId}::${userId}`;

/** Estructura de una conversación. */
function newConversation(accountId, userId) {
  return {
    accountId,                 // cuenta de IG dueña (tenant)
    userId,                    // id del prospecto en IG
    stage: 'inicio',           // fase del guion (ver knowledge/layers.js)
    owner: 'bot',              // 'bot' | 'humano'
    paused: false,             // pausa manual/temporal (ver core/pause.js)
    pausedUntil: null,
    disclosureSent: false,     // aviso de IA enviado (una sola vez)
    username: null,            // @usuario de IG (best-effort, para el panel)
    score: 0,                  // scoring de cualificación 0-10 (ver core/scoring.js)
    followupCount: 0,          // recordatorios enviados en esta conversación
    followupHandle: null,      // handle del recordatorio programado (para cancelar)
    lastUserAt: null,          // timestamp del último mensaje del prospecto (ventana 24h)
    messages: [],              // [{ role, text, ts }]
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function getConversation(accountId, userId) {
  const k = key(accountId, userId);
  if (!store.has(k)) store.set(k, newConversation(accountId, userId));
  return store.get(k);
}

function saveConversation(convo) {
  convo.updatedAt = Date.now();
  store.set(key(convo.accountId, convo.userId), convo);
  return convo;
}

function appendMessage(convo, role, text) {
  convo.messages.push({ role, text, ts: Date.now() });
  if (role === 'user') convo.lastUserAt = Date.now();
  return convo;
}

/** Lista resumida de conversaciones (para el panel). Más recientes primero. */
function listConversations() {
  return [...store.values()]
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .map((c) => {
      const last = c.messages[c.messages.length - 1];
      return {
        accountId: c.accountId,
        userId: c.userId,
        username: c.username || null,
        stage: c.stage,
        owner: c.owner,
        paused: !!c.paused,
        score: c.score,
        msgs: c.messages.length,
        lastRole: last?.role || null,
        lastText: last ? String(last.text).slice(0, 140) : '',
        updatedAt: c.updatedAt,
      };
    });
}

module.exports = { getConversation, saveConversation, appendMessage, listConversations };
