# Odyssey backend (Supabase)

The caregiver dashboard has no custom server. The FaceTime agent writes rows
into Supabase (and the call summary when a call ends), and the Vite dashboard
in [`../dashboard`](../dashboard/README.md) reads them with realtime updates.

```
Glasses (UNO) --serial--> Agent (Node) --writes--> Supabase (Postgres + Auth + Realtime)
                   |                                   ^ reads + live updates
                   +--> Gemini Flash (summary at call end)   Vite dashboard (static, anon key + login)
```

## Tables

| table      | columns                                                                 |
|------------|-------------------------------------------------------------------------|
| `profiles` | `id`, `name`, `role` (`user` = traveler, `caregiver`)                    |
| `calls`    | `id`, `user_id`, `started_at`, `ended_at` (null while live), `summary`  |
| `messages` | `id`, `call_id`, `role` (`user`/`agent`), `text`, `created_at`          |
| `alerts`   | `id`, `call_id`, `type` (`obstacle`/`left`/`right`/`found`), `distance_cm`, `created_at` |

**Security (RLS):** signed-in caregivers can read everything and update a
call's `summary`. Nobody else can read anything. The agent and the scripts
use the service role key, which bypasses RLS, so keep that key on the laptop
only. The dashboard only ever gets the anon key.

## Setup (about 10 minutes)

1. Create a project at [supabase.com](https://supabase.com) (free tier is fine).
2. **SQL Editor → New query**, paste [`migrations/0001_odyssey_schema.sql`](migrations/0001_odyssey_schema.sql), run it.
   It's safe to run again.
3. **Project Settings → API**: copy the Project URL, `anon` key and `service_role` key.
4. Seed the demo data and the caregiver login:
   ```bash
   cd supabase
   cp .env.example .env      # fill in URL, service role key, caregiver email/password
   npm install
   npm run seed
   ```
   This creates the one hardcoded caregiver account (`CAREGIVER_EMAIL`), the
   traveler "Odie", and three finished calls with transcripts, alerts and summaries.
   Re-running it resets those rows.
5. Demo a live call without the agent or glasses:
   ```bash
   npm run simulate          # one row every 3.5 s
   npm run simulate -- --fast
   ```
   Open the dashboard while this runs and the call, transcript and alerts
   appear live. At the end it writes the 3-line summary with Gemini
   (`GEMINI_API_KEY` in `.env`), or a simple fallback summary without a key.
   `npm run summarize -- <callId>` re-writes the summary for any call.

## Writing from the Node agent

Install `@supabase/supabase-js` in the agent and use the service role key.

```js
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const TRAVELER_ID = "00000000-0000-4000-8000-0000000000a1"; // "Odie", created by npm run seed

// When the FaceTime call connects
const { data: call } = await db.from("calls").insert({ user_id: TRAVELER_ID }).select().single();

// Each transcript line (user speech or agent reply)
await db.from("messages").insert({ call_id: call.id, role: "user", text: "Where's the door?" });
await db.from("messages").insert({ call_id: call.id, role: "agent", text: "Two steps ahead, slightly left." });

// Each haptic event: UNO obstacle reading, or a left/right/found buzz the agent sends
await db.from("alerts").insert({ call_id: call.id, type: "obstacle", distance_cm: 42 });
await db.from("alerts").insert({ call_id: call.id, type: "left" });

// When the call ends
await db.from("calls").update({ ended_at: new Date().toISOString() }).eq("id", call.id);

// Then write the 3-line Gemini summary (no dashboard server needed).
// summarize-call.mjs has no dependencies; it uses the db client you pass in.
import { summarizeCall } from "../supabase/scripts/summarize-call.mjs";
summarizeCall(db, call.id, { apiKey: process.env.GEMINI_API_KEY }).catch(console.error);
```

Don't `await` these inside latency-sensitive voice handlers; fire them off and
log errors, so a slow network never delays a buzz.
