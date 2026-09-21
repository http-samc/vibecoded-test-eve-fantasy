import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTradeInbox } from "../lib/trades";
import type { Snapshot } from "../lib/types";
const now = new Date("2026-09-20T12:00:00Z");
const context = {
  teamId: 1,
  roster: [{ id: 11, name: "Our RB" }],
  leagueRosters: [
    { teamId: 2, name: "Other team", roster: [{ id: 22, name: "Their WR" }] },
  ],
  standings: [
    { id: 1, name: "Our team" },
    { id: 2, name: "Other team" },
  ],
} as unknown as Snapshot;
const offer = {
  id: "offer-1",
  type: "TRADE_PROPOSAL",
  executionType: "EXECUTE",
  status: "PENDING",
  isPending: true,
  teamId: 2,
  proposedDate: now.getTime() - 1000,
  expirationDate: now.getTime() + 86400000,
  items: [
    { playerId: 11, fromTeamId: 1, toTeamId: 2, type: "TRADE" },
    { playerId: 22, fromTeamId: 2, toTeamId: 1, type: "TRADE" },
  ],
  memberId: "private-account-id",
};
test("incoming offers are oriented from our team's perspective and omit account identifiers", () => {
  const inbox = parseTradeInbox({ transactions: [offer] }, context, now);
  assert.equal(inbox.incoming.length, 1);
  assert.deepEqual(inbox.incoming[0].give, [{ id: 11, name: "Our RB" }]);
  assert.deepEqual(inbox.incoming[0].receive, [{ id: 22, name: "Their WR" }]);
  assert.equal(JSON.stringify(inbox).includes("private-account-id"), false);
});
test("ESPN cancellation records override original PENDING and isPending flags", () => {
  const cancel = {
    ...offer,
    id: "cancellation",
    executionType: "CANCEL",
    status: "CANCELED",
    relatedTransactionId: "offer-1",
    proposedDate: now.getTime(),
  };
  const inbox = parseTradeInbox(
    { transactions: [offer, cancel] },
    context,
    now,
  );
  assert.equal(inbox.incoming.length, 0);
  assert.equal(inbox.history.length, 1);
  assert.equal(inbox.history[0].status, "CANCELED");
  assert.equal(inbox.history[0].espnStatus, "PENDING");
});
test("expired, declined, and already accepted offers are not actionable", () => {
  const expired = parseTradeInbox(
    { transactions: [{ ...offer, expirationDate: now.getTime() - 1 }] },
    context,
    now,
  );
  assert.equal(expired.history[0].status, "EXPIRED");
  assert.equal(expired.incoming.length, 0);
  const declined = parseTradeInbox(
    {
      transactions: [
        offer,
        {
          id: "decline",
          teamId: 1,
          type: "TRADE_DECLINE",
          status: "EXECUTED",
          relatedTransactionId: "offer-1",
        },
      ],
    },
    context,
    now,
  );
  assert.equal(declined.history[0].status, "DECLINED");
  const accepted = parseTradeInbox(
    { transactions: [{ ...offer, teamActions: { "1": "ACCEPTED" } }] },
    context,
    now,
  );
  assert.equal(accepted.history[0].status, "ACCEPTED");
});
test("unrelated transactions and outgoing trades are not mistaken for incoming offers", () => {
  const inbox = parseTradeInbox(
    {
      transactions: [
        { ...offer, teamId: 1 },
        {
          ...offer,
          id: "unrelated",
          teamId: 3,
          items: [{ playerId: 33, fromTeamId: 3, toTeamId: 4, type: "TRADE" }],
        },
      ],
    },
    context,
    now,
  );
  assert.equal(inbox.incoming.length, 0);
  assert.equal(inbox.outgoing.length, 1);
  assert.throws(() => parseTradeInbox({ unexpected: "schema" }, context, now));
});

test("accept receipts without status and with DROP items are read as accepted, not completed", () => {
  const receipt = {
    id: "reply",
    type: "TRADE_ACCEPT",
    executionType: "EXECUTE",
    teamId: 1,
    relatedTransactionId: offer.id,
    items: [{ playerId: 33, fromTeamId: 1, type: "DROP" }],
  };
  const inbox = parseTradeInbox(
    { transactions: [offer, receipt] },
    context,
    now,
  );
  assert.equal(inbox.history[0].status, "ACCEPTED");
  assert.equal(inbox.history[0].ownerResponse, "accept");
  const completed = parseTradeInbox(
    { transactions: [{ ...offer, status: "EXECUTED" }, receipt] },
    context,
    now,
  );
  assert.equal(completed.history[0].status, "EXECUTED");
});

test("failed or canceled reply records do not prove an owner reply succeeded", () => {
  for (const type of ["TRADE_ACCEPT", "TRADE_DECLINE"]) {
    for (const status of ["FAILED", "CANCELED"]) {
      const inbox = parseTradeInbox(
        {
          transactions: [
            offer,
            {
              id: "reply",
              type,
              executionType: "EXECUTE",
              status,
              teamId: 1,
              relatedTransactionId: offer.id,
            },
          ],
        },
        context,
        now,
      );
      assert.equal(
        [...inbox.incoming, ...inbox.history][0].ownerResponse,
        null,
      );
    }
  }
});
