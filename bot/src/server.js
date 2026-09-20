/**
 * Webhook de Instagram + arranque del servicio.
 *
 * Responsabilidades:
 *  - Verificar el webhook con Meta (GET, handshake con IG_VERIFY_TOKEN).
 *  - Recibir eventos de mensajes (POST) y validar la firma (X-Hub-Signature-256).
 *  - Pasar cada mensaje entrante al orquestador.
 *
 * IMPORTANTE: este servidor NO inicia conversaciones. Solo reacciona a mensajes
 * que la persona ha enviado (cumplimiento de las reglas de la plataforma).
 */
require('dotenv').config();
const crypto = require('crypto');
const express = require('express');

const { handleIncomingMessage } = require('./core/orchestrator');
const control = require('./core/control');
const { listConversations } = require('./core/state');
const { pause, resume } = require('./core/pause');

const app = express();

// Necesitamos el body en crudo para validar la firma de Meta.
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));

const VERIFY_TOKEN = process.env.IG_VERIFY_TOKEN;
const APP_SECRET = process.env.IG_APP_SECRET;

/** Handshake de verificación del webhook (Meta lo llama una vez al configurarlo). */
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

/** Valida que el POST viene realmente de Meta (firma HMAC con el app secret). */
function isValidSignature(req) {
  if (!APP_SECRET) return true; // en desarrollo local sin secret configurado
  const signature = req.get('X-Hub-Signature-256') || '';
  const expected = 'sha256=' + crypto
    .createHmac('sha256', APP_SECRET)
    .update(req.rawBody)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

/** Recepción de eventos (mensajes entrantes). */
app.post('/webhook', async (req, res) => {
  if (!isValidSignature(req)) return res.sendStatus(403);

  // Respondemos 200 rápido; el procesamiento va async para no agotar el timeout de Meta.
  res.sendStatus(200);

  try {
    const body = req.body;
    if (body.object !== 'instagram') return;

    for (const entry of body.entry || []) {
      for (const event of entry.messaging || []) {
        // Ignorar 'echoes' (mensajes que enviamos nosotros mismos).
        if (event.message?.is_echo) continue;
        if (!event.message?.text) continue; // de momento solo texto

        await handleIncomingMessage({
          accountId: event.recipient.id, // la cuenta de IG que recibe = el tenant
          senderId: event.sender.id,     // el prospecto
          text: event.message.text,
          timestamp: event.timestamp,
        });
      }
    }
  } catch (err) {
    console.error('[webhook] error procesando evento:', err);
  }
});

app.get('/health', (_req, res) => res.json({ ok: true }));

// --- Páginas legales requeridas por Meta (política de privacidad + borrado de datos) ---
const OWNER = process.env.BRAND_NAME || 'Trainer Way';
const CONTACT_EMAIL = process.env.PRIVACY_CONTACT || 'hola@trainerway.es';
const pageStyle = 'max-width:760px;margin:40px auto;padding:0 20px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.6;color:#1a1a1a}h1{font-size:1.6rem}h2{font-size:1.15rem;margin-top:1.6em}small{color:#666}';

app.get('/privacidad', (_req, res) => {
  res.type('html').send(`<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Política de privacidad — ${OWNER}</title>
<style>body{${pageStyle}</style></head><body>
<h1>Política de privacidad</h1>
<small>Asistente de mensajería de ${OWNER} en Instagram · última actualización: 2026-09-20</small>
<h2>Quiénes somos</h2>
<p>Este asistente de mensajería lo opera <strong>${OWNER}</strong>. A través de los mensajes directos de Instagram
atendemos y cualificamos a personas interesadas en nuestros servicios de mentoría para profesionales del sector.</p>
<h2>Qué datos tratamos</h2>
<p>Cuando nos escribes por Instagram tratamos tu <strong>nombre de usuario e identificador de Instagram</strong> y el
<strong>contenido de los mensajes</strong> que intercambias con nosotros, con el fin de responderte, resolver tus dudas y,
si encaja, ayudarte a agendar una llamada. No recopilamos datos especiales ni datos de pago por este canal.</p>
<h2>Uso de inteligencia artificial</h2>
<p>Las respuestas se generan con ayuda de un asistente de IA <strong>supervisado por nuestro equipo humano</strong>. Te
informamos de ello en la propia conversación.</p>
<h2>Base legal y finalidad</h2>
<p>Tratamos tus datos sobre la base de tu <strong>consentimiento</strong> al iniciar la conversación y de nuestro
<strong>interés legítimo</strong> en atender solicitudes comerciales. La finalidad es la atención y gestión de tu interés.</p>
<h2>Con quién los compartimos</h2>
<p>Solo con los proveedores que hacen posible el servicio: <strong>Meta/Instagram</strong> (mensajería), nuestro
<strong>alojamiento</strong>, nuestro <strong>CRM</strong> (GoHighLevel) y el <strong>proveedor de IA</strong> (Anthropic),
actuando como encargados del tratamiento. <strong>No vendemos tus datos.</strong></p>
<h2>Conservación</h2>
<p>Conservamos la conversación el tiempo necesario para gestionar tu interés y cumplir obligaciones legales; después se
suprime o anonimiza.</p>
<h2>Tus derechos</h2>
<p>Puedes ejercer tus derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad escribiendo a
<a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>. También puedes reclamar ante la autoridad de control competente.</p>
<h2>Borrado de datos</h2>
<p>Consulta cómo solicitar la eliminación de tus datos en <a href="/borrado-datos">/borrado-datos</a>.</p>
<h2>Contacto</h2>
<p>${OWNER} · <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>
</body></html>`);
});

app.get('/borrado-datos', (_req, res) => {
  res.type('html').send(`<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Borrado de datos — ${OWNER}</title>
<style>body{${pageStyle}</style></head><body>
<h1>Instrucciones para el borrado de datos</h1>
<small>Asistente de mensajería de ${OWNER} en Instagram</small>
<p>Si has hablado con nuestro asistente por Instagram y quieres que eliminemos los datos asociados a tu conversación
(tu identificador de Instagram y los mensajes intercambiados), tienes dos opciones:</p>
<h2>1. Por mensaje</h2>
<p>Escríbenos por el mismo chat de Instagram el texto <strong>"BORRAR MIS DATOS"</strong> y lo tramitaremos.</p>
<h2>2. Por email</h2>
<p>Envía un correo a <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> desde el que puedas identificarte, indicando
tu usuario de Instagram y la solicitud de borrado.</p>
<p>Eliminaremos tus datos en un plazo máximo de <strong>30 días</strong> y te confirmaremos cuando esté hecho, salvo que
debamos conservarlos por una obligación legal.</p>
<h2>Contacto</h2>
<p>${OWNER} · <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>
</body></html>`);
});

// ─────────────────────── PANEL DE MIGUEL (protegido por contraseña) ───────────────────────
function panelAuth(req, res, next) {
  const pass = process.env.PANEL_PASSWORD;
  if (!pass) return res.status(503).send('Panel sin PANEL_PASSWORD configurada.');
  const h = req.get('authorization') || '';
  const decoded = Buffer.from((h.split(' ')[1] || ''), 'base64').toString();
  const given = decoded.slice(decoded.indexOf(':') + 1);
  if (given && given === pass) return next();
  return res.set('WWW-Authenticate', 'Basic realm="TW Setter Panel"').status(401).send('Autenticación requerida');
}

app.get('/panel', panelAuth, (_req, res) => res.type('html').send(PANEL_HTML));

app.get('/panel/api/state', panelAuth, (_req, res) => {
  res.json({ control: control.getState(), conversations: listConversations(), feedback: control.listFeedback() });
});
app.post('/panel/api/mode', panelAuth, (req, res) => res.json(control.setMode(req.body?.mode)));
app.post('/panel/api/allow', panelAuth, (req, res) => {
  const { id, action } = req.body || {};
  res.json({ allow: action === 'remove' ? control.removeAllow(id) : control.addAllow(id) });
});
app.post('/panel/api/pause', panelAuth, (req, res) => {
  const { accountId, userId, action } = req.body || {};
  (action === 'resume' ? resume : pause)(accountId, userId);
  res.json({ ok: true });
});
app.post('/panel/api/feedback', panelAuth, (req, res) => res.json(control.addFeedback(req.body || {})));

const PANEL_HTML = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Panel · TW Setter IA</title>
<style>
:root{--b:#e8500a}*{box-sizing:border-box}body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:0;background:#f5f6f8;color:#1a1a1a}
header{background:#111;color:#fff;padding:14px 18px;font-weight:600}main{max-width:1000px;margin:0 auto;padding:18px}
.card{background:#fff;border-radius:12px;padding:16px;margin-bottom:16px;box-shadow:0 1px 4px rgba(0,0,0,.06)}
h2{font-size:1rem;margin:.2em 0 .8em}button{cursor:pointer;border:0;border-radius:8px;padding:7px 12px;font-weight:600}
.pri{background:var(--b);color:#fff}.sec{background:#eee}.on{background:#12a150;color:#fff}.off{background:#ddd}
table{width:100%;border-collapse:collapse;font-size:.9rem}td,th{padding:8px 6px;border-bottom:1px solid #eee;text-align:left;vertical-align:top}
input,textarea,select{font:inherit;padding:8px;border:1px solid #ccc;border-radius:8px;width:100%}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.muted{color:#888;font-size:.85rem}.pill{font-size:.75rem;padding:2px 8px;border-radius:20px;background:#eee}
</style></head><body>
<header>🤖 Panel TW Setter IA — cabina de Miguel</header>
<main>
 <div class="card"><h2>Modo de captación</h2>
  <div class="row"><label class="row"><input type="radio" name="mode" value="allowlist"> Solo la lista</label>
   <label class="row"><input type="radio" name="mode" value="nuevas"> Nuevas desde ahora</label>
   <label class="row"><input type="radio" name="mode" value="todas"> Todas</label></div>
  <p class="muted" id="modehelp"></p></div>

 <div class="card"><h2>Conversaciones</h2>
  <p class="muted">Activa/desactiva el bot por conversación. "Bot ON" = el bot responde; "Pausar" = lo lleva un humano.</p>
  <table><thead><tr><th>Usuario</th><th>Fase</th><th>Score</th><th>Último mensaje</th><th>Estado</th><th>Acciones</th></tr></thead>
  <tbody id="convs"><tr><td colspan="6" class="muted">Cargando…</td></tr></tbody></table></div>

 <div class="card"><h2>Feedback para el bot</h2>
  <p class="muted">Apunta lo que esté mal o cómo debería responder. Se guarda para ir afinando al bot.</p>
  <div class="row"><input id="fbref" placeholder="@usuario o contexto (opcional)" style="max-width:260px">
   <input id="fbtext" placeholder="Ej: la apertura suena forzada; que sea más natural"></div>
  <div style="margin-top:8px"><button class="pri" onclick="enviarFb()">Guardar feedback</button></div>
  <ul id="fblist"></ul></div>
</main>
<script>
const api=(p,m,b)=>fetch('/panel/api/'+p,{method:m||'GET',headers:{'Content-Type':'application/json'},body:b?JSON.stringify(b):undefined}).then(r=>r.json());
const HELP={allowlist:'El bot solo responde a las cuentas de la lista (las que actives aquí).',nuevas:'El bot coge automáticamente las conversaciones que se abran a partir de ahora.',todas:'El bot responde a todo el que escriba. ¡Cuidado en producción!'};
async function refresh(){const s=await api('state');
 document.querySelectorAll('input[name=mode]').forEach(r=>{r.checked=r.value===s.control.mode;r.onchange=async()=>{await api('mode','POST',{mode:r.value});refresh();}});
 document.getElementById('modehelp').textContent=HELP[s.control.mode]||'';
 const allow=new Set(s.control.allow);
 document.getElementById('convs').innerHTML = s.conversations.length? s.conversations.map(c=>{
  const on=allow.has(String(c.userId)); const u=c.username?('@'+c.username):('id '+c.userId);
  return '<tr><td><b>'+u+'</b><br><span class=muted>'+c.userId+'</span></td><td>'+c.stage+'</td><td>'+(c.score??'')+'</td>'
   +'<td>'+(c.lastRole==='assistant'?'🤖 ':'👤 ')+(c.lastText||'').replace(/</g,'&lt;')+'</td>'
   +'<td>'+(c.owner==='humano'?'<span class=pill>humano</span>':'')+(c.paused?' <span class=pill>pausado</span>':'')+'</td>'
   +'<td><button class="'+(on?'on':'off')+'" onclick="toggleBot(\\''+c.userId+'\\','+on+')">Bot '+(on?'ON':'OFF')+'</button> '
   +'<button class="sec" onclick="pausar(\\''+c.accountId+'\\',\\''+c.userId+'\\','+(c.paused?true:false)+')">'+(c.paused?'Reanudar':'Pausar')+'</button></td></tr>';
 }).join(''):'<tr><td colspan=6 class=muted>Aún no hay conversaciones.</td></tr>';
 document.getElementById('fblist').innerHTML = s.feedback.slice(0,20).map(f=>'<li><b>'+(f.ref||'')+'</b> '+f.texto.replace(/</g,'&lt;')+' <span class=muted>· '+new Date(f.ts).toLocaleString()+'</span></li>').join('');
}
async function toggleBot(id,on){await api('allow','POST',{id,action:on?'remove':'add'});refresh();}
async function pausar(a,u,paused){await api('pause','POST',{accountId:a,userId:u,action:paused?'resume':'pause'});refresh();}
async function enviarFb(){const texto=document.getElementById('fbtext').value.trim();if(!texto)return;await api('feedback','POST',{texto,ref:document.getElementById('fbref').value.trim()});document.getElementById('fbtext').value='';refresh();}
refresh();setInterval(refresh,8000);
</script></body></html>`;

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`TW Setter IA escuchando en :${PORT}`));
