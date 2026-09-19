/**
 * Aviso al humano cuando el bot escala una conversación.
 *
 * Canal configurable por tenant (`escalationChannel`):
 *  - 'ghl'  (recomendado): pone una etiqueta en el contacto de GHL (p.ej. `derivar-humano`).
 *           Un WORKFLOW de GHL escucha esa etiqueta y avisa a Miguel por WhatsApp. Así el
 *           aviso y sus reglas se cambian en GHL sin tocar código, y queda registrado.
 *  - 'none': no envía nada (solo pausa + log). Útil en dev/simulador.
 *  - (futuro) 'whatsapp': envío directo por la API de Meta (más control, más mantenimiento).
 *
 * No lanza excepción hacia arriba: si el aviso falla, se registra pero NO rompe el flujo
 * (la conversación ya queda pausada, que es lo crítico).
 */

const { upsertContactByIg } = require('../crm/ghl');

async function notifyHuman({ tenant, convo, reason }) {
  const channel = tenant?.escalationChannel || 'ghl';
  const tag = tenant?.escalationTag || 'derivar-humano';
  const label = `${convo.accountId}/${convo.userId}`;

  try {
    if (channel === 'none') {
      console.log(`[notify] (none) escalado ${label} — motivo: ${reason}`);
      return { ok: true, channel };
    }

    if (channel === 'ghl') {
      const res = await upsertContactByIg({ igUserId: convo.userId, name: convo.name, tag, motivo: reason });
      if (res?.simulated) console.log(`[notify] GHL tag '${tag}' → ${label} — motivo: ${reason} (simulado: sin GHL_API_KEY)`);
      else if (res?.skipped) console.warn(`[notify] GHL NO etiquetado (${label}): ${res.reason} — el humano igualmente tiene la conversación en pausa.`);
      else console.log(`[notify] GHL tag '${tag}' (${res.mapped}) → contacto ${res.contactId} — motivo: ${reason}`);
      return { ok: !res?.skipped, channel, tag, ...res };
    }

    console.warn(`[notify] canal '${channel}' no implementado; escalado ${label} sin aviso.`);
    return { ok: false, channel };
  } catch (e) {
    console.error(`[notify] fallo avisando (${label}): ${e.message}. La conversación queda pausada igualmente.`);
    return { ok: false, channel, error: e.message };
  }
}

module.exports = { notifyHuman };
