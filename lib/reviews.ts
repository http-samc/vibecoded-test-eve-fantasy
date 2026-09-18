import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  db,
  getSettings,
  getCredentials,
  saveSnapshot,
  claimReview,
  failReview,
} from "./db";
import { fetchSnapshot } from "./espn";
import { optimizeLineup } from "./lineup";
import { deliverNotifications } from "./notifications";
import type { Snapshot, Settings, Proposal } from "./types";

export const evidenceSchema = z.object({
  title: z.string().max(180),
  url: z
    .string()
    .url()
    .refine((s) => s.startsWith("https://")),
  note: z.string().max(800),
});
export const proposalSchema = z.object({
  kind: z.enum(["waiver", "trade", "hold"]),
  title: z.string().max(160),
  rationale: z.string().max(1800),
  expectedGain: z.number().nullable(),
  playerIds: z.array(z.number().int()).max(8),
  targetTeamId: z.number().int().optional(),
  bid: z.number().nonnegative().optional(),
  addPlayerId: z.number().int().positive().optional(),
  dropPlayerId: z.number().int().positive().optional(),
  givePlayerIds: z.array(z.number().int().positive()).max(5).optional(),
  receivePlayerIds: z.array(z.number().int().positive()).max(5).optional(),
  sources: z.array(evidenceSchema).max(6),
});
export const reportSchema = z.object({
  reviewId: z.string().uuid(),
  summary: z.string().min(10).max(3500),
  lineupRecommendation: z.enum(["use_optimizer", "hold"]),
  lineupReason: z.string().max(1000),
  proposals: z.array(proposalSchema).max(8),
  evidence: z.array(evidenceSchema).max(12),
});
export function appOrigin() {
  if (process.env.APP_URL) return process.env.APP_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL)
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (!process.env.VERCEL) return "http://localhost:3000";
  throw new Error("The application URL is not configured.");
}
export async function checkBudget() {
  const s = await getSettings();
  const rows =
    await db()`SELECT COALESCE(sum(cost),0) AS cost FROM model_usage WHERE created_at>=date_trunc('month',now())`;
  if (Number(rows[0].cost) >= s.monthlyAiBudget)
    throw new Error(
      "The monthly model budget is reached. Increase it in Settings to start another review.",
    );
}
export async function startReview(trigger: string, occurrence: string) {
  await checkBudget();
  const id = await claimReview(trigger, occurrence);
  if (!id) return { started: false };
  try {
    const response = await fetch(`${appOrigin()}/eve/v1/session`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.EVE_SERVICE_TOKEN}`,
      },
      body: JSON.stringify({
        operationId: `review-${id}`,
        message: `Perform the fantasy team review ${id}. First call prepare_review with this exact reviewId. Then research current news using web_search (at most 3 searches), evaluate the provided optimizer output and available players, and call finish_review. All numbers must come from tools; cite sources. Do not execute roster changes outside the application policy. If you cannot finish, call fail_review. This run was triggered by ${trigger}.`,
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok)
      throw new Error(
        "The agent could not start. Check the Eve service deployment.",
      );
    const result = await response.json();
    await db()`UPDATE reviews SET session_id=${result.sessionId} WHERE id=${id}`;
    return { started: true, id, sessionId: result.sessionId };
  } catch (error) {
    await failReview(
      id,
      error instanceof Error ? error.message : "Agent dispatch failed.",
    );
    throw error;
  }
}
export async function prepareReview(id: string, sessionId: string) {
  const rows =
    await db()`UPDATE reviews SET status='running',session_id=${sessionId} WHERE id=${id} AND status IN ('queued','running') RETURNING snapshot_id`;
  if (!rows.length) throw new Error("This review is no longer active.");
  const settings = await getSettings();
  if (settings.paused) throw new Error("Eve is paused.");
  const credentials = await getCredentials();
  if (!credentials) throw new Error("Connect ESPN first.");
  // Replayed tools use the same persisted snapshot, so one review has a stable basis.
  let snapshot: Snapshot;
  if (rows[0].snapshot_id) {
    const found =
      await db()`SELECT data FROM snapshots WHERE id=${rows[0].snapshot_id}`;
    snapshot = found[0].data;
  } else {
    snapshot = await fetchSnapshot(settings, credentials);
    await saveSnapshot(snapshot);
    await db()`UPDATE reviews SET snapshot_id=${snapshot.id} WHERE id=${id}`;
  }
  return {
    reviewId: id,
    settings: {
      sport: settings.sport,
      lineupMode: settings.lineupMode,
      waiverMode: settings.waiverMode,
      tradeMode: settings.tradeMode,
      maxWaiverBid: settings.maxWaiverBid,
      protectedPlayers: settings.protectedPlayers,
    },
    snapshot,
    lineup: optimizeLineup(snapshot),
    notes: [
      "ESPN projections are the current numerical baseline. No independent paid projection feed is configured.",
      "Missing game times lock players conservatively. Missing projections prevent automatic optimization.",
      "Trade and waiver execution requires separate owner approval and enabled, validated adapters. Record exact proposed terms only.",
    ],
  };
}
export async function finishReview(input: z.infer<typeof reportSchema>) {
  const rows = await db()`SELECT * FROM reviews WHERE id=${input.reviewId}`;
  const review = rows[0];
  if (!review) throw new Error("Review not found.");
  if (review.status === "completed") return { status: "already_completed" };
  if (review.status !== "running" || !review.snapshot_id)
    throw new Error("Review is inactive or has no snapshot.");
  const [snapshotRow, settings] = await Promise.all([
    db()`SELECT data FROM snapshots WHERE id=${review.snapshot_id}`,
    getSettings(),
  ]);
  const snapshot = snapshotRow[0].data as Snapshot;
  const allPlayers = [
    ...snapshot.roster,
    ...snapshot.freeAgents,
    ...(snapshot.leagueRosters ?? []).flatMap((t) => t.roster),
  ];
  const name = (id: number) =>
    allPlayers.find((p) => p.id === id)?.name ?? `Unknown player ${id}`;
  const proposals: Proposal[] = input.proposals.map((p) => ({
    ...p,
    expectedGain: null,
    terms:
      p.kind === "trade"
        ? [
            `Offer to ${snapshot.leagueRosters?.find((t) => t.teamId === p.targetTeamId)?.name ?? "unselected team"}`,
            `Give: ${(p.givePlayerIds ?? []).map(name).join(", ") || "Not specified"}`,
            `Receive: ${(p.receivePlayerIds ?? []).map(name).join(", ") || "Not specified"}`,
          ]
        : p.kind === "waiver"
          ? [
              `Claim: ${p.addPlayerId ? name(p.addPlayerId) : "Not specified"}`,
              `Drop: ${p.dropPlayerId ? name(p.dropPlayerId) : "None"}`,
              `Bid: ${p.bid ?? 0}`,
            ]
          : [],
  }));
  const optimized = optimizeLineup(snapshot);
  if (input.lineupRecommendation === "use_optimizer" && optimized)
    proposals.unshift({
      ...optimized,
      rationale: input.lineupReason || optimized.rationale,
      sources: input.evidence,
    });
  else
    proposals.unshift({
      kind: "hold",
      title: "Keep the current lineup",
      rationale: input.lineupReason,
      expectedGain: 0,
      playerIds: [],
      sources: [],
    });
  const sql = db();
  const actionIds = proposals.map(() => randomUUID());
  const statements = proposals.map((proposal, i) => {
    const mode =
      proposal.kind === "lineup"
        ? settings.lineupMode
        : proposal.kind === "waiver"
          ? settings.waiverMode
          : settings.tradeMode;
    const status =
      proposal.kind === "hold"
        ? "considered"
        : mode === "observe"
          ? "proposed"
          : "awaiting_approval";
    return sql`INSERT INTO actions (id,review_id,action_key,status,proposal,expires_at)
      SELECT ${actionIds[i]},${input.reviewId},${`${input.reviewId}:${i}`},${status},${JSON.stringify(proposal)}::jsonb,now()+interval '6 hours'
      WHERE EXISTS (SELECT 1 FROM reviews WHERE id=${input.reviewId} AND status='running') ON CONFLICT DO NOTHING`;
  });
  const message = `Eve · Fantasy review\n\n${input.summary.slice(0, 1300)}\n\n${proposals.filter((p) => p.kind !== "hold").length} moves considered. No changes confirmed yet.\n${appOrigin()}/activity`;
  await sql.transaction([
    ...statements,
    sql`UPDATE reviews SET status='completed',summary=${input.summary},evidence=${JSON.stringify(input.evidence)}::jsonb,completed_at=now() WHERE id=${input.reviewId} AND status='running'`,
    sql`INSERT INTO notification_outbox (id,operation_key,body) VALUES (${randomUUID()},${`review:${input.reviewId}`},${message}) ON CONFLICT DO NOTHING`,
  ]);
  if (
    settings.lineupMode === "automatic" &&
    !settings.paused &&
    process.env.ESPN_LINEUP_WRITES_ENABLED === "true"
  ) {
    const { executeLineupAction } = await import("./execution");
    for (let i = 0; i < proposals.length; i++)
      if (proposals[i].kind === "lineup")
        await executeLineupAction(actionIds[i], false);
  }
  await deliverNotifications();
  return { status: "completed", actions: proposals.length };
}
export function scheduledOccurrence(
  settings: Settings,
  snapshot: Snapshot | null,
  now = new Date(),
): string | null {
  if (
    !settings.scheduled ||
    settings.paused ||
    !settings.leagueId ||
    !settings.teamId
  )
    return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: settings.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  const day = `${get("year")}-${get("month")}-${get("day")}`;
  // Deadline checks take precedence during their short window; the daily job catches up later.
  const times = [
    ...new Set(
      snapshot?.roster
        .map((p) => p.gameTime)
        .filter((t): t is string => Boolean(t)) ?? [],
    ),
  ];
  for (const t of times) {
    const minutes = (new Date(t).getTime() - now.getTime()) / 60000;
    for (const lead of [60, 15])
      if (minutes <= lead && minutes > lead - 5)
        return `prelock:${settings.leagueId}:${t}:${lead}`;
  }
  return Number(get("hour")) >= settings.digestHour
    ? `daily:${settings.leagueId}:${settings.season}:${day}`
    : null;
}
