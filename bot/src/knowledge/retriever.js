/**
 * Recuperación (RAG) sobre las capas de conocimiento.
 *
 * SCAFFOLD: de momento devuelve stubs. La implementación real:
 *   1. Ingesta: trocear cada fuente (data/ingestion/) en fragmentos etiquetados por capa.
 *   2. Embeddings: vectorizar cada fragmento y guardarlo en un vector store
 *      (pgvector, Pinecone, etc.), con metadato `layer`.
 *   3. Retrieve: dado el mensaje del prospecto + la fase, buscar los k fragmentos
 *      más relevantes SOLO de las capas pertinentes.
 *
 * La gracia (y la diferencia con Autosetter/Zero Chats): NO metemos todo el
 * conocimiento en el prompt. Recuperamos poco y muy relevante -> respuestas cortas,
 * naturales y con el tono correcto.
 */

const { LAYERS } = require('./layers');
const { loadLayer } = require('./content');

/**
 * Decide qué capas consultar según la fase de la conversación.
 * Las capas `always` (tono, guardarraíles) se incluyen siempre.
 */
function selectLayers(stage) {
  const always = Object.values(LAYERS).filter((l) => l.always).map((l) => l.id);
  const byStage = {
    inicio:       ['captacion'],
    calificando:  ['captacion', 'calificacion', 'programa'],
    interes:      ['captacion', 'programa', 'objeciones'],
    objecion:     ['objeciones', 'programa'],
    cierre:       ['agendamiento', 'captacion'],
    frio:         ['seguimiento'],
  };
  return [...new Set([...(byStage[stage] || ['captacion']), ...always])];
}

/**
 * Recupera fragmentos relevantes de las capas seleccionadas.
 * @returns {Promise<Array<{layer: string, text: string, score: number}>>}
 */
async function retrieve({ text, stage }) {
  const layers = selectLayers(stage);

  // MVP: inyecta la capa destilada entera (los .md son pequeños). 'tono' lo maneja
  // el LLM como guía de estilo; 'guardarrailes' va inline en el prompt.
  // Evolución: búsqueda vectorial para recuperar solo fragmentos cuando la base crezca.
  return layers
    .filter((id) => id !== 'tono' && id !== 'guardarrailes')
    .map((layer) => ({ layer, text: loadLayer(layer) }))
    .filter((c) => c.text); // descarta capas aún sin contenido
}

module.exports = { retrieve, selectLayers };
