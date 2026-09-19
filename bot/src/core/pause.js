/**
 * Lógica de pausa y handover (bot <-> humano).
 *
 * Funcionalidades:
 *  - Pausa manual de una conversación.
 *  - AUTO-PAUSA: si un humano (Dani/alumno) escribe a mano en el DM, el bot se pausa.
 *  - Pausa TEMPORAL configurable (p.ej. "pausar 2h", "hasta mañana 9:00").
 *  - Reanudar (el bot retoma).
 *
 * Independiente de la interfaz: se dispara desde GHL (tags/webhooks) o desde el panel
 * propio. Multi-cuenta: todas las funciones reciben (accountId, userId).
 */

const { getConversation, saveConversation } = require('./state');

/** ¿Debe el bot responder ahora mismo a esta conversación? */
function shouldBotRespond(convo) {
  if (convo.owner === 'humano') return false;
  if (convo.paused) {
    if (convo.pausedUntil && Date.now() >= convo.pausedUntil) {
      convo.paused = false;
      convo.pausedUntil = null;
      saveConversation(convo);
      return true;
    }
    return false;
  }
  return true;
}

function pause(accountId, userId) {
  const convo = getConversation(accountId, userId);
  convo.paused = true;
  convo.pausedUntil = null;
  return saveConversation(convo);
}

function pauseFor(accountId, userId, minutes) {
  const convo = getConversation(accountId, userId);
  convo.paused = true;
  convo.pausedUntil = Date.now() + minutes * 60 * 1000;
  return saveConversation(convo);
}

/**
 * AUTO-PAUSA por intervención humana. Llamar cuando detectamos un 'message echo'
 * cuyo texto NO coincide con lo que envió el bot -> lo escribió un humano a mano.
 */
function autoPauseOnHumanReply(accountId, userId, { resumeAfterMin = null } = {}) {
  const convo = getConversation(accountId, userId);
  convo.owner = 'humano';
  convo.paused = true;
  convo.pausedUntil = resumeAfterMin ? Date.now() + resumeAfterMin * 60 * 1000 : null;
  return saveConversation(convo);
}

function resume(accountId, userId) {
  const convo = getConversation(accountId, userId);
  convo.paused = false;
  convo.pausedUntil = null;
  convo.owner = 'bot';
  return saveConversation(convo);
}

/**
 * HANDOVER por escalado del propio bot: el bot detecta algo que debe ver un humano,
 * se pausa y cede la propiedad. El humano retoma (y luego `resume` si procede).
 */
function handoverToHuman(convo, reason = '') {
  convo.owner = 'humano';
  convo.paused = true;
  convo.pausedUntil = null;
  convo.handover = { at: Date.now(), reason };
  return saveConversation(convo);
}

module.exports = { shouldBotRespond, pause, pauseFor, autoPauseOnHumanReply, handoverToHuman, resume };
