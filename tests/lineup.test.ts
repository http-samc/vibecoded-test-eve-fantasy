import { test } from "node:test";
import assert from "node:assert/strict";
import { optimizeLineup, validateLineup } from "../lib/lineup";
import { defaultSettings, type Player, type Snapshot } from "../lib/types";
const now = Date.parse("2026-09-20T12:00:00Z");
function player(
  id: number,
  slotId: number,
  projected: number,
  eligibleSlots: number[],
): Player {
  return {
    id,
    name: `Player ${id}`,
    position: "RB",
    proTeam: "BUF",
    slotId,
    slot: String(slotId),
    eligibleSlots,
    projected,
    actual: 0,
    injury: "ACTIVE",
    gameTime: "2026-09-20T17:00:00Z",
    locked: false,
  };
}
function fixture(roster: Player[]): Snapshot {
  return {
    id: "snapshot",
    leagueId: "123",
    fetchedAt: new Date(now).toISOString(),
    leagueName: "Test",
    teamName: "Test",
    teamId: 1,
    scoringPeriod: 3,
    matchupPeriod: 3,
    season: 2026,
    sport: "football",
    roster,
    standings: [],
    freeAgents: [],
    opponent: null,
    score: 0,
    slotCounts: { "2": 1, "23": 1, "20": 5 },
    scoringSettings: {},
    acquisitionSettings: {},
    tradeSettings: {},
  };
}
const settings = { ...defaultSettings, leagueId: "123", teamId: 1 };
test("optimizer assigns scarce position before FLEX rather than making a greedy swap", () => {
  const s = fixture([
    player(1, 2, 5, [2, 23]),
    player(2, 23, 8, [23]),
    player(3, 20, 20, [2, 23]),
    player(4, 20, 19, [23]),
  ]);
  const p = optimizeLineup(s)!;
  assert.equal(p.expectedGain, 26);
  assert.equal(p.assignments!.find((m) => m.playerId === 3)?.toSlot, 2);
  assert.equal(p.assignments!.find((m) => m.playerId === 4)?.toSlot, 23);
  assert.equal(validateLineup(p, s, settings, now), true);
});
test("locked starters and locked bench players never move", () => {
  const s = fixture([
    { ...player(1, 2, 5, [2, 23]), locked: true },
    player(2, 23, 8, [23]),
    { ...player(3, 20, 30, [2, 23]), locked: true },
    player(4, 20, 19, [23]),
  ]);
  const p = optimizeLineup(s)!;
  assert.deepEqual(p.playerIds, [2, 4]);
  assert.equal(p.expectedGain, 11);
});
test("missing projections produce a hold rather than treating missing as zero", () => {
  const s = fixture([
    { ...player(1, 2, 5, [2, 23]), projected: null },
    player(2, 23, 8, [23]),
    player(3, 20, 20, [2, 23]),
  ]);
  assert.equal(optimizeLineup(s), null);
});
test("already optimal lineups produce no churn", () => {
  assert.equal(
    optimizeLineup(
      fixture([
        player(1, 2, 20, [2, 23]),
        player(2, 23, 19, [23]),
        player(3, 20, 5, [2, 23]),
      ]),
    ),
    null,
  );
});
test("executor rejects changed rosters, full slots, late actions and another league", () => {
  const s = fixture([
    player(1, 2, 5, [2, 23]),
    player(2, 23, 8, [23]),
    player(3, 20, 20, [2, 23]),
  ]);
  const p = optimizeLineup(s)!;
  assert.throws(
    () => validateLineup(p, { ...s, leagueId: "456" }, settings, now),
    /team changed/,
  );
  assert.throws(
    () => validateLineup(p, s, { ...settings, paused: true }, now),
    /paused/,
  );
  assert.throws(() => validateLineup(p, s, settings, now + 180000), /stale/);
  const changed = structuredClone(s);
  changed.roster[2].slotId = 2;
  assert.throws(
    () => validateLineup(p, changed, settings, now),
    /Roster changed/,
  );
  assert.throws(
    () =>
      validateLineup(
        { ...p, assignments: [{ playerId: 3, fromSlot: 20, toSlot: 2 }] },
        s,
        settings,
        now,
      ),
    /slot limit/,
  );
  const near = structuredClone(s);
  near.roster[2].gameTime = new Date(now + 30000).toISOString();
  assert.throws(() => validateLineup(p, near, settings, now), /near lock/);
});
