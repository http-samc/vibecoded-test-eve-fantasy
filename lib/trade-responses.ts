import type { Proposal, Settings, Snapshot } from "./types";
const sorted = (ids: number[]) => [...ids].sort((a, b) => a - b).join(",");
export function validateTradeResponse(
  proposal: Proposal,
  snapshot: Snapshot,
  settings: Settings,
  now = Date.now(),
) {
  if (
    proposal.kind !== "trade_response" ||
    !proposal.offerId ||
    !["accept", "decline"].includes(proposal.tradeResponse ?? "")
  )
    throw new Error("The trade response is incomplete.");
  if (snapshot.tradeInbox?.status !== "ok")
    throw new Error("The trade inbox cannot be checked.");
  const offer = snapshot.tradeInbox.incoming.find(
    (t) => t.id === proposal.offerId,
  );
  if (!offer || offer.status !== "PENDING" || offer.ownerResponse)
    throw new Error("The incoming offer is no longer open.");
  if (offer.expiresAt && new Date(offer.expiresAt).getTime() <= now + 30000)
    throw new Error("The offer has expired or is too close to expiry.");
  if (
    proposal.targetTeamId !== offer.counterpartyTeamId ||
    sorted(proposal.givePlayerIds ?? []) !==
      sorted(offer.give.map((p) => p.id)) ||
    sorted(proposal.receivePlayerIds ?? []) !==
      sorted(offer.receive.map((p) => p.id))
  )
    throw new Error("The offer terms changed. A new review is required.");
  const drops = proposal.dropPlayerIds ?? [];
  if (proposal.tradeResponse === "decline") {
    if (drops.length) throw new Error("A decline must not drop any players.");
    return offer;
  }
  const own = (id: number) => snapshot.roster.find((p) => p.id === id);
  const other = snapshot.leagueRosters?.find(
    (t) => t.teamId === offer.counterpartyTeamId,
  );
  const protectedPlayer = (id: number) =>
    settings.protectedPlayers.some(
      (p) =>
        p.trim().toLowerCase() === String(id) ||
        p.trim().toLowerCase() === own(id)?.name.toLowerCase(),
    );
  const give = offer.give.map((p) => p.id),
    receive = offer.receive.map((p) => p.id);
  if (
    !give.length ||
    !receive.length ||
    new Set([...give, ...receive, ...drops]).size !==
      give.length + receive.length + drops.length
  )
    throw new Error("The trade contains missing or duplicate players.");
  if (
    !other ||
    give.some(
      (id) => !own(id) || own(id)?.tradeLocked || protectedPlayer(id),
    ) ||
    receive.some(
      (id) =>
        !other.roster.some((p) => p.id === id) ||
        other.roster.find((p) => p.id === id)?.tradeLocked,
    )
  )
    throw new Error("The trade ownership or player lock changed.");
  if (
    drops.some(
      (id) =>
        !own(id) ||
        own(id)?.droppable === false ||
        own(id)?.rosterLocked ||
        own(id)?.tradeLocked ||
        protectedPlayer(id),
    )
  )
    throw new Error("The trade would drop an unavailable or protected player.");
  const normal = (slot: number) => ![21, 24].includes(slot);
  const capacity = Object.entries(snapshot.slotCounts).reduce(
    (sum, [slot, count]) => sum + (normal(Number(slot)) ? count : 0),
    0,
  );
  const rosterSize = snapshot.roster.filter((p) => normal(p.slotId)).length;
  const needed = Math.max(
    0,
    rosterSize -
      give.filter((id) => normal(own(id)!.slotId)).length +
      receive.length -
      capacity,
  );
  if (drops.length !== needed || drops.some((id) => !normal(own(id)!.slotId)))
    throw new Error(`The trade needs exactly ${needed} roster drops.`);
  const rules = snapshot.tradeSettings as { deadlineDate?: number } | null;
  if (rules?.deadlineDate && rules.deadlineDate < now)
    throw new Error("The trade deadline has passed.");
  return offer;
}
export function tradeResponsePayload(
  proposal: Proposal,
  snapshot: Snapshot,
  swid: string,
) {
  const base = {
    isLeagueManager: false,
    teamId: snapshot.teamId,
    memberId: swid,
    scoringPeriodId: snapshot.scoringPeriod,
    executionType: "EXECUTE",
    relatedTransactionId: proposal.offerId,
  };
  return proposal.tradeResponse === "decline"
    ? { ...base, type: "TRADE_DECLINE" }
    : {
        ...base,
        type: "TRADE_ACCEPT",
        items: (proposal.dropPlayerIds ?? []).map((playerId) => ({
          playerId,
          type: "DROP",
          fromTeamId: snapshot.teamId,
        })),
      };
}
export function tradeResponseOutcome(
  proposal: Proposal,
  snapshot: Snapshot,
): { status: "verified" | "submitted" | "failed"; message: string } | null {
  const inbox = snapshot.tradeInbox;
  if (inbox?.status !== "ok") return null;
  const offer = [...inbox.incoming, ...inbox.history].find(
    (t) => t.id === proposal.offerId,
  );
  if (!offer) return null;
  if (proposal.tradeResponse === "decline" && offer.ownerResponse === "decline")
    return {
      status: "verified",
      message: "I declined the offer. ESPN confirmed it.",
    };
  if (proposal.tradeResponse === "accept") {
    const rosterMatches =
      (proposal.receivePlayerIds ?? []).every((id) =>
        snapshot.roster.some((p) => p.id === id),
      ) &&
      [
        ...(proposal.givePlayerIds ?? []),
        ...(proposal.dropPlayerIds ?? []),
      ].every((id) => !snapshot.roster.some((p) => p.id === id));
    if (offer.status === "EXECUTED" && rosterMatches)
      return {
        status: "verified",
        message: "ESPN completed the trade. I checked the new roster.",
      };
    if (
      offer.ownerResponse === "accept" &&
      ["ACCEPTED", "EXECUTED", "PENDING"].includes(offer.status)
    )
      return {
        status: "submitted",
        message: "I accepted the offer. ESPN must finish the trade.",
      };
  }
  if (
    [
      "CANCELED",
      "CANCELLED",
      "DECLINED",
      "EXPIRED",
      "VETOED",
      "REJECTED",
    ].includes(offer.status)
  )
    return {
      status: "failed",
      message: `The offer is ${offer.status.toLowerCase()}. I will not send another reply.`,
    };
  return null;
}
