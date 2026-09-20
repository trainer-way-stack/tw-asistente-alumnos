/**
 * Control de captación y feedback (para el panel de Miguel).
 *
 * - modo: 'allowlist' (solo cuentas de la lista), 'nuevas' (las conversaciones que se abran a
 *   partir de que se activó el modo), 'todas' (cualquiera).
 * - allow: ids de IG a los que el bot SÍ responde.
 * - feedback: notas de Miguel para ir corrigiendo al bot.
 *
 * Persistencia: fichero JSON local (data/control.json), git-ignored. Sobrevive a reinicios del
 * contenedor; se pierde en un redeploy (para durabilidad real → BD, deuda técnica §8). Cada
 * feedback se vuelca además al log.
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', '..', 'data', 'control.json');
const MODES = ['allowlist', 'nuevas', 'todas'];

const state = {
  mode: MODES.includes(process.env.BOT_CAPTURE_MODE) ? process.env.BOT_CAPTURE_MODE : 'allowlist',
  since: Date.now(),
  allow: (process.env.ALLOWED_SENDER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean),
  feedback: [],
};
try { Object.assign(state, JSON.parse(fs.readFileSync(FILE, 'utf8'))); } catch { /* primera vez */ }

function persist() {
  try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(state, null, 2)); }
  catch (e) { console.error('[control] no se pudo persistir:', e.message); }
}

function getState() {
  return { mode: state.mode, since: state.since, allow: state.allow, feedbackCount: state.feedback.length };
}
function setMode(m) {
  if (MODES.includes(m)) { state.mode = m; if (m === 'nuevas') state.since = Date.now(); persist(); }
  return getState();
}
function addAllow(id) {
  id = String(id || '').trim();
  if (id && !state.allow.includes(id)) { state.allow.push(id); persist(); }
  return state.allow;
}
function removeAllow(id) {
  id = String(id || '').trim();
  state.allow = state.allow.filter((x) => x !== id); persist();
  return state.allow;
}
/**
 * ¿Debe el bot atender a este sender?
 * - 'todas': a todos.
 * - 'allowlist' y 'nuevas': solo si está en la lista `allow`. La diferencia es CÓMO se llena la
 *   lista: en 'nuevas' se añade sola cuando Miguel ABRE la conversación (ver noteOutbound en el
 *   orquestador); en 'allowlist' la activa Miguel a mano desde el panel. Así, una conversación ya
 *   existente en IG (inbound primero, sin que Miguel la abra) NO se responde.
 */
function isAllowed(senderId) {
  if (state.mode === 'todas') return true;
  return state.allow.includes(String(senderId));
}
function getMode() { return state.mode; }
function addFeedback({ texto, autor, ref } = {}) {
  const f = { ts: Date.now(), texto: String(texto || '').slice(0, 2000), autor: autor || 'Miguel', ref: ref || '' };
  state.feedback.unshift(f);
  state.feedback = state.feedback.slice(0, 500);
  persist();
  console.log('[feedback]', JSON.stringify(f));
  return f;
}
function listFeedback() { return state.feedback; }

module.exports = { getState, getMode, setMode, addAllow, removeAllow, isAllowed, addFeedback, listFeedback, MODES };
