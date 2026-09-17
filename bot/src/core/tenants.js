/**
 * Configuración por CUENTA (tenant) — la "puerta" para revender.
 *
 * El producto es multi-cuenta desde el diseño: cada cuenta de Instagram (la de Dani
 * hoy, la de un alumno mañana) tiene su propia config. La conversación se identifica
 * por (accountId, userId), así nunca se mezclan datos de distintos dueños.
 *
 * SCAFFOLD: config en memoria. En producción esto vive en base de datos y se
 * administra desde el panel. Los tokens de IG por tenant NO se guardan aquí en
 * claro: van cifrados en BD (aquí solo el nombre de la variable de entorno de Dani).
 */

const DEFAULT = {
  ownerName: 'Dani',           // nombre que aparece en el aviso de IA
  scoreThreshold: 7,           // a partir de aquí se propone llamada (0-10)
  followupHours: 4,            // horas de silencio antes del recordatorio
  followupMaxCount: 1,         // cuántos recordatorios como máximo (dentro de la ventana 24h)
  igAccessTokenEnv: 'IG_ACCESS_TOKEN',
  // tonePromptRef: apunta a la guía de estilo generada en fase 0 (capa TONO)
  tonePromptRef: 'default',
};

// accountId (id de la cuenta de IG que RECIBE el mensaje) -> config
const TENANTS = new Map();

/** Registra/actualiza un tenant (lo usará el panel al dar de alta a un alumno). */
function registerTenant(accountId, config = {}) {
  TENANTS.set(accountId, { ...DEFAULT, ...config, accountId });
  return TENANTS.get(accountId);
}

/** Devuelve la config del tenant; si no existe, usa DEFAULT (cuenta de Dani). */
function getTenant(accountId) {
  return TENANTS.get(accountId) || { ...DEFAULT, accountId };
}

module.exports = { getTenant, registerTenant, DEFAULT };
