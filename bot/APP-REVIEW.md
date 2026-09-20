# App Review de Meta — "Setter IA" (mensajería de Instagram)

Material listo para enviar el App Review del permiso **`instagram_business_manage_messages`**
(y `instagram_business_basic`). Copia/pega cada bloque en el formulario de Meta.

- **App:** Setter IA · **App ID:** 26274737822223484
- **URLs (ya configuradas):**
  - Privacy Policy: `https://tw-setter-ia-production.up.railway.app/privacidad`
  - Data Deletion: `https://tw-setter-ia-production.up.railway.app/borrado-datos`
  - Webhook callback: `https://tw-setter-ia-production.up.railway.app/webhook`
- **Verificación del negocio:** ✅ hecha (Trainer Way).

---

## 1. Descripción de la app (campo "¿Qué hace tu app?")

Setter IA es un asistente de atención por mensajes directos de Instagram para **nuestro propio
negocio** (Trainer Way, mentoría para entrenadores y profesionales online). Cuando una persona
escribe un DM a nuestra cuenta de Instagram profesional, el asistente **responde a esa persona**,
resuelve sus dudas y, si encaja, le ayuda a agendar una llamada con nuestro equipo. La conversación
está **supervisada por personas** de nuestro equipo y se informa al usuario de que habla con un
asistente de IA. La app **no publica contenido, no envía mensajes en frío no solicitados y no
comparte datos con terceros**; solo gestiona las conversaciones que los usuarios inician con nuestra
cuenta.

## 2. Justificación permiso a permiso

### `instagram_business_basic`
- **Uso:** obtener la información básica de la cuenta de Instagram profesional conectada (id de la
  cuenta, nombre de usuario) para identificar la cuenta que gestiona los mensajes.
- **Dónde en el código:** `src/instagram/client.js` (`getUsername`), `src/server.js` (webhook).

### `instagram_business_manage_messages`
- **Uso:** recibir los mensajes que los usuarios envían a nuestra cuenta profesional (vía webhook)
  y enviar la respuesta del asistente a esa misma conversación. Es el núcleo de la funcionalidad.
- **Dónde en el código:** `src/server.js` (recepción del webhook `messages` + validación de firma),
  `src/instagram/client.js` (`sendSequence`/`sendText` → `POST /me/messages`),
  `src/core/orchestrator.js` (lógica de respuesta).
- **Qué NO hacemos:** no enviamos difusiones, no iniciamos conversaciones en frío, no accedemos a
  mensajes de conversaciones ajenas a nuestra cuenta.

## 3. Instrucciones para el revisor (paso a paso reproducible)

1. Nuestra cuenta profesional de Instagram (**@_trainerway**) ya está conectada a la app mediante
   *Instagram API con inicio de sesión de Instagram* y suscrita al webhook `messages`.
2. Desde cualquier cuenta de Instagram, **enviad un mensaje directo a @_trainerway** (por ejemplo:
   "Hola, vi tu perfil").
3. En pocos segundos, **el asistente responde automáticamente** en esa conversación: saluda,
   pregunta de forma natural y, si procede, informa de que se habla con un asistente de IA de Dani.
4. Podéis seguir la conversación; el asistente cualifica y propone una llamada.
   *(Si necesitáis que os habilitemos una cuenta como tester para la prueba, indicádnoslo y la
   añadimos como Evaluador de Instagram al instante.)*

## 4. Guion del SCREENCAST (lo que hay que grabar) — obligatorio

Graba la pantalla (móvil u ordenador) mostrando, sin cortes:
1. **Inicio:** muestra el panel de la app en developers.facebook.com con el producto Instagram y la
   cuenta @_trainerway conectada y suscrita a `messages` (sección "Generar identificadores de acceso").
2. **Mensaje entrante:** desde OTRA cuenta de Instagram, abre el chat de @_trainerway y **envía un
   DM** ("Hola, vi tu perfil, eres entrenador?").
3. **Respuesta automática:** enseña cómo, en segundos, **llega la respuesta del asistente** en ese
   mismo chat (que se vea el mensaje del usuario y la respuesta).
4. **Aviso de IA:** que se vea el mensaje donde el asistente indica que es un asistente de IA.
5. **Cierre:** muestra brevemente las páginas de **/privacidad** y **/borrado-datos**.

> Consejo: que el vídeo dure ~1-2 min, sin datos personales de terceros en pantalla, y que se vea
> claramente el flujo "usuario escribe → la app responde". Es lo que más peso tiene en la revisión.

## 5. Checklist antes de enviar
- [ ] App en modo **Producción (Live)** — ✅ ya está.
- [ ] Privacy Policy + Data Deletion URLs válidas — ✅ ya están.
- [ ] Verificación del negocio — ✅ hecha.
- [ ] Screencast grabado según §4.
- [ ] Textos de §1 y §2 pegados en el formulario.
- [ ] Permisos solicitados: `instagram_business_basic`, `instagram_business_manage_messages`.
