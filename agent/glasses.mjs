// Serial link to the Arduino UNO on the glasses (sketch: ../hardware/odyssey_glasses).
// Sends one letter per buzz (L, R, F, S) and reads "O:<cm>" obstacle lines back.
// Without the glasses plugged in, the agent keeps working and buzzes just do nothing.
//
// The port is opened per call, inside the job process that runs the call, because
// only one process can hold a serial port and the agent framework starts several.
import { ReadlineParser, SerialPort } from 'serialport';

const BAUD = 115200;
const RETRY_MS = 3000;
const LETTERS = { left: 'L', right: 'R', found: 'F', stop: 'S' };
// Genuine UNO (2341, 2a03), CH340 clones (1a86), FTDI (0403), CP210x (10c4).
const ARDUINO_VENDORS = ['2341', '2a03', '1a86', '0403', '10c4'];

/**
 * The glasses' serial port: SERIAL_PORT from .env.local, else the UNO on USB,
 * else a paired HC-05 Bluetooth module (macOS names it /dev/cu.HC-05...).
 */
export async function findGlassesPort() {
  if (process.env.SERIAL_PORT) return process.env.SERIAL_PORT;
  const ports = await SerialPort.list();
  const hit = ports.find(p => ARDUINO_VENDORS.includes((p.vendorId || '').toLowerCase()))
    || ports.find(p => /usbmodem|usbserial|wchusbserial/i.test(p.path))
    || ports.find(p => /HC-?0[56]/i.test(p.path));
  // macOS: the cu.* device opens without waiting for a carrier signal; tty.* can hang.
  return hit ? hit.path.replace('/dev/tty.', '/dev/cu.') : null;
}

/**
 * Opens the glasses and keeps retrying in the background if they are unplugged.
 * @param {{ onObstacle?: (cm: number) => void }} [handlers]
 */
export function connectGlasses({ onObstacle } = {}) {
  let port = null;
  let closed = false;
  let warned = false;
  let timer = null;

  const retry = () => {
    if (!closed) timer = setTimeout(open, RETRY_MS);
  };

  async function open() {
    if (closed) return;
    let path = null;
    try { path = await findGlassesPort(); } catch { /* listing failed: retry */ }
    if (!path) {
      if (!warned) console.warn('[glasses] no Arduino found; buzzes are skipped until it is plugged in');
      warned = true;
      return retry();
    }
    const p = new SerialPort({ path, baudRate: BAUD, autoOpen: false });
    p.open(err => {
      if (err) {
        if (!warned) console.warn(`[glasses] could not open ${path}: ${err.message}`);
        warned = true;
        return retry();
      }
      if (closed) { p.close(() => {}); return; }
      port = p;
      warned = false;
      console.log(`[glasses] connected on ${path}`);
      p.pipe(new ReadlineParser({ delimiter: '\n' })).on('data', raw => {
        const line = String(raw).trim();
        const m = line.match(/^O:(\d+)$/);
        if (m) {
          try { onObstacle?.(Number(m[1])); } catch (e) { console.error('[glasses] obstacle handler failed', e); }
        } else if (line) {
          console.log(`[glasses] ${line}`);
        }
      });
      p.on('error', e => console.error(`[glasses] serial error: ${e.message}`));
      p.on('close', () => {
        port = null;
        if (!closed) { console.warn('[glasses] disconnected; retrying'); retry(); }
      });
    });
  }
  open();

  return {
    /** Buzzes the glasses. Returns false when they are not connected. */
    buzz(direction) {
      const letter = LETTERS[direction];
      if (!letter || !port?.isOpen) return false;
      port.write(letter);
      return true;
    },
    get connected() { return Boolean(port?.isOpen); },
    close() {
      closed = true;
      clearTimeout(timer);
      return new Promise(resolve => (port?.isOpen ? port.close(() => resolve()) : resolve()));
    },
  };
}
