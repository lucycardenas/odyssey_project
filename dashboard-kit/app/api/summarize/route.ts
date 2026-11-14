import { GoogleGenAI } from "@google/genai";
import { NextResponse, type NextRequest } from "next/server";
import { getAdminSupabase, getServerSupabase } from "@/lib/supabase/server";

type Line = { role: "user" | "agent"; text: string };

const PROMPT = `You are summarising a FaceTime call between a visually impaired traveler ("user") and their AI guide ("agent"), for the traveler's caregiver.
Write exactly 3 short lines, no bullets or numbering:
1. Where the traveler went or what they were trying to do.
2. Hazards or guidance that came up (obstacles, turns), with distances if given.
3. How it ended and anything the caregiver should follow up on.`;

/** Used when no GEMINI_API_KEY is set, so the demo never dead-ends. */
function fallbackSummary(lines: Line[]): string {
  const first = lines.find((l) => l.role === "user")?.text ?? "Call with the guide.";
  const hazards = lines.filter((l) => l.role === "agent" && /careful|stop|obstacle|ahead|step/i.test(l.text)).length;
  const last = lines.at(-1)?.text ?? "";
  return [
    first.length > 110 ? `${first.slice(0, 107)}...` : first,
    hazards ? `The guide called out ${hazards} hazard${hazards === 1 ? "" : "s"} along the way.` : "No hazards were called out.",
    last ? `Ended with: "${last.length > 80 ? `${last.slice(0, 77)}...` : last}"` : "Call ended.",
  ].join("\n");
}

async function summarise(lines: Line[]): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return fallbackSummary(lines);
  const ai = new GoogleGenAI({ apiKey });
  const transcript = lines.map((l) => `${l.role === "user" ? "Traveler" : "Guide"}: ${l.text}`).join("\n");
  const res = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL || "gemini-flash-latest",
    contents: `${PROMPT}\n\nTranscript:\n${transcript}`,
  });
  const text = (res.text ?? "").trim();
  if (!text) throw new Error("Gemini returned an empty summary");
  return text
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 3)
    .join("\n");
}

/**
 * POST /api/summarize  { callId }
 * Auth: a signed-in caregiver (cookie session, RLS applies), or the Node agent
 * sending header `x-agent-secret: $AGENT_WEBHOOK_SECRET` (service role).
 */
export async function POST(req: NextRequest) {
  let body: { callId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const callId = body.callId;
  if (!callId) return NextResponse.json({ error: "callId is required" }, { status: 400 });

  try {
    const secret = process.env.AGENT_WEBHOOK_SECRET;
    const fromAgent = !!secret && req.headers.get("x-agent-secret") === secret;
    const supabase = fromAgent ? getAdminSupabase() : await getServerSupabase();
    if (!supabase) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set" }, { status: 500 });

    if (!fromAgent) {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const { data: messages, error } = await supabase
      .from("messages")
      .select("role,text")
      .eq("call_id", callId)
      .order("created_at");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!messages?.length) return NextResponse.json({ error: "No transcript for this call yet" }, { status: 404 });

    const summary = await summarise(messages as Line[]);
    const { error: updateError } = await supabase.from("calls").update({ summary }).eq("id", callId);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    return NextResponse.json({ summary });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Summary failed" }, { status: 502 });
  }
}
