// Checks the glasses without a FaceTime call: opens the UNO's serial port,
// sends left, right, found and stop one second apart, and prints what the UNO
// says back (READY, ACK:x, and O:<cm> when you hold a hand near the sensor).
// Usage: npm run glasses:test            (stop the agent first: only one program can hold the port)
//        npm run glasses:test -- 20      (also listen for obstacle readings for 20 seconds)
import { findGlassesPort } from './glasses.mjs';
import { ReadlineParser, SerialPort } from 'serialport';

const listenSeconds = Number(process.argv[2] || 3);
const path = await findGlassesPort();
if (!path) {
  console.error('No Arduino found. Check the USB cable, then run `ls /dev/cu.usbmodem*`.');
  process.exit(1);
}
console.log(`Opening ${path} (the UNO restarts, about 2 seconds)...`);
const port = new SerialPort({ path, baudRate: 115200 });
port.pipe(new ReadlineParser({ delimiter: '\n' })).on('data', line => console.log(`  UNO says: ${line.trim()}`));
port.on('error', err => { console.error(`Serial error: ${err.message}`); process.exit(1); });

const sleep = ms => new Promise(r => setTimeout(r, ms));
await sleep(2500);
for (const [letter, name] of [['L', 'left'], ['R', 'right'], ['F', 'found'], ['S', 'stop']]) {
  console.log(`Sending ${letter} (${name})`);
  port.write(letter);
  await sleep(1000);
}
console.log(`Listening ${listenSeconds} s for obstacle readings (hold a hand 10-50 cm in front of the sensor)...`);
await sleep(listenSeconds * 1000);
port.close();
