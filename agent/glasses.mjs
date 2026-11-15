// Link to the Arduino UNO on the glasses (sketch: ../hardware/odyssey_glasses).
// Sends one letter per buzz (L, R, F, S) and reads "O:<cm>" obstacle lines back.
// Without the glasses connected, the agent keeps working and buzzes just do nothing.
//
// Two ways to reach the glasses:
// - USB serial (default): the UNO plugged into this Mac, or SERIAL_PORT in .env.local.
// - A Bluetooth bridge: GLASSES_TCP=<ip>:7777 in .env.local points at a Windows laptop
//   running hardware/windows-bridge (it holds the HC-05 Bluetooth link, which macOS
//   cannot pair). If the bridge cannot be reached, USB is tried instead.
//
// The link is opened per call, inside the job process that runs the call, because
// only one process can hold a serial port and the agent framework starts several.
import net from 'node:net';
import { ReadlineParser, SerialPort } from 'serialport';

const BAUD = 115200;
const RETRY_MS = 3000;
const TCP_TIMEOUT_MS = 4000;
const LETTERS = { left: 'L', right: 'R', found: 'F', stop: 'S' };
// Genuine UNO (2341, 2a03), CH340 clones (1a86), FTDI (0403), CP210x (10c4).
const ARDUINO_VENDORS = ['2341', '2a03', '1a86', '0403', '10c4'];

/**
 * The glasses' serial port: SERIAL_PORT from .env.local, else the UNO on USB.
 * A /dev/cu.HC-05 port is never picked on its own: macOS keeps that device file
 * even when it cannot pair the module, and it opens without reaching the glasses.
 * (Set SERIAL_PORT=/dev/cu.HC-05 if this Mac ever does pair it.)
 */
export async function findGlassesPort() {
  if (process.env.SERIAL_PORT) return process.env.SERIAL_PORT;
  const ports = await SerialPort.list();
  const hit = ports.find(p => ARDUINO_VENDORS.includes((p.vendorId || '').toLowerCase()))
    || ports.find(p => /usbmodem|usbserial|wchusbserial/i.test(p.path));
  // macOS: the cu.* device opens without waiting for a carrier signal; tty.* can hang.
  return hit ? hit.path.replace('/dev/tty.', '/dev/cu.') : null;
}

/** Connects to the Windows Bluetooth bridge. Resolves to a port-like link, or null. */
function openBridge(address) {
  const [host, portText] = address.split(':');
  return new Promise(resolve => {
    const sock = net.createConnection({ host, port: Number(portText) || 7777 });
    const fail = () => { sock.destroy(); resolve(null); };
    const timer = setTimeout(fail, TCP_TIMEOUT_MS);
    sock.once('error', () => { clearTimeout(timer); fail(); });
    sock.once('connect', () => {
      clearTimeout(timer);
      sock.setNoDelay(true);
      sock.setKeepAlive(true, 5000);
      resolve({
        stream: sock,
        name: `Bluetooth bridge ${address}`,
        write: data => sock.write(data),
        get isOpen() { return !sock.destroyed && sock.writable; },
        close: done => { sock.end(); sock.destroy(); done?.(); },
        onClose: cb => sock.on('close', cb),
      });
    });
  });
}

/** Opens the UNO's serial port. Resolves to a port-like link, or null. */
async function openSerial() {
  let path = null;
  try { path = await findGlassesPort(); } catch { /* listing failed */ }
  if (!path) return null;
  return new Promise(resolve => {
    const p = new SerialPort({ path, baudRate: BAUD, autoOpen: false });
    p.open(err => {
      if (err) return resolve(null);
      p.on('error', e => console.error(`[glasses] serial error: ${e.message}`));
      resolve({
        stream: p,
        name: path,
        write: data => p.write(data),
        get isOpen() { return p.isOpen; },
        close: done => (p.isOpen ? p.close(() => done?.()) : done?.()),
        onClose: cb => p.on('close', cb),
      });
    });
  });
}

/**
 * Opens the glasses and keeps retrying in the background if they are unreachable.
 * @param {{ onObstacle?: (cm: number) => void }} [handlers]
 */
export function connectGlasses({ onObstacle } = {}) {
  const bridge = process.env.GLASSES_TCP;
  let link = null;
  let closed = false;
  let warned = false;
  let timer = null;

  const retry = () => {
    if (!closed) timer = setTimeout(open, RETRY_MS);
  };

  async function open() {
    if (closed) return;
    const l = (bridge && await openBridge(bridge)) || await openSerial();
    if (!l) {
      if (!warned) console.warn(`[glasses] not reachable (${bridge ? `bridge ${bridge} or USB` : 'no Arduino on USB'}); buzzes are skipped until it is`);
      warned = true;
      return retry();
    }
    if (closed) { l.close(); return; }
    link = l;
    warned = false;
    console.log(`[glasses] connected via ${l.name}`);
    l.stream.pipe(new ReadlineParser({ delimiter: '\n' })).on('data', raw => {
      const line = String(raw).trim();
      const m = line.match(/^O:(\d+)$/);
      if (m) {
        try { onObstacle?.(Number(m[1])); } catch (e) { console.error('[glasses] obstacle handler failed', e); }
      } else if (line) {
        console.log(`[glasses] ${line}`);
      }
    });
    l.onClose(() => {
      if (link === l) link = null;
      if (!closed) { console.warn('[glasses] disconnected; retrying'); retry(); }
    });
    if (l.stream instanceof net.Socket) l.write('?'); // the bridge does not reset the UNO: ask for READY
  }
  open();

  return {
    /** Buzzes the glasses. Returns false when they are not connected. */
    buzz(direction) {
      const letter = LETTERS[direction];
      if (!letter || !link?.isOpen) return false;
      link.write(letter);
      return true;
    },
    get connected() { return Boolean(link?.isOpen); },
    close() {
      closed = true;
      clearTimeout(timer);
      return new Promise(resolve => (link?.isOpen ? link.close(() => resolve()) : resolve()));
    },
  };
}
