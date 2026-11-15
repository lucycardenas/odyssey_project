// Rehearses a call without FaceTime, through the same code the agent uses: buzzes the
// glasses left, right, found and stop, and writes a short call to Supabase so the
// caregiver dashboard updates live. Hold a hand near the sensor to log an obstacle.
// Usage: npm run glasses:call             (stop the agent first: only one program can hold the port)
//        npm run glasses:call -- --keep   (leave the rehearsal call on the dashboard)
import { connectGlasses } from './glasses.mjs';
import { deleteCall, endCall, logAlert, logMessage, startCall } from './dashboard.mjs';

const keep = process.argv.includes('--keep');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const callId = await startCall();
console.log(callId ? `Supabase call ${callId}` : 'Supabase is off (no SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY): glasses only');
const glasses = connectGlasses({
  onObstacle: cm => { console.log(`  obstacle at ${cm} cm`); logAlert(callId, 'obstacle', cm); },
});
await sleep(3000); // the UNO restarts when the port opens
console.log(glasses.connected ? 'Glasses connected' : 'Glasses NOT connected');

logMessage(callId, 'user', 'Rehearsal: where is the door?');
for (const [direction, line] of [
  ['left', 'The door is to your left.'],
  ['right', 'Now turn slightly right.'],
  ['found', 'The door is straight ahead.'],
  ['stop', 'Stop, there is a step down.'],
]) {
  logMessage(callId, 'agent', line);
  const sent = glasses.buzz(direction);
  logAlert(callId, direction === 'stop' ? 'obstacle' : direction);
  console.log(`buzz ${direction}: ${sent ? 'sent' : 'not sent'}`);
  await sleep(1500);
}
console.log('Listening 5 s for obstacles...');
await sleep(5000);
await glasses.close();

if (callId && keep) {
  await endCall(callId);
  console.log('Call ended and summarized; it stays on the dashboard.');
} else if (callId) {
  await deleteCall(callId);
  console.log('Rehearsal call removed from Supabase (use --keep to leave it).');
}
process.exit(0);
