# Navassey caregiver dashboard (Vite + React)

Lucia's Figma Make design, wired to Supabase. The look is unchanged; the screens
now read real calls, transcripts and haptic alerts, and update live during a call.

## Run it

You need Node 22 and pnpm (`npm install -g pnpm` if `pnpm -v` fails).

```bash
cd dashboard
cp .env.example .env.local
```

Open `dashboard/.env.local` and fill in the two values from Supabase →
Project Settings → API (ask Chris for them):

```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<the anon / public key>
```

Only the **anon** key goes here, never the service role key. `.env.local` is
git-ignored, so it never gets committed.

```bash
pnpm install
pnpm dev
```

Open http://localhost:5173. A sign-in card appears with **Caregiver** selected:

- Email: `penelope@ithaca.dev` (already filled in)
- Password: the `CAREGIVER_PASSWORD` from Chris's `supabase/.env`

After signing in you see the traveler Odie's calls. To watch a call arrive live,
have Chris run `cd supabase && npm run simulate` while the dashboard is open.
Click the profile card in the sidebar to sign out.

No `.env.local`? The app still runs and shows the original sample data, so you
can work on the design without Supabase.

## Where to make changes

| file | what's in it |
|------|--------------|
| `src/App.tsx` | All screens and components (your design). Edit layout and copy here. |
| `src/index.css` | All styles. The block at the very bottom was added for the sign-in fields and long transcripts. |
| `src/lib/data.ts` | Supabase hooks: `useSession`, `useVoyage`, `useCallLog`, `signIn`, `signOut`. |
| `src/lib/format.ts` | Turns rows into display text (dates, call titles, alert wording). |
| `src/lib/types.ts` | Row types for `profiles`, `calls`, `messages`, `alerts`. |

What is live now: the traveler's name and initials, today's date, the greeting,
the "on a call now" pill, haptic alert count, the Glasses page, the
notification bell, "Places you've been", "Recent conversations", the full lists
under My journeys and Conversations, and the session modal (live caption, last
haptic cue, transcript and summary). Weather, battery and the mythic chapters
are still static design.

**Edit the files in this folder directly, not in Figma Make.** A fresh Figma
Make export would overwrite the Supabase wiring in `App.tsx`. If you do change
something in Figma Make, copy just the changed JSX or CSS into these files.

Commit on a branch and open a PR:

```bash
git checkout -b lucia/dashboard-tweaks
git add dashboard
git commit -m "Tweak dashboard"
git push -u origin lucia/dashboard-tweaks
```

## How the data gets here

The FaceTime agent writes rows into Supabase with the service role key. When a
call ends it writes the 3-line Gemini summary itself with
[`supabase/scripts/summarize-call.mjs`](../supabase/scripts/summarize-call.mjs),
so the dashboard is a plain static site with no server. Row Level Security
means the anon key sees nothing until the caregiver signs in. See
[`supabase/README.md`](../supabase/README.md) for the schema.
