"use client";
/**
 * Data hooks for the dashboard UI. Each one queries Supabase once, then
 * subscribes to realtime changes so the page updates live during a call.
 * No UI here: pages decide how to render what these return.
 */
import { useEffect, useState } from "react";
import { getBrowserSupabase } from "./supabase/client";
import type { Alert, Call, Message, Profile } from "./types";

type Row = { id: string };

function upsert<T extends Row>(list: T[], row: T, prepend = true): T[] {
  const i = list.findIndex((r) => r.id === row.id);
  if (i === -1) return prepend ? [row, ...list] : [...list, row];
  const copy = list.slice();
  copy[i] = { ...copy[i], ...row };
  return copy;
}

const byTime = <T extends { created_at: string }>(a: T, b: T) => a.created_at.localeCompare(b.created_at);

/** Overview ("The Voyage"): recent calls (newest first), recent alerts, profiles. A call with ended_at null is live. */
export function useVoyage() {
  const [data, setData] = useState({
    loading: true,
    error: null as string | null,
    profiles: [] as Profile[],
    calls: [] as Call[],
    alerts: [] as Alert[],
  });

  useEffect(() => {
    const supabase = getBrowserSupabase();
    let cancelled = false;

    (async () => {
      const [p, c, a] = await Promise.all([
        supabase.from("profiles").select("*"),
        supabase.from("calls").select("*").order("started_at", { ascending: false }).limit(50),
        supabase.from("alerts").select("*").order("created_at", { ascending: false }).limit(300),
      ]);
      if (cancelled) return;
      setData({
        loading: false,
        error: p.error?.message ?? c.error?.message ?? a.error?.message ?? null,
        profiles: (p.data as Profile[]) ?? [],
        calls: (c.data as Call[]) ?? [],
        alerts: (a.data as Alert[]) ?? [],
      });
    })();

    const channel = supabase
      .channel("voyage")
      .on("postgres_changes", { event: "*", schema: "public", table: "calls" }, (payload) => {
        if (payload.eventType === "DELETE") return;
        setData((d) => ({ ...d, calls: upsert(d.calls, payload.new as Call) }));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "alerts" }, (payload) => {
        setData((d) => ({ ...d, alerts: upsert(d.alerts, payload.new as Alert) }));
      })
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  return data;
}

/** Call detail ("Ship's Log"): the call, its transcript and its alerts, oldest first, live. */
export function useCallLog(callId: string | null) {
  const [data, setData] = useState({
    loading: true,
    error: null as string | null,
    call: null as Call | null,
    messages: [] as Message[],
    alerts: [] as Alert[],
  });

  useEffect(() => {
    if (!callId) return;
    const supabase = getBrowserSupabase();
    let cancelled = false;

    (async () => {
      const [c, m, a] = await Promise.all([
        supabase.from("calls").select("*").eq("id", callId).maybeSingle(),
        supabase.from("messages").select("*").eq("call_id", callId).order("created_at"),
        supabase.from("alerts").select("*").eq("call_id", callId).order("created_at"),
      ]);
      if (cancelled) return;
      setData({
        loading: false,
        error: c.error?.message ?? m.error?.message ?? a.error?.message ?? null,
        call: (c.data as Call) ?? null,
        messages: (m.data as Message[]) ?? [],
        alerts: (a.data as Alert[]) ?? [],
      });
    })();

    const channel = supabase
      .channel(`call-${callId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "calls", filter: `id=eq.${callId}` }, (payload) =>
        setData((d) => ({ ...d, call: { ...(d.call as Call), ...(payload.new as Call) } })),
      )
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `call_id=eq.${callId}` }, (payload) =>
        setData((d) => ({ ...d, messages: upsert(d.messages, payload.new as Message, false).sort(byTime) })),
      )
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "alerts", filter: `call_id=eq.${callId}` }, (payload) =>
        setData((d) => ({ ...d, alerts: upsert(d.alerts, payload.new as Alert, false).sort(byTime) })),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [callId]);

  return data;
}

/** Ask the server to summarise a finished call with Gemini. The new summary also arrives via realtime. */
export async function requestSummary(callId: string): Promise<string> {
  const res = await fetch("/api/summarize", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ callId }),
  });
  const json = (await res.json()) as { summary?: string; error?: string };
  if (!res.ok || !json.summary) throw new Error(json.error ?? `Summary failed (${res.status})`);
  return json.summary;
}

/** Sign the caregiver in (the one hardcoded account created by `npm run seed`). */
export async function signIn(email: string, password: string) {
  const { error } = await getBrowserSupabase().auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut() {
  await getBrowserSupabase().auth.signOut();
}
