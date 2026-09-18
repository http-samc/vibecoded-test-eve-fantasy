import { test } from "node:test";
import assert from "node:assert/strict";
import {
  actionMode,
  proposedStatus,
  requireActionPermission,
  transactionIdentity,
} from "../lib/policy";
import { defaultSettings, type Proposal } from "../lib/types";
import { proposalSchema } from "../lib/reviews";
const automatic = {
  ...defaultSettings,
  lineupMode: "automatic" as const,
  waiverMode: "automatic" as const,
  tradeMode: "automatic" as const,
};
const proposal = (kind: Proposal["kind"]): Proposal => ({
  kind,
  title: "Fixture",
  rationale: "Fixture",
  playerIds: [],
  sources: [],
  expectedGain: null,
});
test("standing automatic permission executes every supported move without a per-move approval", () => {
  for (const kind of ["lineup", "waiver", "trade"] as const) {
    const p = proposal(kind);
    assert.equal(actionMode(p, automatic), "automatic");
    assert.equal(proposedStatus(p, automatic), "ready");
    assert.doesNotThrow(() => requireActionPermission(p, automatic, false));
  }
});
test("approval, observation and pause still govern execution after a policy change", () => {
  for (const kind of ["lineup", "waiver", "trade"] as const) {
    const p = proposal(kind);
    const approval = {
      ...defaultSettings,
      lineupMode: "approve" as const,
      waiverMode: "approve" as const,
      tradeMode: "approve" as const,
    };
    assert.throws(
      () => requireActionPermission(p, approval, false),
      /approval is required/,
    );
    assert.doesNotThrow(() => requireActionPermission(p, approval, true));
    assert.throws(
      () => requireActionPermission(p, defaultSettings, true),
      /recommendations only/,
    );
    assert.throws(
      () => requireActionPermission(p, { ...automatic, paused: true }, false),
      /paused/,
    );
  }
});
test("pending trade identity is independent of player array order and human wording", () => {
  const a = {
    ...proposal("trade"),
    targetTeamId: 2,
    givePlayerIds: [11, 12],
    receivePlayerIds: [21, 22],
  };
  assert.equal(
    transactionIdentity(a),
    transactionIdentity({
      ...a,
      title: "Changed wording",
      givePlayerIds: [12, 11],
      receivePlayerIds: [22, 21],
    }),
  );
  assert.notEqual(
    transactionIdentity(a),
    transactionIdentity({ ...a, targetTeamId: 3 }),
  );
});
test("defense player IDs can be negative in actionable proposals", () => {
  const p = proposalSchema.parse({
    ...proposal("waiver"),
    addPlayerId: -16017,
    dropPlayerId: -16023,
  });
  assert.equal(p.addPlayerId, -16017);
});
