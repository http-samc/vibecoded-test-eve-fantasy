import { test } from "node:test";
import assert from "node:assert/strict";
import { scheduledOccurrence } from "../lib/reviews";
import { defaultSettings, type Snapshot } from "../lib/types";
const s = { ...defaultSettings, leagueId: "123", teamId: 1, scheduled: true };
test("daily check observes local time across daylight saving changes", () => {
  assert.equal(
    scheduledOccurrence(s, null, new Date("2026-07-01T11:59:00Z")),
    null,
  );
  assert.equal(
    scheduledOccurrence(s, null, new Date("2026-07-01T12:00:00Z")),
    "daily:123:2026:2026-07-01",
  );
  assert.equal(
    scheduledOccurrence(s, null, new Date("2026-12-01T12:59:00Z")),
    null,
  );
  assert.equal(
    scheduledOccurrence(s, null, new Date("2026-12-01T13:00:00Z")),
    "daily:123:2026:2026-12-01",
  );
});
test("paused, disabled and disconnected managers do not schedule", () => {
  for (const config of [
    { ...s, paused: true },
    { ...s, scheduled: false },
    { ...s, leagueId: "" },
  ])
    assert.equal(
      scheduledOccurrence(config, null, new Date("2026-07-01T18:00:00Z")),
      null,
    );
});
test("prelock windows have a stable key and are never dispatched after kickoff", () => {
  const snapshot = {
    roster: [{ gameTime: "2026-09-20T17:00:00Z" }],
  } as Snapshot;
  assert.equal(
    scheduledOccurrence(s, snapshot, new Date("2026-09-20T16:01:00Z")),
    "prelock:123:2026-09-20T17:00:00Z:60",
  );
  assert.equal(
    scheduledOccurrence(s, snapshot, new Date("2026-09-20T16:47:00Z")),
    "prelock:123:2026-09-20T17:00:00Z:15",
  );
  assert.ok(
    scheduledOccurrence(
      s,
      snapshot,
      new Date("2026-09-20T17:01:00Z"),
    )?.startsWith("daily:"),
  );
});
test("waiver reviews use ESPN's actual processing timestamp, before the daily digest", () => {
  const snapshot = {
    roster: [],
    freeAgents: [{ waiverProcessAt: "2026-09-18T07:00:00.000Z" }],
  } as unknown as Snapshot;
  assert.equal(
    scheduledOccurrence(s, snapshot, new Date("2026-09-18T06:02:00Z")),
    "waiver:123:2026-09-18T07:00:00.000Z",
  );
  assert.equal(
    scheduledOccurrence(s, snapshot, new Date("2026-09-18T07:01:00Z")),
    null,
  );
});
