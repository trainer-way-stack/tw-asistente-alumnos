/**
 * Lógica de pausa y handover (bot <-> humano).
 *
 * Cubre las funcionalidades que pediste:
 *  - Pausa manual de una conversación.
 *  - AUTO-PAUSA: si Dani o Miguel escriben a mano en el DM, el bot se pausa solo.
 *  - Pausa TEMPORAL configurable (p.ej. "pausar 2h", "pausar hasta mañana 9:00").
 *  - Reanudar (que el bot retome).
 *
 * Es independiente de la interfaz: estas funciones se pueden disparar desde GHL
 * (vía tags/webhooks) o desde un panel propio. Ver ARQUITECTURA.md §4.
 */

const { getConversation, saveConversation } = require('./state');

/** ¿Debe el bot responder ahora mismo a esta conversación? */
function shouldBotRespond(convo) {
  if (convo.owner === 'humano') return false;
  if (convo.paused) {
    // Si es pausa temporal y ya venció, la levantamos automáticamente.
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

/** Pausa manual indefinida (hasta reanudar a mano). */
function pause(userId) {
  const convo = getConversation(userId);
  convo.paused = true;
  convo.pausedUntil = null;
  return saveConversation(convo);
}

/** Pausa temporal: se reanuda sola pasados `minutes`. */
function pauseFor(userId, minutes) {
  const convo = getConversation(userId);
  convo.paused = true;
  convo.pausedUntil = Date.now() + minutes * 60 * 1000;
  return saveConversation(convo);
}

/**
 * AUTO-PAUSA por intervención humana.
 * Llamar cuando detectamos que un humano (Dani/Miguel) ha escrito manualmente en
 * el DM. En la API esto llega como un 'message echo' cuyo texto NO coincide con lo
 * que envió el bot -> lo interpretamos como intervención manual.
 * `resumeAfterMin`: opcional, para auto-reanudar tras un rato de silencio del humano.
 */
function autoPauseOnHumanReply(userId, { resumeAfterMin = null } = {}) {
  const convo = getConversation(userId);
  convo.owner = 'humano';
  convo.paused = true;
  convo.pausedUntil = resumeAfterMin ? Date.now() + resumeAfterMin * 60 * 1000 : null;
  return saveConversation(convo);
}

/** Reanudar: el bot vuelve a llevar la conversación. */
function resume(userId) {
  const convo = getConversation(userId);
  convo.paused = false;
  convo.pausedUntil = null;
  convo.owner = 'bot';
  return saveConversation(convo);
}

module.exports = { shouldBotRespond, pause, pauseFor, autoPauseOnHumanReply, resume };
