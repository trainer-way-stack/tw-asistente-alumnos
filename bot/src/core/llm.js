/**
 * Generación de la respuesta con Claude.
 *
 * Aquí se ensambla el prompt en capas:
 *   - SYSTEM: rol + tono de Dani (guía de estilo) + guardarraíles (siempre).
 *   - CONTEXTO: los fragmentos recuperados por RAG de las capas pertinentes.
 *   - HISTORIAL: la conversación hasta ahora.
 *
 * El modelo devuelve JSON: uno o varios mensajes cortos (para trocear como un
 * humano) + la fase siguiente de la conversación.
 *
 * SCAFFOLD: sin ANTHROPIC_API_KEY, devuelve una respuesta simulada para poder
 * probar el flujo completo end-to-end en el simulador.
 */

const MODEL = 'claude-sonnet-4-5';

// La guía de estilo se genera en fase 0 a partir del WhatsApp/mentorías de Dani.
// De momento un placeholder; se cargará desde la base de conocimiento (capa TONO).
const TONO_DANI = `[GUÍA DE ESTILO DE DANI — se genera en fase 0 desde WhatsApp + mentorías.
Cercano, directo, tú a tú, frases cortas, algún emoji con moderación, sin sonar a folleto.]`;

const GUARDARRAILES = `NUNCA prometas resultados garantizados. NUNCA des consejo médico.
NUNCA inventes precios ni datos: si no lo sabes, deriva a una llamada o al equipo.
Mensajes CORTOS y naturales, como en un DM real. No sueltes párrafos.`;

function buildSystem(context) {
  const contextBlock = context.length
    ? context.map((c) => `- (${c.layer}) ${c.text}`).join('\n')
    : '(sin contexto recuperado)';

  return `Eres el asistente de captación de Dani (Trainer Way) en Instagram DM. Tu objetivo es
llevar conversaciones naturales que lleven al prospecto a agendar una llamada, SIN sonar a bot.

TONO (imítalo, es lo más importante):
${TONO_DANI}

LÍMITES:
${GUARDARRAILES}

CONOCIMIENTO RELEVANTE PARA ESTE MOMENTO (úsalo solo si aporta, no lo recites):
${contextBlock}

Devuelve SOLO un JSON con este formato:
{ "messages": ["mensaje 1", "mensaje 2"], "nextStage": "calificando" }
- "messages": 1 a 3 mensajes cortos (trocea como una persona real).
- "nextStage": una de inicio|calificando|interes|objecion|cierre|frio.`;
}

async function generateReply({ convo, context }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    // Modo simulador: respuesta de relleno para probar el flujo sin gastar tokens.
    return {
      messages: ['[respuesta simulada — configura ANTHROPIC_API_KEY para respuestas reales]'],
      nextStage: convo.stage === 'inicio' ? 'calificando' : convo.stage,
    };
  }

  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });

  const history = convo.messages.map((m) => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.text,
  }));

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 400,
    system: buildSystem(context),
    messages: history.length ? history : [{ role: 'user', content: '(inicio de conversación)' }],
  });

  const raw = res.content[0].text.trim();
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return { messages: [raw], nextStage: convo.stage };

  try {
    const parsed = JSON.parse(match[0]);
    return {
      messages: Array.isArray(parsed.messages) ? parsed.messages : [String(parsed.messages)],
      nextStage: parsed.nextStage || convo.stage,
    };
  } catch {
    return { messages: [raw], nextStage: convo.stage };
  }
}

module.exports = { generateReply };
