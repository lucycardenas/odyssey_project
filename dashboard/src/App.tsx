import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { signIn, signOut, useCallLog, useSession, useVoyage } from "./lib/data";
import {
  alertDetail,
  alertText,
  callBody,
  callLength,
  callTitle,
  clock,
  dayTime,
  greeting,
  initials,
  todayLabel,
} from "./lib/format";
import { supabaseConfigured } from "./lib/supabase";
import type { Alert, Call, Message, Profile } from "./lib/types";

type IconName =
  | "sun"
  | "home"
  | "route"
  | "chat"
  | "people"
  | "settings"
  | "help"
  | "bell"
  | "video"
  | "arrow"
  | "map"
  | "clock"
  | "glasses"
  | "signal"
  | "close"
  | "check"
  | "user"
  | "shield";

function Icon({
  name,
  size = 20,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  const paths: Record<IconName, ReactNode> = {
    sun: (
      <>
        <circle cx="12" cy="12" r="3.5" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" />
      </>
    ),
    home: (
      <>
        <path d="m3 10 9-7 9 7" />
        <path d="M5 9v11h14V9M9 20v-6h6v6" />
      </>
    ),
    route: (
      <>
        <circle cx="6" cy="19" r="2" />
        <circle cx="18" cy="5" r="2" />
        <path d="M8 19h3a3 3 0 0 0 3-3V8a3 3 0 0 1 3-3" />
      </>
    ),
    chat: (
      <>
        <path d="M21 12a8 8 0 0 1-8 8H6l-4 2 1.4-4.2A9 9 0 1 1 21 12Z" />
        <path d="M8 12h.01M12 12h.01M16 12h.01" />
      </>
    ),
    people: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06-2.83 2.83-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21h-4v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06-2.83-2.83.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3v-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06 2.83-2.83.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3h4v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06 2.83 2.83-.06.06A1.65 1.65 0 0 0 19.4 9c.12.37.35.7.66.93.3.23.68.35 1.06.35H21v4h-.09A1.65 1.65 0 0 0 19.4 15Z" />
      </>
    ),
    help: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9a2.7 2.7 0 1 1 4.2 2.25c-1.05.7-1.7 1.15-1.7 2.25M12 17h.01" />
      </>
    ),
    bell: (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M10 21h4" />
      </>
    ),
    video: (
      <>
        <rect x="2" y="5" width="14" height="14" rx="2" />
        <path d="m16 10 5-3v10l-5-3Z" />
      </>
    ),
    arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
    map: (
      <>
        <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Z" />
        <path d="M9 3v15M15 6v15" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    glasses: (
      <>
        <path d="M2 12h2M20 12h2M9.5 12h5" />
        <circle cx="7" cy="13" r="3.5" />
        <circle cx="17" cy="13" r="3.5" />
        <path d="m3.5 11 .8-4M20.5 11l-.8-4" />
      </>
    ),
    signal: <path d="M4 18v-3M8 18v-6M12 18V9M16 18V6M20 18V3" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    check: <path d="m5 12 4 4L19 6" />,
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
    shield: (
      <>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
        <path d="m9 12 2 2 4-5" />
      </>
    ),
  };

  return (
    <svg
      className={className}
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

// Sample data, shown only when dashboard/.env.local is missing (design preview mode).
const sampleJourneys = [
  {
    place: "Seabrook Market",
    meta: "Today · 10:32 AM",
    detail: "Main entrance → Produce aisle",
    color: "#125773",
  },
  {
    place: "Harbor Pharmacy",
    meta: "Yesterday · 3:15 PM",
    detail: "Prescription counter → Exit",
    color: "#9d4f32",
  },
  {
    place: "North Pier Walk",
    meta: "Mon · 5:48 PM",
    detail: "Marina gate → Lookout point",
    color: "#5c745b",
  },
];

const sampleConversations = [
  {
    title: "Morning market visit",
    time: "Today · 10:28 AM",
    summary:
      "Found oat milk and fresh basil. Agent guided around a restocking cart near aisle four.",
    length: "18 min",
  },
  {
    title: "Pharmacy pickup",
    time: "Yesterday · 3:12 PM",
    summary: "Prescription collected. Care instructions were read aloud and saved to notes.",
    length: "12 min",
  },
];

const mythicChapters = [
  {
    number: "IX",
    title: "The Cyclops",
    place: "The cave of Polyphemus",
    description:
      "Odysseus escaped the one-eyed giant by wit, hiding beneath the flock as it left the sealed cave.",
    type: "cyclops",
    lesson: "Wit over strength",
  },
  {
    number: "X",
    title: "Circe",
    place: "The island of Aeaea",
    description:
      "The enchantress turned his crew into swine. With courage and Hermes’ aid, Odysseus broke her spell.",
    type: "circe",
    lesson: "Courage against enchantment",
  },
  {
    number: "V",
    title: "Calypso’s prison",
    place: "The island of Ogygia",
    description:
      "Held for seven years in a beautiful island prison, Odysseus never surrendered his longing for home.",
    type: "calypso",
    lesson: "Home above immortality",
  },
] as const;

function VaseScene({ type }: { type: (typeof mythicChapters)[number]["type"] }) {
  return (
    <svg
      className="vase-scene"
      viewBox="0 0 280 145"
      role="img"
      aria-label={`${type} in ancient Greek black-figure style`}
    >
      <path className="ground-line" d="M8 124h264M8 130h264" />
      {type === "cyclops" && (
        <>
          <path
            className="figure-fill"
            d="M190 28c19 0 32 18 30 39l-5 47h-18l-2-35-10 35h-18l8-48c-11-10-5-38 15-38Z"
          />
          <circle className="clay-detail" cx="193" cy="48" r="6" />
          <path
            className="clay-stroke"
            d="M181 62q12 8 24 0M180 70l-25 28M204 69l20 34M211 34l14-17M225 17l9 3"
          />
          <path
            className="figure-fill"
            d="M54 77q10-19 23 0l-2 39H58l2-27-10 27H38l13-33q-2-3 3-6ZM95 81q9-18 21 0l-2 35H99l2-24-9 24H80l13-29q-2-3 2-6Z"
          />
          <path
            className="clay-stroke"
            d="M52 82l-14-12M92 86l-12-9M63 64q7-8 14 0M104 69q7-8 14 0"
          />
          <path className="ornament-stroke" d="M22 112q13-25 26 0M119 112q19-34 38 0" />
        </>
      )}
      {type === "circe" && (
        <>
          <path className="figure-fill" d="M136 35q16-17 31 0l-5 30 15 51h-61l18-51Z" />
          <path
            className="clay-stroke"
            d="M139 51h22M140 61l-36 23M160 61l38 9M150 25V9M143 12l7-3 7 3M125 114l26-25 18 25"
          />
          <path
            className="figure-fill"
            d="M56 93q8-15 18 0l8 23H47l7-15-10-6 9-8ZM214 91q8-15 18 0l9 25h-36l7-16-12-4 11-9Z"
          />
          <path
            className="clay-stroke"
            d="M50 89l-9-7M72 91l10-7M208 88l-10-7M231 89l11-8M101 83q14 10 21 0M178 70q10 9 21 1"
          />
          <circle className="clay-detail" cx="102" cy="84" r="5" />
          <circle className="clay-detail" cx="199" cy="72" r="5" />
        </>
      )}
      {type === "calypso" && (
        <>
          <path className="figure-fill" d="M62 42q14-16 28 0l-4 29 13 45H47l15-45Z" />
          <path
            className="clay-stroke"
            d="M66 58h20M64 67l-27 24M86 67l31 16M72 32V16M98 114l25-25"
          />
          <path className="figure-fill" d="M177 51q13-16 27 0l-3 26 14 39h-54l15-40Z" />
          <path
            className="clay-stroke"
            d="M180 65h21M178 73l-30 11M201 72l26 20M188 41V26M161 114l27-21 27 21"
          />
          <path
            className="ornament-stroke"
            d="M16 110q13-31 26 0M226 110q16-37 32 0M112 116V72m7 44V65m7 51V77"
          />
          <path className="clay-stroke" d="M109 73q14-20 20 0M25 92q5-14 10 0M236 87q7-18 14 0" />
        </>
      )}
    </svg>
  );
}

function Brand({ iconClassName }: { iconClassName?: string }) {
  return (
    <div className="brand">
      <span className="brand-mark">
        <Icon name="sun" size={23} className={iconClassName} />
      </span>
      <span>
        <strong>NAVASSEY</strong>
        <small>your way, made clear</small>
      </span>
    </div>
  );
}

// Dot colours for journey rows, taken from the original design.
const JOURNEY_COLORS = ["#125773", "#9d4f32", "#5c745b"];

type JourneyItem = { id: string | null; place: string; meta: string; detail: string; color: string };
type ConversationItem = { id: string | null; title: string; time: string; summary: string; length: string };

function App() {
  const [active, setActive] = useState("Today");
  const [liveOpen, setLiveOpen] = useState(false);
  const [openCallId, setOpenCallId] = useState<string | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [role, setRole] = useState<"traveler" | "caregiver">(
    supabaseConfigured ? "caregiver" : "traveler",
  );
  const [notice, setNotice] = useState(false);

  // Live data. Without dashboard/.env.local the screens fall back to the sample data above.
  const { session, loading: authLoading } = useSession();
  const signedIn = Boolean(session);
  const voyage = useVoyage(supabaseConfigured && signedIn);
  const usingLive = supabaseConfigured && signedIn;
  const mustSignIn = supabaseConfigured && !authLoading && !signedIn;

  const traveler: Profile | undefined = voyage.profiles.find((p) => p.role === "user");
  const caregivers = voyage.profiles.filter((p) => p.role === "caregiver");
  const travelerName = usingLive ? (traveler?.name ?? "Traveler") : "Alex Parker";
  const firstName = travelerName.split(" ")[0];
  const caregiverName = caregivers[0]?.name ?? "Maya";
  const liveCall = voyage.calls.find((c) => !c.ended_at);

  const alertsFor = (call: Call) => voyage.alerts.filter((a) => a.call_id === call.id);
  const journeys: JourneyItem[] = usingLive
    ? voyage.calls.map((c, i) => ({
        id: c.id,
        place: callTitle(c),
        meta: dayTime(c.started_at),
        detail: alertDetail(alertsFor(c)),
        color: JOURNEY_COLORS[i % JOURNEY_COLORS.length],
      }))
    : sampleJourneys.map((j) => ({ ...j, id: null }));
  const conversations: ConversationItem[] = usingLive
    ? voyage.calls.map((c) => ({
        id: c.id,
        title: callTitle(c),
        time: dayTime(c.started_at),
        summary: callBody(c),
        length: callLength(c),
      }))
    : sampleConversations.map((c) => ({ ...c, id: null }));

  const startOfToday = new Date().setHours(0, 0, 0, 0);
  const alertsToday = voyage.alerts.filter((a) => +new Date(a.created_at) >= startOfToday).length;
  const latestAlert: Alert | undefined = voyage.alerts[0];
  const recentAlert =
    latestAlert && Date.now() - +new Date(latestAlert.created_at) < 15 * 60_000 ? latestAlert : undefined;

  const openCall = (id: string | null) => {
    setOpenCallId(id);
    setLiveOpen(true);
  };

  const nav = [
    ["Today", "home"],
    ["My journeys", "route"],
    ["Conversations", "chat"],
    ["Care circle", "people"],
  ] as [string, IconName][];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand iconClassName="sidebar-brand-gold-icon" />
        <nav className="side-nav edited-side-nav" aria-label="Main navigation">
          <p>EXPLORE</p>
          {nav.map(([label, icon]) => (
            <button
              key={label}
              className={`${active === label ? "active" : ""} ${label === "Today" ? "edited-today-nav" : ""}`}
              onClick={() => setActive(label)}
            >
              <Icon name={icon} /> <span>{label}</span>
            </button>
          ))}
          <p>ACCOUNT</p>
          <button
            onClick={() => setActive("Settings")}
            className={active === "Settings" ? "active" : ""}
          >
            <Icon name="settings" /> <span>Settings</span>
          </button>
          <button onClick={() => setActive("Help")} className={active === "Help" ? "active" : ""}>
            <Icon name="help" /> <span>Help & accessibility</span>
          </button>
        </nav>
        <button className="profile-card" onClick={() => setLoginOpen(true)}>
          <span className="avatar">{initials(travelerName)}</span>
          <span>
            <strong>{travelerName}</strong>
            <small>Traveler profile</small>
          </span>
          <span className="profile-arrow">›</span>
        </button>
      </aside>

      <main>
        <header className="topbar">
          <div className="mobile-brand">
            <Brand />
          </div>
          <div className="topbar-date">{todayLabel()}</div>
          <div className="top-actions">
            <span className="connection">
              <i /> Glasses connected
            </span>
            <button
              className="icon-button edited-notification-button"
              aria-label="Notifications"
              onClick={() => setNotice(!notice)}
            >
              <Icon name="bell" />
              {(!usingLive || recentAlert) && <b />}
            </button>
            {notice && (
              <div className="notification">
                {recentAlert
                  ? `${alertText(recentAlert).title}: ${alertText(recentAlert).detail} (${dayTime(recentAlert.created_at)})`
                  : "No new alerts. Your devices are ready."}
              </div>
            )}
          </div>
        </header>

        <div className="content">
          {usingLive && voyage.error && <div className="notification data-error">{voyage.error}</div>}
          {active === "Today" ? (
            <>
              <section className="welcome edited-welcome">
                <div>
                  <p className="eyebrow edited-welcome-eyebrow">THE VOYAGE CONTINUES</p>
                  <h1>
                    {greeting()}, {firstName}.
                  </h1>
                  <p>Your path to is clear. Your guide and glasses stand ready.</p>
                </div>
                <div className="weather">
                  <Icon name="sun" size={26} />
                  <span>
                    <strong>72°</strong>
                    <small>Clear skies</small>
                  </span>
                </div>
              </section>

              <section className="hero-card">
                <div className="hero-pattern" />
                <div className="hero-copy">
                  <span className="status-pill">
                    <i /> {liveCall ? "ON A CALL NOW" : "AGENT AVAILABLE"}
                  </span>
                  <h2 className="edited-hero-title">
                    Where shall the
                    <br />
                    voyage lead today?
                  </h2>
                  <p className="edited-hero-description">
                    Start a live video session. Your agent will see your surroundings and guide you
                    with voice and haptic signals.
                  </p>
                  <button
                    className="primary-button"
                    onClick={() => openCall(liveCall?.id ?? voyage.calls[0]?.id ?? null)}
                  >
                    <span>
                      <Icon name="video" size={21} />
                    </span>{" "}
                    {liveCall ? "Join live session" : "Start live session"}{" "}
                    <Icon name="arrow" size={18} />
                  </button>
                </div>
                <div className="hero-visual edited-hero-visual" aria-hidden="true">
                  <div className="compass-ring ring-one" />
                  <div className="compass-ring ring-two" />
                  <div className="compass">
                    <span>N</span>
                    <i />
                    <b />
                  </div>
                  <div className="wave wave-a" />
                  <div className="wave wave-b" />
                  <svg className="hero-ship" viewBox="0 0 260 120">
                    <path d="M21 78q104 35 216 0-29 38-105 38Q54 115 21 78Z" />
                    <path d="M122 78V12M124 18q46 15 67 52h-67ZM112 22Q77 42 55 68h57Z" />
                    <path d="M40 82q9-10 18 0m5 6q9-10 18 0m5 5q9-10 18 0m55-2q9-10 18 0m5-6q9-10 18 0" />
                  </svg>
                </div>
              </section>

              <section className="status-grid">
                <div className="status-card">
                  <span className="status-icon blue">
                    <Icon name="glasses" size={24} />
                  </span>
                  <div>
                    <small>SMART GLASSES</small>
                    <strong>Connected & ready</strong>
                    <span>
                      <i className="green-dot" /> 87% battery
                    </span>
                  </div>
                  <button aria-label="View glasses settings">
                    <Icon name="arrow" size={18} />
                  </button>
                </div>
                <div className="status-card">
                  <span className="status-icon sand">
                    <Icon name="signal" size={22} />
                  </span>
                  <div>
                    <small>HAPTIC GUIDANCE</small>
                    <strong>Proximity alerts on</strong>
                    <span>
                      {usingLive
                        ? `${alertsToday} alert${alertsToday === 1 ? "" : "s"} today`
                        : "Medium intensity"}
                    </span>
                  </div>
                  <button aria-label="View haptic settings">
                    <Icon name="arrow" size={18} />
                  </button>
                </div>
                <div className="status-card">
                  <span className="status-icon red">
                    <Icon name="people" size={23} />
                  </span>
                  <div>
                    <small>CARE CIRCLE</small>
                    <strong>
                      {usingLive
                        ? `${caregivers.length} ${caregivers.length === 1 ? "person" : "people"} available`
                        : "2 people available"}
                    </strong>
                    <span>
                      {usingLive ? caregivers.map((c) => c.name).join(" & ") : "Maya & Daniel"}
                    </span>
                  </div>
                  <button aria-label="View care circle" onClick={() => setActive("Care circle")}>
                    <Icon name="arrow" size={18} />
                  </button>
                </div>
              </section>

              <section className="mythic-section">
                <div className="mythic-heading">
                  <div>
                    <p className="eyebrow">THE TALE SO FAR</p>
                    <h3>Trials of the long voyage</h3>
                  </div>
                  <p>
                    Every obstacle becomes a landmark. Every landmark brings you closer to home.
                  </p>
                </div>
                <div className="mythic-grid">
                  {mythicChapters.map((chapter) => (
                    <article className="mythic-card" key={chapter.title}>
                      <div className="chapter-top">
                        <span>BOOK {chapter.number}</span>
                        <span>{chapter.place}</span>
                      </div>
                      <div className="vase-panel">
                        <VaseScene type={chapter.type} />
                      </div>
                      <div className="chapter-copy">
                        <h4>{chapter.title}</h4>
                        <p>{chapter.description}</p>
                        <span className="lesson">{chapter.lesson}</span>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section className="dashboard-grid">
                <JourneysPanel
                  items={journeys.slice(0, 3)}
                  onOpen={openCall}
                  onViewAll={() => setActive("My journeys")}
                />
                <ConversationsPanel
                  items={conversations.slice(0, 2)}
                  onOpen={openCall}
                  onViewAll={() => setActive("Conversations")}
                />
              </section>
            </>
          ) : active === "My journeys" && usingLive && journeys.length ? (
            <section className="dashboard-grid full-list">
              <JourneysPanel items={journeys} onOpen={openCall} />
            </section>
          ) : active === "Conversations" && usingLive && conversations.length ? (
            <section className="dashboard-grid full-list">
              <ConversationsPanel items={conversations} onOpen={openCall} />
            </section>
          ) : (
            <EmptySection
              title={active}
              onLive={() => openCall(liveCall?.id ?? voyage.calls[0]?.id ?? null)}
            />
          )}
        </div>
      </main>

      <nav className="mobile-nav edited-mobile-nav" aria-label="Mobile navigation">
        {nav.slice(0, 4).map(([label, icon]) => (
          <button
            key={label}
            className={active === label ? "active" : ""}
            onClick={() => setActive(label)}
          >
            <Icon
              name={icon}
              size={21}
              className={`${label === "Today" ? "mobile-icon-ink" : "mobile-icon-blue"} ${label === "My journeys" ? "edited-journeys-icon" : ""}`}
            />
            <span
              className={`mobile-label-blue ${label === "Today" || label === "My journeys" ? "edited-mobile-label-ink" : ""} ${label === "Conversations" || label === "Care circle" ? "edited-secondary-mobile-label-ink" : ""}`}
            >
              {label === "My journeys" ? "Journeys" : label}
            </span>
          </button>
        ))}
      </nav>

      {liveOpen && (
        <LiveSession
          callId={usingLive ? openCallId : null}
          travelerName={firstName}
          onClose={() => setLiveOpen(false)}
        />
      )}
      {(loginOpen || mustSignIn) && (
        <LoginModal
          role={role}
          setRole={setRole}
          mandatory={mustSignIn}
          signedIn={signedIn}
          travelerName={firstName}
          caregiverName={usingLive ? caregiverName : "Maya"}
          onClose={() => setLoginOpen(false)}
        />
      )}
    </div>
  );
}

function JourneysPanel({
  items,
  onOpen,
  onViewAll,
}: {
  items: JourneyItem[];
  onOpen: (id: string | null) => void;
  onViewAll?: () => void;
}) {
  return (
    <div className="panel journeys-panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">RECENT PATHS</p>
          <h3>Places you’ve been</h3>
        </div>
        {onViewAll && (
          <button onClick={onViewAll}>
            View all <Icon name="arrow" size={15} />
          </button>
        )}
      </div>
      <div className="map-art">
        <svg viewBox="0 0 700 170" preserveAspectRatio="none" aria-hidden="true">
          <path d="M-20 130 C70 95,110 150,200 107 S350 28,455 82 S590 150,730 55" />
          <path
            className="map-road"
            d="M35 15 C125 80,160 12,255 65 S410 160,515 92 S625 23,710 48"
          />
        </svg>
        <span className="map-pin pin-a">
          <Icon name="map" size={15} />
        </span>
        <span className="map-pin pin-b">
          <Icon name="map" size={15} />
        </span>
        <span className="map-pin pin-c">
          <Icon name="map" size={15} />
        </span>
      </div>
      <div className="journey-list">
        {items.map((item) => (
          <button className="journey-row" key={item.id ?? item.place} onClick={() => onOpen(item.id)}>
            <span className="place-dot" style={{ backgroundColor: item.color }}>
              <Icon name="map" size={17} />
            </span>
            <span className="journey-info">
              <strong>{item.place}</strong>
              <small>{item.detail}</small>
            </span>
            <span className="journey-time">{item.meta}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ConversationsPanel({
  items,
  onOpen,
  onViewAll,
}: {
  items: ConversationItem[];
  onOpen: (id: string | null) => void;
  onViewAll?: () => void;
}) {
  return (
    <div className="panel conversations-panel edited-conversations-panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">AGENT NOTES</p>
          <h3>Recent conversations</h3>
        </div>
        {onViewAll && (
          <button onClick={onViewAll}>
            View all <Icon name="arrow" size={15} />
          </button>
        )}
      </div>
      {items.map((item) => (
        <article className="conversation" key={item.id ?? item.title}>
          <div className="conversation-meta">
            <span>
              <Icon name="chat" size={15} /> {item.time}
            </span>
            <span>
              <Icon name="clock" size={14} /> {item.length}
            </span>
          </div>
          <h4>{item.title}</h4>
          <p>{item.summary}</p>
          <button onClick={() => onOpen(item.id)}>
            Read summary <Icon name="arrow" size={14} />
          </button>
        </article>
      ))}
    </div>
  );
}

function EmptySection({ title, onLive }: { title: string; onLive: () => void }) {
  const descriptions: Record<string, string> = {
    "My journeys": "Review saved routes and every place your agent helped you navigate.",
    Conversations: "Read summaries and notes from your recent live sessions.",
    "Care circle": "Manage the trusted people who can support your journey.",
    Settings: "Adjust your devices, haptic language, voice, and privacy preferences.",
    Help: "Accessibility help, device tutorials, and support are always close at hand.",
  };
  return (
    <section className="empty-section">
      <p className="eyebrow edited-empty-eyebrow">NAVASSEY</p>
      <h1>{title}</h1>
      <p>{descriptions[title]}</p>
      <div className="empty-card edited-empty-card">
        <span>
          <Icon
            name={title === "Care circle" ? "people" : title === "Settings" ? "settings" : "route"}
            size={32}
          />
        </span>
        <h2>Your path, remembered.</h2>
        <p>This area is ready for your next journey. Start a live session to add new activity.</p>
        <button className="primary-button edited-empty-primary" onClick={onLive}>
          Start live session
        </button>
      </div>
    </section>
  );
}

/**
 * The session modal. With a callId it shows that call from Supabase, live:
 * the last agent line as the caption, the last haptic alert, and the transcript.
 * Without one (design preview mode) it shows the original sample content.
 */
function LiveSession({
  callId,
  travelerName,
  onClose,
}: {
  callId: string | null;
  travelerName: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"video" | "messages">("video");
  const [muted, setMuted] = useState(false);
  const log = useCallLog(callId);
  const call = callId ? log.call : null;
  const isLive = Boolean(call && !call.ended_at);

  // Tick the call timer once a second while live.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!isLive) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isLive]);

  const lastAgent: Message | undefined = [...log.messages].reverse().find((m) => m.role === "agent");
  const lastAlert: Alert | undefined = log.alerts.at(-1);
  const lastObstacle = [...log.alerts].reverse().find((a) => a.type === "obstacle");
  const cue = lastAlert ? alertText(lastAlert) : null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Live agent session">
      <div className="live-modal">
        <div className="live-head">
          <div>
            <span className="live-pulse">
              <i />
            </span>
            <strong>{call && !isLive ? `Voyage log · ${dayTime(call.started_at)}` : "Live with Nia"}</strong>
            <small>AI navigation agent · {call ? clock(call, now) : "00:24"}</small>
          </div>
          <button onClick={onClose} aria-label="Close session">
            <Icon name="close" />
          </button>
        </div>
        <div className="live-tabs">
          <button className={tab === "video" ? "active" : ""} onClick={() => setTab("video")}>
            Agent view
          </button>
          <button className={tab === "messages" ? "active" : ""} onClick={() => setTab("messages")}>
            Transcript
          </button>
        </div>
        {tab === "video" ? (
          <div className="video-view">
            <div className="video-scene">
              <div className="horizon" />
              <div className="pathway" />
              <span className="detection-box">
                {call ? (
                  lastObstacle && lastObstacle.distance_cm != null ? (
                    <>
                      OBSTACLE <b>{(lastObstacle.distance_cm / 100).toFixed(1)}m</b>
                    </>
                  ) : (
                    <>CLEAR PATH</>
                  )
                ) : (
                  <>
                    CLEAR PATH <b>3.2m</b>
                  </>
                )}
              </span>
              <div className="agent-caption">
                {call
                  ? lastAgent
                    ? `“${lastAgent.text}”`
                    : "Waiting for the guide to speak…"
                  : "“The path ahead is clear. There’s a doorway about three meters to your right.”"}
              </div>
            </div>
            <div className="haptic-strip">
              <Icon name="signal" />
              <span>
                <strong>{call ? (cue?.title ?? "No haptic cues yet") : "Haptic cue sent"}</strong>
                <small>{call ? (cue?.detail ?? "Alerts appear here as they happen") : "Two short pulses · turn right"}</small>
              </span>
              <i>{call ? (cue?.pattern ?? "") : "·· —"}</i>
            </div>
          </div>
        ) : call ? (
          <div className="transcript">
            {call.summary && (
              <p>
                <strong>Summary</strong>
                <span className="summary-text">{call.summary}</span>
              </p>
            )}
            {log.messages.map((m) => (
              <p key={m.id}>
                <strong>{m.role === "user" ? travelerName : "Nia · Agent"}</strong>
                <span>{m.text}</span>
              </p>
            ))}
            {!log.messages.length && (
              <p>
                <strong>Nia · Agent</strong>
                <span>{log.loading ? "Loading the transcript…" : "No words spoken yet."}</span>
              </p>
            )}
          </div>
        ) : (
          <div className="transcript">
            <p>
              <strong>You</strong>
              <span>Can you help me find the entrance?</span>
            </p>
            <p>
              <strong>Nia · Agent</strong>
              <span>
                Of course. Continue straight for three meters, then turn right. I’m sending a haptic
                cue now.
              </span>
            </p>
          </div>
        )}
        <div className="live-controls">
          <button className={muted ? "control-on" : ""} onClick={() => setMuted(!muted)}>
            <Icon name="signal" />
            <span>{muted ? "Voice off" : "Voice on"}</span>
          </button>
          <button className="end-call" onClick={onClose}>
            {call && !isLive ? "Close log" : "End session"}
          </button>
          <button onClick={() => setTab("messages")}>
            <Icon name="chat" />
            <span>Message</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Sign-in modal. Caregiver signs in with Supabase email + password
 * (the account `npm run seed` creates). When Supabase is configured and nobody
 * is signed in, the modal is `mandatory` and cannot be closed.
 */
function LoginModal({
  role,
  setRole,
  mandatory,
  signedIn,
  travelerName,
  caregiverName,
  onClose,
}: {
  role: "traveler" | "caregiver";
  setRole: (role: "traveler" | "caregiver") => void;
  mandatory: boolean;
  signedIn: boolean;
  travelerName: string;
  caregiverName: string;
  onClose: () => void;
}) {
  const [blind, setBlind] = useState(true);
  const [deaf, setDeaf] = useState(false);
  const [email, setEmail] = useState("penelope@ithaca.dev");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsPassword = supabaseConfigured && !signedIn && role === "caregiver";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!supabaseConfigured || signedIn) return onClose();
    if (role === "traveler") {
      setError("Travelers sign in on their glasses. Choose Caregiver to open the dashboard.");
      return;
    }
    setBusy(true);
    try {
      await signIn(email.trim(), password);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="modal-backdrop login-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Switch profile"
    >
      <form className="login-modal" onSubmit={submit}>
        {!mandatory && (
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        )}
        <Brand />
        <p className="eyebrow">WELCOME ABOARD</p>
        <h2>Choose how you journey.</h2>
        <p className="login-intro">Sign in as a traveler or as someone in their care circle.</p>
        <div className="role-grid">
          <button
            type="button"
            className={role === "traveler" ? "selected" : ""}
            onClick={() => setRole("traveler")}
          >
            <span>
              <Icon name="user" size={24} />
            </span>
            <strong>Traveler</strong>
            <small>Navigate with your agent</small>
            {role === "traveler" && (
              <i>
                <Icon name="check" size={13} />
              </i>
            )}
          </button>
          <button
            type="button"
            className={role === "caregiver" ? "selected" : ""}
            onClick={() => setRole("caregiver")}
          >
            <span>
              <Icon name="shield" size={24} />
            </span>
            <strong>Caregiver</strong>
            <small>Support someone’s journey</small>
            {role === "caregiver" && (
              <i>
                <Icon name="check" size={13} />
              </i>
            )}
          </button>
        </div>
        {role === "traveler" && (
          <div className="access-needs">
            <label>ACCESSIBILITY PROFILE</label>
            <button type="button" onClick={() => setBlind(!blind)} className={blind ? "checked" : ""}>
              <i>{blind && <Icon name="check" size={13} />}</i> I am blind or have low vision
            </button>
            <button type="button" onClick={() => setDeaf(!deaf)} className={deaf ? "checked" : ""}>
              <i>{deaf && <Icon name="check" size={13} />}</i> I am Deaf or hard of hearing
            </button>
          </div>
        )}
        {needsPassword && (
          <div className="access-needs login-fields">
            <label htmlFor="login-email">CAREGIVER SIGN IN</label>
            <input
              id="login-email"
              className="login-input"
              type="email"
              autoComplete="username"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              className="login-input"
              type="password"
              autoComplete="current-password"
              placeholder="Password"
              aria-label="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
        )}
        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}
        <button className="sign-in-button" type="submit" disabled={busy}>
          {busy
            ? "Signing in…"
            : needsPassword
              ? "Sign in as caregiver"
              : `Continue as ${role === "traveler" ? travelerName : caregiverName}`}{" "}
          <Icon name="arrow" size={18} />
        </button>
        <p className="privacy">
          <Icon name="shield" size={14} /> Your journey data is private and encrypted.
        </p>
        {signedIn && (
          <button
            type="button"
            className="sign-out-link"
            onClick={async () => {
              await signOut();
              onClose();
            }}
          >
            Sign out
          </button>
        )}
      </form>
    </div>
  );
}

export default App;
