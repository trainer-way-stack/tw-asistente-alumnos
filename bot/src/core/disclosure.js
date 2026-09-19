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
// Framing HUMORÍSTICO (Dani): transparente (cumple art. 50) pero con guiño, no a disculpa.
const DISCLOSURES = [
  'Por cierto, te aviso: estás hablando con el asistente de IA de {owner} 😅 Porfa no me lo pongas muy difícil, que si lo hago mal {owner} me despide… y está la cosa muy jodida para encontrar curro entre tanto bot mediocre 🤖',
  'Ah, te aviso de paso: soy el asistente de IA de {owner} jaja. Sé bueno conmigo, que como la líe {owner} me pone de patitas en la calle y el mercado está fatal para los bots 😂',
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
