/**
 * Aviso de interacción con IA (art. 50 del AI Act — obligatorio desde 02/08/2026).
 *
 * DECISIÓN DE DISEÑO (ver ARQUITECTURA.md §6):
 * Este módulo envía un aviso CLARO y VISIBLE, UNA sola vez, al principio de la
 * conversación. Está redactado para sonar natural y con seguridad (posicionarlo
 * como un plus: "respuesta al instante"), NO como una disculpa.
 *
 * Lo que este módulo NO hace, a propósito: NO entierra el aviso en una ráfaga de
 * mensajes para reducir la probabilidad de que se lea. Eso sería un patrón oscuro
 * que incumple el art. 50 (sanciones de hasta 15 M€ / 3% de facturación) y, sobre
 * todo, es un riesgo legal y de marca que heredarían los alumnos a quienes se les
 * pase el producto. La efectividad se gana con un bot bueno y bien posicionado, no
 * ocultando el aviso.
 */

// Varias redacciones para que no suene siempre igual (se elige una al azar).
const DISCLOSURES = [
  '¡Hola! 👋 Soy el asistente de Dani, te escribo yo para que tengas respuesta al momento. Cuéntame, ¿en qué andas?',
  '¡Buenas! Soy el asistente virtual del equipo de Dani 🙌 Así te contesto al instante. Dime, ¿qué te ha llamado la atención?',
  '¡Hey! Soy el asistente de IA de Dani, encantado. Te ayudo yo para agilizar y si hace falta te paso con el equipo. ¿Qué necesitas?',
];

function pickDisclosure() {
  return DISCLOSURES[Math.floor(Math.random() * DISCLOSURES.length)];
}

/**
 * Devuelve el texto del aviso si toca enviarlo (aún no se ha enviado en esta
 * conversación), o null si ya se envió. El orquestador lo antepone a la primera
 * respuesta del bot.
 */
function maybeDisclosure(convo) {
  if (convo.disclosureSent) return null;
  convo.disclosureSent = true;
  return pickDisclosure();
}

module.exports = { maybeDisclosure };
