# Seguimiento / follow-up (ghosting)

> Capa `seguimiento`. Qué hacer cuando el prospecto deja de responder. En DM solo se puede
> escribir dentro de la **ventana de 24h** desde su último mensaje (regla de Instagram).

## Cadencia (Dani, 09-19)

Toques de recordatorio por SILENCIO, en este orden (horas desde el mensaje anterior):
**5h → +5h → +12h → +24h → +24h** (máximo 5 toques). Si responde en cualquier momento, la
cadencia se reinicia. Configurado en `tenants.js` (`followupScheduleHours`) y ejecutado por
`core/followup.js`.

> ⚠️ Ventana 24h: los toques que caen **más allá de 24h** de silencio del usuario quedan
> **fuera de la ventana** y NO se envían automáticamente (haría falta un re-engagement por
> humano o esperar a que el usuario vuelva a escribir). El sistema los omite solo.

## Tono de los recordatorios

- **Muy cortos, ligeros, sin presión.** Nada de párrafos ni de "reenganche de venta".
- Varía el mensaje en cada toque (no repetir el mismo).
- Ejemplos reales del estilo: "pudiste leerme??", "todo bien??", "sigues por ahí?",
  "te leo cuando puedas 🙌", "cómo lo ves?".
- Si hay señal de "leído/visto" (read receipt de IG) y no contesta, se puede reconocer con
  naturalidad: "veo que lo viste, ¿todo bien? 👀".

## Cuándo dejar de insistir / derivar

- Agotada la cadencia sin respuesta → se deja la puerta abierta y se para (no se persigue más).
- Si en vez de silencio hay **evasivas activas** repetidas (4-5 intentos) → **derivar a Miguel**
  (ver capa `calificacion`), que valore si merece la pena seguir.

---

**Fuente:** cadencia y tono definidos por Dani (09-19). Se afinará con los follow-ups reales
que recuperaron conversaciones.
