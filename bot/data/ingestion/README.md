# Preparación de datos para entrenar el setter (fase 0)

Aquí se dejan los datos en crudo que alimentan las capas de conocimiento
(`src/knowledge/layers.js`). **Ninguno de estos archivos se sube al repo** (van en
`.gitignore`): contienen conversaciones privadas de clientes. Se procesan en local.

## Qué reunir (por prioridad)

### 1. Conversaciones EXITOSAS de Miguel  → capa CAPTACION  ⭐ lo más valioso
- 50–100 hilos que **llegaron a llamada Y acabaron en compra**.
- Formato ideal: un archivo por conversación, o un CSV, con líneas marcadas:
  ```
  MIGUEL: ...
  PROSPECTO: ...
  ```
- Anonimiza nombres/teléfonos si puedes (basta con reemplazar por [NOMBRE]).

### 2. Conversaciones que NO convirtieron  → capa CALIFICACION
- 20–50 hilos, mismo formato. Sirven para aprender a descartar y qué evitar.

### 3. WhatsApp de Dani  → capa TONO
- Export de chats (WhatsApp permite exportar chat en .txt).
- Solo se usa el **estilo** de Dani, no el contenido.

### 4. Transcripciones de mentorías  → capa TONO + PROGRAMA
- Texto de las sesiones. Aportan tono y conocimiento del programa.

### 5. Materiales del programa  → capa PROGRAMA
- PDFs, docs, FAQs, guiones internos.

### 6. Objeciones reales  → capa OBJECIONES
- Lista de objeciones y cómo se resolvieron (puede salir de las conversaciones).

## Pipeline de ingesta (IMPLEMENTADO)

Parser del export categorizado de GHL (PDF) → hilos normalizados y anonimizados.

```bash
# desde bot/
node src/ingestion/parse_export.js <export.pdf|export.txt> [--out data/ingestion]
```

Qué hace (`src/ingestion/parse_export.js`, versionado, sin PII):
1. Extrae el texto del PDF con PDFKit (`src/ingestion/pdftext.swift`, nativo macOS; no necesita poppler).
2. Parsea categorías → contactos (con tags) → mensajes, mapeando `Trainer Way`→`SETTER`, `Contacto`→`PROSPECTO`.
3. **Anonimiza**: nombres de contacto/handle → `[NOMBRE]`, teléfonos → `[TEL]`, emails → `[EMAIL]`.
   (Nombres del equipo —Dani, Miguel, Natasia, Silvia— se conservan: no son PII de cliente.)
4. Deriva `outcome` por conversación: `sale` (tag nuevo-cliente-tw/cliente), `reached_call`, `no_show`, `no_booking`.
5. Escribe `normalized/NNN-<outcome>-<categoria>.txt` + `index.json`. **Todo ignorado por git.**

### Salida de la 1ª tanda (`conversaciones_categorizadas.pdf`, 2026-09-18)
48 conversaciones · 5.206 mensajes reales. Outcome: **7 sale, 14 reached_call, 2 no_show, 25 no_booking**.

### Ground truth de ventas (override)
Algunas compras NO llevan el tag `nuevo-cliente-tw` en GHL (p. ej. la conv. 021: tag
`antiguo cliente`). Por eso el resultado de venta se corrige con `data/ingestion/overrides.json`
(**git-ignored**, contiene nombres reales): `{ "sale": ["Marie González", ...] }`. Casa por
subconjunto de palabras (nombre+apellido basta; tolera 2º apellido). Dani pasó 8 ventas; 7 están
en esta tanda, **"Joaquín Escudero" no aparece en este export** (será de otra tanda).

> OJO de criterio (Dani, 09-18): las 25 `no_booking` **NO son un dataset negativo de técnica**:
> son conversaciones bien hechas que se enfriaron por un factor externo. Se usan como buenos
> ejemplos de oficio; el "por qué se cayeron" se analiza aparte. La **voz objetivo** del bot es
> un BLEND (estas conversaciones de Miguel + estilo de WhatsApp de Dani + formaciones), no una
> copia literal de Miguel.

## Siguiente (destilación a few-shot — PENDIENTE, con el corpus completo)
Curar a mano ~8-12 fragmentos ejemplares por fase (apertura / cualificación / objeción / cierre),
**sin PII**, y meterlos en `captacion.md`, `objeciones.md`, `tono.md`. Se hace cuando lleguen más
tandas para que la voz salga del blend y no de una sola muestra.
