import { test } from "node:test";
import assert from "node:assert/strict";
import { transactionPayload, validateTransaction } from "../lib/transactions";
import {
  defaultSettings,
  type Snapshot,
  type Proposal,
  type Player,
} from "../lib/types";
const now = Date.parse("2026-09-20T12:00:00Z");
const player = (id: number) =>
  ({ id, name: `Player ${id}`, availability: "FREEAGENT" }) as Player;
const snapshot = {
  id: "fixture",
  leagueName: "Fixture league",
  teamName: "Fixture team",
  matchupPeriod: 3,
  standings: [],
  opponent: null,
  score: 0,
  scoringSettings: {},
  acquisitionSettings: {},
  leagueId: "123",
  teamId: 1,
  season: 2026,
  sport: "football",
  fetchedAt: new Date(now).toISOString(),
  scoringPeriod: 3,
  roster: [player(1), player(2)],
  freeAgents: [{ ...player(4), availability: "WAIVERS" }],
  slotCounts: { 20: 3 },
  faabRemaining: 50,
  leagueRosters: [{ teamId: 2, name: "Other", roster: [player(3)] }],
  tradeSettings: { deadlineDate: now + 86400000 },
} as Snapshot;
const settings = {
  ...defaultSettings,
  leagueId: "123",
  teamId: 1,
  waiverMode: "approve" as const,
  tradeMode: "approve" as const,
  maxWaiverBid: 10,
};
const trade: Proposal = {
  kind: "trade",
  title: "Trade",
  rationale: "Fixture",
  expectedGain: null,
  playerIds: [1, 3],
  givePlayerIds: [1],
  receivePlayerIds: [3],
  targetTeamId: 2,
  sources: [],
};
const waiver: Proposal = {
  kind: "waiver",
  title: "Claim",
  rationale: "Fixture",
  expectedGain: null,
  playerIds: [4, 2],
  addPlayerId: 4,
  dropPlayerId: 2,
  bid: 5,
  sources: [],
};
test("trade direction is exact and ownership is independently checked", () => {
  assert.equal(validateTransaction(trade, snapshot, settings, now), true);
  const payload = transactionPayload(
    trade,
    snapshot,
    "fixture",
    "2026-09-22T12:00:00.000Z",
  );
  assert.ok("items" in payload);
  assert.deepEqual(payload.items, [
    { playerId: 1, type: "TRADE", fromTeamId: 1, toTeamId: 2 },
    { playerId: 3, type: "TRADE", fromTeamId: 2, toTeamId: 1 },
  ]);
  assert.throws(
    () =>
      validateTransaction(
        { ...trade, receivePlayerIds: [2] },
        snapshot,
        settings,
        now,
      ),
    /ownership/,
  );
  assert.throws(
    () =>
      validateTransaction(
        trade,
        snapshot,
        { ...settings, protectedPlayers: ["Player 1"] },
        now,
      ),
    /protected/,
  );
  assert.throws(
    () =>
      validateTransaction(
        trade,
        { ...snapshot, tradeSettings: { deadlineDate: now - 1 } },
        settings,
        now,
      ),
    /deadline/,
  );
});
test("waivers reject over-budget bids, missing FAAB, protected drops and unavailable players", () => {
  assert.equal(validateTransaction(waiver, snapshot, settings, now), true);
  assert.throws(
    () => validateTransaction({ ...waiver, bid: 11 }, snapshot, settings, now),
    /policy limit/,
  );
  assert.throws(
    () =>
      validateTransaction(
        waiver,
        { ...snapshot, faabRemaining: null },
        settings,
        now,
      ),
    /unverified/,
  );
  assert.throws(
    () =>
      validateTransaction(
        waiver,
        snapshot,
        { ...settings, protectedPlayers: ["2"] },
        now,
      ),
    /protected/,
  );
  assert.throws(
    () =>
      validateTransaction(
        { ...waiver, addPlayerId: 99 },
        snapshot,
        settings,
        now,
      ),
    /not confirmed/,
  );
  const payload = transactionPayload(waiver, snapshot, "fixture");
  assert.equal(payload.type, "WAIVER");
  assert.ok("items" in payload);
  assert.deepEqual(payload.items, [
    { playerId: 4, type: "ADD", toTeamId: 1 },
    { playerId: 2, type: "DROP", fromTeamId: 1 },
  ]);
});
test("paused and observation policies cannot submit transactions", () => {
  assert.throws(
    () =>
      validateTransaction(trade, snapshot, { ...settings, paused: true }, now),
    /paused/,
  );
  assert.throws(
    () =>
      validateTransaction(
        trade,
        snapshot,
        { ...settings, tradeMode: "observe" },
        now,
      ),
    /recommendations only/,
  );
  assert.throws(
    () =>
      validateTransaction(
        waiver,
        snapshot,
        { ...settings, waiverMode: "observe" },
        now,
      ),
    /recommendations only/,
  );
});

test("available free agents use immediate acquisitions, and reserve capacity cannot justify a normal roster add", () => {
  const free = {
    ...snapshot,
    freeAgents: [{ ...player(4), availability: "FREEAGENT" }],
  };
  assert.equal(transactionPayload(waiver, free, "fixture").type, "FREEAGENT");
  assert.equal(
    "bidAmount" in transactionPayload(waiver, free, "fixture"),
    false,
  );
  assert.throws(
    () =>
      validateTransaction(
        { ...waiver, dropPlayerId: undefined, bid: 0 },
        { ...free, slotCounts: { 20: 2, 21: 1 } },
        settings,
        now,
      ),
    /roster is full/,
  );
  assert.throws(
    () =>
      validateTransaction(
        waiver,
        {
          ...snapshot,
          roster: [player(1), { ...player(2), droppable: false }],
        },
        settings,
        now,
      ),
    /does not currently allow/,
  );
});
