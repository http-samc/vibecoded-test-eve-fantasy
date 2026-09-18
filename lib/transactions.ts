import { randomUUID } from "node:crypto";
import { db, getCredentials, getSettings } from "./db";
import { espnRequest, fetchSnapshot, seasonBase } from "./espn";
import type { Proposal, Settings, Snapshot } from "./types";

export function validateTransaction(
  proposal: Proposal,
  snapshot: Snapshot,
  settings: Settings,
  now = Date.now(),
) {
  if (settings.paused) throw new Error("Eve is paused.");
  if (
    snapshot.leagueId !== settings.leagueId ||
    snapshot.teamId !== settings.teamId ||
    snapshot.season !== settings.season ||
    snapshot.sport !== settings.sport
  )
    throw new Error("The connected team changed.");
  if (now - new Date(snapshot.fetchedAt).getTime() > 120000)
    throw new Error("The roster is stale.");
  const owned = (id: number) => snapshot.roster.find((p) => p.id === id);
  const protectedPlayer = (id: number) =>
    settings.protectedPlayers.some(
      (p) =>
        p.trim().toLowerCase() === String(id) ||
        p.trim().toLowerCase() === owned(id)?.name.toLowerCase(),
    );
  if (proposal.kind === "waiver") {
    if (settings.waiverMode === "observe")
      throw new Error("Current policy allows waiver recommendations only.");
    if (
      !proposal.addPlayerId ||
      !snapshot.freeAgents.some(
        (p) =>
          p.id === proposal.addPlayerId &&
          ["FREEAGENT", "WAIVERS"].includes(p.availability ?? ""),
      )
    )
      throw new Error("The acquisition target is not confirmed available.");
    if (
      proposal.dropPlayerId &&
      (!owned(proposal.dropPlayerId) || protectedPlayer(proposal.dropPlayerId))
    )
      throw new Error("The player to drop is unavailable or protected.");
    const bid = proposal.bid ?? 0;
    if (!Number.isInteger(bid) || bid < 0 || bid > settings.maxWaiverBid)
      throw new Error("The waiver bid exceeds your policy limit.");
    if (
      bid > 0 &&
      (snapshot.faabRemaining == null || bid > snapshot.faabRemaining)
    )
      throw new Error(
        "The remaining FAAB budget is insufficient or unverified.",
      );
    if (
      !proposal.dropPlayerId &&
      snapshot.roster.length >=
        Object.values(snapshot.slotCounts).reduce((a, b) => a + b, 0)
    )
      throw new Error(
        "The roster is full. A drop must be included in this proposal.",
      );
  } else if (proposal.kind === "trade") {
    if (settings.tradeMode !== "approve")
      throw new Error("Current policy allows trade recommendations only.");
    const give = proposal.givePlayerIds ?? [];
    const receive = proposal.receivePlayerIds ?? [];
    if (
      !give.length ||
      give.length !== receive.length ||
      give.length > 5 ||
      new Set([...give, ...receive]).size !== give.length + receive.length
    )
      throw new Error(
        "The trade must contain distinct players and equal roster counts on both sides.",
      );
    const other = snapshot.leagueRosters?.find(
      (t) => t.teamId === proposal.targetTeamId && t.teamId !== settings.teamId,
    );
    if (
      !other ||
      give.some((id) => !owned(id) || protectedPlayer(id)) ||
      receive.some((id) => !other.roster.some((p) => p.id === id))
    )
      throw new Error(
        "The trade ownership changed, or a protected player is included.",
      );
    const rules = snapshot.tradeSettings as { deadlineDate?: number } | null;
    if (rules?.deadlineDate && rules.deadlineDate < now)
      throw new Error("The trade deadline has passed.");
  } else throw new Error("This proposal is not a waiver claim or trade offer.");
  return true;
}
export function transactionPayload(
  proposal: Proposal,
  snapshot: Snapshot,
  swid: string,
  expiresAt = new Date(
    Math.floor((Date.now() + 2 * 86400000) / 1000) * 1000,
  ).toISOString(),
) {
  const base = {
    isLeagueManager: false,
    teamId: snapshot.teamId,
    memberId: swid,
    scoringPeriodId: snapshot.scoringPeriod,
    executionType: "EXECUTE",
  };
  if (proposal.kind === "trade")
    return {
      ...base,
      type: "TRADE_PROPOSAL",
      expirationDate: expiresAt,
      comment: "Proposed by my fantasy manager.",
      items: [
        ...proposal.givePlayerIds!.map((playerId) => ({
          playerId,
          type: "TRADE",
          fromTeamId: snapshot.teamId,
          toTeamId: proposal.targetTeamId,
        })),
        ...proposal.receivePlayerIds!.map((playerId) => ({
          playerId,
          type: "TRADE",
          fromTeamId: proposal.targetTeamId,
          toTeamId: snapshot.teamId,
        })),
      ],
    };
  return {
    ...base,
    type: "WAIVER",
    bidAmount: snapshot.faabRemaining == null ? null : (proposal.bid ?? 0),
    items: [
      {
        playerId: proposal.addPlayerId,
        type: "ADD",
        toTeamId: snapshot.teamId,
      },
      ...(proposal.dropPlayerId
        ? [
            {
              playerId: proposal.dropPlayerId,
              type: "DROP",
              fromTeamId: snapshot.teamId,
            },
          ]
        : []),
    ],
  };
}

export async function executeTransactionAction(id: string) {
  const [rows, settings, credentials] = await Promise.all([
    db()`SELECT * FROM actions WHERE id=${id}`,
    getSettings(),
    getCredentials(),
  ]);
  const action = rows[0];
  if (!action) throw new Error("This action does not exist.");
  const proposal = action.proposal as Proposal;
  const flag =
    proposal.kind === "trade"
      ? "ESPN_TRADE_WRITES_ENABLED"
      : "ESPN_WAIVER_WRITES_ENABLED";
  if (
    process.env[flag] !== "true" ||
    process.env.VERCEL_ENV !== "production" ||
    settings.sport !== "football"
  )
    throw new Error(
      "Live waiver and trade submission remains disabled until its adapter is verified for your league.",
    );
  if (!credentials) throw new Error("ESPN is not connected.");
  const unknown =
    await db()`SELECT id FROM actions WHERE status='unknown' LIMIT 1`;
  if (unknown.length)
    throw new Error(
      "The previous ESPN result is uncertain. Reconcile it before submitting another transaction.",
    );
  const claimed =
    await db()`UPDATE actions SET status='executing',approved_at=now(),execution_started_at=now() WHERE id=${id} AND status IN ('proposed','awaiting_approval') AND expires_at>now() RETURNING id`;
  if (!claimed.length)
    throw new Error("This proposal has expired or was already handled.");
  let submitted = false;
  try {
    const snapshot = await fetchSnapshot(settings, credentials);
    const original =
      await db()`SELECT s.data FROM reviews r JOIN snapshots s ON s.id=r.snapshot_id WHERE r.id=${action.review_id}`;
    if (
      original[0]?.data.leagueId !== snapshot.leagueId ||
      original[0]?.data.teamId !== snapshot.teamId ||
      original[0]?.data.scoringPeriod !== snapshot.scoringPeriod
    )
      throw new Error(
        "The league, team, or scoring period changed. Run a fresh review.",
      );
    const current = await getSettings();
    validateTransaction(proposal, snapshot, current);
    // Reserve pending app claims when checking a positive FAAB bid.
    if (proposal.kind === "waiver" && (proposal.bid ?? 0) > 0) {
      const pending =
        await db()`SELECT COALESCE(sum((proposal->>'bid')::numeric),0) AS reserved FROM actions WHERE proposal->>'kind'='waiver' AND status IN ('submitted','unknown')`;
      if (
        (proposal.bid ?? 0) + Number(pending[0].reserved) >
        (snapshot.faabRemaining ?? 0)
      )
        throw new Error(
          "The waiver bid would exceed the budget after pending app claims.",
        );
    }
    submitted = true;
    const response = (await espnRequest(
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
          transactionPayload(proposal, snapshot, credentials.swid),
        ),
      },
    )) as { id?: string | number; status?: string } | null;
    const externalId = response?.id != null ? String(response.id) : null;
    const accepted = Boolean(
      externalId &&
      ["PENDING", "EXECUTED", "PROPOSED"].includes(response?.status ?? ""),
    );
    const status = accepted ? "submitted" : "unknown";
    const message = accepted
      ? `ESPN accepted ${proposal.kind === "trade" ? "trade offer" : "waiver claim"} ${externalId}. It is submitted, not a confirmed roster change.`
      : "ESPN did not return a recognizable transaction receipt. Check ESPN; no automatic retry will occur.";
    const sql = db();
    await sql.transaction([
      sql`UPDATE actions SET status=${status},external_id=${externalId},result=${message} WHERE id=${id}`,
      sql`INSERT INTO notification_outbox(id,operation_key,body) VALUES (${randomUUID()},${`action:${id}`},${`Eve · ${message}`}) ON CONFLICT DO NOTHING`,
    ]);
    return { status, message };
  } catch (error) {
    const message = submitted
      ? "The ESPN transaction result is uncertain. Check ESPN before any retry."
      : error instanceof Error
        ? error.message
        : "The transaction could not be validated.";
    await db()`UPDATE actions SET status=${submitted ? "unknown" : "failed"},result=${message} WHERE id=${id}`;
    throw new Error(message);
  }
}
