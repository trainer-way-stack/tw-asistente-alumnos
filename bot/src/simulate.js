/**
 * Simulador de conversación por consola — probar el flujo completo SIN Instagram.
 *
 *   node src/simulate.js
 *
 * Usa el mismo orquestador que producción, pero con envío por consola en vez de
 * la Graph API. Sirve para calibrar tono/guion en fase 0 antes de conectar nada.
 * Comandos: /pausa  /reanuda  /salir
 */
require('dotenv').config();
const readline = require('readline');

// Interceptamos el envío ANTES de cargar el orquestador (que captura la función
// por destructuring al importarse): pintamos por consola en vez de enviar a IG.
const igClient = require('./instagram/client');
igClient.sendSequence = async (_userId, messages) => {
  for (const m of messages) console.log(`\n🤖 bot → ${m}`);
};

const { handleIncomingMessage } = require('./core/orchestrator');
const { pause, resume } = require('./core/pause');

const USER = 'sim-user';
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
let closed = false;
rl.on('close', () => { closed = true; });

console.log('Simulador TW Setter IA. Escribe como si fueras el prospecto.');
console.log('Comandos: /pausa  /reanuda  /salir\n');

function ask() {
  if (closed) return;
  rl.question('👤 tú → ', async (line) => {
    const text = line.trim();
    if (text === '/salir') return rl.close();
    if (text === '/pausa') { pause(USER); console.log('(conversación pausada)'); return ask(); }
    if (text === '/reanuda') { resume(USER); console.log('(conversación reanudada)'); return ask(); }
    try { await handleIncomingMessage({ senderId: USER, text }); } catch (e) { console.error(e); }
    ask();
  });
}

ask();
