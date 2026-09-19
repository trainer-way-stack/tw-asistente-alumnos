/**
 * Decisión de ESCALADO a humano.
 *
 * El bot pasa la conversación a un humano (Miguel) cuando:
 *  1) El propio modelo lo pide: `necesitaHumano` (algo nuevo/fuera de guion/sensible), o
 *  2) su `confianza` cae por debajo del umbral del tenant, o
 *  3) red de seguridad: el mensaje del prospecto toca un tema sensible por palabras clave
 *     (por si el modelo no lo marcó, o en modo simulador sin API key).
 *
 * Devuelve { escalate, reason }. Independiente del canal de aviso (ver notify.js).
 */

// Red de seguridad: temas que SIEMPRE queremos que vea un humano.
// OJO: son RAÍCES (prefijos), sin \b al final, para que casen la palabra completa
// (p.ej. "abogad" → "abogado/abogada"). Se evita meter raíces benignas ("contrat" casaría
// "contratar", que es lo que queremos que pase, no un escalado).
const KEYWORD_TRIGGERS = [
  { re: /\b(abogad|denunci|demand|estaf|fraud|\btimo\b)/i, reason: 'legal / estafa' },
  { re: /\b(reembols|devoluci|me devuelv|recuperar el dinero|quiero mi dinero)/i, reason: 'reembolso' },
  { re: /\b(lesi[oó]n|m[eé]dic|enferm|patolog|embaraz|depresi|ansiedad|suicid)/i, reason: 'salud' },
  { re: /\b(prensa|periodist|colaboraci[oó]n|afiliad|partnership)/i, reason: 'prensa / colaboración' },
  { re: /\b(iban|swift|cuenta bancaria|n[uú]mero de cuenta|tarjeta de cr[eé]dito)/i, reason: 'datos bancarios (guardarraíl)' },
  { re: /\b(reclamaci|estoy muy enfadad|indignad|verg[uü]enza)/i, reason: 'queja / enfado' },
];

/**
 * @param {object} llmOut  Salida de generateReply: { confianza, necesitaHumano, motivo }
 * @param {object} tenant  Config del tenant (confidenceThreshold, escalation on/off)
 * @param {string} incomingText  Último mensaje del prospecto (para la red de seguridad)
 */
function decideEscalation(llmOut, tenant, incomingText = '') {
  if (tenant?.escalationEnabled === false) return { escalate: false, reason: '' };

  if (llmOut?.necesitaHumano) {
    return { escalate: true, reason: llmOut.motivo || 'el asistente pidió relevo' };
  }

  const threshold = tenant?.confidenceThreshold ?? 0.45;
  if (typeof llmOut?.confianza === 'number' && llmOut.confianza < threshold) {
    return { escalate: true, reason: `confianza baja (${llmOut.confianza})` };
  }

  for (const { re, reason } of KEYWORD_TRIGGERS) {
    if (re.test(incomingText)) return { escalate: true, reason };
  }

  return { escalate: false, reason: '' };
}

module.exports = { decideEscalation, KEYWORD_TRIGGERS };
