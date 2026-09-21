import { formatActionMessage } from "./messages";
import { randomUUID } from "node:crypto";
import { db, getCredentials, getSettings } from "./db";
import {
  espnRequest,
  fetchSnapshot,
  seasonBase,
  EspnRequestError,
} from "./espn";
import {
  validateTradeResponse,
  tradeResponsePayload,
  tradeResponseOutcome,
} from "./trade-responses";
import { requireActionPermission, transactionIdentity } from "./policy";
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
  if (proposal.kind === "trade_response") {
    if (settings.tradeMode === "observe")
      throw new Error("Current policy allows trade ideas only.");
    validateTradeResponse(proposal, snapshot, settings, now);
    return true;
  }
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
    if (
      proposal.dropPlayerId &&
      (owned(proposal.dropPlayerId)?.droppable === false ||
        owned(proposal.dropPlayerId)?.rosterLocked)
    )
      throw new Error(
        "ESPN does not currently allow this player to be dropped.",
      );
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
      snapshot.roster.filter((p) => ![21, 24].includes(p.slotId)).length >=
        Object.entries(snapshot.slotCounts).reduce(
          (sum, [slot, count]) =>
            sum + ([21, 24].includes(Number(slot)) ? 0 : count),
          0,
        )
    )
      throw new Error(
        "The roster is full. A drop must be included in this proposal.",
      );
  } else if (proposal.kind === "trade") {
    if (settings.tradeMode === "observe")
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
    if (
      give.some((id) => owned(id)?.tradeLocked) ||
      receive.some((id) => other.roster.find((p) => p.id === id)?.tradeLocked)
    )
      throw new Error(
        "ESPN currently locks one of the players against trades.",
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
  if (proposal.kind === "trade_response")
    return tradeResponsePayload(proposal, snapshot, swid);
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
  const freeAgent =
    snapshot.freeAgents.find((p) => p.id === proposal.addPlayerId)
      ?.availability === "FREEAGENT";
  return {
    ...base,
    type: freeAgent ? "FREEAGENT" : "WAIVER",
    ...(!freeAgent
      ? {
          bidAmount:
            snapshot.faabRemaining == null ? null : (proposal.bid ?? 0),
        }
      : {}),
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

export async function executeTransactionAction(
  id: string,
  ownerApproved = false,
) {
  const [rows, settings, credentials] = await Promise.all([
    db()`SELECT * FROM actions WHERE id=${id}`,
    getSettings(),
    getCredentials(),
  ]);
  const action = rows[0];
  if (!action) throw new Error("This action does not exist.");
  const proposal = action.proposal as Proposal;
  const flag =
    proposal.kind === "trade" || proposal.kind === "trade_response"
      ? "ESPN_TRADE_WRITES_ENABLED"
      : "ESPN_WAIVER_WRITES_ENABLED";
  if (
    process.env[flag] !== "true" ||
    process.env.VERCEL_ENV !== "production" ||
    settings.sport !== "football"
  )
    throw new Error(
      "Live acquisition or trade execution is disabled for this deployment.",
    );
  if (!credentials) throw new Error("ESPN is not connected.");
  requireActionPermission(proposal, settings, ownerApproved);
  const unknown =
    await db()`SELECT id FROM actions WHERE status='unknown' LIMIT 1`;
  if (unknown.length)
    throw new Error(
      "The previous ESPN result is uncertain. Reconcile it before submitting another transaction.",
    );
  const existing =
    await db()`SELECT a.proposal FROM actions a JOIN reviews r ON r.id=a.review_id JOIN snapshots s ON s.id=r.snapshot_id WHERE a.id<>${id} AND (a.status IN ('submitted','executing') OR (a.status='verified' AND a.proposal->>'kind'='trade_response')) AND s.data->>'leagueId'=${settings.leagueId} AND (s.data->>'teamId')::int=${settings.teamId} AND (s.data->>'season')::int=${settings.season}`;
  if (
    existing.some((a) =>
      proposal.kind === "trade_response"
        ? a.proposal.kind === "trade_response" &&
          a.proposal.offerId === proposal.offerId
        : transactionIdentity(a.proposal) === transactionIdentity(proposal),
    )
  ) {
    await db()`UPDATE actions SET status='rejected',result='An identical transaction is already pending on ESPN.' WHERE id=${id} AND status IN ('ready','proposed','awaiting_approval')`;
    return {
      status: "rejected",
      message: "An identical transaction is already pending.",
    };
  }
  const claimed =
    await db()`UPDATE actions SET status='executing',approved_at=CASE WHEN ${ownerApproved} THEN now() ELSE approved_at END,execution_started_at=now() WHERE id=${id} AND status IN ('ready','proposed','awaiting_approval') AND expires_at>now() RETURNING id`;
  if (!claimed.length)
    throw new Error("This proposal has expired or was already handled.");
  let submitted = false;
  try {
    const snapshot = await fetchSnapshot(settings, credentials);
    if (!snapshot.accountOwnsTeam)
      throw new Error(
        "ESPN account ownership of the selected team could not be verified.",
      );
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
    requireActionPermission(proposal, current, ownerApproved);
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
    if (externalId)
      await db()`UPDATE actions SET external_id=${externalId} WHERE id=${id}`;
    const accepted = Boolean(
      externalId &&
      ["PENDING", "EXECUTED", "PROPOSED"].includes(response?.status ?? ""),
    );
    let status = accepted ? "submitted" : "unknown";
    let message = accepted
      ? `ESPN accepted ${proposal.kind === "trade" ? "trade offer" : "waiver claim"} ${externalId}. It is submitted, not a confirmed roster change.`
      : "ESPN did not return a recognizable transaction receipt. Check ESPN; no automatic retry will occur.";
    if (proposal.kind === "trade_response") {
      const after = await fetchSnapshot(settings, credentials);
      const outcome = tradeResponseOutcome(proposal, after);
      status = outcome?.status ?? "unknown";
      message =
        outcome?.message ??
        "I cannot confirm the reply yet. I will check ESPN before I try again.";
    }
    const sql = db();
    await sql.transaction([
      sql`UPDATE actions SET status=${status},external_id=${externalId},result=${message} WHERE id=${id}`,
      sql`INSERT INTO notification_outbox(id,operation_key,body) VALUES (${randomUUID()},${`action:${id}`},${formatActionMessage(proposal, status, message)}) ON CONFLICT DO NOTHING`,
    ]);
    return { status, message };
  } catch (error) {
    const uncertain =
      submitted &&
      !(error instanceof EspnRequestError && error.definitivelyRejected);
    const message = uncertain
      ? "The ESPN transaction result is uncertain. Check ESPN before any retry."
      : error instanceof Error
        ? error.message
        : "The transaction could not be validated.";
    const sql = db();
    await sql.transaction([
      sql`UPDATE actions SET status=${uncertain ? "unknown" : "failed"},result=${message} WHERE id=${id}`,
      sql`INSERT INTO notification_outbox(id,operation_key,body) VALUES (${randomUUID()},${`action:${id}`},${formatActionMessage(proposal, uncertain ? "unknown" : "failed", message)}) ON CONFLICT DO NOTHING`,
    ]);
    throw new Error(message);
  }
}
