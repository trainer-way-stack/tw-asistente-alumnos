# TW Setter IA — Asistente de captación por Instagram

> Bot que gestiona conversaciones de captación en Instagram DM. **Miguel (setter humano) abre
> las conversaciones; el bot gestiona a todo el que responde.** Objetivo: que Miguel pase de
> gestionar 30–40 conversaciones/día a solo abrir puertas, y que las conversaciones se cierren
> hacia llamada de forma automática, natural y con el tono de Dani.

Este documento es el plano completo. El código en `bot/src/` es el esqueleto que lo implementa.

---

## 0. Principio de diseño

Dos reglas que gobiernan todo lo demás:

1. **Nada de mensajes en frío automatizados.** El bot **solo responde** a personas que ya han
   escrito. La apertura la hace siempre un humano (Miguel). Esto no es solo por ley: es lo que
   permite usar la API oficial de Instagram sin que te cierren la cuenta (ver §1).
2. **El bot no "sabe todo a la vez".** Se entrena por **capas** y en cada momento el modelo
   decide *de qué capa* sacar la información (ver §5). Eso es lo que lo hace natural y lo que nos
   diferencia de Autosetter / Zero Chats (ver §3).

---

## 1. Qué necesitamos técnicamente para conectar el bot a Instagram

Instagram **no permite** conectar un bot a una cuenta personal ni "pilotar" la app como si
fueras tú a mano de forma masiva (eso es lo que hace que baneen cuentas). El camino legal y
estable es la **API oficial de mensajería de Instagram** (Instagram Messaging API, parte de la
Graph API de Meta).

### 1.1 Requisitos de cuenta
- La cuenta de Instagram debe ser **Profesional** (Business o Creator). Las cuentas personales
  no pueden usar automatización de DMs.
- Debe estar **vinculada a una Página de Facebook** (requisito de Meta para la API).
- Necesitas una **app en Meta for Developers** (developers.facebook.com).

### 1.2 Permisos que hay que solicitar (App Review de Meta)
- `instagram_business_basic` — identidad básica de la cuenta.
- `instagram_business_manage_messages` — leer y enviar DMs. **Este es el permiso clave y va
  detrás de "App Review" con "Advanced Access"**: Meta revisa tu app, te pide un vídeo de cómo
  la usas y para qué. Hay que preparar bien esta solicitud (es donde falla la mayoría).
- (Opcional según features) `instagram_business_manage_comments` — si algún día automatizamos
  respuestas a comentarios que abren DM.

### 1.3 Reglas de plataforma que condicionan el producto (importantísimas)
- **Ventana de 24 horas:** solo puedes enviar mensajes a un usuario **dentro de las 24h**
  desde su última interacción. Fuera de esa ventana, solo mensajes "humanos" limitados o
  plantillas aprobadas. → El bot debe estar diseñado para trabajar dentro de esa ventana y para
  marcar/derivar a Miguel cuando una conversación se enfría.
- **Solo respuestas a acción del usuario:** el bot responde a mensajes iniciados por el usuario.
  Nada de campañas salientes automáticas.
- **El bot debe responder a cualquier input** del usuario (no puede ignorar).
- **Transparencia:** hay que dejar claro que se interactúa con un sistema automático (ver §6).
- **Handover Protocol:** Meta permite que una conversación la gestionen varias "apps" (p.ej. el
  bot lleva la primera parte y un humano toma el control después). Esto encaja perfecto con
  "pausar y que Miguel/Dani retome".

### 1.4 Infraestructura que hay que montar
| Pieza | Para qué | Estado en el scaffold |
|---|---|---|
| **App de Meta + permisos** | acceso a la API | ⛔ hay que crearla en developers.facebook.com |
| **Servidor con webhook público (HTTPS)** | recibir los DMs en tiempo real | ✅ `src/server.js` |
| **Verificación del webhook** (verify token) | Meta valida tu endpoint | ✅ `src/server.js` |
| **Cliente de envío** (Graph API) | responder DMs, "escribiendo…", trocear mensajes | ✅ `src/instagram/client.js` |
| **Almacén de estado por conversación** | pausa, fase, propietario, historial | ✅ `src/core/state.js` (skeleton) → mover a Postgres/Redis |
| **Orquestador / cerebro** | decidir qué responder usando las capas | ✅ `src/core/orchestrator.js` |
| **Base de conocimiento + RAG** | tono, programa, objeciones, guion | ✅ `src/knowledge/*` |
| **CRM / interfaz** | ver conversaciones, pausar, configurar | ver §4 |

> **Nota sobre "Tech Provider":** si algún día ofreces esto a tus alumnos como servicio (que
> cada alumno conecte SU Instagram), Meta te exige estatus de **Tech Provider** (procesar datos
> en nombre de terceros). Para uso propio (tu cuenta + la de Miguel) no hace falta. Lo tenemos en
> el radar para la fase 2 (§7).

---

## 2. Arquitectura general (flujo de un mensaje)

```
  Prospecto escribe en IG DM
            │
            ▼
   Webhook (src/server.js)  ──►  ¿conversación en pausa? (src/core/pause.js)
            │                         │ sí → no responder, notificar a humano
            ▼                         │ no ↓
   Cargar estado (src/core/state.js)
            │
            ▼
   Orquestador (src/core/orchestrator.js)
     1. clasifica intención / fase de la conversación
     2. RECUPERA de las capas lo relevante (src/knowledge/retriever.js)
        - tono de Dani
        - conocimiento del programa
        - objeciones
        - guion de captación
     3. genera respuesta con Claude, con el tono y los límites correctos
     4. decide: ¿responder?, ¿trocear en varios mensajes?, ¿agendar?, ¿derivar a humano?
            │
            ▼
   Cliente IG (src/instagram/client.js) → envía respuesta(s)
            │
            ▼
   Actualiza estado + CRM (src/crm/ghl.js)
```

---

## 3. Por qué Autosetter / Zero Chats decepcionan y cómo nos diferenciamos

De lo investigado, ambas venden lo mismo: "IA que califica leads y agenda llamadas 24/7 en tus
DMs". El problema no es la tecnología (usan modelos tipo GPT), es que **no tienen tu know-how de
prospección**. Los fallos típicos de estas herramientas y nuestra respuesta:

| Fallo típico de Autosetter/Zero Chats | Nuestra diferencia |
|---|---|
| **Tono genérico "de bot"**: suenan a asistente de atención al cliente, no a persona. | Capa de **tono** extraída de tus WhatsApp y mentorías. El bot habla como Dani/como el setter, no como un bot. |
| **Guion rígido tipo formulario** (presupuesto/necesidad/urgencia → link). Se nota el "interrogatorio". | Guion aprendido de **conversaciones reales exitosas** de Miguel (las que llegaron a llamada Y compraron). Aprende el *ritmo*, no un checklist. |
| **Meten todo el conocimiento de golpe** → respuestas largas, cargadas, poco naturales. | Recuperación por capas: el bot saca **solo lo que necesita** en cada mensaje (RAG). Respuestas cortas y humanas. |
| **Objeciones tratadas como FAQ.** | Capa dedicada de **resolución de objeciones prematuras** con tu enfoque. |
| **Cero control fino**: difícil pausar, se pisan con el humano. | Pausa manual, **auto-pausa si escribes tú**, pausa temporal configurable, handover limpio (§4). |
| **No conocen el programa a fondo.** | Capa de **conocimiento del programa** (parte práctica) alimentada por ti. |

**Resumen del diferencial:** ellos venden una IA que *responde*; nosotros construimos una IA que
*prospecta como Miguel y suena como Dani*, entrenada con datos reales del negocio.

---

## 4. Interfaz / CRM: ¿Go High Level o algo propio?

> **Decisiones tomadas:** el bot corre en la **cuenta de Dani** (no en la de Miguel). El sistema
> es **multi-cuenta desde el diseño** para poder revenderlo a alumnos (cada cuenta = un "tenant"
> con su config: nombre para el aviso, umbral de scoring, horas de follow-up, tono; ver
> `src/core/tenants.js`). Dani quiere además un **panel propio** más friendly que GHL — se hace en
> fase 2; abajo explico también qué implica hacerlo dentro de GHL.

**Recomendación: híbrido, apoyándonos en Go High Level (GHL) como CRM + un panel de control
propio para lo que GHL no hace bien.**

### ¿Qué implica montarlo en Go High Level?
GHL **no** ejecuta el bot (la IA y la lógica de capas viven en nuestro servidor). GHL aporta el
CRM y el calendario. La integración es:
1. **Contacto + pipeline:** por cada prospecto, nuestro bot crea/actualiza un contacto en GHL vía
   API y lo mueve por un pipeline con etapas (Nuevo → Cualificando → Propuesta de llamada →
   Agendado → Descartado). Ver `src/crm/ghl.js`.
2. **Etiquetas de estado:** `bot-activo`, `pausado`, `derivado-humano`, `agendado`. Cambiar una
   etiqueta a mano en GHL puede **disparar la pausa** del bot (GHL → webhook → nuestro servidor).
3. **Automatizaciones (Workflows) de GHL:** sí, se crean workflows, pero para lo periférico:
   avisar a Miguel cuando un lead pasa a "Propuesta de llamada", enviar recordatorio de la cita,
   mover etapas. **La conversación en sí NO se gestiona con workflows de GHL** (son rígidos); eso
   lo lleva nuestro orquestador.
4. **Calendario:** las llamadas se agendan en el calendario de GHL (link de reserva que el bot
   comparte, o creando la cita por API).

**Límite de GHL:** el control fino del bot (pausar una conversación concreta, ver por qué
respondió lo que respondió, ajustar tono/umbral por conversación) es tosco en GHL. Por eso el
**panel propio** (fase 2).

Razonamiento:
- **GHL ya te da gratis** (bueno, ya lo pagas): pipeline/CRM visual, contactos, etiquetas,
  calendario para las llamadas, y ya lo usáis con Meta Ads (según tu stack). No tiene sentido
  reinventar el CRM.
- **Lo que GHL NO hace bien** para este caso: el control fino del bot (pausar una conversación
  concreta, auto-pausa al escribir a mano, ver el "por qué" de cada respuesta del bot, ajustar
  el prompt/knowledge por conversación). Eso lo damos con un **panel propio ligero**.

Arquitectura de interfaz propuesta:
- **GHL** = sistema de registro (contacto, pipeline, etiquetas: `bot-activo`, `pausado`,
  `derivado-humano`, `agendado`), y el calendario donde caen las llamadas.
- **Panel propio** (fase 2, web sencilla) = "cabina de mando del bot":
  - lista de conversaciones activas y su estado (bot / pausado / humano)
  - botón **Pausar / Reanudar** por conversación
  - **auto-pausa**: si Dani o Miguel escriben manualmente en ese DM, el bot se pausa solo
  - pausa **temporal configurable** (p.ej. "pausar 2h", "pausar hasta mañana 9:00")
  - ver el historial + qué capa usó el bot en cada respuesta (para depurar/entrenar)
  - "kill switch" global.

La lógica de pausa/handover ya está esbozada en `src/core/pause.js` y es **independiente de la
interfaz**: funciona igual la dispares desde GHL (vía tags/webhooks) o desde el panel propio.
Empezamos integrando con GHL y, si nos quedamos cortos, montamos el panel.

---

## 5. Entrenamiento por capas (el corazón del producto)

La clave que pides: **no cargarle todo a lo bruto**, sino que el bot entienda **de dónde extraer
cada parte**. Esto se hace con **RAG** (Retrieval-Augmented Generation): la base de conocimiento
se trocea y etiqueta por capa; en cada mensaje el orquestador recupera solo los fragmentos
relevantes de la(s) capa(s) que toca. Ver `src/knowledge/layers.js` y `src/knowledge/retriever.js`.

> **Estado:** la base de conocimiento YA está poblada (1ª pasada) en
> `src/knowledge/content/*.md`, destilada de tus documentos reales del Drive (script en frío,
> formación setter, objeciones, imprescindibles pre-llamada, el proyecto TW). El bot ya responde
> con tu metodología, no con placeholders. Incluye una **rúbrica de scoring 0-10** real en
> `calificacion.md`. Falta enriquecerlo con conversaciones reales y el export de WhatsApp (tono).

### Capa 1 — TONO de Dani
- **Fuente:** conversaciones de WhatsApp de Dani + transcripciones de mentorías.
- **Qué se extrae:** *cómo* hablas (muletillas, longitud de frase, emojis o no, formalidad,
  ritmo), **NO** conceptos ni técnicas de captación. Es un "perfil de estilo".
- **Cómo:** analizamos una muestra grande y generamos una **guía de estilo** + ejemplos few-shot.
  El modelo imita el estilo sin copiar contenido.

### Capa 2 — CONOCIMIENTO DEL PROGRAMA (parte práctica)
- **Fuente:** materiales del programa, FAQs, dudas frecuentes que resuelve el equipo.
- **Qué se extrae:** cómo funciona el programa, qué incluye, logística, resolución de dudas
  prácticas. Se recupera solo cuando el prospecto pregunta algo concreto.

### Capa 3 — RESOLUCIÓN DE OBJECIONES (prematuras)
- **Fuente:** conversaciones reales donde surgieron objeciones + tu metodología.
- **Qué se extrae:** patrones de objeción ("es caro", "no tengo tiempo", "me lo pienso",
  "consultarlo con mi pareja"…) y **tu forma** de reencuadrarlas antes de la llamada, sin
  quemar el lead.

### Capa 4 — GESTIÓN DE LA CONVERSACIÓN DE CAPTACIÓN (el guion vivo)
- **Fuente:** las **conversaciones exitosas de Miguel** (llegaron a llamada Y compraron).
- **Qué se extrae:** el *arco* de una conversación que convierte: apertura, calificación
  natural, generación de interés, transición a llamada. El bot aprende el **ritmo y los
  micro-pasos**, no un checklist.

### Capas extra que te recomiendo añadir
5. **Calificación / descarte (fit) con SCORING:** el bot puntúa al prospecto de 0 a 10 (interés,
   situación, encaje con cliente ideal, urgencia). Si supera el **umbral del tenant** (por defecto
   7) → se le **propone llamada**; si es muy bajo (≤3) → se descarta con tacto; en medio → se sigue
   cualificando. Así no se quema agenda con quien no encaja. Ver `src/core/scoring.js`.
6. **Agendamiento:** el momento y la forma exacta de proponer la llamada + integración con el
   calendario (GHL). El "cómo se cierra hacia llamada" merece su propia capa.
7. **Seguimiento (follow-up):** igual que en la API de WhatsApp, solo se puede escribir **dentro
   de las 24h** desde el último mensaje del prospecto. Dentro de esa ventana, si pasan **N horas
   (config, por defecto 4) sin respuesta**, el bot manda **un recordatorio suave**; si el prospecto
   responde, se cancela. Aquí se gana MUCHA conversión que las otras herramientas dejan sobre la
   mesa. Ver `src/core/followup.js`. (Nota: el scaffold usa `setTimeout`; en producción → job queue
   durable tipo BullMQ/Redis para que sobreviva a reinicios y escale.)
8. **Guardarraíles / seguridad:** qué NO puede decir el bot (promesas de resultados, temas
   médicos, precios inventados, información falsa). Capa de límites que se aplica siempre.

### Datos concretos a extraer (checklist para ti)
Cuantos más, mejor. Prioridad:
- [ ] **50–100 conversaciones de captación exitosas de Miguel** (llegaron a llamada + compraron).
      Exporta el hilo completo, marcando quién es quién. **Este es el dato más valioso.**
- [ ] 20–50 conversaciones que **NO** convirtieron (para aprender a descartar y qué NO hacer).
- [ ] Muestra grande de **WhatsApp de Dani** (para el tono).
- [ ] Transcripciones de **mentorías** (tono + conocimiento del programa).
- [ ] Materiales del **programa** (para la capa 2).
- [ ] Lista de **objeciones reales** y cómo se resolvieron.

Cómo preparar los exports: ver `bot/data/ingestion/README.md`.

---

## 6. El aviso legal de "estás hablando con una IA" — cómo lo hacemos bien

Esto lo trato aparte y con franqueza porque es donde me pediste "esquivarlo" / meterlo de forma
"civilina" para que la gente no lo lea. **No voy a diseñar el sistema para ocultar el aviso**, y
te explico por qué te conviene a ti, no solo por la ley:

**Lo legal (dato real):** desde el **2 de agosto de 2026** el **artículo 50 del Reglamento
Europeo de IA (AI Act)** obliga a informar de forma clara cuando alguien interactúa con una IA,
salvo que sea obvio por el contexto. En España lo supervisa la **AESIA**. Las sanciones llegan a
**15 M€ o el 3% de la facturación** (hasta el 7% en lo más grave). Diseñar el mensaje *para que
no se lea* (enterrarlo en una ráfaga de 7-8 mensajes) es exactamente el tipo de "patrón oscuro"
que la norma persigue: no es zona gris, es incumplir a propósito, y queda por escrito en el chat.

**Por qué además te perjudica en negocio:**
- Estás construyendo esto para **vendérselo/pasárselo a tus alumnos**. Si el producto lleva el
  engaño de fábrica, el riesgo legal y reputacional lo heredan ellos y tu marca.
- Si un prospecto pilla que se le ocultó que era un bot (y con capturas), el daño de marca es
  peor que cualquier caída de conversión por el aviso.

**La buena noticia:** tu miedo real (que el aviso "resta efectividad" e invita a vacilar al bot)
se resuelve **sin ocultarlo**, con *posicionamiento*. Enfoque acordado con Dani:
- **Primera respuesta NATIVA.** La conversación se abre en frío ("hola {nombre}") y el prospecto
  responde ("hola" / "¿qué quieres?"). El bot responde primero a ESO de forma natural (si saluda,
  saluda; si pregunta qué quieres, "nada raro, quería conectar contigo"). Nada de discurso de
  venta de entrada.
- **Aviso justo después, framing "a medias".** En ese mismo primer turno, tras la respuesta
  nativa, entra el aviso presentado como un **plus de rapidez**:
  *"Por cierto: ahora mismo escribes con el asistente de IA de Dani. Esta conversación la llevamos
  a medias entre Dani y yo para que tengas respuesta al momento 🙌"*. Es transparente (cumple el
  art. 50: claro y temprano) y a la vez suena bien y justifica la fluidez.
- **Que el bot sea buenísimo** es lo que evita que la gente lo "pille", no esconder el aviso.

`src/core/disclosure.js` implementa el aviso **una sola vez**, con varias redacciones y con el
nombre del dueño parametrizado por cuenta (para reventa). El orquestador lo coloca DESPUÉS de la
respuesta nativa en el primer turno. Lo que NO hace —y no haré— es programar la entrega para
reducir la probabilidad de que se lea.

---

## 7. Plan de fases

**Fase 0 — Datos + tono (sin conectar nada todavía).** Reunir las conversaciones (§5), montar la
base de conocimiento por capas, calibrar el tono. Se puede validar en "modo simulador" antes de
tocar Instagram.

**Fase 1 — MVP conectado a UNA cuenta (la de Miguel).** App de Meta + permisos + webhook +
orquestador + pausa + aviso legal + integración GHL. Miguel abre, el bot gestiona, con humano
siempre pudiendo tomar el control.

**Fase 2 — Panel de control propio + follow-up + métricas.** Cabina de mando, capas 5–7, informes
de conversión (cuántos DMs → llamada → venta).

**Fase 3 — Producto para alumnos.** Multi-cuenta, estatus Tech Provider de Meta, onboarding para
que cada alumno conecte su IG. (Decisión de negocio aparte.)

---

## 8. Estado de decisiones
- ✅ **Cuenta:** corre en la cuenta de **Dani**. Multi-cuenta listo para reventa (`tenants.js`).
- ✅ **Aviso:** framing "a medias" + primera respuesta nativa (§6).
- ✅ **Scoring** de cualificación con umbral → propuesta de llamada (§5.5).
- ✅ **Follow-up** a las 4h dentro de la ventana de 24h (§5.7).
- ✅ **Interfaz:** GHL como CRM ahora + panel propio en fase 2 (§4).

### Pendiente / lo que necesito
1. **Datos de entrenamiento** (§5). Ya estoy catalogando tu Drive (WhatsApp, mentorías,
   conversaciones). Con eso montamos el pipeline de ingesta y la guía de tono.
2. **Acceso Meta:** confirmar que la cuenta de Dani es Profesional y está vinculada a una Página
   de Facebook, y crear la app de desarrollador para pedir permisos.
3. **Afinar el aviso** con ejemplos reales una vez tengamos el tono.
```
