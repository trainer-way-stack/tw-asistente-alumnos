# Base de conocimiento destilada (capas del setter IA)

Cada `.md` de esta carpeta es una **capa** destilada de los materiales reales de Trainer
Way (Drive de Dani). El bot los carga por fase de la conversación (ver `../content.js` y
`../retriever.js`). El nombre del archivo = id de la capa en `../layers.js`.

| Archivo | Capa | Fuentes destiladas |
|---|---|---|
| `tono.md` | tono (siempre) | Scripts en frío, formación setter (solo estilo, no conceptos) |
| `captacion.md` | captacion | Nuevo script conversaciones en frío, formación setter, roadmap v2 |
| `objeciones.md` | objeciones | "Resuelve objeciones...", estrategia del "giro" |
| `calificacion.md` | calificacion | Imprescindibles setter pre llamada, formación, roadmap (incluye rúbrica de scoring 0-10) |
| `programa.md` | programa | Trainer Way - El Proyecto, dossier/oferta |
| `agendamiento.md` | agendamiento | Imprescindibles pre llamada, roadmap, script |

**Contenido:** metodología y estilo, **sin PII de clientes** (nombres/teléfonos/emails) ni
datos bancarios. Es apto para el repo privado.

**Cómo mejorar cada capa:** editar el `.md` a mano, o re-ingerir desde el Drive. La mayor
mejora vendrá de añadir **conversaciones reales que convirtieron** (carpeta CONVERSACIONES
EXITOSAS + transcripciones VENDIDAS/NO VENDIDAS) como ejemplos few-shot en `captacion.md` y
`objeciones.md`, y del **export de WhatsApp** para afinar `tono.md`.
