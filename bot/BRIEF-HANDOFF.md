# BRIEF DE HANDOFF — TW Setter IA (bot de captación por Instagram)

> **Para quién es esto:** para la sesión de **Claude Code local** (o cualquier persona) que
> continúe el proyecto. Resume TODO lo hecho, las decisiones, el estado de cada pieza y lo que
> falta. Léelo entero antes de seguir. Documento vivo: actualízalo al avanzar.
>
> **Repo:** `trainer-way-stack/tw-asistente-alumnos` · **Rama de trabajo:**
> `claude/instagram-lead-bot-ovqose` · **Carpeta del bot:** `bot/`
> **Dueño/negocio:** Dani Penas — Trainer Way (mentoría para entrenadores online).

---

## 1. Objetivo del proyecto

Construir un **"setter IA"**: un bot que gestiona conversaciones de captación en **Instagram DM**.
- **Miguel (setter humano) ABRE** las conversaciones en frío. El bot **gestiona a todo el que
  responde**: cualifica, resuelve dudas/objeciones y lleva a **agendar una videollamada**.
- Meta: que Miguel pase de gestionar 30-40 conversaciones/día a solo abrir puertas.
- Diferenciador vs. Autosetter / Zero Chats: **tono real de Dani + guion aprendido de
  conversaciones que convirtieron + conocimiento por capas** (no un bot genérico tipo FAQ).
- **Segundo objetivo:** que sea **revendible** a los alumnos de Dani (multi-cuenta desde el diseño).

### Reglas inquebrantables
1. **Nada de mensajes en frío automatizados.** El bot SOLO responde a quien ya escribió. La
   apertura la hace siempre un humano. (Legal + evita baneos de Instagram.)
2. **No cargar todo el conocimiento a lo bruto.** El bot recupera por capas solo lo relevante (RAG).
3. **Transparencia de IA** obligatoria (art. 50 AI Act) — resuelto con framing "a medias" (ver §4).

---

## 2. Estado actual = lo que YA funciona (scaffold probado)

Todo el flujo está montado y probado en un **simulador de consola** (`bot/src/simulate.js`), sin
necesidad de conectar Instagram. Con `ANTHROPIC_API_KEY` responde con la metodología real de Dani.

### Mapa de archivos (`bot/`)
| Archivo | Qué hace |
|---|---|
| `ARQUITECTURA.md` | Plano completo del sistema (léelo también). |
| `SETUP-CODE-LOCAL.md` | Cómo correr Claude Code en el ordenador de Dani (acceso local). |
| `BRIEF-HANDOFF.md` | Este documento. |
| `package.json` / `.env.example` | Deps y variables de entorno. |
| `src/server.js` | Webhook de Instagram (verificación + firma HMAC). Solo reactivo. |
| `src/instagram/client.js` | Envío de DMs con troceado en varios mensajes + "escribiendo…". |
| `src/core/orchestrator.js` | **Cerebro**: orquesta pausa → RAG → LLM → scoring → aviso → envío → follow-up. |
| `src/core/state.js` | Estado por conversación, clave `(accountId, userId)` (multi-cuenta). En memoria (→ BD). |
| `src/core/tenants.js` | Config por cuenta/tenant (nombre, umbral scoring, horas follow-up, tono). La "puerta" para revender. |
| `src/core/pause.js` | Pausa manual, **auto-pausa si escribe un humano**, pausa temporal, reanudar, **handover por escalado**. |
| `src/core/disclosure.js` | Aviso de IA "a medias", una sola vez, nombre del dueño parametrizado. |
| `src/core/scoring.js` | Decisión por score de cualificación (umbral → proponer llamada / descartar). |
| `src/core/escalation.js` | **Decide ESCALAR a humano**: el modelo pide relevo (`necesita_humano`/`confianza`) o red de seguridad por palabras clave (legal, reembolso, salud, datos bancarios…). |
| `src/core/notify.js` | **Aviso al humano** al escalar. Canal por tenant: `ghl` (pone etiqueta → workflow WhatsApp), `none`. Nunca rompe el flujo. |
| `src/core/followup.js` | Recordatorio a las N h de silencio dentro de la ventana 24h (setTimeout → job queue). |
| `src/core/llm.js` | Generación con Claude: 1ª respuesta nativa + score; guardarraíles; carga tono real. |
| `src/knowledge/layers.js` | Definición de las capas de conocimiento. |
| `src/knowledge/retriever.js` | Selecciona capas por fase y las inyecta (MVP; RAG fino después). |
| `src/knowledge/content.js` | Cargador con caché de la base de conocimiento destilada. |
| `src/knowledge/content/*.md` | **Conocimiento real** por capa (ver §5). |
| `src/crm/ghl.js` | Integración Go High Level (skeleton). |

### Funcionalidades implementadas
- ✅ **Webhook Instagram** con verificación y validación de firma (solo reactivo).
- ✅ **Orquestador** completo con logging de fase/score/capas usadas.
- ✅ **Pausa/handover**: manual, **auto-pausa cuando un humano escribe a mano** en el DM, pausa
  temporal configurable (se levanta sola), reanudar.
- ✅ **Aviso de IA "a medias"**: 1ª respuesta NATIVA al saludo del prospecto y, justo después, el
  aviso ("escribes con el asistente de IA de Dani; lo llevamos a medias Dani y yo…"). Una sola vez.
- ✅ **Scoring de cualificación 0-10**: al superar el umbral del tenant (por defecto 7) → propone
  llamada; ≤3 → descarta con tacto; en medio → sigue cualificando.
- ✅ **Follow-up con cadencia (v2, 19-09)**: toques por silencio a **5h→+5h→+12h→+24h→+24h**
  (`followupScheduleHours`), tono muy corto y ligero ("pudiste leerme??"); se reinicia si
  responde. Los toques >24h quedan fuera de la ventana IG y se omiten solos. Ver capa `seguimiento`.
- ✅ **Reglas v2 de negocio (19-09, en las capas de conocimiento):** nichos válidos = entrenador/
  nutri/fisio/psicólogo/dietista/coach (otros → derivar a Miguel); MLM → descartar; ya-cliente →
  identificarse y parar; compite con otro y le va mal → derivar; "¿estafa?/pruebas" → prueba
  social del perfil; "¿qué método?" → pinceladas de los 3 pilares (Two Days Offer, embudo
  orgánico, sistema de ventas 5500) + "se ve en la llamada"; tuteo siempre; **nunca garantías ni
  comparar con competencia**; filtro económico final = viabilidad 330€/mes ×12.
- ✅ **Multi-cuenta / reventa**: estado y config por tenant. Corre en la **cuenta de Dani**.
- ✅ **Escalado a humano (18-09)**: si sale algo NUEVO/fuera de guion, sensible (legal, reembolso,
  salud, datos bancarios, queja) o el modelo duda (confianza baja), el bot **se pausa, manda un
  mensaje puente** al prospecto y **avisa a Miguel** poniendo la etiqueta `derivar-humano` en GHL
  (un workflow de GHL la escucha y avisa por WhatsApp). Config por tenant en `tenants.js`
  (`escalationEnabled`, `confidenceThreshold`, `escalationChannel`, `escalationTag`, `bridgeMessage`).
  Probado en simulador. **FALTA (Dani):** crear el workflow en GHL que, al añadirse `derivar-humano`,
  notifique a Miguel por WhatsApp.
- ✅ **Guardarraíles**: no promete resultados, no da consejo médico, **no da precios por DM** (salvo insistencia fuerte → "desde 330 €/mes durante 12 meses", nunca el total), no
  comparte datos bancarios, mensajes cortos.

---

## 3. Requisitos técnicos de Instagram (Meta) — PENDIENTE de montar

Para conectar de verdad (no solo simulador):
- Cuenta de Instagram **Profesional** (Business/Creator) **de Dani**, vinculada a una **Página de
  Facebook**.
- **App en Meta for Developers** con permisos `instagram_business_basic` +
  `instagram_business_manage_messages` (este último requiere **App Review** de Meta con vídeo de
  uso — es lo que más tarda; prepararlo bien).
- **Servidor con webhook público HTTPS** (ya tenemos `src/server.js`); desplegarlo.
- Reglas de plataforma a respetar: **ventana de 24h** (solo escribir dentro de 24h desde el último
  mensaje del usuario), **solo respuestas a acción del usuario**, **Handover Protocol** (humano
  toma el control).
- Para revender a alumnos (cada uno su IG) → se necesita estatus **Tech Provider** de Meta (fase 3).

---

## 4. Decisiones tomadas (NO revertir sin hablar con Dani)

| Tema | Decisión |
|---|---|
| Cuenta | Corre en la **cuenta de Dani**, no la de Miguel. |
| Reventa | Multi-cuenta desde el diseño (`tenants.js`). |
| Aviso de IA | Framing **"a medias"** (asistente + Dani) + **1ª respuesta nativa**. Transparente pero natural. **NO** se oculta el aviso (art. 50; era petición inicial de Dani, descartada por riesgo legal/marca). |
| Precios | Por defecto el bot **NO da precio por DM** y reencuadra a la llamada. **Excepción (Dani, 17-09):** si el prospecto **insiste mucho**, puede decir **"desde 330 €/mes durante 12 meses"** — nunca el total ni el contado. Contexto interno: **TW 3.500 € contado / 330 €×12 = 3.960 € financiado / 2 pagos 2.000+1.500 a ~60d**; **TW Alpha 8.000 €**. (El "desde 300 €/mes" es el gancho del setter en la llamada; DM usa 330.) Calcar el cómo con las conversaciones de Miguel. |
| Interfaz | **GHL como CRM** ahora + **panel propio** más friendly en fase 2. |
| Scoring | Rúbrica 0-10 con umbral. **PENDIENTE:** Dani quiere usar los **11 puntos** de su "proyecto de Omni" (ver §6). |
| Fuente del programa | Dani quiere que la info del programa salga de su **carpeta "app/apps"** (en su ordenador), NO del Drive. `programa.md` está marcado **PROVISIONAL** hasta tenerla (ver §6). |

---

## 5. Base de conocimiento (capas) — estado

Ubicación: `bot/src/knowledge/content/`. Se cargan por fase de conversación (`retriever.js`).
Destiladas (1ª pasada) de documentos reales del Drive de Dani. **Sin PII de clientes ni datos
bancarios.**

| Archivo | Capa | Estado |
|---|---|---|
| `tono.md` | tono (siempre) | ✅ **v1 few-shot (19-09)**: calibrado con conversaciones reales que cerraron (emojis reales 💪✅🔥🤝, mensajes de 3-8 palabras, micro-ejemplos reales). Se seguirá afinando con más lotes/WhatsApp. |
| `captacion.md` | captacion | ✅ **v1 few-shot (19-09)**: + sección "Ejemplos reales del arco" (apertura→cualificación→pitch→filtro→agenda) de las ventas 001-005. |
| `objeciones.md` | objeciones | ✅ **v1 few-shot (19-09)**: + ejemplos reales (precio, negociar a la baja, codecisor/pareja, "prefiero seguir", "mi caso es especial", "otro mentor"). |
| `calificacion.md` | calificacion | ✅ **REHECHO (17-09) desde OMNI**: los 11 puntos reales del setter + 3 marcadores de no-show + señales de alarma de ICP. Scoring 0-10 mapeado a los 11 puntos. |
| `programa.md` | programa | ✅ **REHECHO (17-09) desde OMNI** (`command-deck-os`: precio canónico + contexto de negocio). Precio canónico 3.500 € contado / 330 €×12 = 3.960 €; fraccionamiento 2.000+1.500 a ~60d **confirmado vigente** por Dani. Regla de precio en DM actualizada (ver §4). |
| `agendamiento.md` | agendamiento | OK (de "Imprescindibles setter pre llamada" + roadmap). |

**Mejora de mayor impacto:** añadir **conversaciones reales que convirtieron** como ejemplos
few-shot en `captacion.md` y `objeciones.md`. Dani está exportando las conversaciones de **Go High
Level** para esto (ver §7).

### Nota sobre datos del Drive (contexto para no repetir trabajo)
- Se catalogó el Drive y se destilaron 8 documentos clave. **Dani pidió NO fiarse mucho del Drive
  para el programa** y usar su carpeta "app/apps".
- La carpeta **"CONVERSACIONES EXITOSAS"** (Drive, 3 vídeos .mp4) **es de Dani** (verificado por
  propietario), pero **no está confirmado quién habla** en los vídeos → habría que **transcribirlos**.
- El **export de WhatsApp** "TRAINER WAY CREW.zip" (2,4 GB) sirve para tono; procesar aparte por
  tamaño y por PII de terceros (solo derivar estilo, no volcar chats).

---

## 6. BLOQUEOS que necesitan input de Dani (o de Code local)

1. ✅ **RESUELTO (17-09, Code local).** Carpeta autoritativa = `~/Desktop/apps`, y la fuente del
   programa + los 11 puntos viven en `OMNI-codigo-completo.txt` (dump de `command-deck-os`).
   `programa.md` reescrito desde ahí. **Pendiente de Dani:** confirmar la discrepancia de
   financiación (Drive decía 2.000+1.500 a 60 días; OMNI dice 330 €×12).
2. ✅ **RESUELTO (17-09, Code local).** Los "11 puntos" = la rúbrica del setter en
   `command-deck-os → src/lib/prompts.ts → setterSystemPrompt` (FASE A diagnóstico 1-5, FASE B
   anclajes 6-8, FASE C cierre 9-11) + 3 marcadores de no-show + señales de alarma de calidad de
   lead. `calificacion.md` reconstruido. `scoring.js` NO necesita cambios: solo mapea score→acción
   con el umbral del tenant; la rúbrica vive en la capa de conocimiento que usa el LLM.
3. **Export de conversaciones de Go High Level** (en marcha por Dani). Al tenerlo → ingerir como
   ejemplos few-shot (ver §7). **Sigue pendiente.**

---

## 7. Integrar Go High Level (para meter las conversaciones reales)

GHL **no ejecuta el bot** (eso vive en nuestro servidor). GHL = CRM + calendario + fuente de datos.
Dos usos:

**A) Como fuente de conversaciones reales (ahora):**
- Opción manual: exportar las conversaciones/mensajes desde GHL (o desde el chat de cada contacto).
- Opción API (recomendada, escalable): usar la **API de LeadConnector (GHL v2)**, endpoints de
  **Conversations** (`/conversations/search`) y **Messages** para bajar los hilos. Requiere API key
  + Location ID (ver `bot/.env.example`: `GHL_API_KEY`, `GHL_LOCATION_ID`).
- Normalizar los hilos a formato `SETTER:` / `PROSPECTO:` y etiquetar resultado (agendó / compró /
  no). Guardarlos en `bot/data/ingestion/` (ignorado por git, contiene PII) y destilar los patrones
  ganadores a `captacion.md` / `objeciones.md` (few-shot, sin PII).

**B) Como CRM en producción (fase 1-2):**
- El bot crea/actualiza contacto y lo mueve por el pipeline (Nuevo → Cualificando → Propuesta de
  llamada → Agendado → Descartado) vía `src/crm/ghl.js` (skeleton a completar).
- Etiquetas de estado (`bot-activo`, `pausado`, `derivado-humano`, `agendado`); cambiar una etiqueta
  en GHL puede disparar la pausa vía webhook.
- Workflows de GHL solo para lo periférico (avisar a Miguel de lead caliente, recordatorio de cita).
  **La conversación NO se gestiona con workflows** (rígidos): la lleva el orquestador.
- Llamadas → calendario de GHL.

---

## 8. Deuda técnica / a industrializar antes de producción
- **Persistencia:** `state.js` y `tenants.js` están en memoria → mover a **Postgres** (historial) +
  **Redis** (estado caliente).
- **Follow-up:** `followup.js` usa `setTimeout` → **job queue durable** (BullMQ/Redis) para
  sobrevivir a reinicios y escalar.
- **RAG fino:** hoy se inyecta la capa entera (archivos pequeños). Cuando crezca la base
  (cientos de conversaciones) → trocear + embeddings + vector store (pgvector) y recuperar solo
  fragmentos.
- **Auto-pausa real:** en `server.js`, detectar el `message echo` humano (texto que no coincide con
  lo que envió el bot) y llamar a `autoPauseOnHumanReply`. Hoy la lógica existe pero falta cablearla
  al evento real de la API.
- **Panel propio** (fase 2): cabina de mando (pausar/reanudar, ver por qué respondió, ajustar
  tono/umbral). Más friendly que GHL.
- **Despliegue** del webhook (HTTPS público) + secrets management.

---

## 9. Cómo continuar (para Code local)

```bash
# 1) Traer el proyecto
git clone https://github.com/trainer-way-stack/tw-asistente-alumnos.git
cd tw-asistente-alumnos
git checkout claude/instagram-lead-bot-ovqose

# 2) Instalar y probar el bot en simulador (sin Instagram)
cd bot
npm install
cp .env.example .env        # y rellenar ANTHROPIC_API_KEY para respuestas reales
node src/simulate.js        # conversación de prueba por consola

# 3) Cuando toque, arrancar el webhook
npm start
```
- Trabaja siempre en la rama `claude/instagram-lead-bot-ovqose`. Commits claros. Push a esa rama.
- Si abres Claude Code en una carpeta "madre" que contenga el repo **y** la carpeta "app/apps",
  puede leer ambas en la misma sesión (para rehacer `programa.md`).

---

## 10. Próximos pasos priorizados
1. ✅ **HECHO (17-09).** `programa.md` reescrito desde la carpeta autoritativa (`~/Desktop/apps`,
   OMNI). Falta que Dani confirme la discrepancia de financiación.
2. ✅ **HECHO (17-09).** `calificacion.md` reconstruido con los 11 puntos de Omni. `scoring.js` sin
   cambios (a propósito).
3. **(Dani/Code)** Export de GHL → few-shot. **Pipeline HECHO (18-09):** `src/ingestion/parse_export.js`
   parsea el PDF categorizado, normaliza a SETTER/PROSPECTO, **anonimiza** (nombres/tel/email) y
   etiqueta outcome. 1ª tanda ingerida (`conversaciones_categorizadas.pdf`): 48 convos → 7 sale,
   14 reached_call, 2 no_show, 25 no_booking (en `data/ingestion/`, ignorado por git). **La venta
   la marcan las ETIQUETAS de GHL** (`nuevo-cliente-tw`/`cliente`/`antiguo cliente`), no las listas
   de nombres. `overrides.json` (git-ignored) tiene `sale` (ventas que Dani confirma explícitamente,
   red de seguridad) y `check` (lista a cotejar; la etiqueta manda). "Joaquín Escudero" confirmado
   pero no está en esta tanda.
   **PENDIENTE:** más tandas (Dani las está sacando) y luego **destilar few-shot a mano** a
   `captacion.md`/`objeciones.md`/`tono.md` (sin PII). Criterio: las `no_booking` NO son mala
   técnica; la voz objetivo es un BLEND (Miguel + WhatsApp Dani + formaciones), no copiar a Miguel.
4. **(Opcional)** Transcribir los 3 vídeos de "CONVERSACIONES EXITOSAS" y confirmar de quién son.
5. **(Paralelo, tarda)** Crear la **app de Meta** y pedir permisos de Instagram.
6. Procesar el **export de WhatsApp** para afinar `tono.md`.
7. Industrializar: BD, job queue, cablear auto-pausa, desplegar webhook.
8. Fase 2: panel propio + integración GHL completa + métricas.

---

## 11. Límites de acceso (para que no haya sorpresas)
- **Esta sesión (nube):** ve el repo de GitHub + conectores de la cuenta de Dani (**Google Drive,
  Miro**). **NO** ve el ordenador de Dani, ni GHL, ni Instagram, ni "Omni".
- **Code local (tu ordenador):** ve tus archivos/apps locales y ejecuta tareas en tu máquina. Pero
  GHL/Instagram/Omni siguen necesitando **su API o conector** (no se accede "por estar en el PC").
