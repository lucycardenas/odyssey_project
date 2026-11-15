// Writes each FaceTime call to Supabase so the caregiver dashboard shows it live:
// the call, every transcript line, every buzz and obstacle, and a summary at the end.
// Optional: without SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local it does nothing.
// Nothing here is awaited inside the voice loop, so a slow network never delays a buzz.
import { createClient } from '@supabase/supabase-js';
import { summarizeCall } from '../supabase/scripts/summarize-call.mjs';

const TRAVELER_ID = '00000000-0000-4000-8000-0000000000a1'; // "Odie", created by `npm run seed` in supabase/
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
const db = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

const report = what => res => { if (res?.error) console.error(`[supabase] ${what}: ${res.error.message}`); };
const fail = what => err => console.error(`[supabase] ${what}: ${err?.message ?? err}`);

/** Inserts the call row. Returns its id, or null when Supabase is off or fails. */
export async function startCall() {
  if (!db) return null;
  try {
    const { data, error } = await db.from('calls').insert({ user_id: TRAVELER_ID }).select('id').single();
    if (error) throw error;
    console.log(`[supabase] call ${data.id} started`);
    return data.id;
  } catch (err) {
    fail('could not start the call')(err);
    return null;
  }
}

/** role is 'user' (the traveler) or 'agent'. */
export function logMessage(callId, role, text) {
  if (!db || !callId || !text?.trim()) return;
  db.from('messages').insert({ call_id: callId, role, text: text.trim() }).then(report('message'), fail('message'));
}

/** type is 'obstacle', 'left', 'right' or 'found' (the table has no 'stop'). */
export function logAlert(callId, type, distanceCm) {
  if (!db || !callId) return;
  db.from('alerts').insert({ call_id: callId, type, distance_cm: distanceCm ?? null }).then(report('alert'), fail('alert'));
}

/** Removes a call and its messages and alerts (used by the rehearsal script). */
export async function deleteCall(callId) {
  if (!db || !callId) return;
  await db.from('calls').delete().eq('id', callId).then(report('delete call'), fail('delete call'));
}

/** Marks the call ended, then writes the 3-line Gemini summary for the caregiver. */
export async function endCall(callId) {
  if (!db || !callId) return;
  await db.from('calls').update({ ended_at: new Date().toISOString() }).eq('id', callId).then(report('end call'), fail('end call'));
  try {
    await summarizeCall(db, callId, {
      apiKey: process.env.GOOGLE_API_KEY,
      model: process.env.GEMINI_SUMMARY_MODEL || process.env.GEMINI_VISION_MODEL || 'gemini-3.5-flash',
    });
    console.log(`[supabase] call ${callId} summarized`);
  } catch (err) {
    fail('summary')(err); // e.g. a call with no transcript
  }
}
