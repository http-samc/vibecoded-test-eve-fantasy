import type { Snapshot, Proposal, Settings } from "./types";
export const benchSlot = (s: Snapshot) => (s.sport === "football" ? 20 : 8);
export const reserveSlots = (s: Snapshot) =>
  s.sport === "football" ? [20, 21, 24, 25] : [8, 9, 10];
export const isStarter = (slot: number, s: Snapshot) =>
  !reserveSlots(s).includes(slot);
export function optimizeLineup(snapshot: Snapshot): Proposal | null {
  const players = snapshot.roster.filter(
    (p) => p.slotId === benchSlot(snapshot) || isStarter(p.slotId, snapshot),
  );
  // Unknown projections must never silently become zero or justify a swap.
  if (players.some((p) => p.projected === null)) return null;
  const locked = players.filter((p) => p.locked);
  const slots = Object.entries(snapshot.slotCounts).flatMap(([slot, count]) =>
    isStarter(Number(slot), snapshot)
      ? Array.from({ length: count }, () => Number(slot))
      : [],
  );
  for (const p of locked.filter((p) => isStarter(p.slotId, snapshot))) {
    const i = slots.indexOf(p.slotId);
    if (i < 0) return null;
    slots.splice(i, 1);
  }
  if (slots.length > 15) return null;
  const available = players.filter((p) => !p.locked);
  type Choice = { score: number; picks: { playerId: number; slot: number }[] };
  const dp = new Map<number, Choice>([[0, { score: 0, picks: [] }]]);
  for (const p of available) {
    for (const [mask, choice] of [...dp.entries()]) {
      for (let i = 0; i < slots.length; i++) {
        if (mask & (1 << i) || !p.eligibleSlots.includes(slots[i])) continue;
        const score =
          choice.score +
          (/^(OUT|INJURY_RESERVE|SUSPENSION)$/.test(p.injury)
            ? 0
            : p.projected!);
        const next = mask | (1 << i);
        const previous = dp.get(next);
        if (!previous || score > previous.score)
          dp.set(next, {
            score,
            picks: [...choice.picks, { playerId: p.id, slot: slots[i] }],
          });
      }
    }
  }
  const best = dp.get((1 << slots.length) - 1);
  if (!best) return null;
  const current = available
    .filter((p) => isStarter(p.slotId, snapshot))
    .reduce(
      (sum, p) =>
        sum +
        (/^(OUT|INJURY_RESERVE|SUSPENSION)$/.test(p.injury) ? 0 : p.projected!),
      0,
    );
  const gain = best.score - current;
  if (gain < 0.5) return null;
  const assignments = available
    .map((p) => ({
      playerId: p.id,
      fromSlot: p.slotId,
      toSlot:
        best.picks.find((x) => x.playerId === p.id)?.slot ??
        benchSlot(snapshot),
    }))
    .filter((p) => p.fromSlot !== p.toSlot);
  return {
    kind: "lineup",
    title: "Improve the starting lineup",
    rationale: `The best legal assignment gains ${gain.toFixed(1)} ESPN projected points. Locked players remain in place.`,
    expectedGain: Math.round(gain * 10) / 10,
    playerIds: assignments.map((p) => p.playerId),
    assignments,
    sources: [],
  };
}
export function validateLineup(
  proposal: Proposal,
  snapshot: Snapshot,
  settings: Settings,
  now = Date.now(),
) {
  if (settings.paused) throw new Error("Eve is paused.");
  if (proposal.kind !== "lineup" || !proposal.assignments?.length)
    throw new Error("This is not an executable lineup proposal.");
  if (now - new Date(snapshot.fetchedAt).getTime() > 120000)
    throw new Error("Roster data is stale.");
  if (
    snapshot.teamId !== settings.teamId ||
    snapshot.leagueId !== settings.leagueId ||
    snapshot.season !== settings.season ||
    snapshot.sport !== settings.sport
  )
    throw new Error("The connected team changed.");
  const slots = new Map(snapshot.roster.map((p) => [p.id, p.slotId]));
  const seen = new Set<number>();
  for (const move of proposal.assignments) {
    const p = snapshot.roster.find((p) => p.id === move.playerId);
    if (!p || seen.has(p.id))
      throw new Error("Invalid or duplicate roster player.");
    seen.add(p.id);
    if (p.slotId !== move.fromSlot)
      throw new Error("Roster changed since the proposal was made.");
    if (
      p.locked ||
      !p.gameTime ||
      new Date(p.gameTime).getTime() <= now + 60000
    )
      throw new Error(
        "A player is locked, near lock, or has no verified game time.",
      );
    if (
      move.toSlot !== benchSlot(snapshot) &&
      !p.eligibleSlots.includes(move.toSlot)
    )
      throw new Error("Player is not eligible for the target slot.");
    if (
      reserveSlots(snapshot).includes(move.fromSlot) &&
      move.fromSlot !== benchSlot(snapshot)
    )
      throw new Error("IR and reserve moves require separate validation.");
    if (
      reserveSlots(snapshot).includes(move.toSlot) &&
      move.toSlot !== benchSlot(snapshot)
    )
      throw new Error("Reserve moves are not supported by the lineup adapter.");
    slots.set(p.id, move.toSlot);
  }
  const counts: Record<string, number> = {};
  for (const slot of slots.values()) counts[slot] = (counts[slot] ?? 0) + 1;
  for (const [slot, count] of Object.entries(counts))
    if (count > (snapshot.slotCounts[slot] ?? 0))
      throw new Error("The proposed lineup exceeds a roster slot limit.");
  return true;
}
