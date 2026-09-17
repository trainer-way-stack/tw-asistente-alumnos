/**
 * Integración con Go High Level (CRM).  SCAFFOLD.
 *
 * Rol de GHL (ver ARQUITECTURA.md §4): sistema de registro (contacto, pipeline,
 * etiquetas, calendario de llamadas). La lógica del bot NO depende de GHL: si
 * mañana usamos panel propio, solo cambia este archivo.
 *
 * Etiquetas sugeridas para el pipeline: bot-activo, pausado, derivado-humano, agendado.
 */

async function ghlFetch(path, options = {}) {
  const key = process.env.GHL_API_KEY;
  if (!key) { console.warn('[ghl] sin GHL_API_KEY — no-op (modo dev).'); return { simulated: true }; }
  const res = await fetch(`https://services.leadconnectorhq.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Version: '2021-07-28',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`[ghl] ${res.status}: ${await res.text()}`);
  return res.json();
}

/** Crea/actualiza el contacto y le pone una etiqueta de estado. */
async function upsertContact({ igUserId, name, tag }) {
  // TODO: mapear igUserId <-> contacto GHL; setear etiqueta `tag`.
  return ghlFetch('/contacts/upsert', {
    method: 'POST',
    body: JSON.stringify({
      locationId: process.env.GHL_LOCATION_ID,
      name: name || `IG ${igUserId}`,
      tags: tag ? [tag] : [],
      customFields: [{ key: 'ig_user_id', value: igUserId }],
    }),
  });
}

module.exports = { upsertContact };
