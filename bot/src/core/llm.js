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

// Modelo configurable por env (BOT_MODEL) para poder cambiarlo/hacer A/B sin tocar código.
// Por defecto Sonnet 5: en el A/B respetó mejor las reglas (derivación) y sonó natural, a una
// fracción del coste de Opus. Se puede sobreescribir con BOT_MODEL (p. ej. opus para casos duros).
const MODEL = 'claude-sonnet-5';
const currentModel = () => process.env.BOT_MODEL || MODEL;
const { loadLayer } = require('../knowledge/content');

// Guía de estilo real, destilada de los materiales de Dani (capa TONO).
// Fallback por si aún no existe el archivo.
const TONO_FALLBACK = `Cercano, directo, tú a tú, frases cortas, una pregunta por turno,
emojis muy escasos, sin sonar a folleto ni a vendedor.`;
const TONO_DEFECTO = loadLayer('tono') || TONO_FALLBACK;

const GUARDARRAILES = `NUNCA uses "garantizado" ni "por contrato" ni garantices un resultado a
esa persona en concreto. SÍ puedes expresar la promesa general ("nuestra promesa es ayudarte a
aumentar 2000-5000€ en 4 meses"), pero como objetivo, nunca como garantía personal. NUNCA
compares con la competencia ni hables mal de otros. NUNCA des consejo médico.
PRECIOS por DM: por defecto NO des precio; si preguntan cuánto cuesta, reencuadra hacia la
llamada ("el precio y las opciones de pago dependen de tu caso, los vemos en la sesión").
SOLO si la persona insiste mucho, puedes decir "desde 330 € al mes durante 12 meses" — nunca
el total ni el precio al contado, y sigue empujando a la llamada. NUNCA inventes datos.
NUNCA compartas datos bancarios. Si no sabes algo, deriva a la llamada o al equipo.
Mensajes CORTOS y naturales, como en un DM real. No sueltes párrafos.`;

function buildSystem({ context, tenant, isFirstBotTurn }) {
  const contextBlock = context.length
    ? context.map((c) => `- (${c.layer}) ${c.text}`).join('\n')
    : '(sin contexto recuperado)';

  const owner = tenant?.ownerName || 'el dueño';
  const firstTurnRule = isFirstBotTurn
    ? `\nESTE ES EL PRIMER MENSAJE que respondes. La conversación se abrió en frío
("hola {nombre}") y la persona acaba de contestar. RESPONDE DE FORMA NATIVA y NATURAL:
- Si solo te saluda ("hola/buenas"), devuélvele el saludo con calidez y pregúntale cómo va,
  como a un colega: "¡Buenas! ¿Qué tal, cómo vas?". Deja que fluya.
- El filtro de si es entrenador se mete SUAVE y como de pasada, mejor con "¿eres entrenador
  también?" (el "también" suena a igual, no a interrogatorio). Puede ir en ese mismo mensaje
  o en el siguiente, pero SIN brusquedad.
- PROHIBIDO soltar de golpe "¿eres entrenador o te dedicas a algo del fitness?" — suena a
  formulario. Una cosa a la vez, con naturalidad. Nada de discurso de venta todavía.\n`
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

CUÁNDO PARAR Y PASAR A UN HUMANO / DESCARTAR (muy importante):
Si te encuentras algo para lo que NO estás preparado, NO improvises: pide relevo. Marca
"necesita_humano": true y baja "confianza" cuando pase cualquiera de estas:
- Sale un tema NUEVO o fuera de lo que conoces (no está en tu conocimiento).
- Situación sensible: queja/enfado, reembolso/devolución, tema legal, salud/lesión, prensa,
  colaboración/negocio, o algo que podría meter en un lío.
- Piden algo que un guardarraíl te prohíbe (datos bancarios, etc.).
- Un lead MUY caliente y listo para comprar (mejor que lo remate un humano ya).
- No entiendes lo que quiere tras un par de intentos, o dudas de verdad de qué responder.
- NICHO fuera de: entrenador, nutricionista, fisio, psicólogo, dietista, coach → deriva a
  humano (no lo descartes tú, que lo valore Miguel). PERO si aún no sabes a qué se dedica,
  PREGÚNTASELO primero ("¿a qué te dedicas?"); solo derivas cuando confirmes que está fuera.
- Ya trabaja con OTRA empresa/mentor y dice que NO le va bien o regular → deriva a humano.
- Da evasivas excesivas: insiste con tacto hasta 4-5 veces; si aun así no avanza, deriva a humano.
En esos casos, en "messages" NO sueltes una respuesta arriesgada: como mucho un mensaje puente
breve ("déjame que lo confirmo bien y te digo 🙌") o deja "messages" vacío.

CASOS QUE SÍ MANEJAS TÚ (no derives):
- MLM / network marketing → NO trabajamos con eso: descarta con tacto y cierra sano (sin derivar).
- Ya es CLIENTE nuestro / "ya estoy con Dani" → preséntate ("perdona, soy el asistente de IA de
  Dani") y para; no intentes venderle nada.
- Ya trabaja con otra empresa/mentor y le va BIEN → felicítale, sin intentar quitárselo.
- "¿Es una estafa? / enséñame pruebas" y "¿qué método usáis?" → contéstalos con tu conocimiento
  (capas objeciones/programa); no derives por esto.

Devuelve SOLO un JSON con este formato:
{ "messages": ["msg1", "msg2"], "nextStage": "calificando", "score": 6,
  "confianza": 0.9, "necesita_humano": false, "motivo": "" }
- "messages": 1 a 3 mensajes cortos (trocea como una persona real).
- "nextStage": inicio|calificando|interes|objecion|cierre|frio.
- "score": 0-10 de cómo de buen fit es el prospecto para una llamada (interés,
  situación, encaje con cliente ideal, urgencia). Estima con lo que sepas hasta ahora.
- "confianza": 0-1, cómo de seguro estás de tu respuesta (1 = totalmente).
- "necesita_humano": true si hay que pasar la conversación a un humano (ver arriba).
- "motivo": si necesita_humano es true, una frase MUY corta del porqué (para avisar al humano).`;
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
      confianza: 1,
      necesitaHumano: false,
      motivo: '',
    };
  }

  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });

  const history = convo.messages.map((m) => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.text,
  }));

  const res = await client.messages.create({
    model: currentModel(),
    max_tokens: 700,
    // Sonnet 5 activa "thinking" por defecto y sin tope se come el presupuesto → JSON truncado.
    // Para un DM corto no hace falta; lo desactivamos (más rápido, más barato, determinista).
    thinking: { type: 'disabled' },
    system: buildSystem({ context, tenant, isFirstBotTurn }),
    messages: history.length ? history : [{ role: 'user', content: '(inicio de conversación)' }],
  });

  // OJO: content[0] puede ser un bloque de "thinking" (Sonnet 5 y otros). Buscar el de texto.
  const textBlock = (res.content || []).find((b) => b.type === 'text');
  const raw = (textBlock?.text || '').trim();
  const match = raw.match(/\{[\s\S]*\}/);
  // Sin JSON parseable: no arriesgamos, pedimos relevo humano.
  if (!match) return { messages: [], nextStage: convo.stage, score: convo.score, confianza: 0, necesitaHumano: true, motivo: 'respuesta del modelo no interpretable' };

  try {
    const parsed = JSON.parse(match[0]);
    return {
      messages: Array.isArray(parsed.messages) ? parsed.messages : (parsed.messages ? [String(parsed.messages)] : []),
      nextStage: parsed.nextStage || convo.stage,
      score: typeof parsed.score === 'number' ? parsed.score : convo.score,
      confianza: typeof parsed.confianza === 'number' ? parsed.confianza : 1,
      necesitaHumano: parsed.necesita_humano === true,
      motivo: parsed.motivo || '',
    };
  } catch {
    return { messages: [], nextStage: convo.stage, score: convo.score, confianza: 0, necesitaHumano: true, motivo: 'JSON inválido del modelo' };
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
    model: currentModel(),
    max_tokens: 200,
    thinking: { type: 'disabled' },
    system: `Eres el asistente de ${tenant?.ownerName || 'el equipo'}. La persona dejó de
responder hace un rato. Escribe UN recordatorio MUY corto, ligero y natural para retomar, sin
presionar (estilo real: "pudiste leerme??", "todo bien??", "sigues por ahí?", "te leo cuando
puedas 🙌"). Varía respecto a lo ya enviado. Con el tono de siempre. Devuelve solo el texto.`,
    messages: history.length ? history : [{ role: 'user', content: '(sin respuesta)' }],
  });
  const textBlock = (res.content || []).find((b) => b.type === 'text');
  return [(textBlock?.text || '').trim()].filter(Boolean);
}

module.exports = { generateReply, generateReminder };
