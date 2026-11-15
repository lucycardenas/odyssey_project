/** Small helpers that turn Supabase rows into the text Lucia's screens show. */
import type { Alert, Call } from "./types";

const time = (d: Date) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/** "Today · 10:32 AM", "Yesterday · 3:15 PM", "Mon · 5:48 PM", "Nov 3 · 9:10 AM". */
export function dayTime(iso: string): string {
  const d = new Date(iso);
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((start(new Date()) - start(d)) / 86_400_000);
  const day =
    days === 0
      ? "Today"
      : days === 1
        ? "Yesterday"
        : days < 7
          ? d.toLocaleDateString([], { weekday: "short" })
          : d.toLocaleDateString([], { month: "short", day: "numeric" });
  return `${day} · ${time(d)}`;
}

/** "18 min", or "Live" while the call has no ended_at. */
export function callLength(call: Call): string {
  if (!call.ended_at) return "Live";
  const min = Math.max(1, Math.round((+new Date(call.ended_at) - +new Date(call.started_at)) / 60_000));
  return `${min} min`;
}

/** "04:12" since the call started (or its full length once it has ended). */
export function clock(call: Call, now = Date.now()): string {
  const end = call.ended_at ? +new Date(call.ended_at) : now;
  const s = Math.max(0, Math.floor((end - +new Date(call.started_at)) / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function summaryLines(call: Call): string[] {
  return (call.summary ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
}

/** Title for a call: the first line of its Gemini summary. */
export function callTitle(call: Call): string {
  const first = summaryLines(call)[0];
  if (first) return first.replace(/\.$/, "");
  return call.ended_at ? "Voyage" : "Voyage in progress";
}

/** Body text for a call card: the rest of the summary. */
export function callBody(call: Call): string {
  const rest = summaryLines(call).slice(1).join(" ");
  if (rest) return rest;
  if (!call.ended_at) return "Live now. Open it to follow the guide and the haptic alerts as they happen.";
  return call.summary ? "" : "The guide is writing a summary of this voyage.";
}

/** "2 obstacles · 3 guidance cues" for one call. */
export function alertDetail(alerts: Alert[]): string {
  const obstacles = alerts.filter((a) => a.type === "obstacle").length;
  const cues = alerts.length - obstacles;
  if (!alerts.length) return "No haptic alerts";
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  return `${plural(obstacles, "obstacle")} · ${plural(cues, "guidance cue")}`;
}

/** Headline and pattern text for a haptic alert (matches the "Haptic cue sent" strip). */
export function alertText(a: Alert): { title: string; detail: string; pattern: string } {
  switch (a.type) {
    case "obstacle":
      return {
        title: "Obstacle detected",
        detail: a.distance_cm != null ? `${a.distance_cm} cm ahead · steady buzz` : "Steady buzz",
        pattern: "———",
      };
    case "left":
      return { title: "Haptic cue sent", detail: "One short pulse · turn left", pattern: "· —" };
    case "right":
      return { title: "Haptic cue sent", detail: "Two short pulses · turn right", pattern: "·· —" };
    case "found":
      return { title: "Target found", detail: "Three quick pulses · you've arrived", pattern: "···" };
  }
}

export function greeting(d = new Date()): string {
  const h = d.getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/** "WEDNESDAY, JUNE 18" */
export function todayLabel(d = new Date()): string {
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }).toUpperCase();
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
