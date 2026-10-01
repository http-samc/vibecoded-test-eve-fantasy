import { test } from "node:test";
import assert from "node:assert/strict";
import { reviewSnapshot, leagueRosterColumns } from "../lib/review-context";
import type { Snapshot, Player } from "../lib/types";

test("league context preserves exact players and locks while removing repeated field names", () => {
  const player: Player = {
    id: -3,
    name: "Fixture defense",
    position: "D/ST",
    proTeam: "BUF",
    slotId: 20,
    slot: "BE",
    eligibleSlots: [16, 20],
    projected: null,
    actual: 0,
    injury: "ACTIVE",
    gameTime: null,
    locked: true,
    availability: "ONTEAM",
    droppable: false,
    rosterLocked: true,
    tradeLocked: true,
    waiverProcessAt: null,
  };
  const snapshot = {
    roster: [player],
    freeAgents: [player],
    leagueRosters: Array.from({ length: 12 }, (_, teamId) => ({
      teamId,
      name: `Team ${teamId}`,
      roster: Array(17).fill(player),
    })),
    tradeInbox: {
      status: "error",
      error: "unavailable",
      incoming: [],
      outgoing: [],
      history: [],
    },
    scoringSettings: { playerRankType: "PPR" },
    slotCounts: { 20: 8 },
  } as unknown as Snapshot;
  const before = JSON.stringify(snapshot);
  const compact = reviewSnapshot(snapshot);
  const roundTrip = Object.fromEntries(
    leagueRosterColumns.map((key, i) => [
      key,
      compact.leagueRosters![0].roster[0][i],
    ]),
  );
  assert.deepEqual(roundTrip, player);
  assert.strictEqual(compact.roster, snapshot.roster);
  assert.strictEqual(compact.freeAgents, snapshot.freeAgents);
  assert.strictEqual(compact.tradeInbox, snapshot.tradeInbox);
  assert.deepEqual(compact.scoringSettings, snapshot.scoringSettings);
  assert.equal(JSON.stringify(snapshot), before);
  assert.ok(JSON.stringify(compact).length < before.length * 0.6);
});

test("missing opponent roster fields stay unknown, not unlocked or zero projections", () => {
  const compact = reviewSnapshot({
    leagueRosters: [
      {
        teamId: 2,
        name: "Other",
        roster: [{ id: 1, name: "Unknown" } as Player],
      },
    ],
  } as Snapshot);
  const row = compact.leagueRosters![0].roster[0];
  assert.equal(row[leagueRosterColumns.indexOf("tradeLocked")], null);
  assert.equal(row[leagueRosterColumns.indexOf("projected")], null);
  assert.equal(reviewSnapshot({} as Snapshot).leagueRosters, undefined);
});
