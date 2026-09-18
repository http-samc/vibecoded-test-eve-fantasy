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
import { proposedStatus } from "./policy";
import { executeReadyActions } from "./autopilot";

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
  addPlayerId: z
    .number()
    .int()
    .refine((id) => id !== 0)
    .optional(),
  dropPlayerId: z
    .number()
    .int()
    .refine((id) => id !== 0)
    .optional(),
  givePlayerIds: z
    .array(
      z
        .number()
        .int()
        .refine((id) => id !== 0),
    )
    .max(5)
    .optional(),
  receivePlayerIds: z
    .array(
      z
        .number()
        .int()
        .refine((id) => id !== 0),
    )
    .max(5)
    .optional(),
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
  const pendingActions =
    await db()`SELECT status,proposal,result FROM actions WHERE status IN ('ready','executing','submitted','unknown','awaiting_approval') ORDER BY created_at DESC LIMIT 20`;
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
    pendingActions,
    lineup: optimizeLineup(snapshot),
    notes: [
      "ESPN projections are the current numerical baseline. No independent paid projection feed is configured.",
      "Missing game times lock players conservatively. Missing projections prevent automatic optimization.",
      "Automatic mode submits eligible actions without owner approval; approve mode waits for the owner; observe mode records ideas only. Do not duplicate pending claims or offers. Propose moves only when they improve the team.",
    ],
  };
}
export async function finishReview(input: z.infer<typeof reportSchema>) {
  const rows = await db()`SELECT * FROM reviews WHERE id=${input.reviewId}`;
  const review = rows[0];
  if (!review) throw new Error("Review not found.");
  if (review.status === "completed") {
    await executeReadyActions(input.reviewId);
    await queueReviewDigests();
    await deliverNotifications();
    return { status: "already_completed" };
  }
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
    const status = proposedStatus(proposal, settings);
    return sql`INSERT INTO actions (id,review_id,action_key,status,proposal,expires_at)
      SELECT ${actionIds[i]},${input.reviewId},${`${input.reviewId}:${i}`},${status},${JSON.stringify(proposal)}::jsonb,now()+interval '6 hours'
      WHERE EXISTS (SELECT 1 FROM reviews WHERE id=${input.reviewId} AND status='running') ON CONFLICT DO NOTHING`;
  });
  await sql.transaction([
    ...statements,
    sql`UPDATE reviews SET status='completed',summary=${input.summary},evidence=${JSON.stringify(input.evidence)}::jsonb,completed_at=now() WHERE id=${input.reviewId} AND status='running'`,
  ]);
  await executeReadyActions(input.reviewId);
  await queueReviewDigests();
  await deliverNotifications();
  const outcomes =
    await db()`SELECT status,proposal->>'title' AS title,result FROM actions WHERE review_id=${input.reviewId} ORDER BY created_at`;
  return { status: "completed", actions: proposals.length, outcomes };
}
export async function queueReviewDigests() {
  const reviews =
    await db()`SELECT r.id,r.summary FROM reviews r WHERE r.status='completed'
    AND NOT EXISTS(SELECT 1 FROM actions a WHERE a.review_id=r.id AND a.status IN ('ready','executing'))
    AND NOT EXISTS(SELECT 1 FROM notification_outbox n WHERE n.operation_key='review:'||r.id::text)
    ORDER BY r.started_at LIMIT 10`;
  for (const review of reviews) {
    const counts =
      await db()`SELECT status,count(*)::int AS count FROM actions WHERE review_id=${review.id} AND proposal->>'kind'<>'hold' GROUP BY status`;
    const outcomes = counts.length
      ? counts
          .map((r) => `${r.count} ${r.status.replaceAll("_", " ")}`)
          .join(", ")
      : "No changes needed.";
    const body = `Eve · Fantasy review\n\n${review.summary?.slice(0, 1300) ?? "Review complete."}\n\nMoves: ${outcomes}\n${appOrigin()}/activity`;
    await db()`INSERT INTO notification_outbox(id,operation_key,body) VALUES (${randomUUID()},${`review:${review.id}`},${body}) ON CONFLICT DO NOTHING`;
  }
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
  const waiverTimes = [
    ...new Set(
      snapshot?.freeAgents
        ?.map((p) => p.waiverProcessAt)
        .filter((t): t is string => Boolean(t)) ?? [],
    ),
  ];
  for (const time of waiverTimes) {
    const minutes = (new Date(time).getTime() - now.getTime()) / 60000;
    if (minutes <= 60 && minutes > 55)
      return `waiver:${settings.leagueId}:${time}`;
  }
  return Number(get("hour")) >= settings.digestHour
    ? `daily:${settings.leagueId}:${settings.season}:${day}`
    : null;
}
