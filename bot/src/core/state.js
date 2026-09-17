/**
 * Estado por conversación.
 *
 * SCAFFOLD: implementación en memoria para poder probar en local / simulador.
 * En producción hay que mover esto a una base de datos persistente (Postgres para
 * el historial + Redis para estado caliente). La interfaz pública (get/save) no
 * cambia, así que el resto del código no se entera del cambio.
 */

const store = new Map();

/** Estructura de una conversación. */
function newConversation(userId) {
  return {
    userId,                    // id del prospecto en IG
    stage: 'inicio',           // fase del guion de captación (ver knowledge/layers.js)
    owner: 'bot',              // 'bot' | 'humano'  -> quién lleva la conversación ahora
    paused: false,             // pausa manual/temporal (ver core/pause.js)
    pausedUntil: null,         // timestamp hasta el que está pausada (pausa temporal)
    disclosureSent: false,     // si ya se envió el aviso legal de IA (una sola vez)
    messages: [],              // historial [{ role, text, ts }]
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function getConversation(userId) {
  if (!store.has(userId)) store.set(userId, newConversation(userId));
  return store.get(userId);
}

function saveConversation(convo) {
  convo.updatedAt = Date.now();
  store.set(convo.userId, convo);
  return convo;
}

function appendMessage(convo, role, text) {
  convo.messages.push({ role, text, ts: Date.now() });
  return convo;
}

module.exports = { getConversation, saveConversation, appendMessage };
