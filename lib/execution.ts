import { randomUUID } from "node:crypto";
import { db, getSettings, getCredentials, saveSnapshot } from "./db";
import { fetchSnapshot, espnRequest, seasonBase } from "./espn";
import { validateLineup } from "./lineup";
import type { Proposal, Snapshot } from "./types";
export function lineupPayload(
  proposal: Proposal,
  snapshot: Snapshot,
  swid: string,
) {
  return {
    isLeagueManager: false,
    teamId: snapshot.teamId,
    memberId: swid,
    scoringPeriodId: snapshot.scoringPeriod,
    executionType: "EXECUTE",
    type: "ROSTER",
    items: proposal.assignments!.map((m) => ({
      playerId: m.playerId,
      type: "LINEUP",
      fromLineupSlotId: m.fromSlot,
      toLineupSlotId: m.toSlot,
    })),
  };
}
export async function executeLineupAction(id: string, ownerApproved: boolean) {
  if (
    process.env.ESPN_LINEUP_WRITES_ENABLED !== "true" ||
    process.env.VERCEL_ENV !== "production"
  )
    throw new Error(
      "Live lineup changes are disabled until this adapter is verified for your league.",
    );
  const settings = await getSettings();
  if (settings.sport !== "football")
    throw new Error(
      "Live lineup changes are currently limited to the football adapter.",
    );
  if (settings.paused || settings.lineupMode === "observe")
    throw new Error("Current policy does not allow lineup changes.");
  if (settings.lineupMode === "approve" && !ownerApproved)
    throw new Error("Owner approval is required.");
  const credentials = await getCredentials();
  if (!credentials) throw new Error("ESPN is not connected.");
  const claimed =
    await db()`UPDATE actions SET status='executing',execution_started_at=now(),approved_at=CASE WHEN ${ownerApproved} THEN now() ELSE approved_at END
    WHERE id=${id} AND status IN ('awaiting_approval','proposed') AND expires_at>now() AND proposal->>'kind'='lineup'
    RETURNING *`;
  if (!claimed.length)
    throw new Error(
      "This action is expired, already handled, or not a lineup change.",
    );
  const proposal = claimed[0].proposal as Proposal;
  let submitted = false;
  try {
    const snapshot = await fetchSnapshot(settings, credentials);
    const original =
      await db()`SELECT s.data FROM reviews r JOIN snapshots s ON s.id=r.snapshot_id WHERE r.id=${claimed[0].review_id}`;
    if (
      original[0]?.data.scoringPeriod !== snapshot.scoringPeriod ||
      original[0]?.data.leagueId !== snapshot.leagueId ||
      original[0]?.data.teamId !== snapshot.teamId
    )
      throw new Error(
        "The scoring period or connected team changed. Run a new review.",
      );
    validateLineup(proposal, snapshot, await getSettings());
    submitted = true;
    await espnRequest(
      `${seasonBase(settings, true)}/segments/0/leagues/${settings.leagueId}/transactions/`,
      credentials,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-fantasy-platform": "espn-fantasy-web",
          "x-fantasy-source": "kona",
        },
        body: JSON.stringify(
          lineupPayload(proposal, snapshot, credentials.swid),
        ),
      },
    );
    const after = await fetchSnapshot(settings, credentials);
    await saveSnapshot(after);
    const verified = proposal.assignments!.every(
      (move) =>
        after.roster.find((p) => p.id === move.playerId)?.slotId ===
        move.toSlot,
    );
    const status = verified ? "verified" : "unknown";
    const message = verified
      ? "The lineup change was verified on ESPN."
      : "ESPN's final lineup did not match the request. No automatic retry will occur.";
    const sql = db();
    await sql.transaction([
      sql`UPDATE actions SET status=${status},result=${message} WHERE id=${id}`,
      sql`INSERT INTO notification_outbox (id,operation_key,body) VALUES (${randomUUID()},${`action:${id}`},${`Eve · ${message}`}) ON CONFLICT DO NOTHING`,
    ]);
    return { status, message };
  } catch (error) {
    const message = submitted
      ? "The ESPN result is uncertain. Check your roster before any retry."
      : error instanceof Error
        ? error.message
        : "Lineup validation failed.";
    await db()`UPDATE actions SET status=${submitted ? "unknown" : "failed"},result=${message} WHERE id=${id}`;
    throw new Error(message);
  }
}
