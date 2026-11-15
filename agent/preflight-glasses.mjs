// Demo preflight for the glasses (used by ../demo-start.sh; the agent must be stopped).
// Opens the UNO, waits for READY, sends one stop buzz and waits for ACK:S, then
// listens a few seconds for O:<cm> sensor readings.
// Exit codes: 0 = ok, 2 = no Arduino on USB, 3 = Arduino silent (sketch frozen), 4 = buzz not acknowledged.
// Usage: node preflight-glasses.mjs [listenSeconds] [--no-buzz]
import { ReadlineParser, SerialPort } from 'serialport';
import { findGlassesPort } from './glasses.mjs';

const args = process.argv.slice(2);
const listenSeconds = Number(args.find(a => /^\d+$/.test(a)) || 6);
const buzz = !args.includes('--no-buzz');
const sleep = ms => new Promise(r => setTimeout(r, ms));

delete process.env.GLASSES_TCP; // USB only
const path = await findGlassesPort();
if (!path) { console.log('  no Arduino on USB'); process.exit(2); }
console.log(`  port: ${path}`);

const lines = [];
let waiter = null;
const port = new SerialPort({ path, baudRate: 115200 });
port.on('error', err => { console.log(`  serial error: ${err.message}`); process.exit(3); });
port.pipe(new ReadlineParser({ delimiter: '\n' })).on('data', raw => {
  const line = String(raw).replace(/\0/g, '').trim();
  if (!line) return;
  lines.push(line);
  if (waiter && waiter.test(line)) { waiter.done(); waiter = null; }
});
const waitFor = (re, ms) => new Promise(resolve => {
  if (lines.some(l => re.test(l))) return resolve(true);
  const t = setTimeout(() => { waiter = null; resolve(false); }, ms);
  waiter = { test: l => re.test(l), done: () => { clearTimeout(t); resolve(true); } };
});
const finish = code => port.close(() => process.exit(code));

// Opening the port resets the UNO; READY arrives ~2 s later. Ask again with '?' in case.
let ready = await waitFor(/READY/, 3500);
for (let i = 0; !ready && i < 3; i++) { port.write('?'); ready = await waitFor(/READY/, 1000); }
if (!ready) { console.log('  Arduino did not answer READY (sketch frozen?)'); finish(3); }
else {
  console.log('  Arduino: READY');
  if (buzz) {
    port.write('S');
    if (await waitFor(/ACK:S/, 2000)) console.log('  buzz: ACK:S (the motor should have spun for 1 s)');
    else { console.log('  buzz: no ACK'); finish(4); }
  }
  if (!buzz || lines.some(l => /ACK:S/.test(l))) {
    console.log(`  sensor: hold a hand ~20-50 cm in front of it for ${listenSeconds} s...`);
    const start = lines.length;
    await sleep(listenSeconds * 1000);
    const readings = lines.slice(start).map(l => l.match(/^O:(\d+)/)?.[1]).filter(Boolean);
    console.log(readings.length ? `  sensor: ${readings.join(', ')} cm` : '  sensor: no readings (nothing seen in range, or check the HC-SR04 wiring)');
    finish(0);
  }
}
