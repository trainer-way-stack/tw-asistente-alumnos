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

    // ¿línea de tags? → el contacto es la línea NO vacía anterior
    if (RE_TAGLINE.test(trimmed) && !/contactos ·/.test(trimmed)) {
      flushConvo();
      let name = '';
      for (let j = i - 1; j >= 0; j--) { if (lines[j].trim()) { name = lines[j].trim(); break; } }
      const cleanName = name.replace(/[⭐️\s]+$/u, '').trim();
      const tagPart = trimmed.split('·')[0].trim();
      const tags = tagPart ? tagPart.split('|').map((s) => s.trim()).filter(Boolean) : [];
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

function outcomeOf(convo) {
  const base = CATEGORY_OUTCOME[convo.category] || 'unknown';
  const tags = convo.tags.map((t) => t.toLowerCase());
  if (base === 'reached_call' && (tags.includes('nuevo-cliente-tw') || tags.includes('cliente'))) return 'sale';
  return base;
}

function main() {
  const input = process.argv[2];
  if (!input) { console.error('Uso: node src/ingestion/parse_export.js <export.pdf|.txt> [--out dir]'); process.exit(1); }
  const outIdx = process.argv.indexOf('--out');
  const outDir = outIdx > -1 ? process.argv[outIdx + 1] : path.join(__dirname, '..', '..', 'data', 'ingestion');
  const normDir = path.join(outDir, 'normalized');
  fs.mkdirSync(normDir, { recursive: true });

  const text = extractText(input);
  const convos = parse(text);

  const index = [];
  const summary = {};
  convos.forEach((c, i) => {
    const anon = makeAnonymizer(c.name, c.handle);
    const outcome = outcomeOf(c);
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

  fs.writeFileSync(path.join(outDir, 'index.json'),
    JSON.stringify({ generated: new Date().toISOString(), source: path.basename(input),
      total: convos.length, summary, conversations: index }, null, 2), 'utf8');

  console.log(`OK · ${convos.length} conversaciones → ${normDir}`);
  console.log('Resumen por outcome:', summary);
}

main();
