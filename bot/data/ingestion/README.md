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

## Cómo se procesa (pipeline de ingesta — se implementa en fase 0)
1. Normalizar cada fuente a texto limpio con su etiqueta de capa.
2. Trocear en fragmentos (chunks) manejables.
3. Generar embeddings y guardarlos en el vector store con metadato `layer`.
4. Para el TONO: además, generar una **guía de estilo** + ejemplos few-shot.

> Cuando tengas los datos, súbelos a esta carpeta (o a un Drive y me pasas el
> acceso) y montamos el pipeline de ingesta.
