/**
 * Scoring de cualificación (0-10).
 *
 * En la fase de cualificación el modelo estima cómo de buen fit es el prospecto en
 * función de la conversación (interés, situación, encaje con el cliente ideal,
 * capacidad/urgencia). Cuando el score alcanza el umbral del tenant (por defecto 7),
 * se le PROPONE llamada; por debajo, se sigue cualificando o se descarta con tacto.
 *
 * El score lo devuelve el LLM en cada turno de cualificación (ver core/llm.js).
 * Aquí solo va la lógica de decisión, para tenerla aislada y testeable.
 */

/** Decide el siguiente paso según el score y el umbral del tenant. */
function decideFromScore(score, tenant) {
  const threshold = tenant?.scoreThreshold ?? 7;
  if (score >= threshold) return { action: 'proponer_llamada', stage: 'cierre' };
  if (score <= 3) return { action: 'descartar_con_tacto', stage: 'frio' };
  return { action: 'seguir_cualificando', stage: 'calificando' };
}

module.exports = { decideFromScore };
