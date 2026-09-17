/**
 * Definición de las CAPAS de conocimiento.
 *
 * Cada capa es una fuente de conocimiento independiente. El orquestador decide, en
 * cada mensaje, de qué capa(s) recuperar información (RAG) — NO se le mete todo a la
 * vez. Esto es lo que hace las respuestas cortas y naturales (ver ARQUITECTURA.md §5).
 *
 * `source` describe de dónde salen los datos de cada capa (ver data/ingestion/).
 */

const LAYERS = {
  TONO: {
    id: 'tono',
    nombre: 'Tono de Dani',
    descripcion: 'CÓMO se expresa Dani: ritmo, longitud de frase, muletillas, emojis, ' +
      'formalidad. Estilo, NO conceptos ni técnicas de captación.',
    source: 'WhatsApp de Dani + transcripciones de mentorías',
    // El tono se aplica SIEMPRE (como guía de estilo + ejemplos few-shot), no se "recupera".
    always: true,
  },
  PROGRAMA: {
    id: 'programa',
    nombre: 'Conocimiento del programa',
    descripcion: 'Parte práctica: qué incluye, cómo funciona, logística, dudas frecuentes.',
    source: 'Materiales del programa + FAQs del equipo',
    always: false,
  },
  OBJECIONES: {
    id: 'objeciones',
    nombre: 'Resolución de objeciones prematuras',
    descripcion: 'Patrones de objeción (caro, tiempo, "me lo pienso", pareja...) y la ' +
      'forma de Dani de reencuadrarlas antes de la llamada sin quemar el lead.',
    source: 'Conversaciones reales con objeciones + metodología de Dani',
    always: false,
  },
  CAPTACION: {
    id: 'captacion',
    nombre: 'Gestión de la conversación de captación',
    descripcion: 'El ARCO de una conversación que convierte: apertura, calificación ' +
      'natural, interés, transición a llamada. Ritmo y micro-pasos, no checklist.',
    source: 'Conversaciones EXITOSAS de Miguel (llegaron a llamada Y compraron)',
    always: false,
  },
  // ── Capas extra recomendadas (ver ARQUITECTURA.md §5) ──
  CALIFICACION: {
    id: 'calificacion',
    nombre: 'Calificación / descarte (fit)',
    descripcion: 'Detectar a quién NO encaja para no quemar agenda ni tiempo.',
    source: 'Conversaciones que NO convirtieron + criterios de cliente ideal',
    always: false,
  },
  AGENDAMIENTO: {
    id: 'agendamiento',
    nombre: 'Agendamiento',
    descripcion: 'Cuándo y cómo proponer la llamada + integración con calendario (GHL).',
    source: 'Conversaciones donde se cerró la llamada',
    always: false,
  },
  SEGUIMIENTO: {
    id: 'seguimiento',
    nombre: 'Seguimiento / follow-up',
    descripcion: 'Qué hacer con leads que se enfrían, respetando la ventana de 24h.',
    source: 'Follow-ups que recuperaron conversaciones',
    always: false,
  },
  GUARDARRAILES: {
    id: 'guardarrailes',
    nombre: 'Guardarraíles / límites',
    descripcion: 'Lo que el bot NO puede decir: promesas de resultados, temas médicos, ' +
      'precios inventados, datos falsos. Se aplica SIEMPRE.',
    source: 'Políticas definidas por Dani',
    always: true,
  },
};

module.exports = { LAYERS };
