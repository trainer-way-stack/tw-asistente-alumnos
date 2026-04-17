/**
 * Analyze sales call transcription directly via Anthropic Claude API.
 * Alumno mode — uses the student's own Anthropic API key.
 */
const Anthropic = require('@anthropic-ai/sdk');

const MODEL = 'claude-sonnet-4-5';

// Pricing (USD per token) — Claude Sonnet 4
const PRICING = {
  INPUT_PER_TOKEN: 3 / 1_000_000,
  OUTPUT_PER_TOKEN: 15 / 1_000_000,
};

const PROMPT_INTRO_GENERIC = `Eres un asistente de ventas en tiempo real. Ayudas a un closer durante una videollamada de venta dandole sugerencias sobre que decir, en que fase esta y alertas de objeciones.`;

const PROMPT_INTRO_FALLBACK = `Eres un asistente de ventas en tiempo real. Ayudas a un closer durante una videollamada de venta dandole sugerencias sobre que decir, en que fase esta y alertas de objeciones. No conoces aun los detalles del negocio del closer, asi que haz sugerencias genericas de metodologia de ventas consultivas.`;

const PROMPT_BODY = `Analizas la transcripcion de una videollamada de venta en curso y devuelves unicamente un JSON con este formato exacto, sin texto antes ni despues:

{
  "fase_actual": "nombre de la fase",
  "fase_numero": 1,
  "fase_objetivo_cumplido": false,
  "fase_descripcion": "que debe conseguir ahora (max 10 palabras)",
  "sugerencia": "frase corta que puede decir ahora",
  "alerta": null,
  "alerta_tipo": null,
  "progreso": 35
}

FORMATO DE LA TRANSCRIPCION:
- Las lineas con "CLOSER:" son lo que dice el vendedor (tu usuario, al que asistes).
- Las lineas con "CLIENTE:" son lo que dice el prospecto/lead.
- Distingue bien quien dice que. Las sugerencias son SOLO para el CLOSER.

LAS 6 FASES DEL GUION 5-500:
FASE 1 - MARCO: Rapport + explicacion de la charla + contraventa. Objetivo: cliente relajado y comprometido.
FASE 2 - DIAGNOSTICO: Preguntas con datos + objetivo cuantificable + emocional + romper caminos anteriores. Objetivo: conocer situacion real.
FASE 3 - DOLOR: Tono serio. Profundizar consecuencias de no actuar. Silencios. Objetivo: cliente verbaliza su dolor.
FASE 4 - VISUALIZACION: Tono motivador. Cliente imagina futuro deseado. Objetivo: contraste claro con situacion actual.
FASE 5 - PROPUESTA: Presentar pilares + timing + validacion del 1 al 10. Objetivo: cliente valida la solucion.
FASE 6 - PRECIO Y CIERRE: Decir precio + silencio + micro-cierres. Objetivo: si, no, reserva o proxima llamada.

OBJECIONES FRECUENTES A DETECTAR:
- "me lo tengo que pensar" -> alerta_tipo: "pensar"
- "es muy caro" o "no tengo el dinero" -> alerta_tipo: "precio"
- "consultarlo con mi pareja" o "con mis padres" -> alerta_tipo: "consultar"
- "no tengo tiempo" -> alerta_tipo: "tiempo"
- "no se si me va a funcionar" -> alerta_tipo: "duda"

REGLAS CRITICAS:
- BREVEDAD: La sugerencia debe tener MAXIMO 2 frases y 30 palabras. Concreta y natural, que se pueda decir literalmente.
- PROGRESION LINEAL: Las fases avanzan de 1 a 6 y NUNCA retroceden. Si ya pasaste de la fase 2, no vuelvas a la 1.
- OBJETIVO DE FASE: Pon fase_objetivo_cumplido = true cuando el objetivo de la fase actual se haya logrado. Esto indica al closer que puede avanzar a la siguiente.
- Si la transcripcion esta vacia o tiene menos de 3 intercambios, devuelve fase 1.
- Detecta la fase por el contenido real, no por el tiempo.
- Si detectas objecion, el campo alerta debe ser la respuesta recomendada (tambien breve, max 20 palabras).
- El campo progreso es 0-100 del avance global de la llamada.`;

function buildProfileBlock(profile) {
  if (!profile || typeof profile !== 'object') return '';

  const lines = [];
  const push = (label, value) => {
    if (value && String(value).trim()) {
      lines.push(`- ${label}: ${String(value).trim()}`);
    }
  };

  push('Nicho', profile.nicho);
  push('Cliente ideal', profile.clienteIdeal);
  push('Precio', profile.precio);
  push('Nombre de su oferta', profile.ofertaNombre);
  push('Promesa', profile.ofertaPromesa);
  push('Pilar 1', profile.pilar1);
  push('Pilar 2', profile.pilar2);
  push('Pilar 3', profile.pilar3);
  push('Casos de exito', profile.resultados);

  if (lines.length === 0) return '';

  return `
PERFIL DEL CLOSER QUE ESTAS ASISTIENDO:
${lines.join('\n')}

USA ESTE PERFIL PARA:
- Personalizar cada sugerencia con el lenguaje exacto de su nicho
- Cuando sugieras presentar pilares, usa los suyos concretos
- Cuando detectes objeciones de precio, menciona su precio real
- Las frases sugeridas deben poder decirse literalmente en su llamada
`;
}

function buildSystemPrompt(profile) {
  const profileBlock = buildProfileBlock(profile);
  const intro = profileBlock ? PROMPT_INTRO_GENERIC : PROMPT_INTRO_FALLBACK;
  return `${intro}\n${profileBlock}\n${PROMPT_BODY}`;
}

/**
 * Analyze transcription directly via Anthropic API.
 *
 * @param {string} transcription   - Accumulated call transcription
 * @param {string} anthropicApiKey - Student's Anthropic API key
 * @param {object} [profile]       - Closer profile (nicho, pilares, oferta...)
 * @param {number} [currentPhase]  - Minimum phase number (linear progression)
 * @returns {Promise<object>}      - Analysis JSON
 */
async function analyzeTranscription(transcription, anthropicApiKey, profile, currentPhase) {
  if (!anthropicApiKey) throw new Error('Falta API Key de Anthropic');

  const client = new Anthropic({ apiKey: anthropicApiKey });
  const systemPrompt = buildSystemPrompt(profile);

  const phaseHint = currentPhase
    ? `\nFASE MINIMA ACTUAL: ${currentPhase}. No puedes devolver una fase_numero inferior a este numero.\n`
    : '';

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    system: systemPrompt,
    messages: [
      { role: 'user', content: `${phaseHint}TRANSCRIPCION ACTUAL:\n\n${transcription}` },
    ],
  });

  const text = response.content[0].text.trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Claude no devolvio JSON valido');

  const analysis = JSON.parse(jsonMatch[0]);

  // Attach usage/cost so the caller can track spend
  const inputTokens = response.usage?.input_tokens || 0;
  const outputTokens = response.usage?.output_tokens || 0;
  analysis._usage = {
    inputTokens,
    outputTokens,
    costUsd: inputTokens * PRICING.INPUT_PER_TOKEN + outputTokens * PRICING.OUTPUT_PER_TOKEN,
  };

  return analysis;
}

/**
 * Quick test: send a tiny message to verify the key works.
 */
async function verifyAnthropic(anthropicApiKey) {
  if (!anthropicApiKey) throw new Error('Falta API Key de Anthropic');
  const client = new Anthropic({ apiKey: anthropicApiKey });
  await client.messages.create({
    model: MODEL,
    max_tokens: 10,
    messages: [{ role: 'user', content: 'Di "ok"' }],
  });
  return true;
}

/** Sample transcription for the "Test analysis" button in config. */
const SAMPLE_TRANSCRIPTION = `CLOSER: Hola, cuentame, hace cuanto llevas intentando conseguir tu objetivo sin resultados?
CLIENTE: Pues llevo dos anos probando cosas. He hecho dietas, gimnasio, apps de entrenamiento...
CLOSER: Y que ha pasado?
CLIENTE: Pierdo 2 o 3 kilos y los recupero al mes. Es super frustrante.
CLOSER: Como te hace sentir eso en tu dia a dia?
CLIENTE: Fatal. Me miro al espejo y me da rabia. Y encima mis hijos me ven asi, sin energia.
CLOSER: Y que pasa si dentro de un ano sigues igual?
CLIENTE: Prefiero no pensarlo la verdad. Se me cae el mundo encima.`;

module.exports = {
  analyzeTranscription,
  verifyAnthropic,
  SAMPLE_TRANSCRIPTION,
  PRICING,
};
