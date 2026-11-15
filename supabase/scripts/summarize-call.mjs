// Writes the 3-line caregiver summary for a finished call, with Gemini Flash.
// Replaces the old Next.js /api/summarize route: the dashboard is now a static
// Vite app, so whoever ends the call (the agent, or `npm run simulate`) writes
// the summary itself with the service role key.
//
// From code (no extra dependencies; pass your own service-role Supabase client):
//   import { summarizeCall } from "../supabase/scripts/summarize-call.mjs";
//   await summarizeCall(db, callId, { apiKey: process.env.GEMINI_API_KEY });
//
// From the command line:
//   npm run summarize -- <callId>        (reads supabase/.env, GEMINI_API_KEY optional)

const PROMPT = `You are summarising a FaceTime call between a visually impaired traveler ("user") and their AI guide ("agent"), for the traveler's caregiver.
Write exactly 3 short lines, no bullets or numbering:
1. Where the traveler went or what they were trying to do.
2. Hazards or guidance that came up (obstacles, turns), with distances if given.
3. How it ended and anything the caregiver should follow up on.`;

/** Used when there is no Gemini key or Gemini fails, so the demo never dead-ends. */
export function fallbackSummary(lines) {
  const first = lines.find((l) => l.role === "user")?.text ?? "Call with the guide.";
  const hazards = lines.filter((l) => l.role === "agent" && /careful|stop|obstacle|ahead|step/i.test(l.text)).length;
  const last = lines.at(-1)?.text ?? "";
  return [
    first.length > 110 ? `${first.slice(0, 107)}...` : first,
    hazards ? `The guide called out ${hazards} hazard${hazards === 1 ? "" : "s"} along the way.` : "No hazards were called out.",
    last ? `Ended with: "${last.length > 80 ? `${last.slice(0, 77)}...` : last}"` : "Call ended.",
  ].join("\n");
}

async function gemini(lines, apiKey, model) {
  const transcript = lines.map((l) => `${l.role === "user" ? "Traveler" : "Guide"}: ${l.text}`).join("\n");
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({ contents: [{ parts: [{ text: `${PROMPT}\n\nTranscript:\n${transcript}` }] }] }),
    },
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  const text = (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
  if (!text) throw new Error("Gemini returned an empty summary");
  return text
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 3)
    .join("\n");
}

/**
 * Reads the call's transcript, writes calls.summary, and returns the summary.
 * `db` must be a service-role client. Never throws on a Gemini failure: it
 * logs and saves the simple fallback summary instead.
 */
export async function summarizeCall(db, callId, { apiKey = process.env.GEMINI_API_KEY, model = process.env.GEMINI_MODEL || "gemini-flash-latest" } = {}) {
  const { data: lines, error } = await db.from("messages").select("role,text").eq("call_id", callId).order("created_at");
  if (error) throw error;
  if (!lines?.length) throw new Error(`No transcript for call ${callId}`);

  let summary;
  try {
    summary = apiKey ? await gemini(lines, apiKey, model) : fallbackSummary(lines);
  } catch (err) {
    console.error(`[summary] Gemini failed, using fallback: ${err.message ?? err}`);
    summary = fallbackSummary(lines);
  }
  const { error: updateError } = await db.from("calls").update({ summary }).eq("id", callId);
  if (updateError) throw updateError;
  return summary;
}

// CLI: npm run summarize -- <callId>
if (import.meta.url === `file://${process.argv[1]}`) {
  const { createClient } = await import("@supabase/supabase-js");
  const callId = process.argv[2];
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!callId || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Usage: npm run summarize -- <callId>   (needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in supabase/.env)");
    process.exit(1);
  }
  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  summarizeCall(db, callId)
    .then((s) => console.log(s))
    .catch((e) => {
      console.error(e.message ?? e);
      process.exit(1);
    });
}
