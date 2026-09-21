import { test } from "node:test";
import assert from "node:assert/strict";
import { tradeResponseOutcome } from "../lib/trade-responses";
import { transactionPayload, validateTransaction } from "../lib/transactions";
import {
  proposedStatus,
  requireActionPermission,
  transactionIdentity,
} from "../lib/policy";
import {
  defaultSettings,
  type Player,
  type Snapshot,
  type Proposal,
  type TradeOffer,
} from "../lib/types";

const now = Date.parse("2026-09-20T12:00:00Z");
const player = (id: number, slotId = 20) =>
  ({ id, name: `Player ${id}`, slotId, droppable: true }) as Player;
const offer: TradeOffer = {
  id: "incoming-1",
  direction: "incoming",
  status: "PENDING",
  espnStatus: "PENDING",
  counterpartyTeamId: 2,
  counterpartyName: "Other",
  createdAt: new Date(now - 1000).toISOString(),
  expiresAt: new Date(now + 86400000).toISOString(),
  give: [{ id: 1, name: "Player 1" }],
  receive: [
    { id: -3, name: "Defense" },
    { id: 4, name: "Player 4" },
  ],
};
const snapshot = {
  leagueId: "123",
  teamId: 1,
  season: 2026,
  sport: "football",
  scoringPeriod: 3,
  fetchedAt: new Date(now).toISOString(),
  roster: [player(1), player(2), player(5, 21)],
  slotCounts: { 20: 2, 21: 1 },
  tradeSettings: { deadlineDate: now + 86400000 },
  leagueRosters: [
    { teamId: 2, name: "Other", roster: [player(-3), player(4)] },
  ],
  tradeInbox: {
    status: "ok",
    checkedAt: new Date(now).toISOString(),
    error: null,
    incoming: [offer],
    outgoing: [],
    history: [],
  },
} as unknown as Snapshot;
const settings = {
  ...defaultSettings,
  leagueId: "123",
  teamId: 1,
  tradeMode: "automatic" as const,
};
const accept: Proposal = {
  kind: "trade_response",
  title: "Accept offer",
  rationale: "Improve team",
  expectedGain: null,
  playerIds: [1, -3, 4],
  offerId: offer.id,
  tradeResponse: "accept",
  targetTeamId: 2,
  givePlayerIds: [1],
  receivePlayerIds: [-3, 4],
  dropPlayerIds: [2],
  sources: [],
};
const decline: Proposal = {
  ...accept,
  tradeResponse: "decline",
  dropPlayerIds: [],
};
const withOffer = (changes: Partial<TradeOffer>): Snapshot => ({
  ...snapshot,
  tradeInbox: { ...snapshot.tradeInbox!, incoming: [{ ...offer, ...changes }] },
});

test("automatic replies use exact offer IDs and only required drop items", () => {
  assert.equal(validateTransaction(accept, snapshot, settings, now), true);
  assert.equal(validateTransaction(decline, snapshot, settings, now), true);
  assert.equal(proposedStatus(accept, settings), "ready");
  assert.doesNotThrow(() => requireActionPermission(accept, settings, false));
  const body = transactionPayload(accept, snapshot, "fixture");
  assert.equal(body.type, "TRADE_ACCEPT");
  assert.ok("relatedTransactionId" in body);
  assert.ok("items" in body);
  assert.equal(body.relatedTransactionId, offer.id);
  assert.deepEqual(body.items, [{ playerId: 2, type: "DROP", fromTeamId: 1 }]);
  const rejected = transactionPayload(decline, snapshot, "fixture");
  assert.equal(rejected.type, "TRADE_DECLINE");
  assert.ok("relatedTransactionId" in rejected);
  assert.equal(rejected.relatedTransactionId, offer.id);
  assert.equal("items" in rejected, false);
  assert.notEqual(transactionIdentity(accept), transactionIdentity(decline));
});

test("stale, changed, closed, expired, or unavailable offers cannot be answered", () => {
  for (const s of [
    withOffer({ status: "CANCELED" }),
    withOffer({ ownerResponse: "accept" }),
    withOffer({ expiresAt: new Date(now + 10000).toISOString() }),
    withOffer({ give: [{ id: 2, name: "Player 2" }] }),
    { ...snapshot, fetchedAt: new Date(now - 121000).toISOString() },
    {
      ...snapshot,
      tradeInbox: { ...snapshot.tradeInbox!, status: "error" as const },
    },
    { ...snapshot, teamId: 3 },
  ])
    assert.throws(() => validateTransaction(accept, s, settings, now));
});

test("acceptance checks current ownership, protections, locks and exact normal-roster capacity", () => {
  for (const changes of [
    { dropPlayerIds: [] },
    { dropPlayerIds: [2, 5] },
    { dropPlayerIds: [5] },
    { dropPlayerIds: [1] },
    { dropPlayerIds: [2, 2] },
    { dropPlayerIds: [99] },
  ])
    assert.throws(() =>
      validateTransaction({ ...accept, ...changes }, snapshot, settings, now),
    );
  for (const protectedPlayers of [["2"], ["Player 1"]])
    assert.throws(() =>
      validateTransaction(
        accept,
        snapshot,
        { ...settings, protectedPlayers },
        now,
      ),
    );
  for (const flag of [
    { droppable: false },
    { rosterLocked: true },
    { tradeLocked: true },
  ])
    assert.throws(() =>
      validateTransaction(
        accept,
        {
          ...snapshot,
          roster: [player(1), { ...player(2), ...flag }, player(5, 21)],
        },
        settings,
        now,
      ),
    );
  assert.throws(() =>
    validateTransaction(
      accept,
      { ...snapshot, leagueRosters: [] },
      settings,
      now,
    ),
  );
  assert.throws(() =>
    validateTransaction(
      accept,
      { ...snapshot, tradeSettings: { deadlineDate: now - 1 } },
      settings,
      now,
    ),
  );
  assert.throws(() =>
    validateTransaction(
      { ...decline, dropPlayerIds: [2] },
      snapshot,
      settings,
      now,
    ),
  );
  assert.throws(() =>
    requireActionPermission(
      accept,
      { ...settings, tradeMode: "approve" },
      false,
    ),
  );
  assert.throws(() =>
    requireActionPermission(accept, { ...settings, paused: true }, false),
  );
});

test("an acceptance is not a completed trade until ESPN status and roster agree", () => {
  assert.equal(tradeResponseOutcome(accept, snapshot), null);
  assert.equal(
    tradeResponseOutcome(
      accept,
      withOffer({ status: "ACCEPTED", ownerResponse: "accept" }),
    )?.status,
    "submitted",
  );
  const completed = withOffer({ status: "EXECUTED", ownerResponse: "accept" });
  assert.equal(tradeResponseOutcome(accept, completed)?.status, "submitted");
  assert.equal(
    tradeResponseOutcome(accept, {
      ...completed,
      roster: [player(-3), player(4), player(5, 21)],
    })?.status,
    "verified",
  );
  assert.equal(
    tradeResponseOutcome(
      accept,
      withOffer({ status: "CANCELED", ownerResponse: "accept" }),
    )?.status,
    "failed",
  );
  assert.equal(
    tradeResponseOutcome(
      decline,
      withOffer({ status: "DECLINED", ownerResponse: "decline" }),
    )?.status,
    "verified",
  );
  assert.equal(
    tradeResponseOutcome(decline, withOffer({ status: "DECLINED" }))?.status,
    "failed",
  );
});
