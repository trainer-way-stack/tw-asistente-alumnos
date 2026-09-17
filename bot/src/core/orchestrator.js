/**
 * Orquestador: el "cerebro" del setter IA.
 *
 * Por cada mensaje entrante:
 *   1. Comprueba pausa/propietario (¿debe responder el bot?).
 *   2. Recupera de las CAPAS solo lo relevante (RAG).
 *   3. Genera la respuesta con Claude, aplicando el tono de Dani y los guardarraíles.
 *   4. Antepone el aviso de IA la primera vez (art. 50).
 *   5. Envía la(s) respuesta(s) y actualiza el estado.
 *
 * La generación real con Claude está aislada en `generateReply` para poder probar
 * el flujo completo en el simulador sin gastar tokens.
 */

const { getConversation, saveConversation, appendMessage } = require('./state');
const { shouldBotRespond } = require('./pause');
const { maybeDisclosure } = require('./disclosure');
const { retrieve, selectLayers } = require('../knowledge/retriever');
const { sendSequence } = require('../instagram/client');
const { generateReply } = require('./llm');

async function handleIncomingMessage({ senderId, text }) {
  const convo = getConversation(senderId);
  appendMessage(convo, 'user', text);

  if (!shouldBotRespond(convo)) {
    // En pausa o lo lleva un humano: registramos y no respondemos.
    saveConversation(convo);
    console.log(`[orq] ${senderId}: en pausa/humano, no responde.`);
    return;
  }

  // 1) Recuperar conocimiento relevante (solo de las capas que tocan).
  const context = await retrieve({ text, stage: convo.stage });

  // 2) Generar respuesta (con tono + guardarraíles). Puede devolver varios mensajes.
  const { messages, nextStage } = await generateReply({ convo, context });

  // 3) Aviso de IA la primera vez (claro, una sola vez, al principio).
  const disclosure = maybeDisclosure(convo);
  const outgoing = disclosure ? [disclosure, ...messages] : messages;

  // 4) Enviar + registrar.
  await sendSequence(senderId, outgoing);
  outgoing.forEach((m) => appendMessage(convo, 'assistant', m));
  if (nextStage) convo.stage = nextStage;
  saveConversation(convo);

  console.log(`[orq] ${senderId}: respondido (capas: ${selectLayers(convo.stage).join(', ')}).`);
  return outgoing;
}

module.exports = { handleIncomingMessage };
