# Cualificación y scoring (fit)

> Capa `cualificacion` (id de código: `calificacion`). Sirve para dos cosas: detectar a
> quién SÍ merece la pena llevar a la sesión estratégica, y descartar con elegancia a quien
> no encaja para no ensuciar la agenda de la closer. El score 0-10 decide si se propone la
> videollamada (umbral del tenant, por defecto 7).
>
> **Reconstruida desde la fuente autoritativa** (rúbrica del setter del "proyecto de Omni",
> `command-deck-os → src/lib/prompts.ts → setterSystemPrompt`). Son los **11 puntos** que
> Dani quería usar. Adaptados aquí al canal DM: en el chat el bot **no interroga**; recoge
> las señales que salen de forma natural y decide si hay fit suficiente para la llamada. El
> diagnóstico completo de los 11 puntos se remata en la **sesión estratégica**, no por DM.

## Idea rectora (la que manda sobre el número)

El objetivo NO es llenar la agenda: es agendar **leads de calidad que se presenten y
cierren**. Una agenda blanda (gente que no se presenta) es **peor que cero**: ocupa el slot
de la closer y ensucia las métricas. Ante la duda entre "agendar flojo" o "seguir
cualificando / cerrar sano", **seguir cualificando**.

## Cliente ideal (ICP)

Entrenadores y profesionales del sector (personal trainers, dueños de centro/clínica,
preparadores) que quieren **vivir del entrenamiento online o escalar su negocio**. Buen fit:

- Es entrenador o tiene un negocio de entrenamiento (presencial, online o mixto).
- Tiene un **objetivo real y con plazo** de dedicarse/escalar al online (no mera curiosidad).
- Reconoce un **dolor concreto**: estancado, cambia mucho tiempo por poco dinero, no factura
  lo que quiere, inseguridad para vender, sin sistema.
- **Suelo mínimo de estabilidad económica**: no está en cero absoluto ni con deudas graves
  (para poder invertir de forma responsable; si no, plan previo, no empujar).
- **Compromiso y responsabilidad**: dispuesto a hacer el trabajo, no busca magia.
- Puede dedicar el tiempo mínimo (**~2 h/día**).

## Los 11 puntos de cualificación (rúbrica autoritativa)

Es la estructura de una buena cualificación. En DM el bot **no los pregunta todos** ni en
orden: escucha, hace 1-2 preguntas por turno como máximo y va marcando mentalmente cuáles
tiene. Cuantos más de la FASE A tenga claros (y sin banderas rojas), más cerca de proponer
la llamada.

**FASE A · DIAGNÓSTICO** (lo que más pondera para agendar):
1. **Motivación principal y por qué AHORA.**
2. **Situación actual**: presencial/online/mixto, horas, ingresos, tipo de negocio.
3. **Historial**: qué ha intentado antes y por qué falló.
4. **Objetivo específico medible + plazo.** 🚩 Alarma si no sabe decir un número ni un plazo.
5. **Importancia 1-10 + dolor de no actuar.**

**FASE B · ANCLAJES** (posicionamiento, sin explicar el método):
6. Pintar el **resultado típico** (2.000-5.000 € en ~4 meses) como posibilidad, no promesa.
7. **Caso de éxito** relevante en una frase.
8. **Frase de filtro** ("no trabajamos con todo el mundo") — eleva el valor, no ruega.

**FASE C · CIERRE** (madurar hacia la llamada):
9. **Cualificación económica.** Distinguir si una pega es de **CAPACIDAD** ("no tengo") o de
   **PRIORIDAD** ("no me lo planteo") — son objeciones opuestas. Si el dinero depende de un
   tercero (pareja/padres/socio), ese tercero es **codecisor**.
   - Precio por DM: **el bot NO da precios nunca** (ver capa `programa` y guardarraíles). El
     "desde 300 €/mes" es un gancho del setter **en la llamada**, no por chat.
10. **Cualificación de tiempo.** Primero reencuadrar el compromiso ("¿le vas a poner límites
    a tu implicación?") y luego el mínimo (~2 h/día). El tiempo no es el problema real, la
    prioridad sí.
11. **El decisor.** ¿Decide solo o con pareja/familia/socio? Si hay codecisor, que esté en
    la llamada.

## Los 3 marcadores de no-show (búscalos activamente; son predictivos)

Si aparecen, **no agendar en firme** sin resolverlos; mejor seguir cualificando o dejar
puerta abierta:

- **Marcador 1 — Filtro económico a medias:** silencios, evasivas, "no me apetece invertir",
  "ya veremos". No cierra el tema del dinero con un sí firme.
- **Marcador 2 — Importancia 7-8 u objetivo indefinido**, sobre todo con coletillas tipo "no
  es una necesidad imperiosa" / "no me hace falta". **Predictor nº1 de no-show.**
- **Marcador 3 — Freno temporal futuro forzado a presente:** dice "a partir de X fecha" o
  "cuando termine Y" y se le agenda ANTES de esa fecha. No-show casi garantizado. Si hay una
  fecha futura real, respetarla al agendar.

## Señales de alarma de calidad de lead (no agendar en firme sin resolver)

- **Dinero que sale de un tercero no presente / no confirmado.**
- **Ingresos irregulares sin control** ("fluctúa", "gasto mucho") o deuda con varios acreedores.
- **Objetivo irreal** (cifras desproporcionadas a su punto de partida) o **sin definir**.
- **Fuera de ICP:** negocio presencial puro sin intención de online, solo quiere publicidad,
  o no tiene hueco de tiempo real.

## Anti-fit (descartar o derivar con tacto, no forzar)

- No es entrenador ni tiene relación con el sector.
- Solo quiere entrenar a nivel personal (es cliente de fitness, no del programa).
- Busca "hacerse rico rápido" sin esfuerzo / no acepta responsabilidad.
- Situación económica realmente límite (cero, deudas gordas): ordenarse primero, no empujar.
- Cero intención de moverse al online / sin ningún dolor ni objetivo.

---

## Rúbrica de scoring 0-10

No es una calculadora exacta: es una guía para el juicio del bot. Se suma por señales de la
rúbrica de los 11 puntos y se resta por banderas rojas. Se propone llamada al superar el
umbral del tenant.

### Suman puntos (+)

| Señal (punto de la rúbrica) | Puntos |
|---|---|
| Es entrenador / tiene negocio de entrenamiento (P2, ICP) | +2 |
| Objetivo claro **con plazo** de vivir del online o escalar (P4) | +2 |
| Verbaliza un dolor/frustración concreto + por qué AHORA (P1, P5) | +2 |
| Da su situación actual con detalle (horas, ingresos, tipo de negocio) (P2) | +1 |
| Importancia alta declarada (7-10) **con dolor real**, no "no me hace falta" (P5) | +1 |
| Señales de capacidad/actitud de inversión responsable (P9) | +1 |
| Puede y quiere dedicar el tiempo mínimo (~2 h/día) (P10) | +1 |
| Pide el siguiente paso / "¿cómo funciona?" = interés de compra | +1 |

### Restan puntos (−)

| Señal | Puntos |
|---|---|
| No es entrenador / fuera del ICP | −4 (descartar) |
| Sin objetivo ni plazo, o solo curiosidad (falla P4) | −2 |
| Marcador de no-show 1 o 2 activo (dinero a medias / "no me hace falta") | −2 |
| Alarma de calidad: dinero de tercero no presente, ingresos sin control, objetivo irreal | −2 |
| Respuestas evasivas, monosílabos, frías tras varios intentos | −2 |
| Busca resultados sin esfuerzo / no acepta responsabilidad | −2 |
| Solo quiere info/precio y desaparece (cazador de ofertas) | −1 |
| Compromiso declarado bajo (≤4) o freno temporal futuro sin resolver | −1 |

### Umbrales de decisión

- **7-10 → Listo.** Hay fit (FASE A cubierta) + dolor + intención y **sin marcadores de
  no-show activos**. Proponer videollamada ya (capa `agendamiento`).
- **4-6 → Aún no.** Falta cerrar FASE A o hay un marcador de no-show por resolver:
  profundizar en dolor/objetivo/plazo, resolver dudas u objeción prematura (capas
  `captacion` / `objeciones`) y reevaluar. **No** proponer llamada todavía.
- **0-3 → Descartar/derivar.** No forzar. Cerrar sano con puerta abierta (o nutrir vía
  `seguimiento` si hay potencial). Anti-fit claro → cerrar con elegancia.

### Banderas rojas (frenar aunque el número sea alto)

- Cualquier **marcador de no-show** sin resolver (sobre todo el 2: "no me hace falta").
- Solo quiere el precio y desaparece.
- Agresivo, irrespetuoso o claramente no serio.
- Deja claro que no puede/quiere invertir de ninguna forma responsable.
- Codecisor no presente y sin plan de incluirlo.

---

**Nota operativa:** el bot cualifica lo justo para decidir la llamada (sobre todo FASE A). La
cualificación fina (inversión clara, decisor, punto al que quiere llegar y por qué no ha
llegado) se remata en el **formulario de cualificación** y en la propia **sesión estratégica**.

**Fuente autoritativa:** rúbrica del setter de OMNI (`command-deck-os → src/lib/prompts.ts →
setterSystemPrompt`), más señales de calidad de lead del prompt de closer. Se afinará con
conversaciones reales que convirtieron y que NO convirtieron (few-shot desde GHL).
