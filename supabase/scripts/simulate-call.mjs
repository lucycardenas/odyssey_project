// Plays a live call into Supabase, one row every few seconds, so the dashboard's
// realtime view can be demoed without the FaceTime agent or the glasses.
// Usage: cd supabase && npm run simulate            (run `npm run seed` first)
//        npm run simulate -- --fast                 (1 s between rows)
import { createClient } from "@supabase/supabase-js";
import { TRAVELER_ID, VOYAGES } from "./seed.mjs";
import { summarizeCall } from "./summarize-call.mjs";

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in supabase/.env");
  process.exit(1);
}
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const must = (r) => { if (r.error) throw r.error; return r.data; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STEP_MS = process.argv.includes("--fast") ? 1000 : 3500;

const voyage = VOYAGES[Math.floor(Math.random() * VOYAGES.length)];
const call = must(await db.from("calls").insert({ user_id: TRAVELER_ID }).select().single());
console.log(`Live call ${call.id} started`);

for (const s of voyage.steps) {
  await sleep(STEP_MS);
  if (s.kind === "msg") {
    must(await db.from("messages").insert({ call_id: call.id, role: s.role, text: s.text }));
    console.log(`  ${s.role}: ${s.text}`);
  } else {
    must(await db.from("alerts").insert({ call_id: call.id, type: s.type, distance_cm: s.distance_cm }));
    console.log(`  [buzz] ${s.type}${s.distance_cm ? ` ${s.distance_cm} cm` : ""}`);
  }
}

must(await db.from("calls").update({ ended_at: new Date().toISOString() }).eq("id", call.id));
console.log("Call ended");

// Write the Gemini summary, like the agent does when a call ends.
// Uses GEMINI_API_KEY from supabase/.env, or a simple fallback summary without it.
console.log(`Summary:\n${await summarizeCall(db, call.id)}`);
