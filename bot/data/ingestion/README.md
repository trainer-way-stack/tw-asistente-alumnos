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
- Ventas (por **etiqueta**): 001 marie, 002 adrià, 003 ernest, 004 mariangi, 005 david garay,
  006 manuel (todas `nuevo-cliente-tw`), 021 laia (`antiguo cliente`).
- No-show: `022 yadira moreno` (tag `no show`), `023 itziar arroyo rodriguez`.

### Cómo se decide la VENTA (criterio de Dani, 09-18)
**La venta la marcan las ETIQUETAS de GHL**, no el hecho de estar en una lista de nombres.
Cuentan como venta: `nuevo-cliente-tw`, `cliente`, `antiguo cliente`.

`data/ingestion/overrides.json` (**git-ignored**, nombres/emails reales) tiene 2 claves:
- **`sale`**: ventas que Dani confirma EXPLÍCITAMENTE (fuerzan el outcome aunque a esa conversación
  le falte el tag — red de seguridad para compras sin etiquetar). En esta tanda los 7 confirmados
  presentes coinciden con su tag; "Joaquín Escudero" es venta confirmada pero no está en el export.
- **`check`**: lista a COTEJAR (no fuerza nada; la etiqueta manda). El run informa cuáles están en
  el corpus y si tienen tag de venta. En esta tanda solo `samuel maya` está presente y **NO** tiene
  tag de venta → queda como `reached_call`, no venta.

Casa por **subconjunto de palabras** del nombre (nombre+apellido; tolera 2º apellido) o por
**email** encontrado en el cuerpo. El run escribe el cotejo completo en `data/ingestion/crossref.txt`
(git-ignored) e imprime ventas, no-shows y el resultado de la lista `check`.

> OJO de criterio (Dani, 09-18): las 25 `no_booking` **NO son un dataset negativo de técnica**:
> son conversaciones bien hechas que se enfriaron por un factor externo. Se usan como buenos
> ejemplos de oficio; el "por qué se cayeron" se analiza aparte. La **voz objetivo** del bot es
> un BLEND (estas conversaciones de Miguel + estilo de WhatsApp de Dani + formaciones), no una
> copia literal de Miguel.

### 2ª tanda (`conversaciones_lote2_completas.pdf`, 2026-09-18)
Formato B: "conversaciones completas, sin filtrar", **sin categorías** y con línea de tags
"· N mensajes ·…" (el parser soporta ambos formatos). 30 registros de contacto (algunos son
registros GHL duplicados del mismo contacto: juanpe ×3, reinaldo ×3, pablo molina ×2, cada
hilo/canal es un registro). Outcome: **1 sale, 29 uncategorized** (sin categorías, el outcome
solo sale del tag; los que no son venta/no-show quedan `uncategorized`).
- Venta (por tag): `genaro álvarez` (`antiguo cliente`).
- ⚠️ OJO (a confirmar por Dani): `jota fernández díaz` lleva `nuevo cliente` (sin `-tw`) y
  `entrenadorpersonalsevilla150@gmail.com` lleva `tw-elite` — por la regla de Dani NO cuentan
  como venta, aunque parecen clientes. Si esos tags deben valer, se añaden a `SALE_TAGS`.
- 3 registros con **nombre no extraíble** del PDF ("prueba y me cuentas", "Vale", pie de email):
  la conversación está, solo el nombre no; no afecta al outcome (tag-driven).

### Tags que cuentan como VENTA (Dani, 09-18)
**SOLO** `nuevo-cliente-tw` y `antiguo cliente`. (No cuentan: `nuevo cliente` sin `-tw`,
`tw-elite`, `cliente`, `seguimiento clientes`, `clientes contactados`.)

## Siguiente (destilación a few-shot — PENDIENTE, con el corpus completo)
Curar a mano ~8-12 fragmentos ejemplares por fase (apertura / cualificación / objeción / cierre),
**sin PII**, y meterlos en `captacion.md`, `objeciones.md`, `tono.md`. Se hace cuando lleguen más
tandas para que la voz salga del blend y no de una sola muestra.
