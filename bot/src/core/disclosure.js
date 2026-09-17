/**
 * Aviso de interacción con IA (art. 50 del AI Act — obligatorio desde 02/08/2026).
 *
 * FRAMING elegido por Dani: se presenta como conversación gestionada "a medias"
 * entre el asistente de IA y la persona real (Dani / el dueño de la cuenta), y el
 * beneficio es la RAPIDEZ/fluidez de respuesta. Es transparente (cumple el art. 50)
 * pero suena natural y positivo, no a disculpa.
 *
 * ORDEN (ver orchestrator): en el primer turno el bot responde primero de forma
 * NATIVA a lo que dijo la persona y a continuación mete el aviso. Sigue siendo
 * claro y temprano (2º mensaje del primer turno). Lo que NO hacemos: enterrarlo
 * para que no se lea.
 *
 * Multi-cuenta (reventa): el nombre del dueño sale de la config del tenant, así el
 * mismo código sirve para Dani o para cualquier alumno que revenda el producto.
 */

// {owner} se sustituye por el nombre del dueño de la cuenta (tenant).
const DISCLOSURES = [
  'Por cierto, te aviso: ahora mismo escribes con el asistente de IA de {owner} 🙂 Esta conversación la llevamos a medias entre {owner} y yo para que tengas respuesta al momento.',
  'Te comento de paso: soy el asistente de IA de {owner}. Esta charla la gestionamos entre {owner} y yo, así te contesto con la mayor fluidez posible 🙌',
  'Un apunte rápido y honesto: te responde el asistente de IA de {owner}. La conversación la llevamos a medias {owner} y yo para que no te quedes esperando.',
];

function pickDisclosure(ownerName) {
  const t = DISCLOSURES[Math.floor(Math.random() * DISCLOSURES.length)];
  return t.replaceAll('{owner}', ownerName || 'nuestro equipo');
}

/**
 * Devuelve el texto del aviso si toca (aún no enviado en esta conversación), o null.
 * @param {object} convo
 * @param {object} tenant  config del tenant (usa tenant.ownerName)
 */
function maybeDisclosure(convo, tenant) {
  if (convo.disclosureSent) return null;
  convo.disclosureSent = true;
  return pickDisclosure(tenant?.ownerName);
}

module.exports = { maybeDisclosure };
