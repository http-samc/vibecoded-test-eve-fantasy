import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePlayer, fetchSnapshot, EspnRequestError } from "../lib/espn";
import { defaultSettings } from "../lib/types";
const settings = { ...defaultSettings, leagueId: "123", teamId: 1 };
test("definitive ESPN rejections are distinguished from uncertain timeout and server responses", () => {
  assert.equal(
    new EspnRequestError("rejected", 409).definitivelyRejected,
    true,
  );
  assert.equal(new EspnRequestError("auth", 403).definitivelyRejected, true);
  assert.equal(
    new EspnRequestError("timeout", 408).definitivelyRejected,
    false,
  );
  assert.equal(new EspnRequestError("server", 503).definitivelyRejected, false);
});
function rawPlayer() {
  return {
    id: 1,
    fullName: "Fixture player",
    defaultPositionId: 2,
    proTeamId: 1,
    eligibleSlots: [2, 23, 20],
    stats: [
      {
        seasonId: 2026,
        scoringPeriodId: 0,
        statSourceId: 1,
        statSplitTypeId: 0,
        appliedTotal: 250,
      },
      {
        seasonId: 2026,
        scoringPeriodId: 3,
        statSourceId: 1,
        statSplitTypeId: 1,
        appliedTotal: 17,
      },
      {
        seasonId: 2026,
        scoringPeriodId: 3,
        statSourceId: 0,
        statSplitTypeId: 1,
        appliedTotal: 12,
      },
    ],
  };
}
test("ESPN projection selection uses the exact season and scoring period", () => {
  const entry = { lineupSlotId: 2, playerPoolEntry: { player: rawPlayer() } };
  const parsed = parsePlayer(entry, settings, 3, [
    {
      id: 1,
      abbrev: "BUF",
      proGamesByScoringPeriod: { "3": [{ date: Date.now() + 3600000 }] },
    },
  ]);
  assert.equal(parsed.projected, 17);
  assert.equal(parsed.actual, 12);
  assert.equal(parsed.locked, false);
  assert.equal(parsePlayer(entry, settings, 4, []).projected, null);
  assert.equal(parsePlayer(entry, settings, 4, []).locked, true);
});
test("snapshot read tolerates unavailable enrichment without inventing data or enabling unlocked players", async () => {
  const saved = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("proTeamSchedules") || url.includes("kona_player_info"))
      return Response.json({}, { status: 503 });
    return Response.json({
      scoringPeriodId: 3,
      status: { currentMatchupPeriod: 3 },
      settings: {
        name: "Fixture league",
        rosterSettings: { lineupSlotCounts: { "2": 1, "20": 5 } },
      },
      teams: [
        {
          id: 1,
          name: "Fixture team",
          record: {
            overall: {
              wins: 2,
              losses: 0,
              ties: 0,
              pointsFor: 250,
              pointsAgainst: 200,
            },
          },
          roster: {
            entries: [
              { lineupSlotId: 2, playerPoolEntry: { player: rawPlayer() } },
            ],
          },
        },
      ],
      schedule: [],
    });
  };
  try {
    const s = await fetchSnapshot(settings, {
      espnS2: "fixture",
      swid: "fixture",
    });
    assert.equal(s.teamName, "Fixture team");
    assert.equal(s.roster[0].projected, 17);
    assert.equal(s.roster[0].locked, true);
    assert.deepEqual(s.freeAgents, []);
    assert.equal(s.standings[0].rank, 1);
    assert.equal(s.leagueId, "123");
  } finally {
    globalThis.fetch = saved;
  }
});
test("expired credentials produce a bounded reconnection error without cookie contents", async () => {
  const saved = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({ private: "data" }, { status: 403 });
  try {
    await assert.rejects(
      fetchSnapshot(settings, { espnS2: "fixture-sensitive", swid: "fixture" }),
      /Refresh the ESPN cookies/,
    );
  } finally {
    globalThis.fetch = saved;
  }
});
