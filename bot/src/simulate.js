/**
 * Simulador de conversación por consola — probar el flujo completo SIN Instagram.
 *
 *   node src/simulate.js
 *
 * Usa el mismo orquestador que producción, pero con envío por consola en vez de
 * la Graph API. Sirve para calibrar tono/guion/scoring en fase 0 antes de conectar.
 * Comandos: /pausa  /reanuda  /salir
 */
require('dotenv').config();
const readline = require('readline');

// Interceptamos el envío ANTES de cargar el orquestador (lo captura por destructuring
// al importarse): pintamos por consola en vez de enviar a IG.
const igClient = require('./instagram/client');
igClient.sendSequence = async (_userId, messages) => {
  for (const m of messages) console.log(`\n🤖 bot → ${m}`);
};

const { handleIncomingMessage } = require('./core/orchestrator');
const { pause, resume } = require('./core/pause');

const ACCOUNT = 'cuenta-dani';   // tenant simulado
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
    if (text === '/pausa') { pause(ACCOUNT, USER); console.log('(pausada)'); return ask(); }
    if (text === '/reanuda') { resume(ACCOUNT, USER); console.log('(reanudada)'); return ask(); }
    try { await handleIncomingMessage({ accountId: ACCOUNT, senderId: USER, text }); }
    catch (e) { console.error(e); }
    ask();
  });
}

ask();
