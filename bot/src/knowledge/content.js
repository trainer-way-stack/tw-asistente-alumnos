/**
 * Cargador de la base de conocimiento destilada (bot/src/knowledge/content/*.md).
 *
 * Cada archivo .md es una CAPA destilada de los materiales reales de Trainer Way
 * (tono, captación, objeciones, calificación/scoring, programa, agendamiento). Los
 * generó la ingesta desde el Drive de Dani. Aquí solo se cargan y cachean.
 *
 * MVP: se inyecta la capa entera relevante en el prompt (los archivos son pequeños).
 * Evolución: trocear + embeddings para recuperar solo fragmentos (RAG fino) cuando la
 * base crezca (p.ej. al añadir cientos de conversaciones reales).
 */

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'content');
const cache = new Map();

/** Devuelve el contenido destilado de una capa por su id, o null si no existe. */
function loadLayer(layerId) {
  if (cache.has(layerId)) return cache.get(layerId);
  const file = path.join(DIR, `${layerId}.md`);
  let content = null;
  try {
    content = fs.readFileSync(file, 'utf8');
  } catch {
    content = null; // capa sin contenido todavía (p.ej. seguimiento)
  }
  cache.set(layerId, content);
  return content;
}

module.exports = { loadLayer };
