// odyssey_glasses.ino  (Arduino UNO R3)
// Haptic glasses for the Odyssey FaceTime guide.
//
// One motor, one meaning: a long buzz always means "careful, something is ahead".
// Directions (left / right) are given by the AI's voice, not by the motor.
//
// Laptop -> UNO over USB serial at 115200 baud, one letter per command:
//   F = found it / straight ahead: three quick taps (the only "good news" buzz)
//   S = stop now: one long 1 s buzz
//   L / R = accepted for compatibility but do not buzz (direction is spoken)
//   ? = reply READY (connection check)
// UNO -> laptop, one line each: READY at boot, ACK:<letter> after a command,
//   O:<cm> each time something comes into a closer warning zone (60, 30, 15 cm).
//
// Obstacle warnings run on the UNO itself, so they keep working even when the
// laptop, Wi-Fi or the AI lag behind.
//
// Pins: D5 = left motor, D6 = right motor (through a transistor or a motor
// module), D9 = HC-SR04 TRIG, D10 = HC-SR04 ECHO. Keep pins 0 and 1 free:
// they are the USB serial link.
//
// Optional HC-05 Bluetooth (same commands and replies, 9600 baud, wireless):
// HC-05 TXD -> D2, D3 -> 1k -> HC-05 RXD (and 2k from RXD to GND: RXD is 3.3 V),
// VCC -> 5V, GND -> GND. Pair it with the Mac (PIN 1234 or 0000) and the agent
// finds it as /dev/cu.HC-05*. USB keeps working at the same time as a backup.

#define USE_LCD 0        // 1 if the optional LCD1602 is wired (RS 12, E 11, D4-D7 on 4, 3, 2, 7)
#define USE_BLUETOOTH 1  // HC-05 on D2/D3; must be 0 when USE_LCD is 1 (the LCD uses D2/D3)

#if USE_LCD && USE_BLUETOOTH
#error "The LCD and the HC-05 both use pins 2 and 3: turn one of them off"
#endif

#if USE_LCD
#include <LiquidCrystal.h>
LiquidCrystal lcd(12, 11, 4, 3, 2, 7);
#endif

#if USE_BLUETOOTH
#include <SoftwareSerial.h>
SoftwareSerial bt(2, 3);  // RX = D2 (from HC-05 TXD), TX = D3 (to HC-05 RXD via divider)
#endif

// Sends one line to the laptop over USB and, when fitted, over Bluetooth.
void say(const char* line) {
  Serial.println(line);
#if USE_BLUETOOTH
  bt.println(line);
#endif
}

void sayNumber(const char* prefix, int value) {
  Serial.print(prefix); Serial.println(value);
#if USE_BLUETOOTH
  bt.print(prefix); bt.println(value);
#endif
}

const int MOTOR_L = 5, MOTOR_R = 6;  // PWM pins
const int TRIG = 9, ECHO = 10;       // HC-SR04
// Tuned for the kit's small DC motor (driven through a PN2222): it needs full
// power and a few hundred ms to spin up. For 3 V coin vibration motors use
// STRENGTH 170 and shorter times.
const int STRENGTH = 255;            // 0-255
const int FOUND_TAP_MS = 200;        // F: three taps of this length
const int FOUND_GAP_MS = 150;        //    with this pause between them
const int STOP_MS = 1000;            // S, and the closest obstacle zone
// Obstacle warnings work in distance zones. The motor spins once each time
// something comes into a CLOSER zone, so walking up to an object gives a spin
// at 60 cm, two at 30 cm and a long one at 15 cm, while a wall or desk that just
// sits in front of the sensor never spins it again.
const int OBSTACLE_CM = 100;          // zone 1: closer than this
const int CLOSE_CM = 60;             // zone 2
const int VERY_CLOSE_CM = 30;        // zone 3
const int HYSTERESIS_CM = 15;         // must move this far back out before a zone re-arms

unsigned long lastPing = 0;
int distanceCm = -1;
int warnedZone = 0;                  // closest zone already warned about
int pendingZone = 0;                 // zone seen on the previous reading (2 in a row needed)

void motors(int l, int r) { analogWrite(MOTOR_L, l); analogWrite(MOTOR_R, r); }

void pulse(int l, int r, int ms) { motors(l, r); delay(ms); motors(0, 0); }

void show(const char* line1) {
#if USE_LCD
  lcd.setCursor(0, 0); lcd.print("                "); lcd.setCursor(0, 0); lcd.print(line1);
  lcd.setCursor(0, 1); lcd.print("dist:     cm    ");
  lcd.setCursor(6, 1); if (distanceCm > 0) lcd.print(distanceCm); else lcd.print("--");
#else
  (void)line1;
#endif
}

int readDistanceCm() {
  digitalWrite(TRIG, LOW);  delayMicroseconds(2);
  digitalWrite(TRIG, HIGH); delayMicroseconds(10);
  digitalWrite(TRIG, LOW);
  long us = pulseIn(ECHO, HIGH, 25000);  // 25 ms timeout (about 4 m) so the loop never stalls
  if (us == 0) return -1;                // nothing in range, or no sensor plugged in
  int cm = us / 58;
  return cm < 3 ? -1 : cm;               // ignore impossible readings
}

void handleCommand(char c) {
  switch (c) {
    case 'L': show("<< LEFT");  break;   // spoken by the AI; no buzz with one motor
    case 'R': show("RIGHT >>"); break;
    case 'F': for (int i = 0; i < 3; i++) {
                if (i) delay(FOUND_GAP_MS);
                pulse(STRENGTH, STRENGTH, FOUND_TAP_MS);
              }
              show("FOUND"); break;
    case 'S': pulse(STRENGTH, STRENGTH, STOP_MS); show("STOP"); break;
    case '?': say("READY"); return;
    default: return;  // ignore newlines and junk
  }
  char ack[] = "ACK:?";
  ack[4] = c;
  say(ack);
}

void setup() {
  pinMode(MOTOR_L, OUTPUT); pinMode(MOTOR_R, OUTPUT);
  pinMode(TRIG, OUTPUT);
  pinMode(ECHO, INPUT_PULLUP);  // reads "nothing in range" if the sensor is unplugged
  motors(0, 0);
  Serial.begin(115200);
#if USE_BLUETOOTH
  bt.begin(9600);  // HC-05 default data-mode speed
#endif
#if USE_LCD
  lcd.begin(16, 2);
#endif
  show("Odyssey ready");
  say("READY");
}

void loop() {
  // 1) Commands from the agent, over USB or Bluetooth
  while (Serial.available()) handleCommand(Serial.read());
#if USE_BLUETOOTH
  while (bt.available()) handleCommand(bt.read());
#endif

  // 2) Local obstacle detection, independent of the laptop
  unsigned long now = millis();
  if (now - lastPing < 60) return;
  lastPing = now;
  distanceCm = readDistanceCm();
  int zone = zoneFor(distanceCm);

  // Moved back out (with a little margin so jitter at a border doesn't count): re-arm.
  int farZone = zoneFor(distanceCm < 0 ? -1 : distanceCm - HYSTERESIS_CM);
  if (farZone < warnedZone) warnedZone = farZone;

  // Came into a closer zone on two readings in a row: warn once for that zone.
  if (zone > warnedZone && pendingZone > warnedZone) {
    warnedZone = min(zone, pendingZone);
    if (warnedZone == 1) pulse(STRENGTH, STRENGTH, 500);
    else if (warnedZone == 2) { pulse(STRENGTH, STRENGTH, 300); delay(150); pulse(STRENGTH, STRENGTH, 300); }
    else pulse(STRENGTH, STRENGTH, 1000);
    sayNumber("O:", distanceCm);  // the agent logs it and can say "stop"
    show("OBSTACLE");
  }
  pendingZone = zone;
}

int zoneFor(int cm) {
  if (cm <= 0 || cm >= OBSTACLE_CM) return 0;
  if (cm >= CLOSE_CM) return 1;
  if (cm >= VERY_CLOSE_CM) return 2;
  return 3;
}
