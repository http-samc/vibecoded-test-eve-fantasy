import type { Proposal, Settings } from "./types";
export function actionMode(proposal: Proposal, settings: Settings) {
  return proposal.kind === "lineup"
    ? settings.lineupMode
    : proposal.kind === "waiver"
      ? settings.waiverMode
      : proposal.kind === "trade" || proposal.kind === "trade_response"
        ? settings.tradeMode
        : "observe";
}
export function proposedStatus(proposal: Proposal, settings: Settings) {
  if (proposal.kind === "hold") return "considered";
  const mode = actionMode(proposal, settings);
  return mode === "automatic"
    ? "ready"
    : mode === "approve"
      ? "awaiting_approval"
      : "proposed";
}
export function requireActionPermission(
  proposal: Proposal,
  settings: Settings,
  ownerApproved: boolean,
) {
  if (settings.paused) throw new Error("Eve is paused.");
  if (proposal.kind === "hold")
    throw new Error("This is a hold decision, not a roster action.");
  const mode = actionMode(proposal, settings);
  if (mode === "observe")
    throw new Error("Current policy allows recommendations only.");
  if (mode === "approve" && !ownerApproved)
    throw new Error("Owner approval is required by the current policy.");
}
export function transactionIdentity(proposal: Proposal) {
  return JSON.stringify({
    kind: proposal.kind,
    offerId: proposal.offerId ?? null,
    response: proposal.tradeResponse ?? null,
    drops: [...(proposal.dropPlayerIds ?? [])].sort((a, b) => a - b),
    target: proposal.targetTeamId ?? null,
    add: proposal.addPlayerId ?? null,
    drop: proposal.dropPlayerId ?? null,
    bid: proposal.bid ?? 0,
    give: [...(proposal.givePlayerIds ?? [])].sort((a, b) => a - b),
    receive: [...(proposal.receivePlayerIds ?? [])].sort((a, b) => a - b),
  });
}
