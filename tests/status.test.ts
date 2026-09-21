import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { createStatusTool } from "../agent/tools/get_status";
import type { dashboardData } from "../lib/db";
import { defaultSettings } from "../lib/types";
type Dashboard = Awaited<ReturnType<typeof dashboardData>>;

test("get_status returns strict JSON with database dates and a private recipient", async () => {
  const fixture = {
    settings: { ...defaultSettings, photonRecipient: "+14155550123" },
    snapshot: null,
    tradeInbox: null,
    connected: true,
    photonConfigured: true,
    monthCost: 0.1,
    gatewayHealth: { status: "ready" },
    lineupWritesEnabled: true,
    waiverWritesEnabled: true,
    tradeWritesEnabled: true,
    reviews: [
      {
        id: "review",
        started_at: new Date("2026-09-19T12:00:00Z"),
        completed_at: null,
      },
    ],
    actions: [
      {
        id: "action",
        created_at: new Date("2026-09-19T12:01:00Z"),
        expires_at: new Date("2026-09-19T18:01:00Z"),
      },
    ],
    deliveries: [
      {
        status: "sent",
        created_at: new Date("2026-09-19T12:02:00Z"),
        last_error: null,
      },
    ],
  } as unknown as Dashboard;
  const tool = createStatusTool(async () => fixture);
  const result = await tool.execute(
    {},
    {} as Parameters<typeof tool.execute>[1],
  );
  assert.ok(
    "settings" in result,
    "Status tool must return an object, not a stream",
  );
  assert.equal(
    z.json().safeParse(result).success,
    true,
    "Eve requires plain JSON values; database Date instances must become ISO strings",
  );
  assert.equal(Object.hasOwn(result.settings, "photonRecipient"), false);
  assert.equal(result.reviews[0].started_at, "2026-09-19T12:00:00.000Z");
  assert.equal(result.reviews[0].completed_at, null);
  assert.equal(result.actions[0].expires_at, "2026-09-19T18:01:00.000Z");
  assert.equal(result.deliveries[0].created_at, "2026-09-19T12:02:00.000Z");
  assert.equal(result.connected, true);
  assert.equal(result.monthCost, 0.1);
  assert.equal(
    fixture.settings.photonRecipient,
    "+14155550123",
    "redaction must not mutate stored settings",
  );
});

test("get_status is JSON-safe before a first review and still omits the recipient key", async () => {
  const tool = createStatusTool(async () => ({
    settings: { ...defaultSettings },
    snapshot: null,
    tradeInbox: null,
    reviews: [],
    actions: [],
    deliveries: [],
    connected: false,
    photonConfigured: false,
    monthCost: 0,
    gatewayHealth: null,
    lineupWritesEnabled: false,
    waiverWritesEnabled: false,
    tradeWritesEnabled: false,
  }));
  const result = await tool.execute(
    {},
    {} as Parameters<typeof tool.execute>[1],
  );
  assert.ok(
    "settings" in result,
    "Status tool must return an object, not a stream",
  );
  assert.equal(z.json().safeParse(result).success, true);
  assert.equal(Object.hasOwn(result.settings, "photonRecipient"), false);
});
