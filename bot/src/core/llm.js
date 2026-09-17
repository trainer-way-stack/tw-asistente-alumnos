/**
 * Generación de la respuesta con Claude.
 *
 * Ensambla el prompt en capas:
 *   - SYSTEM: rol + tono del dueño (guía de estilo) + guardarraíles (siempre).
 *   - CONTEXTO: fragmentos recuperados por RAG de las capas pertinentes.
 *   - HISTORIAL: la conversación hasta ahora.
 *
 * Comportamiento clave pedido por Dani:
 *   - PRIMER turno: responder de forma NATIVA a lo que dice la persona (la charla se
 *     abre en frío con "hola {nombre}" y la persona responde "hola" o "¿qué quieres?").
 *     El aviso de IA lo añade el orquestador DESPUÉS de esta respuesta nativa.
 *   - Devuelve un SCORE 0-10 de cualificación para decidir si se propone llamada.
 *
 * SCAFFOLD: sin ANTHROPIC_API_KEY devuelve una respuesta simulada para probar el
 * flujo end-to-end en el simulador sin gastar tokens.
 */

const MODEL = 'claude-sonnet-4-5';

// La guía de estilo se genera en fase 0 desde WhatsApp + mentorías (capa TONO).
// Placeholder; en producción se carga por tenant (tenant.tonePromptRef).
const TONO_DEFECTO = `[GUÍA DE ESTILO — se genera en fase 0 desde WhatsApp + mentorías.
Cercano, directo, tú a tú, frases cortas, algún emoji con moderación, sin sonar a folleto.]`;

const GUARDARRAILES = `NUNCA prometas resultados garantizados. NUNCA des consejo médico.
NUNCA inventes precios ni datos: si no lo sabes, deriva a una llamada o al equipo.
Mensajes CORTOS y naturales, como en un DM real. No sueltes párrafos.`;

function buildSystem({ context, tenant, isFirstBotTurn }) {
  const contextBlock = context.length
    ? context.map((c) => `- (${c.layer}) ${c.text}`).join('\n')
    : '(sin contexto recuperado)';

  const owner = tenant?.ownerName || 'el dueño';
  const firstTurnRule = isFirstBotTurn
    ? `\nESTE ES EL PRIMER MENSAJE que respondes. La conversación se abrió en frío
("hola {nombre}") y la persona acaba de contestar. RESPONDE DE FORMA NATIVA a lo que
dice: si saluda, salúdale y conecta; si pregunta "¿qué quieres?", sé honesto y cercano
("nada raro, quería conectar contigo"). NO sueltes discurso de venta todavía.\n`
    : '';

  return `Eres el asistente de captación de ${owner} en Instagram DM. Objetivo: llevar
conversaciones naturales que lleven a agendar una llamada, SIN sonar a bot.
${firstTurnRule}
TONO (imítalo, es lo más importante):
${tenant?.tonePrompt || TONO_DEFECTO}

LÍMITES:
${GUARDARRAILES}

CONOCIMIENTO RELEVANTE PARA ESTE MOMENTO (úsalo solo si aporta, no lo recites):
${contextBlock}

Devuelve SOLO un JSON con este formato:
{ "messages": ["msg1", "msg2"], "nextStage": "calificando", "score": 6 }
- "messages": 1 a 3 mensajes cortos (trocea como una persona real).
- "nextStage": inicio|calificando|interes|objecion|cierre|frio.
- "score": 0-10 de cómo de buen fit es el prospecto para una llamada (interés,
  situación, encaje con cliente ideal, urgencia). Estima con lo que sepas hasta ahora.`;
}

async function generateReply({ convo, context, tenant }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const isFirstBotTurn = !convo.messages.some((m) => m.role === 'assistant');

  if (!apiKey) {
    // Modo simulador.
    return {
      messages: isFirstBotTurn
        ? ['[respuesta nativa simulada al saludo del prospecto]']
        : ['[respuesta simulada — configura ANTHROPIC_API_KEY para respuestas reales]'],
      nextStage: convo.stage === 'inicio' ? 'calificando' : convo.stage,
      score: convo.score || 5,
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
    system: buildSystem({ context, tenant, isFirstBotTurn }),
    messages: history.length ? history : [{ role: 'user', content: '(inicio de conversación)' }],
  });

  const raw = res.content[0].text.trim();
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return { messages: [raw], nextStage: convo.stage, score: convo.score };

  try {
    const parsed = JSON.parse(match[0]);
    return {
      messages: Array.isArray(parsed.messages) ? parsed.messages : [String(parsed.messages)],
      nextStage: parsed.nextStage || convo.stage,
      score: typeof parsed.score === 'number' ? parsed.score : convo.score,
    };
  } catch {
    return { messages: [raw], nextStage: convo.stage, score: convo.score };
  }
}

/** Genera el texto de un recordatorio (follow-up) suave, con el tono del dueño. */
async function generateReminder({ convo, tenant }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return ['[recordatorio simulado — un mensaje suave para retomar]'];

  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });
  const history = convo.messages.map((m) => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.text,
  }));

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 150,
    system: `Eres el asistente de ${tenant?.ownerName || 'el equipo'}. La persona dejó de
responder hace un rato. Escribe UN recordatorio corto, suave y natural para retomar la
conversación sin presionar. Con el tono de siempre. Devuelve solo el texto del mensaje.`,
    messages: history.length ? history : [{ role: 'user', content: '(sin respuesta)' }],
  });
  return [res.content[0].text.trim()];
}

module.exports = { generateReply, generateReminder };
