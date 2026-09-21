"use client";
import { useState, useEffect, type FormEvent } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  ArrowDown,
  ArrowUpRight,
  Activity,
  LayoutDashboard,
  ListChecks,
  Settings2,
  MessageSquare,
  Plus,
  Play,
  Pause,
  RefreshCw,
  ShieldCheck,
  ChevronRight,
  Check,
  Clock3,
  Radio,
  Link2,
  Users,
  Trophy,
  Wallet,
  ExternalLink,
  LoaderCircle,
  Search,
  AlertCircle,
} from "lucide-react";
import type { dashboardData } from "@/lib/db";
import type { Action, Settings } from "@/lib/types";
type Data = Awaited<ReturnType<typeof dashboardData>>;
const Chat = dynamic(() => import("./chat").then((m) => m.Chat), {
  loading: () => <div className="empty">Opening Eve…</div>,
});
const nav = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "activity", label: "Activity", icon: Activity },
  { id: "decisions", label: "Decisions", icon: ListChecks },
  { id: "chat", label: "Ask Eve", icon: MessageSquare },
];
function date(value: string | null) {
  return value
    ? new Date(value).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/New_York",
      })
    : "Not yet";
}
function Badge({ status }: { status: string }) {
  return (
    <span
      className={`badge ${["verified", "completed", "sent"].includes(status) ? "green" : ["failed", "unknown"].includes(status) ? "amber" : ""}`}
    >
      <span />
      {status.replaceAll("_", " ")}
    </span>
  );
}
async function post(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed.");
  return data;
}
export function Dashboard({
  initial,
  section,
}: {
  initial: Data;
  section: string;
}) {
  const [data, setData] = useState(initial);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const active = data.reviews.some((r) =>
    ["queued", "running"].includes(r.status),
  );
  async function refresh() {
    const res = await fetch("/api/dashboard");
    if (res.status === 401) {
      window.location.assign("/login");
      return;
    }
    if (!res.ok) throw new Error("Could not refresh the dashboard.");
    setData(await res.json());
  }
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      void refresh().catch(() =>
        setNotice(
          "Connection interrupted. Refresh to check the review status.",
        ),
      );
    }, 5000);
    return () => clearInterval(timer);
  }, [active]);
  async function act(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setNotice("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy("");
    }
  }
  const settings = data.settings;
  const snapshot = data.snapshot;
  const own = snapshot?.standings.find((t) => t.id === settings.teamId);
  const pending = data.actions.filter((a) =>
    ["proposed", "awaiting_approval"].includes(a.status),
  );
  const title =
    section === "overview"
      ? "Front office"
      : (nav.find((n) => n.id === section)?.label ?? "Connections & settings");
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/">
          <span className="brand-mark">e</span>eve
          <span className="version">FANTASY</span>
        </Link>
        <div className="workspace">
          <div className="team-icon">
            <Trophy size={17} />
          </div>
          <div>
            <strong>{snapshot?.teamName ?? "Your front office"}</strong>
            <span>{snapshot?.leagueName ?? "One team. One manager."}</span>
          </div>
          <ChevronRight size={15} />
        </div>
        <span className="nav-label">WORKSPACE</span>
        <nav>
          {nav.map((n) => (
            <Link
              href={n.id === "overview" ? "/" : `/${n.id}`}
              key={n.id}
              className={section === n.id ? "selected" : ""}
            >
              <n.icon size={18} />
              {n.label}
              {n.id === "decisions" && pending.length > 0 ? (
                <span className="count">{pending.length}</span>
              ) : null}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="manager-status">
            <span className={`status-dot ${settings.paused ? "paused" : ""}`} />
            <div>
              <strong>
                {settings.paused
                  ? "Eve is paused"
                  : settings.scheduled
                    ? "Eve is on the clock"
                    : "Eve is standing by"}
              </strong>
              <span>
                {settings.scheduled
                  ? `${settings.digestHour}:00 daily · ${settings.timezone.split("/").at(-1)?.replaceAll("_", " ")}`
                  : "Connect your team to begin"}
              </span>
            </div>
          </div>
          <Link
            href="/settings"
            className={`settings-link ${section === "settings" ? "selected" : ""}`}
          >
            <Settings2 size={17} />
            Settings
            <ArrowUpRight size={15} />
          </Link>
          <div className="owner-avatar">
            <span>S</span>
            <div>
              <strong>Your private workspace</strong>
              <small>Personal account</small>
            </div>
            <ShieldCheck size={16} />
          </div>
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <div>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{title}</strong>
          </div>
          <Link href="/settings" className="private-label">
            <Settings2 size={14} />
            Settings
          </Link>
        </header>
        <main className="content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {section === "overview"
                  ? "THE LONG GAME"
                  : section.toUpperCase()}
              </span>
              <h1>
                {section === "overview"
                  ? snapshot
                    ? "Your week, under control."
                    : "Your team. Handled."
                  : title}
              </h1>
              <p>
                {section === "overview"
                  ? "The latest on your league, and the thinking behind every move."
                  : section === "activity"
                    ? "A clear record of what Eve checked, considered, and did."
                    : section === "decisions"
                      ? "Every move starts with a reason. You set the boundaries."
                      : section === "settings"
                        ? "Connect your league and decide how Eve works for you."
                        : "A second opinion, with the whole league in view."}
              </p>
            </div>
            <div className="heading-actions">
              {section !== "settings" && (
                <button
                  className="subtle icon-button"
                  aria-label="Refresh dashboard"
                  disabled={Boolean(busy)}
                  onClick={() => act("refresh", refresh)}
                >
                  <RefreshCw
                    size={16}
                    className={busy === "refresh" ? "spin" : ""}
                  />
                </button>
              )}
              <button
                className="primary"
                disabled={
                  !data.connected || active || settings.paused || Boolean(busy)
                }
                onClick={() =>
                  act("review", async () => {
                    const result = await post("/api/reviews");
                    setNotice(
                      result.started
                        ? "Eve is reviewing your team. You can leave this page; the run will continue."
                        : "A review is already active or this scheduled check is complete.",
                    );
                  })
                }
              >
                {busy === "review" || active ? (
                  <LoaderCircle size={16} className="spin" />
                ) : (
                  <Play size={15} />
                )}{" "}
                {active ? "Review in progress" : "Run a review"}
              </button>
            </div>
          </div>
          {data.gatewayHealth?.status === "blocked" && (
            <div className="notice">
              <AlertCircle size={17} />
              <span>{data.gatewayHealth.message}</span>
              <a
                href="https://vercel.com/httpsamcs-projects/~/ai-gateway"
                target="_blank"
                rel="noreferrer"
              >
                Open Gateway <ArrowUpRight size={14} />
              </a>
            </div>
          )}
          {notice && (
            <div className="notice" role="status">
              <AlertCircle size={17} />
              <span>{notice}</span>
              <button
                aria-label="Dismiss notification"
                onClick={() => setNotice("")}
              >
                ×
              </button>
            </div>
          )}
          {section === "overview" && (
            <>
              {!data.connected ? (
                <section className="welcome-panel">
                  <div>
                    <span className="tag">
                      <span className="status-dot" /> YOUR MANAGER IS READY
                    </span>
                    <h2>Meet your unfair advantage.</h2>
                    <p>
                      Eve follows the news, weighs your options, and keeps you
                      in the loop.
                      <br />
                      Start by connecting your ESPN team.
                    </p>
                    <Link className="primary" href="/settings">
                      <Plus size={16} />
                      Connect your team
                      <ArrowUpRight size={16} />
                    </Link>
                    <small>
                      <ShieldCheck size={13} />
                      Private connection · You control every permission
                    </small>
                  </div>
                  <div className="playbook" aria-hidden="true">
                    <div className="field-line" />
                    <span className="player-dot p1" />
                    <span className="player-dot p2" />
                    <span className="player-dot p3" />
                    <span className="player-dot p4" />
                    <span className="player-dot p5" />
                    <svg viewBox="0 0 300 220">
                      <path d="M60 170 L60 110 Q60 85 95 85 L225 85" />
                      <path d="M130 180 L130 135 Q130 120 155 120 L225 120" />
                      <path d="M190 180 L190 160 L240 160" />
                      <path d="M210 73 L225 85 L210 97" />
                    </svg>
                    <span className="diagram-label">
                      A PLAN FOR EVERY PLAY.
                    </span>
                  </div>
                </section>
              ) : (
                <section className="briefing panel">
                  <span className="eyebrow">
                    <Radio size={13} /> EVE’S LATEST BRIEFING
                  </span>
                  <h2>
                    {data.reviews.find((r) => r.status === "completed")
                      ? "Here’s where we stand."
                      : "Your team is connected."}
                  </h2>
                  <p>
                    {data.reviews.find((r) => r.status === "completed")
                      ?.summary ??
                      "Run your first review to get a researched assessment of your lineup, opportunities, and league position."}
                  </p>
                  <Link href="/activity">
                    Read the full review <ArrowUpRight size={15} />
                  </Link>
                </section>
              )}
              <div className="stats-grid">
                {[
                  {
                    label: "LEAGUE POSITION",
                    value: own
                      ? `${own.rank}${own.rank === 1 ? "st" : own.rank === 2 ? "nd" : own.rank === 3 ? "rd" : "th"}`
                      : "—",
                    detail: own
                      ? `of ${snapshot?.standings.length} teams`
                      : "Waiting for your league",
                    icon: Trophy,
                  },
                  {
                    label: "SEASON RECORD",
                    value: own
                      ? `${own.wins} – ${own.losses}${own.ties ? ` – ${own.ties}` : ""}`
                      : "—",
                    detail: own
                      ? `${own.pointsFor.toFixed(1)} points for`
                      : "A fresh start",
                    icon: Users,
                  },
                  {
                    label: "MOVES TO REVIEW",
                    value: String(pending.length).padStart(2, "0"),
                    detail: pending.length
                      ? "Your call, whenever you’re ready"
                      : "Nothing needs your attention",
                    icon: ListChecks,
                  },
                  {
                    label: "MODEL SPEND",
                    value: `$${data.monthCost.toFixed(2)}`,
                    detail: `$${settings.monthlyAiBudget.toFixed(0)} monthly model budget`,
                    icon: Wallet,
                  },
                ].map((s) => (
                  <section className="stat-card" key={s.label}>
                    <div>
                      <span className="eyebrow">{s.label}</span>
                      <s.icon size={16} />
                    </div>
                    <strong>{s.value}</strong>
                    <span>{s.detail}</span>
                  </section>
                ))}
              </div>
              <div className="two-column">
                <section className="panel">
                  <header className="panel-heading">
                    <h2>This week’s matchup</h2>
                    <span className="small muted">
                      {snapshot
                        ? `Period ${snapshot.matchupPeriod}`
                        : "NOT CONNECTED"}
                    </span>
                  </header>
                  {snapshot ? (
                    <div className="matchup">
                      <div>
                        <span className="team-icon big">
                          <Trophy size={24} />
                        </span>
                        <strong>{snapshot.teamName}</strong>
                        <b>{snapshot.score.toFixed(1)}</b>
                        <span>YOUR TEAM</span>
                      </div>
                      <span className="versus">VS</span>
                      <div>
                        <span className="team-icon big opposing">
                          <Users size={24} />
                        </span>
                        <strong>
                          {snapshot.opponent?.name ?? "No opponent"}
                        </strong>
                        <b>{snapshot.opponent?.score.toFixed(1) ?? "—"}</b>
                        <span>OPPONENT</span>
                      </div>
                    </div>
                  ) : (
                    <div className="empty compact">
                      <Users size={28} />
                      <h3>Your next matchup starts here.</h3>
                      <p>
                        Connect ESPN to see your opponent, score,
                        <br />
                        and how your team stacks up.
                      </p>
                    </div>
                  )}
                  <footer className="panel-footer">
                    <Clock3 size={13} />
                    {snapshot
                      ? `ESPN · Updated ${date(snapshot.fetchedAt)}`
                      : "Live league data will appear after connection"}
                  </footer>
                </section>
                <section className="panel">
                  <header className="panel-heading">
                    <h2>The manager’s notebook</h2>
                    <Link href="/activity" aria-label="View all activity">
                      <ArrowUpRight size={18} />
                    </Link>
                  </header>
                  {data.reviews.length ? (
                    <div className="notebook">
                      {data.reviews.slice(0, 3).map((r) => (
                        <Link href="/activity" key={r.id}>
                          <span className="notebook-icon">
                            <Search size={17} />
                          </span>
                          <div>
                            <strong>
                              {r.summary?.split(".")[0]?.slice(0, 80) ??
                                `${r.trigger} review`}
                            </strong>
                            <span>{date(r.started_at)}</span>
                          </div>
                          <Badge status={r.status} />
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="empty compact">
                      <Activity size={28} />
                      <h3>Every decision has a story.</h3>
                      <p>
                        Research, lineup calls, and moves considered.
                        <br />
                        You’ll see the whole picture here.
                      </p>
                    </div>
                  )}
                  <footer className="panel-footer">
                    <ShieldCheck size={13} />
                    Recommendations and completed moves are recorded separately
                  </footer>
                </section>
              </div>
              <section className="panel roster-panel">
                <header className="panel-heading">
                  <div>
                    <h2>Your roster</h2>
                    <p className="small muted">The players behind the plan.</p>
                  </div>
                  <span className="badge">
                    {snapshot
                      ? `${snapshot.roster.length} PLAYERS`
                      : "AWAITING CONNECTION"}
                  </span>
                </header>
                {snapshot ? (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>SLOT</th>
                          <th>PLAYER</th>
                          <th>STATUS</th>
                          <th>PROJECTED</th>
                          <th>ACTUAL</th>
                        </tr>
                      </thead>
                      <tbody>
                        {snapshot.roster.map((p) => (
                          <tr key={p.id}>
                            <td>
                              <span className="slot">{p.slot}</span>
                            </td>
                            <td>
                              <strong>{p.name}</strong>
                              <small>
                                {p.proTeam} · {p.position}
                              </small>
                            </td>
                            <td>
                              <Badge status={p.injury.toLowerCase()} />
                            </td>
                            <td className="number">
                              {p.projected?.toFixed(1) ?? "—"}
                            </td>
                            <td className="number">
                              {p.actual?.toFixed(1) ?? "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="roster-placeholder">
                    <div>
                      <span className="slot">01</span>
                      <span>Bring your team into focus</span>
                    </div>
                    <p>
                      Your starters, bench, availability, and ESPN projections
                      in one place.
                    </p>
                    <Link href="/settings">
                      Connect ESPN <ArrowUpRight size={15} />
                    </Link>
                  </div>
                )}
              </section>
            </>
          )}
          {section === "activity" && (
            <div className="activity-list">
              {data.reviews.length ? (
                data.reviews.map((r) => (
                  <section className="panel review-card" key={r.id}>
                    <header className="panel-heading">
                      <div>
                        <span className="eyebrow">{r.trigger}</span>
                        <h2>{date(r.started_at)}</h2>
                      </div>
                      <Badge status={r.status} />
                    </header>
                    <p className={r.error ? "error" : "review-summary"}>
                      {r.summary ??
                        r.error ??
                        "Eve is gathering your league data and checking current news."}
                    </p>
                    {r.evidence?.length > 0 && (
                      <div className="sources">
                        {r.evidence.map((s, i) => (
                          <a
                            href={s.url}
                            key={i}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <ExternalLink size={13} />
                            {s.title}
                          </a>
                        ))}
                      </div>
                    )}
                    <div className="review-actions">
                      {data.actions
                        .filter((a) => a.review_id === r.id)
                        .map((a) => (
                          <ActionCard
                            key={a.id}
                            action={a}
                            busy={busy}
                            act={act}
                          />
                        ))}
                    </div>
                    <footer className="panel-footer">
                      Model cost ${Number(r.model_cost).toFixed(4)} ·{" "}
                      {r.completed_at
                        ? `Finished ${date(r.completed_at)}`
                        : "Durable run continues in the background"}
                    </footer>
                  </section>
                ))
              ) : (
                <Empty
                  title="The notebook is ready."
                  text="Your first review will create a permanent record of Eve’s research and recommendations."
                />
              )}
            </div>
          )}
          {section === "decisions" && (
            <>
              <div className="policy-banner">
                <ShieldCheck size={20} />
                <div>
                  <strong>Your permissions come first.</strong>
                  <p>
                    Lineups: {settings.lineupMode}. Waivers:{" "}
                    {settings.waiverMode}. Trades: {settings.tradeMode}.{" "}
                    {data.lineupWritesEnabled
                      ? "Lineup execution is enabled."
                      : "Live ESPN writes are disabled for this deployment."}
                  </p>
                </div>
                <Link href="/settings">
                  Edit policy <ArrowUpRight size={14} />
                </Link>
              </div>
              <section className="panel" style={{ marginBottom: 20 }}>
                <header className="panel-heading">
                  <div>
                    <h2>ESPN trade inbox</h2>
                    <p className="small muted">
                      Incoming offers and their actual status, separate from
                      Eve’s proposals.
                    </p>
                  </div>
                  <button
                    className="subtle"
                    disabled={Boolean(busy)}
                    onClick={() =>
                      act("trade-inbox", () => post("/api/trade-inbox"))
                    }
                  >
                    <RefreshCw size={14} />
                    Refresh inbox
                  </button>
                </header>
                {!data.tradeInbox ? (
                  <div className="empty compact">
                    <p>Refresh to check ESPN for received trade offers.</p>
                  </div>
                ) : data.tradeInbox.status === "error" ? (
                  <div className="notice" role="alert">
                    {data.tradeInbox.error}
                  </div>
                ) : (
                  <div className="review-actions">
                    {[
                      ...data.tradeInbox.incoming,
                      ...data.tradeInbox.outgoing,
                      ...data.tradeInbox.history,
                    ].length ? (
                      [
                        ...data.tradeInbox.incoming,
                        ...data.tradeInbox.outgoing,
                        ...data.tradeInbox.history,
                      ].map((offer) => (
                        <article className="action-card" key={offer.id}>
                          <header>
                            <span className="eyebrow">{offer.direction}</span>
                            <Badge status={offer.status.toLowerCase()} />
                          </header>
                          <h3>
                            {offer.direction === "incoming" ? "From" : "To"}{" "}
                            {offer.counterpartyName}
                          </h3>
                          <ul className="transaction-terms">
                            <li>
                              Give: {offer.give.map((p) => p.name).join(", ")}
                            </li>
                            <li>
                              Receive:{" "}
                              {offer.receive.map((p) => p.name).join(", ")}
                            </li>
                          </ul>
                          <p className="small muted">
                            Received {date(offer.createdAt)}
                            {offer.expiresAt
                              ? ` · Expires ${date(offer.expiresAt)}`
                              : ""}
                          </p>
                        </article>
                      ))
                    ) : (
                      <p className="small muted">
                        No trade offers returned by ESPN.
                      </p>
                    )}
                  </div>
                )}
                {data.tradeInbox && (
                  <footer className="panel-footer">
                    Checked {date(data.tradeInbox.checkedAt)} ·{" "}
                    {data.tradeInbox.status === "ok"
                      ? `${data.tradeInbox.incoming.length} active incoming · ${data.tradeInbox.history.length} past offers`
                      : "Inbox unavailable"}
                  </footer>
                )}
              </section>
              {data.actions.filter((a) => a.proposal.kind !== "hold").length ? (
                <div className="decision-grid">
                  {data.actions
                    .filter((a) => a.proposal.kind !== "hold")
                    .map((a) => (
                      <ActionCard key={a.id} action={a} busy={busy} act={act} />
                    ))}
                </div>
              ) : (
                <Empty
                  title="No moves on the table. Yet."
                  text="Eve will bring you lineup opportunities, waiver candidates, and trade ideas with a reason for each."
                />
              )}
            </>
          )}
          {section === "settings" && (
            <SettingsPanel
              data={data}
              onRefresh={refresh}
              act={act}
              busy={busy}
              setNotice={setNotice}
            />
          )}
          {section === "chat" && <Chat />}
          <footer className="page-footer">
            <span>
              <span className="mini-mark">e</span>A thoughtful manager. A
              better-informed team.
            </span>
            <span>Eve · ESPN · AI Gateway</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <section className="panel empty large-empty">
      <span className="brand-mark large">e</span>
      <h2>{title}</h2>
      <p>{text}</p>
    </section>
  );
}
function ActionCard({
  action: a,
  busy,
  act,
}: {
  action: Action;
  busy: string;
  act: (key: string, fn: () => Promise<unknown>) => Promise<void>;
}) {
  const pending = ["proposed", "awaiting_approval"].includes(a.status);
  const expired = new Date(a.expires_at).getTime() < Date.now();
  return (
    <article className="action-card">
      <header>
        <span className="eyebrow">{a.proposal.kind}</span>
        <Badge status={pending && expired ? "expired" : a.status} />
      </header>
      <h3>{a.proposal.title}</h3>
      <p>{a.proposal.rationale}</p>
      {a.proposal.terms?.length ? (
        <ul className="transaction-terms">
          {a.proposal.terms.map((term, i) => (
            <li key={i}>{term}</li>
          ))}
        </ul>
      ) : null}
      {a.proposal.expectedGain !== null && (
        <span className="gain">
          {a.proposal.expectedGain >= 0 ? "+" : ""}
          {a.proposal.expectedGain.toFixed(1)} projected points
        </span>
      )}
      {a.proposal.sources.length > 0 && (
        <div className="sources">
          {a.proposal.sources.map((s, i) => (
            <a key={i} href={s.url} target="_blank" rel="noreferrer">
              {s.title}
              <ExternalLink size={11} />
            </a>
          ))}
        </div>
      )}
      {a.result && <p className="small muted">{a.result}</p>}
      {pending && !expired && (
        <footer>
          <button
            className="subtle"
            disabled={Boolean(busy)}
            onClick={() =>
              act(a.id, () =>
                post("/api/actions", { id: a.id, action: "skip" }),
              )
            }
          >
            Skip
          </button>
          <button
            className="primary"
            disabled={Boolean(busy)}
            onClick={() =>
              act(a.id, () =>
                post("/api/actions", { id: a.id, action: "approve" }),
              )
            }
          >
            {busy === a.id ? (
              <LoaderCircle className="spin" size={14} />
            ) : (
              <Check size={14} />
            )}
            Approve
          </button>
        </footer>
      )}
    </article>
  );
}
function SettingsPanel({
  data,
  onRefresh,
  act,
  busy,
  setNotice,
}: {
  data: Data;
  onRefresh: () => Promise<void>;
  act: (key: string, fn: () => Promise<unknown>) => Promise<void>;
  busy: string;
  setNotice: (message: string) => void;
}) {
  const [form, setForm] = useState<Settings>(data.settings);
  const [protectedText, setProtectedText] = useState(
    data.settings.protectedPlayers.join(", "),
  );
  const preferences = () => ({
    ...form,
    protectedPlayers: protectedText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  });
  const [teams, setTeams] = useState<{ id: number; name: string }[]>([]);
  const [teamId, setTeamId] = useState(data.settings.teamId);
  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const node = event.currentTarget;
    const f = new FormData(node);
    await act("connect", async () => {
      const result = await post("/api/connect", {
        league: f.get("league"),
        sport: f.get("sport"),
        season: Number(f.get("season")),
        teamId,
        espnS2: f.get("espnS2"),
        swid: f.get("swid"),
      });
      if (result.teams) {
        setTeams(result.teams);
        setNotice("League found. Select your team and connect.");
      } else {
        node.reset();
        setTeams([]);
        setNotice(
          `Connected ${result.teamName}. Run your first review when you’re ready.`,
        );
        await onRefresh();
      }
    });
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    await act("settings", async () => {
      await post("/api/settings", preferences());
      setNotice("Settings saved.");
    });
  }
  return (
    <div className="settings-grid">
      <section className="panel settings-card">
        <header className="panel-heading">
          <div className="icon-heading">
            <span className="team-icon espn-logo">E</span>
            <div>
              <h2>ESPN connection</h2>
              <p className="small muted">Your league is the source of truth.</p>
            </div>
          </div>
          <Badge status={data.connected ? "connected" : "not connected"} />
        </header>
        <form onSubmit={connect} className="form-grid">
          <label className="full">
            League URL or ID
            <input
              name="league"
              required
              defaultValue={data.settings.leagueId}
              placeholder="https://fantasy.espn.com/football/team?leagueId=…"
            />
          </label>
          <label>
            Sport
            <select name="sport" defaultValue={data.settings.sport}>
              <option value="football">NFL football</option>
              <option value="basketball">NBA basketball</option>
            </select>
          </label>
          <label>
            Season
            <input
              name="season"
              type="number"
              min={2020}
              max={2100}
              defaultValue={data.settings.season}
              required
            />
          </label>
          {teams.length > 0 && (
            <label className="full">
              Your team
              <select
                value={teamId}
                onChange={(e) => setTeamId(Number(e.target.value))}
                required
              >
                <option value={0}>Choose your team</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="form-divider full" />
          <div className="full">
            <h3>Connect your ESPN session</h3>
            <p className="small muted">
              While signed into ESPN, open browser DevTools → Application →
              Cookies → fantasy.espn.com. Copy these two values. They’re
              encrypted before storage and never sent to the model.
            </p>
          </div>
          <label className="full">
            espn_s2
            <input
              name="espnS2"
              type="password"
              autoComplete="off"
              required
              placeholder="Paste your ESPN session cookie"
            />
          </label>
          <label className="full">
            SWID
            <input
              name="swid"
              type="password"
              autoComplete="off"
              required
              placeholder="{xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx}"
            />
          </label>
          <button className="primary full" disabled={Boolean(busy)}>
            {busy === "connect" ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <Link2 size={16} />
            )}{" "}
            {teams.length ? "Connect selected team" : "Verify ESPN connection"}
          </button>
        </form>
      </section>
      <form onSubmit={save} className="settings-stack">
        <section className="panel settings-card">
          <header className="panel-heading">
            <div>
              <h2>On your terms</h2>
              <p className="small muted">
                Start with recommendations. Add autonomy when ready.
              </p>
            </div>
            <ShieldCheck size={20} />
          </header>
          <div className="policy-banner">
            <div>
              <strong>Full autopilot</strong>
              <p>
                Eve handles lineups, acquisitions, and trade offers. No routine
                approvals.
              </p>
            </div>
            <button
              type="button"
              className="primary"
              disabled={Boolean(busy)}
              onClick={() =>
                act("autopilot", async () => {
                  const next = {
                    ...preferences(),
                    scheduled: true,
                    paused: false,
                    lineupMode: "automatic" as const,
                    waiverMode: "automatic" as const,
                    tradeMode: "automatic" as const,
                  };
                  await post("/api/settings", next);
                  setForm(next);
                  setNotice(
                    "Full autopilot is enabled. Eve will text you the outcomes.",
                  );
                })
              }
            >
              {form.scheduled &&
              !form.paused &&
              [form.lineupMode, form.waiverMode, form.tradeMode].every(
                (mode) => mode === "automatic",
              )
                ? "Autopilot enabled"
                : "Enable autopilot"}
            </button>
          </div>
          <div className="form-grid">
            <label className="full">
              Lineup changes
              <select
                value={form.lineupMode}
                onChange={(e) =>
                  setForm({
                    ...form,
                    lineupMode: e.target.value as Settings["lineupMode"],
                  })
                }
              >
                <option value="observe">Recommend only</option>
                <option value="approve">Ask for approval</option>
                <option value="automatic">Automatic — no approval</option>
              </select>
            </label>
            <label>
              Waiver moves
              <select
                value={form.waiverMode}
                onChange={(e) =>
                  setForm({
                    ...form,
                    waiverMode: e.target.value as Settings["waiverMode"],
                  })
                }
              >
                <option value="observe">Recommend only</option>
                <option value="approve">Ask for approval</option>
                <option value="automatic">Automatic — no approval</option>
              </select>
            </label>
            <label>
              Trade offers and replies
              <select
                value={form.tradeMode}
                onChange={(e) =>
                  setForm({
                    ...form,
                    tradeMode: e.target.value as Settings["tradeMode"],
                  })
                }
              >
                <option value="observe">Recommend only</option>
                <option value="approve">Ask for approval</option>
                <option value="automatic">Automatic — no approval</option>
              </select>
            </label>
            <p className="small muted full">
              Automatic mode lets Eve submit eligible moves without waiting for
              you. It respects ESPN locks, protected players, and your spending
              limit, then texts you the outcome.
            </p>
            <label className="full">
              Protected players (names or ESPN IDs, separated by commas)
              <input
                value={protectedText}
                onChange={(e) => setProtectedText(e.target.value)}
                placeholder="Players Eve should never drop or trade"
              />
            </label>
            <label>
              Monthly model budget ($)
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={form.monthlyAiBudget}
                onChange={(e) =>
                  setForm({ ...form, monthlyAiBudget: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Maximum waiver bid
              <input
                type="number"
                min={0}
                max={1000}
                value={form.maxWaiverBid}
                onChange={(e) =>
                  setForm({ ...form, maxWaiverBid: Number(e.target.value) })
                }
              />
            </label>
            <p className="small muted full">
              The budget stops new reviews at the model-spend limit. A final
              model call can cross it; search, Photon, and hosting are billed
              separately.
            </p>
          </div>
        </section>
        <section className="panel settings-card">
          <header className="panel-heading">
            <div>
              <h2>A daily check-in</h2>
              <p className="small muted">
                Plus checks before verified game locks.
              </p>
            </div>
            <Clock3 size={20} />
          </header>
          <div className="form-grid">
            <label className="full toggle">
              <span>
                <strong>Scheduled reviews</strong>
                <small>Checks every five minutes for due work</small>
              </span>
              <input
                type="checkbox"
                checked={form.scheduled}
                onChange={(e) =>
                  setForm({ ...form, scheduled: e.target.checked })
                }
              />
            </label>
            <label>
              Daily review hour
              <select
                value={form.digestHour}
                onChange={(e) =>
                  setForm({ ...form, digestHour: Number(e.target.value) })
                }
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")}:00
                  </option>
                ))}
              </select>
            </label>
            <label>
              Timezone
              <select
                value={form.timezone}
                onChange={(e) => setForm({ ...form, timezone: e.target.value })}
              >
                {[
                  "America/New_York",
                  "America/Chicago",
                  "America/Denver",
                  "America/Los_Angeles",
                  "Europe/London",
                  "Asia/Kolkata",
                ].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="full toggle">
              <span>
                <strong>Pause Eve</strong>
                <small>Stops reviews and future roster changes</small>
              </span>
              <input
                type="checkbox"
                checked={form.paused}
                onChange={(e) => setForm({ ...form, paused: e.target.checked })}
              />
            </label>
          </div>
        </section>
        <section className="panel settings-card">
          <header className="panel-heading">
            <div>
              <h2>Texts through Photon</h2>
              <p className="small muted">
                Eve has its own Photon number. Reply to its texts to talk about
                your team.
              </p>
            </div>
            <MessageSquare size={20} />
          </header>
          <label>
            Your registered phone number
            <input
              type="tel"
              placeholder="(415) 555-0123 or +country code"
              value={form.photonRecipient}
              onChange={(e) =>
                setForm({ ...form, photonRecipient: e.target.value })
              }
            />
          </label>
          <p className="small muted">
            US numbers can use 10 digits; include the country code elsewhere.
            Receive one daily digest, plus distinct move, incoming-trade, and
            failure updates. Routine checks stay quiet. Existing Oura incoming
            routing is preserved; use this dashboard for fantasy replies and
            approvals.
          </p>
          <button
            type="button"
            className="subtle"
            disabled={Boolean(busy)}
            onClick={() =>
              act("text", async () => {
                await post("/api/settings", preferences());
                const result = await post("/api/notifications");
                setNotice(
                  result.status === "sent"
                    ? "Test message accepted by Photon."
                    : (result.last_error ?? "Message queued for delivery."),
                );
              })
            }
          >
            {busy === "text" ? (
              <LoaderCircle className="spin" size={14} />
            ) : (
              <MessageSquare size={14} />
            )}
            Send a test text
          </button>
          {data.deliveries.length > 0 && (
            <div className="delivery-status">
              <span className="small muted">Last notification</span>
              <Badge status={String(data.deliveries[0].status)} />
            </div>
          )}
        </section>
        <button className="primary save-settings" disabled={Boolean(busy)}>
          {busy === "settings" ? (
            <LoaderCircle className="spin" size={16} />
          ) : (
            <Check size={16} />
          )}
          Save preferences
        </button>
      </form>
    </div>
  );
}
