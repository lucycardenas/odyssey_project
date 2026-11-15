# Dashboard kit (data layer for the Next.js app)

Drop-in backend pieces for the caregiver dashboard. There's no UI here on purpose:
the pages and styling live in the Next.js app. Copy these into that app's `src/`
(paths assume the `@/*` import alias):

| file | what it does |
|------|--------------|
| `lib/types.ts` | Row types: `Profile`, `Call`, `Message`, `Alert`. |
| `lib/supabase/client.ts` | Browser Supabase client (cookie session via `@supabase/ssr`). |
| `lib/supabase/server.ts` | Server client for route handlers, plus a service-role client. |
| `lib/data.ts` | React hooks with realtime: `useVoyage()` for the overview, `useCallLog(id)` for a call page, plus `requestSummary`, `signIn`, `signOut`. |
| `proxy.ts` | Next 16 proxy (formerly `middleware.ts`): refreshes the session and redirects signed-out visitors to `/login`. |
| `app/api/summarize/route.ts` | `POST /api/summarize {callId}` sends the transcript to Gemini Flash and saves a 3-line summary on the call. |

## Install

```bash
npm install @supabase/ssr @supabase/supabase-js @google/genai server-only
cp ../dashboard-kit/.env.example .env.local   # then fill in
```

Set the same variables in Vercel → Project → Settings → Environment Variables.
`GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `AGENT_WEBHOOK_SECRET` are
server-only; never give them a `NEXT_PUBLIC_` prefix. Without a Gemini key the
route still returns a simple 3-line fallback summary, so the demo never dead-ends.

## Using the hooks

```tsx
"use client";
import { useVoyage, useCallLog, requestSummary } from "@/lib/data";

const { calls, alerts, profiles, loading, error } = useVoyage();
const liveCall = calls.find((c) => !c.ended_at);          // "on a call now"

const { call, messages, alerts: callAlerts } = useCallLog(id);
// When call.ended_at is set and call.summary is null, call requestSummary(call.id).
// The new summary arrives through realtime too.
```

Login page: call `signIn(email, password)` then `router.replace("/")` and
`router.refresh()`. The caregiver account is created by `npm run seed` in
[`../supabase`](../supabase/README.md).

## Summary route auth

- From the dashboard: the signed-in caregiver's cookie session (RLS applies).
- From the agent or `npm run simulate`: header `x-agent-secret: $AGENT_WEBHOOK_SECRET` (uses the service role).
