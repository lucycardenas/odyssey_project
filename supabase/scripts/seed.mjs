// Seeds Supabase for the demo: creates the one caregiver login, the traveler
// profile, and three finished voyages with transcripts, alerts and summaries.
// Usage: cd supabase && npm install && npm run seed   (reads supabase/.env)
import { createClient } from "@supabase/supabase-js";

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CAREGIVER_EMAIL, CAREGIVER_PASSWORD } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !CAREGIVER_EMAIL || !CAREGIVER_PASSWORD) {
  console.error("Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CAREGIVER_EMAIL and CAREGIVER_PASSWORD in supabase/.env");
  process.exit(1);
}
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const must = (r) => { if (r.error) throw r.error; return r.data; };

// Stable ids so re-running the seed replaces rows instead of duplicating them.
export const TRAVELER_ID = "00000000-0000-4000-8000-0000000000a1";

const say = (role, text) => ({ kind: "msg", role, text });
const buzz = (type, distance_cm = null) => ({ kind: "alert", type, distance_cm });

export const VOYAGES = [
  {
    id: "00000000-0000-4000-8000-0000000000c1",
    hoursAgo: 26,
    summary:
      "Crossed campus from the library to the engineering building.\nTwo obstacle alerts: a bike rack (110 cm) and stairs going down (45 cm).\nUsed the handrail and arrived at the entrance safely.",
    steps: [
      say("user", "Walking from the library to the engineering building."),
      say("agent", "Okay. You're on the main walkway. Head straight for about fifty meters."),
      buzz("obstacle", 110),
      say("agent", "There's a bike rack on your right edge. Drift slightly left."),
      buzz("left"),
      say("user", "Is there anyone in front of me?"),
      say("agent", "A small group is walking toward you but they're keeping to their side. You're fine."),
      buzz("obstacle", 45),
      say("agent", "Stop. There are three steps going down right in front of you. There's a handrail on your right."),
      say("user", "Thanks, I've got the rail."),
      say("agent", "The engineering building entrance is straight ahead. Automatic doors."),
      buzz("found"),
    ],
  },
  {
    id: "00000000-0000-4000-8000-0000000000c2",
    hoursAgo: 5,
    summary:
      "Shopped for groceries and located the cereal aisle (aisle 7).\nPaused for a stopped shopping cart at 60 cm, then continued.\nFound the blue oat cereal box on the middle shelf.",
    steps: [
      say("user", "I'm in the grocery store. Can you help me find the cereal aisle?"),
      say("agent", "Sure. I see aisle signs overhead. Aisle 7 says cereal and breakfast, two aisles to your right."),
      buzz("right"),
      say("user", "Turning right now."),
      buzz("obstacle", 60),
      say("agent", "Careful, a shopping cart is stopped just ahead. Wait a second, it's moving away."),
      say("agent", "Clear. Aisle 7 is on your left now."),
      buzz("left"),
      say("user", "I'm looking for the oat cereal with the blue box."),
      say("agent", "Hold the phone up to the middle shelf. The blue oat box is just to the left of your hand."),
      buzz("found"),
      say("user", "Got it!"),
    ],
  },
  {
    id: "00000000-0000-4000-8000-0000000000c3",
    hoursAgo: 2,
    summary:
      "Walked to the coffee shop on Cooper Street.\nAvoided a sandwich board on the sidewalk with a right buzz at 85 cm.\nReached the door safely; no help needed.",
    steps: [
      say("user", "Hey, I'm heading out to find the coffee shop on Cooper Street."),
      say("agent", "Got it. I can see the sidewalk ahead and it's clear. Walk straight and I'll buzz you if anything's in the way."),
      buzz("obstacle", 85),
      say("agent", "There's a sandwich board about a meter ahead. Step a little to the right."),
      buzz("right"),
      say("user", "Okay, I moved right."),
      say("agent", "Perfect, the path is clear again. Keep going straight."),
      say("user", "Do you see the coffee shop yet?"),
      say("agent", "Yes, there's a green awning ahead on your left, about ten steps away."),
      buzz("left"),
      say("agent", "The door is right in front of you. The handle is on the right side."),
      buzz("found"),
      say("user", "Found it. Thank you!"),
      say("agent", "You made it. Enjoy your coffee."),
    ],
  },
];

async function ensureCaregiver() {
  const list = must(await db.auth.admin.listUsers({ perPage: 1000 }));
  let user = list.users.find((u) => u.email?.toLowerCase() === CAREGIVER_EMAIL.toLowerCase());
  if (!user) {
    user = must(await db.auth.admin.createUser({ email: CAREGIVER_EMAIL, password: CAREGIVER_PASSWORD, email_confirm: true })).user;
    console.log(`Created caregiver login ${CAREGIVER_EMAIL}`);
  } else {
    must(await db.auth.admin.updateUserById(user.id, { password: CAREGIVER_PASSWORD }));
    console.log(`Caregiver login ${CAREGIVER_EMAIL} exists; password reset to CAREGIVER_PASSWORD`);
  }
  return user.id;
}

async function main() {
  const caregiverId = await ensureCaregiver();
  must(await db.from("profiles").upsert([
    { id: caregiverId, name: "Penelope", role: "caregiver" },
    { id: TRAVELER_ID, name: "Odie", role: "user" },
  ]));

  const STEP_MS = 9000;
  for (const v of VOYAGES) {
    const start = Date.now() - v.hoursAgo * 3600_000;
    const at = (i) => new Date(start + (i + 1) * STEP_MS).toISOString();
    must(await db.from("calls").delete().eq("id", v.id)); // cascades messages + alerts
    must(await db.from("calls").insert({
      id: v.id,
      user_id: TRAVELER_ID,
      started_at: new Date(start).toISOString(),
      ended_at: at(v.steps.length),
      summary: v.summary,
    }));
    const messages = [], alerts = [];
    v.steps.forEach((s, i) => {
      if (s.kind === "msg") messages.push({ call_id: v.id, role: s.role, text: s.text, created_at: at(i) });
      else alerts.push({ call_id: v.id, type: s.type, distance_cm: s.distance_cm, created_at: at(i) });
    });
    must(await db.from("messages").insert(messages));
    must(await db.from("alerts").insert(alerts));
  }
  console.log(`Seeded ${VOYAGES.length} voyages for traveler Odie. Log in as ${CAREGIVER_EMAIL}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e.message ?? e);
    process.exit(1);
  });
}
