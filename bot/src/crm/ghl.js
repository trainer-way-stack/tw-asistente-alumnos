/**
 * Integración con Go High Level (CRM).
 *
 * Rol de GHL (ver ARQUITECTURA.md §4): sistema de registro (contacto, pipeline,
 * etiquetas, calendario de llamadas). La lógica del bot NO depende de GHL: si
 * mañana usamos panel propio, solo cambia este archivo.
 *
 * Credenciales (mismas que el exportador de conversaciones): Private Integration Token
 * `pit-…` y Location de Trainer Way. En `.env` (git-ignored):
 *   GHL_API_KEY=pit-...           (token)
 *   GHL_LOCATION_ID=gIW9fexOVrMZupvV0YAC
 * Opcional, para el mapeo IG↔contacto (ver más abajo):
 *   GHL_IG_FIELD_ID=...           (id del custom field donde guardamos el IGSID)
 *   GHL_MOTIVO_FIELD_ID=...       (id del custom field donde escribimos el motivo de derivación)
 *
 * ⚠️ GHL NO guarda el id de usuario de Instagram (IGSID) en ningún campo consultable
 * (revisados los 90 custom fields de la cuenta el 2026-09-19). Para atar una conversación
 * de IG a su contacto de GHL de forma fiable hace falta un custom field propio (`ig_user_id`)
 * que gestione el bot. Mientras no exista + esté en GHL_IG_FIELD_ID, el mapeo se salta con un
 * aviso (no ensucia el CRM). El aviso a Miguel por WhatsApp NO necesita esto.
 *
 * Etiquetas del pipeline: bot-activo, pausado, derivar-humano, agendado.
 */

const BASE = 'https://services.leadconnectorhq.com';
const VERSION = '2021-07-28';

function creds() {
  return {
    key: process.env.GHL_API_KEY,
    location: process.env.GHL_LOCATION_ID,
    igFieldId: process.env.GHL_IG_FIELD_ID || null,
    motivoFieldId: process.env.GHL_MOTIVO_FIELD_ID || null,
  };
}

async function ghlFetch(path, options = {}) {
  const { key } = creds();
  if (!key) { console.warn('[ghl] sin GHL_API_KEY — no-op (modo dev).'); return { simulated: true }; }
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Version: VERSION,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`[ghl] ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/** Busca el contacto de GHL de un usuario de IG por el custom field ig_user_id. */
async function findContactByIg(igUserId) {
  const { location, igFieldId } = creds();
  if (!igFieldId) return null; // sin campo configurado no podemos casar de forma fiable
  const body = {
    locationId: location,
    pageLimit: 1,
    filters: [{ group: 'AND', filters: [{ field: `customFields.${igFieldId}`, operator: 'eq', value: igUserId }] }],
  };
  const data = await ghlFetch('/contacts/search', { method: 'POST', body: JSON.stringify(body) });
  if (data?.simulated) return null;
  return (data.contacts || [])[0] || null;
}

/**
 * Localiza (o crea) el contacto de ese usuario de IG y le pone la etiqueta + el motivo.
 * Seguro por diseño: si falta el campo ig_user_id configurado, NO crea nada (evita duplicar
 * contactos en un CRM de 17k). Devuelve { ok, contactId, mapped } o { skipped, reason }.
 */
async function upsertContactByIg({ igUserId, name, tag, motivo }) {
  const { key, location, igFieldId, motivoFieldId } = creds();
  if (!key) return { simulated: true };
  if (!igFieldId) {
    return { skipped: true, reason: 'GHL_IG_FIELD_ID no configurado (no hay campo para casar el IGSID; no se toca el CRM).' };
  }

  const customFields = [{ id: igFieldId, value: igUserId }];
  if (motivo && motivoFieldId) customFields.push({ id: motivoFieldId, value: motivo });

  const existing = await findContactByIg(igUserId);
  if (existing) {
    await ghlFetch(`/contacts/${existing.id}`, {
      method: 'PUT',
      body: JSON.stringify({ tags: [...(existing.tags || []), tag].filter(Boolean), customFields }),
    });
    return { ok: true, contactId: existing.id, mapped: 'updated' };
  }

  // GHL exige al menos firstName/lastName/email/phone; "name" a secas da 422.
  const parts = String(name || `IG ${igUserId}`).trim().split(/\s+/);
  const firstName = parts[0] || 'IG';
  const lastName = parts.slice(1).join(' ') || igUserId;
  const created = await ghlFetch('/contacts/', {
    method: 'POST',
    body: JSON.stringify({
      locationId: location,
      firstName,
      lastName,
      tags: tag ? [tag] : [],
      customFields,
    }),
  });
  return { ok: true, contactId: created?.contact?.id, mapped: 'created' };
}

/** (Compat) upsert simple por si se usa en otros sitios. */
async function upsertContact({ igUserId, name, tag }) {
  return upsertContactByIg({ igUserId, name, tag });
}

module.exports = { findContactByIg, upsertContactByIg, upsertContact };
