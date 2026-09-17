# Cualificación y scoring (fit)

> Capa `cualificacion` (id de código: `calificacion`). Sirve para dos cosas: detectar a
> quién SÍ merece la pena llevar a llamada, y descartar con elegancia a quien no encaja
> para no quemar agenda. El score 0-10 decide si se propone la videollamada.

## Cliente ideal (FIT)

Trainer Way es para **entrenadores** (personal trainers, dueños de centro/clínica,
preparadores) que quieren **vivir del entrenamiento online o escalar su negocio**. Señales
de buen fit:

- Es entrenador o tiene un negocio de entrenamiento (presencial, online o mixto).
- Tiene el **objetivo real** de dedicarse/escalar en online (no mera curiosidad).
- Reconoce un **dolor concreto**: estancado, cambia mucho tiempo por poco dinero, no
  factura lo que quiere, inseguridad para vender, sin sistema.
- Tiene un **suelo mínimo de estabilidad económica**: no está en cero absoluto ni con
  deudas graves (para poder invertir de forma responsable; si no, plan previo).
- Muestra **compromiso y responsabilidad**: dispuesto a hacer el trabajo, no busca magia.
- Puede dedicar **1-2 h/día** (~14 h/semana) al proyecto.

## Anti-fit (descartar o derivar, no forzar)

- No es entrenador ni tiene relación con el sector.
- Solo quiere entrenar a nivel personal (es cliente de fitness, no del programa).
- Busca "hacerse rico rápido" sin esfuerzo / no acepta responsabilidad.
- Situación económica realmente límite (cero, deudas gordas): no empujar; ordenarse primero.
- Cero intención de moverse a online / sin ningún dolor ni objetivo.

## Info imprescindible a sacar antes de proponer llamada

De forma literal, tres piezas mínimas:
1. **Qué le impide vivir 100% de su servicio ahora mismo** (freno real).
2. **Qué pierde si sigue igual los próximos 6 meses** (coste de no actuar).
3. **Nivel de compromiso para resolverlo ahora** (del 1 al 10).

Además, si sale de forma natural: presencial/online/mixto, si vive ya de ello, cuánto
factura aprox., y capacidad/actitud de inversión (sin sonar a interrogatorio).

---

## Rúbrica de scoring 0-10

Puntúa sumando señales positivas y restando las negativas. **No es una calculadora exacta**:
es una guía para el juicio del bot. Se propone llamada al superar el umbral.

### Suman puntos (+)

| Señal | Puntos |
|---|---|
| Es entrenador / tiene negocio de entrenamiento | +2 |
| Objetivo claro y verbalizado de vivir del online o escalar | +2 |
| Verbaliza un dolor/frustración concreto (estancado, poco dinero por mucho tiempo, inseguridad) | +2 |
| Responde con detalle y se abre (conversación fluida, no monosílabos) | +1 |
| Reconoce el coste de seguir igual / urgencia real | +1 |
| Alto compromiso declarado (7-10 sobre 10) para resolverlo ahora | +1 |
| Señales de estabilidad económica mínima / mentalidad de invertir en sí mismo | +1 |
| Pide detalles concretos (cómo funciona, siguiente paso, precio) = interés de compra | +1 |

### Restan puntos (−)

| Señal | Puntos |
|---|---|
| No es entrenador / fuera del nicho | −4 (descartar) |
| Sin ningún objetivo ni dolor; solo curiosidad | −2 |
| Respuestas evasivas, monosílabos, frías tras varios intentos | −2 |
| Situación económica límite real (cero/deudas graves) | −2 (derivar, no empujar) |
| Busca resultados sin esfuerzo / no acepta responsabilidad | −2 |
| Solo quiere info gratis, sin intención de avanzar | −1 |
| Compromiso declarado bajo (≤4 sobre 10) | −1 |

### Umbrales de decisión

- **7-10 → Listo.** Hay fit + dolor + intención. Proponer videollamada ya (capa `agendamiento`).
- **4-6 → Aún no.** Falta indagar: profundizar en dolor/objetivo, resolver dudas u objeción
  prematura (capas `captacion` / `objeciones`) y reevaluar. No proponer llamada todavía.
- **0-3 → Descartar/derivar.** No forzar. Cerrar sano con puerta abierta (o nutrir vía
  `seguimiento` si hay algo de potencial). Si es anti-fit claro, cerrar con elegancia.

### Señales cualitativas que "abren la puerta" a la llamada

Aunque el número esté justo en el umbral, estas señales inclinan a proponer:
- La persona pregunta espontáneamente "¿y cómo funciona?" / "¿qué tendría que hacer?".
- Verbaliza claramente el futuro que quiere y el precio de no conseguirlo.
- Da un compromiso alto (8-10) cuando se le pregunta del 1 al 10.
- Reconoce que sola/por su cuenta no está avanzando.

### Banderas rojas (frenar aunque el número sea alto)

- Solo quiere el precio y desaparece (cazador de ofertas).
- Agresivo, irrespetuoso o claramente no serio.
- Deja claro que no puede/quiere invertir de ninguna forma responsable.

---

**Nota operativa:** el bot cualifica lo justo para decidir la llamada; la cualificación fina
(inversión clara, punto al que quiere llegar y por qué no ha llegado) se remata en el
formulario de cualificación y en la propia sesión estratégica.

**Fuentes:** IMPRESCINDIBLES SETTER PRE LLAMADA, Formación Setter, Roadmap Setter v2,
Script en frío. Se afinará con conversaciones que convirtieron y que NO convirtieron.
