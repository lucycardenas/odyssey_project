// odyssey_glasses.ino  (Arduino UNO R3)
// Haptic glasses for the Odyssey FaceTime guide.
//
// Laptop -> UNO over USB serial at 115200 baud, one letter per command:
//   L = turn left (left motor 250 ms)     R = turn right (right motor 250 ms)
//   F = found it / straight ahead (two short pulses on both)
//   S = stop now (both motors, 600 ms)    ? = reply READY (connection check)
// UNO -> laptop, one line each: READY at boot, ACK:<letter> after a command,
//   O:<cm> when something is closer than OBSTACLE_CM (at most once a second).
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
const int TURN_MS = 500;             // L / R
const int FOUND_MS = 250;            // F: two of these
const int STOP_MS = 1000;            // S
const int OBSTACLE_SPIN_MS = 250;    // each spin while something is close
const int OBSTACLE_CM = 60;          // closer than this = local warning spins

unsigned long lastPing = 0, lastReport = 0, lastPulse = 0;
int distanceCm = -1;

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
    case 'L': pulse(STRENGTH, 0, TURN_MS); show("<< LEFT");  break;
    case 'R': pulse(0, STRENGTH, TURN_MS); show("RIGHT >>"); break;
    case 'F': pulse(STRENGTH, STRENGTH, FOUND_MS); delay(200);
              pulse(STRENGTH, STRENGTH, FOUND_MS); show("FOUND"); break;
    case 'S': pulse(255, 255, STOP_MS); show("STOP"); break;
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
  if (now - lastPing >= 60) {
    lastPing = now;
    distanceCm = readDistanceCm();
  }

  if (distanceCm > 0 && distanceCm < OBSTACLE_CM) {
    // Spin, pause, spin: closer = shorter pauses (almost nonstop up close,
    // about 3 spins a second at the edge of the range)
    unsigned long gap = constrain(map(distanceCm, 5, OBSTACLE_CM, 30, 350), 30, 350);
    if (now - lastPulse >= OBSTACLE_SPIN_MS + gap) {
      pulse(STRENGTH, STRENGTH, OBSTACLE_SPIN_MS);
      lastPulse = millis();
    }
    if (now - lastReport >= 1000) {
      lastReport = now;
      sayNumber("O:", distanceCm);
      show("OBSTACLE");
    }
  }
}
