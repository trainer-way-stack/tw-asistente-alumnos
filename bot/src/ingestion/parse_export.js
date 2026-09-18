#!/usr/bin/env node
/**
 * Ingesta de exports de conversaciones categorizadas (GHL → PDF).
 *
 * Qué hace:
 *  1) Extrae el texto del PDF (PDFKit vía pdftext.swift; en macOS, sin poppler) o lee un .txt ya extraído.
 *  2) Parsea la estructura: categorías → contactos (con tags) → mensajes (SETTER / PROSPECTO).
 *  3) ANONIMIZA: nombres de contacto, handles, teléfonos y emails → tokens. (Los nombres del equipo
 *     —Dani, Miguel, Natasia, Silvia— NO son PII de cliente y se conservan como contexto.)
 *  4) Deriva una etiqueta de resultado por conversación (reached_call / sale / no_show / no_booking).
 *  5) Escribe los hilos normalizados y anonimizados en data/ingestion/normalized/ y un index.json.
 *
 * IMPORTANTE: la salida (data/ingestion/*) está IGNORADA por git (contiene material sensible aun
 * anonimizado). A los .md de conocimiento solo van patrones destilados a mano, sin PII.
 *
 * Uso:
 *   node src/ingestion/parse_export.js <export.pdf|export.txt> [--out data/ingestion]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const os = require('os');

// ── Nombres del equipo que NO se anonimizan (no son PII de cliente) ──
const EQUIPO = ['Dani', 'Miguel', 'Natasia', 'Natasia', 'Silvia', 'Trainer Way'];

// ── Regex ──
const RE_CATEGORY = /^(.+?) \((\d+)\)$/;            // "Llegaron a llamada (21)"
const RE_TAGLINE = /·\s*(\d+)\s*mensajes reales/;    // línea de tags del contacto
const RE_MSG = /^(Trainer Way|Contacto) · (\d{4}-\d{2}-\d{2} \d{2}:\d{2}) · ([A-ZÁÉÍÓÚ]+)\s*$/;
const RE_PHONE = /(\+?\d{1,3}[ .-]?)?(?:\d[ .-]?){8,12}\d/g; // teléfonos (amplio)
const RE_EMAIL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

const CATEGORY_OUTCOME = {
  'Llegaron a llamada': 'reached_call',
  'Agendaron pero no asistieron (no-show)': 'no_show',
  'No llegaron a agendar': 'no_booking',
};

function extractText(input) {
  if (input.toLowerCase().endsWith('.txt')) return fs.readFileSync(input, 'utf8');
  // PDF → swift PDFKit
  const tmp = path.join(os.tmpdir(), `export-${Date.now()}.txt`);
  const swift = path.join(__dirname, 'pdftext.swift');
  execFileSync('swift', [swift, input, tmp], { stdio: ['ignore', 'inherit', 'inherit'] });
  return fs.readFileSync(tmp, 'utf8');
}

function slugify(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

/** Construye el anonimizador para un contacto concreto. */
function makeAnonymizer(contactName, handle) {
  const names = new Set();
  for (const raw of [contactName, handle]) {
    if (!raw) continue;
    for (const part of String(raw).split(/[\s._-]+/)) {
      const p = part.trim();
      if (p.length >= 3 && !EQUIPO.some((e) => e.toLowerCase() === p.toLowerCase())) names.add(p);
    }
  }
  const nameRes = [...names].sort((a, b) => b.length - a.length)
    .map((n) => new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'));
  return (text) => {
    let t = text;
    t = t.replace(RE_EMAIL, '[EMAIL]');
    t = t.replace(RE_PHONE, (m) => (m.replace(/\D/g, '').length >= 9 ? '[TEL]' : m));
    for (const re of nameRes) t = t.replace(re, '[NOMBRE]');
    return t;
  };
}

function parse(text) {
  const lines = text.split(/\r?\n/);
  const convos = [];
  let category = null;
  let cur = null; // conversación actual
  let msg = null; // mensaje actual

  const flushMsg = () => {
    if (cur && msg) { cur.messages.push(msg); msg = null; }
  };
  const flushConvo = () => { flushMsg(); if (cur) { convos.push(cur); cur = null; } };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // ¿línea de mensaje?
    const mm = trimmed.match(RE_MSG);
    if (mm) {
      flushMsg();
      msg = { speaker: mm[1] === 'Trainer Way' ? 'SETTER' : 'PROSPECTO', ts: mm[2], channel: mm[3], body: [] };
      continue;
    }

    // ¿línea de tags? → el nombre es la línea NO vacía anterior que NO parece tags.
    // Las líneas de tags pueden ocupar varios renglones (muchos tags → wrap). Se reconocen
    // porque contienen '|'; se recogen hacia atrás hasta dar con la línea del nombre.
    if (RE_TAGLINE.test(trimmed) && !/contactos ·/.test(trimmed)) {
      flushConvo();
      const tagLines = [trimmed];
      let name = '';
      for (let j = i - 1; j >= 0; j--) {
        const prev = lines[j].trim();
        if (!prev) continue;
        if (RE_MSG.test(prev) || RE_CATEGORY.test(prev)) break;
        if (prev.includes('|')) { tagLines.unshift(prev); continue; } // renglón de tags
        name = prev; break; // primera línea sin '|' = nombre
      }
      const cleanName = name.replace(/[⭐️\s]+$/u, '').trim();
      const tagBlob = tagLines.join(' | ').split('·')[0]; // todo antes del "· N mensajes reales"
      const tags = tagBlob.split('|').map((s) => s.trim()).filter(Boolean);
      // handle = un token del nombre con punto o sin espacios (p.ej. oscarperez.trainer)
      const handle = /[.\_]/.test(cleanName) && !cleanName.includes(' ') ? cleanName : '';
      cur = { category, name: cleanName, handle, tags, messages: [] };
      continue;
    }

    // ¿cabecera de categoría? (línea corta "X (N)", no dentro de un mensaje largo)
    const cm = trimmed.match(RE_CATEGORY);
    if (cm && trimmed.length < 60 && Number(cm[2]) < 1000 && !RE_MSG.test(trimmed)) {
      flushConvo();
      category = cm[1].trim();
      continue;
    }

    // cuerpo del mensaje
    if (msg && trimmed) msg.body.push(trimmed);
  }
  flushConvo();
  return convos;
}

/** Normaliza un nombre para comparar (minúsculas, sin acentos ni ⭐). */
function normName(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Ground truth de Dani: ventas confirmadas por nombre (algunas compras no llevan el tag
 * nuevo-cliente-tw en GHL). Se lee de data/ingestion/overrides.json (GIT-IGNORED, contiene
 * nombres reales). Formato: { "sale": ["Marie González", ...] }.
 */
// Outcomes que un override PUEDE forzar (ground truth explícito de Dani). La clave "check" NO
// fuerza nada: es una lista de nombres/emails a cotejar e informar (la etiqueta manda).
const FORCEABLE = new Set(['sale', 'no_show', 'reached_call', 'no_booking']);

function makeEntry(outcome, e) {
  const emailMatch = String(e).match(RE_EMAIL);
  return emailMatch
    ? { outcome, label: e, email: emailMatch[0].toLowerCase() }
    : { outcome, label: e, words: normName(e).split(' ').filter(Boolean) };
}

function loadOverrides(outDir) {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(outDir, 'overrides.json'), 'utf8'));
    const forcing = [];
    const check = [];
    for (const [key, entries] of Object.entries(raw)) {
      for (const e of entries) {
        if (FORCEABLE.has(key)) forcing.push(makeEntry(key, e));
        else if (key === 'check') check.push(makeEntry('check', e));
      }
    }
    return { forcing, check };
  } catch { return { forcing: [], check: [] }; }
}

/** Texto crudo (pre-anonimización) de un convo, para casar overrides por email. */
function rawTextOf(convo) {
  return (convo.messages || []).map((m) => m.body.join(' ')).join(' ').toLowerCase();
}

/** Casa por email (en el cuerpo) o por subconjunto de palabras del nombre (nombre+apellido). */
function matchOverride(convo, overrides) {
  const words = new Set(normName(convo.name).split(' ').filter(Boolean));
  let raw = null;
  return overrides.find((o) => {
    if (o.email) { if (raw === null) raw = rawTextOf(convo); return raw.includes(o.email); }
    return o.words.length >= 2 && o.words.every((w) => words.has(w));
  });
}

// Tags de GHL que equivalen a "compró / es cliente".
const SALE_TAGS = ['nuevo-cliente-tw', 'cliente', 'antiguo cliente'];

function outcomeOf(convo, overrides) {
  const hit = matchOverride(convo, overrides);
  if (hit) return hit.outcome; // ground truth manda
  const base = CATEGORY_OUTCOME[convo.category] || 'unknown';
  const tags = convo.tags.map((t) => t.toLowerCase());
  if (base === 'reached_call' && tags.some((t) => SALE_TAGS.includes(t))) return 'sale';
  return base;
}

function main() {
  const input = process.argv[2];
  if (!input) { console.error('Uso: node src/ingestion/parse_export.js <export.pdf|.txt> [--out dir]'); process.exit(1); }
  const outIdx = process.argv.indexOf('--out');
  const outDir = outIdx > -1 ? process.argv[outIdx + 1] : path.join(__dirname, '..', '..', 'data', 'ingestion');
  // Cada export escribe en su propio subdirectorio (por nombre de fuente), para acumular tandas
  // sin pisarse. overrides.json se comparte y se lee siempre de la base (outDir).
  const srcTag = slugify(path.basename(input).replace(/\.[^.]+$/, ''));
  const normDir = path.join(outDir, 'normalized', srcTag);
  fs.mkdirSync(normDir, { recursive: true });

  const { forcing, check } = loadOverrides(outDir);
  const text = extractText(input);
  const convos = parse(text);

  const index = [];
  const summary = {};
  const matchedForcing = new Set();
  const checkHits = []; // nombres de la lista "a comprobar" presentes en el corpus
  const crossref = []; // local, con nombres reales (git-ignored) para cotejo de Dani
  convos.forEach((c, i) => {
    const anon = makeAnonymizer(c.name, c.handle);
    const outcome = outcomeOf(c, forcing);
    const hit = matchOverride(c, forcing);
    if (hit) matchedForcing.add(hit.label);
    const chk = matchOverride(c, check);
    const hasSaleTag = c.tags.map((t) => t.toLowerCase()).some((t) => SALE_TAGS.includes(t));
    if (chk) checkHits.push({ id: String(i + 1).padStart(3, '0'), name: c.name, label: chk.label, outcome, hasSaleTag, tags: c.tags });
    crossref.push({ id: String(i + 1).padStart(3, '0'), name: c.name, outcome,
      viaOverride: hit ? hit.label : '', hasSaleTag, tags: c.tags });
    summary[outcome] = (summary[outcome] || 0) + 1;
    const id = String(i + 1).padStart(3, '0');
    const fname = `${id}-${outcome}-${slugify(c.category)}.txt`;
    const setterTurns = c.messages.filter((m) => m.speaker === 'SETTER').length;
    const prospectTurns = c.messages.filter((m) => m.speaker === 'PROSPECTO').length;

    const header = [
      `# conversación ${id}`,
      `categoria: ${c.category}`,
      `outcome: ${outcome}`,
      `tags: ${c.tags.join(', ')}`,
      `mensajes: ${c.messages.length} (setter ${setterTurns} / prospecto ${prospectTurns})`,
      '', '---', '',
    ].join('\n');
    const bodyText = c.messages.map((m) => `${m.speaker}: ${anon(m.body.join('\n'))}`).join('\n');
    fs.writeFileSync(path.join(normDir, fname), header + bodyText + '\n', 'utf8');

    index.push({ id, file: fname, category: c.category, outcome, tags: c.tags,
      messages: c.messages.length, setterTurns, prospectTurns });
  });

  fs.writeFileSync(path.join(outDir, `index.${srcTag}.json`),
    JSON.stringify({ generated: new Date().toISOString(), source: path.basename(input),
      total: convos.length, summary, conversations: index }, null, 2), 'utf8');

  // Cotejo local (nombres reales; git-ignored) para que Dani verifique.
  const crossLines = crossref.map((r) =>
    `${r.id}  ${r.outcome.padEnd(13)}  ${r.hasSaleTag ? 'tag✓' : 'tag·'}  ${r.viaOverride ? 'ovr✓' : 'ovr·'}  ${r.name}  [${r.tags.join(', ')}]`);
  fs.writeFileSync(path.join(outDir, `crossref.${srcTag}.txt`),
    'id  outcome        tag   override  nombre  [tags]\n' + crossLines.join('\n') + '\n', 'utf8');

  console.log(`OK · ${convos.length} conversaciones → ${normDir}`);
  console.log('Resumen por outcome:', summary);

  console.log('\nVENTAS (por etiqueta de cliente / venta confirmada):');
  crossref.filter((r) => r.outcome === 'sale').forEach((r) => console.log(`  ${r.id}  ${r.name}  [${r.tags.join(', ')}]`));
  console.log('\nNO-SHOW en el corpus:');
  crossref.filter((r) => r.outcome === 'no_show').forEach((r) => console.log(`  ${r.id}  ${r.name}  [${r.tags.join(', ')}]`));

  if (check.length) {
    console.log('\nLista "a comprobar" presente en el corpus (la ETIQUETA manda el outcome):');
    checkHits.forEach((r) => console.log(`  ${r.id}  ${r.outcome.padEnd(12)} ${r.hasSaleTag ? 'tag-venta✓' : 'sin-tag-venta'}  ${r.name}`));
    const notHere = check.filter((o) => !checkHits.some((h) => h.label === o.label)).map((o) => o.label);
    console.log(`  (${check.length - checkHits.length} de la lista NO están en este export)`);
  }

  const unmatched = forcing.filter((o) => !matchedForcing.has(o.label)).map((o) => o.label);
  if (unmatched.length) console.log(`\n⚠️ Ventas confirmadas SIN casar (no están en este export) [${unmatched.length}]:`, unmatched);
  console.log(`\nCotejo completo → data/ingestion/crossref.${srcTag}.txt`);
}

main();
