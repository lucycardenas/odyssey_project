/**
 * Data hooks for the dashboard. Each one queries Supabase once, then subscribes
 * to realtime changes so the screens update live during a call.
 * No UI here: App.tsx decides how to render what these return.
 */
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { Alert, Call, Message, Profile } from "./types";

type Row = { id: string };

function upsert<T extends Row>(list: T[], row: T, prepend = true): T[] {
  const i = list.findIndex((r) => r.id === row.id);
  if (i === -1) return prepend ? [row, ...list] : [...list, row];
  const copy = list.slice();
  copy[i] = { ...copy[i], ...row };
  return copy;
}

const byTime = <T extends { created_at: string }>(a: T, b: T) =>
  a.created_at.localeCompare(b.created_at);

/** Current auth session. `loading` is true until Supabase has restored it from storage. */
export function useSession() {
  const [state, setState] = useState<{ loading: boolean; session: Session | null }>({
    loading: Boolean(supabase),
    session: null,
  });

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setState({ loading: false, session: data.session }));
    const { data } = supabase.auth.onAuthStateChange((_event, session) =>
      setState({ loading: false, session }),
    );
    return () => data.subscription.unsubscribe();
  }, []);

  return state;
}

/** Sign the caregiver in (the one account created by `npm run seed` in supabase/). */
export async function signIn(email: string, password: string) {
  if (!supabase) throw new Error("Supabase is not configured. Fill in dashboard/.env.local.");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut() {
  await supabase?.auth.signOut();
}

/** Overview ("The Voyage"): recent calls (newest first), recent alerts, profiles. A call with ended_at null is live. */
export function useVoyage(enabled: boolean) {
  const [data, setData] = useState({
    loading: true,
    error: null as string | null,
    profiles: [] as Profile[],
    calls: [] as Call[],
    alerts: [] as Alert[],
  });

  useEffect(() => {
    if (!supabase || !enabled) return;
    const db = supabase;
    let cancelled = false;

    (async () => {
      const [p, c, a] = await Promise.all([
        db.from("profiles").select("*"),
        db.from("calls").select("*").order("started_at", { ascending: false }).limit(50),
        db.from("alerts").select("*").order("created_at", { ascending: false }).limit(300),
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

    const channel = db
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
      db.removeChannel(channel);
    };
  }, [enabled]);

  return data;
}

/** One call ("Ship's Log"): the call, its transcript and its alerts, oldest first, live. */
export function useCallLog(callId: string | null) {
  const [data, setData] = useState({
    loading: true,
    error: null as string | null,
    call: null as Call | null,
    messages: [] as Message[],
    alerts: [] as Alert[],
  });

  useEffect(() => {
    if (!supabase || !callId) return;
    const db = supabase;
    let cancelled = false;

    (async () => {
      const [c, m, a] = await Promise.all([
        db.from("calls").select("*").eq("id", callId).maybeSingle(),
        db.from("messages").select("*").eq("call_id", callId).order("created_at"),
        db.from("alerts").select("*").eq("call_id", callId).order("created_at"),
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

    const channel = db
      .channel(`call-${callId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "calls", filter: `id=eq.${callId}` },
        (payload) =>
          setData((d) => ({ ...d, call: { ...(d.call as Call), ...(payload.new as Call) } })),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `call_id=eq.${callId}` },
        (payload) =>
          setData((d) => ({
            ...d,
            messages: upsert(d.messages, payload.new as Message, false).sort(byTime),
          })),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "alerts", filter: `call_id=eq.${callId}` },
        (payload) =>
          setData((d) => ({
            ...d,
            alerts: upsert(d.alerts, payload.new as Alert, false).sort(byTime),
          })),
      )
      .subscribe();

    return () => {
      cancelled = true;
      db.removeChannel(channel);
    };
  }, [callId]);

  return data;
}
