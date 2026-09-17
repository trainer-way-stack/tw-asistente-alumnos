# Cómo darle a Claude Code acceso total a tu ordenador (versión local)

> **Por qué esto.** Ahora mismo trabajamos con Claude Code **en la nube** (web): corre en un
> servidor aislado de Anthropic que solo tiene clonado el repositorio de GitHub y tus conectores
> (Drive, Miro). **No ve tu ordenador.** Para que Claude Code entre en tus archivos locales, tu
> escritorio, tu carpeta "apps" y ejecute tareas en tu máquina, hay que usar **Claude Code
> instalado en tu ordenador**. Es el mismo Claude Code, pero corriendo en tu equipo.

---

## Qué te da la versión local (y qué NO)

**SÍ puede:**
- Leer y editar **cualquier archivo/carpeta de tu ordenador** (tu escritorio, la carpeta "apps",
  documentos del programa, etc.).
- **Ejecutar comandos y tareas** en tu máquina (con tu permiso).
- Seguir trabajando en este mismo proyecto (el repo de GitHub) desde local.
- Usar tus **conectores** (Google Drive, Miro): van ligados a tu cuenta de Claude, así que
  funcionan igual en local.

**NO puede (esto no cambia por instalarlo):**
- Entrar por arte de magia en apps SaaS de terceros (**Go High Level, Instagram, "Omni"**). Esas
  requieren su **conector o su API** (p.ej. Instagram = la API de Meta que ya vimos; GHL = su API
  o export). Estar en tu ordenador no salta ese paso.

---

## Instalación (elige una)

### Opción A — App de escritorio (la más fácil, recomendada para ti)
1. Entra en **https://claude.ai/code** y descarga la app de **Claude Code** para **Mac** o
   **Windows**.
2. Instálala y ábrela.
3. **Inicia sesión con tu cuenta de Claude** (la misma de aquí, `tuentrenador.dani@gmail.com`).
   Así se traen tus conectores (Drive, Miro) automáticamente.
4. Cuando te pida **abrir una carpeta**, elige la carpeta donde está lo que quieres que vea
   (por ejemplo tu **Escritorio**, o directamente la carpeta **"apps"**). Esa carpeta y todo lo
   que hay dentro pasa a ser accesible.

### Opción B — Terminal / CLI (para Miguel o quien lleve lo técnico)
1. Instala Node.js (https://nodejs.org, versión LTS) si no lo tienes.
2. En la terminal:
   ```bash
   npm install -g @anthropic-ai/claude-code
   ```
3. Ve a la carpeta que quieras darle y arráncalo:
   ```bash
   cd ~/Desktop/apps      # o la ruta de tu carpeta
   claude
   ```
4. La primera vez te pedirá **iniciar sesión** con tu cuenta de Claude.

### Opción C — Extensión de VS Code / JetBrains
Si usáis un editor de código, hay extensión de Claude Code. Misma idea: se instala, inicias
sesión y trabaja sobre la carpeta que tengas abierta.

---

## Para seguir ESTE proyecto (el bot) desde tu ordenador

Una vez instalado, para continuar justo donde vamos:
```bash
git clone https://github.com/trainer-way-stack/tw-asistente-alumnos.git
cd tw-asistente-alumnos
git checkout claude/instagram-lead-bot-ovqose   # la rama donde está el bot
```
Y ya puedes pedirle que trabaje sobre el bot **y** que lea tu carpeta "apps" a la vez (si abriste
Claude Code en una carpeta que las contiene a ambas, o le añades la ruta de la carpeta "apps").

> Truco: puedes arrancar Claude Code en una carpeta "madre" (p.ej. tu Escritorio) que contenga
> tanto el proyecto como la carpeta "apps". Así ve las dos cosas en la misma sesión.

---

## Permisos y seguridad (importante)

- Es **tu ordenador y tu decisión.** Por defecto, Claude Code **pide permiso** antes de cada
  acción sensible (ejecutar un comando, modificar archivos). Puedes aprobar caso a caso.
- Hay modos más automáticos (para no aprobar cada paso), pero **empieza en el modo normal** hasta
  cogerle confianza. No hace falta darle "barra libre" para que sea útil.
- Nunca metas contraseñas ni datos bancarios en archivos que le pases; para claves de APIs usa
  los archivos `.env` (como ya hacemos en el bot).

---

## Resumen de la decisión
- **Nube (aquí):** ideal para trabajar sobre el repo y con Drive/Miro. No ve tu PC.
- **Local (tu ordenador):** ve tu PC entero y ejecuta tareas en tu máquina. Es lo que necesitas
  para la carpeta "apps" y para pasarle "todo".
- Puedes usar **las dos**: seguimos aquí con el repo y, cuando necesites que lea tu ordenador,
  tiras de la local.
