/**
 * Follow-up / recordatorios dentro de la ventana de 24h.
 *
 * Igual que en la API de WhatsApp, en Instagram solo se puede escribir dentro de las
 * 24h desde el último mensaje del usuario. Dentro de esa ventana, si pasan N horas
 * (config del tenant, por defecto 4) sin que el prospecto responda, el bot le manda
 * UN recordatorio suave. Si el prospecto responde, el recordatorio se cancela.
 *
 * SCAFFOLD: usa setTimeout (vale para el simulador y un MVP de una sola instancia).
 * En producción hay que sustituirlo por un job queue durable (BullMQ/Redis, o el
 * scheduler de la nube) para que sobreviva a reinicios y escale. La interfaz
 * (schedule/cancel) no cambia.
 */

const { getConversation, saveConversation, appendMessage } = require('./state');
const { getTenant } = require('./tenants');

const WINDOW_MS = 24 * 60 * 60 * 1000;

/** ¿Seguimos dentro de la ventana de 24h desde el último mensaje del usuario? */
function withinWindow(convo) {
  return convo.lastUserAt != null && (Date.now() - convo.lastUserAt) < WINDOW_MS;
}

/**
 * Programa un recordatorio tras `followupHours` de silencio.
 * @param {object} convo
 * @param {(convo, tenant) => Promise<void>} sendReminder  callback que genera y envía el recordatorio
 */
function scheduleFollowup(convo, sendReminder) {
  cancelFollowup(convo); // nunca dos a la vez
  const tenant = getTenant(convo.accountId);
  const schedule = tenant.followupScheduleHours || [tenant.followupHours || 4];
  const idx = convo.followupCount || 0;
  if (idx >= schedule.length) return; // cadencia agotada

  const delayMs = schedule[idx] * 60 * 60 * 1000;
  const handle = setTimeout(async () => {
    const fresh = getConversation(convo.accountId, convo.userId);
    // Solo si sigue dentro de la ventana, no está en pausa/humano y no llegó respuesta.
    if (!withinWindow(fresh) || fresh.paused || fresh.owner === 'humano') return;
    fresh.followupCount = (fresh.followupCount || 0) + 1;
    fresh.followupHandle = null;
    saveConversation(fresh);
    try { await sendReminder(fresh, tenant); } catch (e) { console.error('[followup] error:', e); }
    // Re-arma el SIGUIENTE toque de la cadencia (si queda y sigue en ventana).
    scheduleFollowup(getConversation(fresh.accountId, fresh.userId), sendReminder);
  }, delayMs);

  if (typeof handle.unref === 'function') handle.unref();
  convo.followupHandle = handle;
  saveConversation(convo);
}

/** Cancela el recordatorio pendiente (p.ej. porque el prospecto respondió). */
function cancelFollowup(convo) {
  if (convo.followupHandle) {
    clearTimeout(convo.followupHandle);
    convo.followupHandle = null;
    saveConversation(convo);
  }
}

module.exports = { scheduleFollowup, cancelFollowup, withinWindow };
