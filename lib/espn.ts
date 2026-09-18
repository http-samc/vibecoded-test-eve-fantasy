import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { EspnCredentials, Settings, Snapshot, Player } from "./types";

const footballSlots: Record<number, string> = {
  0: "QB",
  1: "TQB",
  2: "RB",
  3: "RB/WR",
  4: "WR",
  5: "WR/TE",
  6: "TE",
  7: "OP",
  8: "DT",
  9: "DE",
  10: "LB",
  11: "DL",
  12: "CB",
  13: "S",
  14: "DB",
  15: "DP",
  16: "D/ST",
  17: "K",
  18: "P",
  19: "HC",
  20: "BE",
  21: "IR",
  23: "FLEX",
};
const basketballSlots: Record<number, string> = {
  0: "PG",
  1: "SG",
  2: "SF",
  3: "PF",
  4: "C",
  5: "G",
  6: "F",
  7: "UTIL",
  8: "BE",
  9: "IR",
};
const statSchema = z
  .object({
    seasonId: z.number(),
    scoringPeriodId: z.number(),
    statSourceId: z.number(),
    statSplitTypeId: z.number().optional(),
    appliedTotal: z.number().optional(),
  })
  .passthrough();
const playerSchema = z
  .object({
    id: z.number(),
    fullName: z.string(),
    defaultPositionId: z.number(),
    proTeamId: z.number(),
    eligibleSlots: z.array(z.number()).default([]),
    injuryStatus: z.string().optional(),
    stats: z.array(statSchema).default([]),
  })
  .passthrough();
const entrySchema = z
  .object({
    lineupSlotId: z.number().optional(),
    status: z.string().optional(),
    playerPoolEntry: z.object({ player: playerSchema }).optional(),
    player: playerSchema.optional(),
  })
  .passthrough();
const teamSchema = z
  .object({
    id: z.number(),
    name: z.string().optional(),
    location: z.string().optional(),
    nickname: z.string().optional(),
    abbrev: z.string().optional(),
    rankCalculatedFinal: z.number().optional(),
    playoffSeed: z.number().optional(),
    transactionCounter: z
      .object({ acquisitionBudgetSpent: z.number().optional() })
      .optional(),
    record: z
      .object({
        overall: z
          .object({
            wins: z.number().default(0),
            losses: z.number().default(0),
            ties: z.number().default(0),
            pointsFor: z.number().default(0),
            pointsAgainst: z.number().default(0),
          })
          .optional(),
      })
      .optional(),
    roster: z.object({ entries: z.array(entrySchema) }).optional(),
  })
  .passthrough();
const leagueSchema = z
  .object({
    teams: z.array(teamSchema).min(1),
    scoringPeriodId: z.number(),
    status: z
      .object({ currentMatchupPeriod: z.number().optional() })
      .optional(),
    settings: z
      .object({
        name: z.string(),
        rosterSettings: z.object({
          lineupSlotCounts: z.record(z.string(), z.number()),
        }),
        scoringSettings: z.unknown().optional(),
        acquisitionSettings: z.unknown().optional(),
        tradeSettings: z.unknown().optional(),
      })
      .passthrough(),
    schedule: z
      .array(
        z.object({
          matchupPeriodId: z.number(),
          home: z.object({
            teamId: z.number(),
            totalPoints: z.number().default(0),
          }),
          away: z
            .object({ teamId: z.number(), totalPoints: z.number().default(0) })
            .optional(),
        }),
      )
      .default([]),
  })
  .passthrough();
const proSchema = z.object({
  settings: z.object({
    proTeams: z.array(
      z.object({
        id: z.number(),
        abbrev: z.string().optional(),
        proGamesByScoringPeriod: z
          .record(z.string(), z.array(z.object({ date: z.number() })))
          .optional(),
      }),
    ),
  }),
});
type League = z.infer<typeof leagueSchema>;
type ProTeams = z.infer<typeof proSchema>["settings"]["proTeams"];
const teamName = (t: League["teams"][number]) =>
  t.name ||
  [t.location, t.nickname].filter(Boolean).join(" ") ||
  t.abbrev ||
  `Team ${t.id}`;
export function seasonBase(
  s: Pick<Settings, "sport" | "season">,
  write = false,
) {
  return `https://lm-api-${write ? "writes" : "reads"}.fantasy.espn.com/apis/v3/games/${s.sport === "football" ? "ffl" : "fba"}/seasons/${s.season}`;
}
export async function espnRequest(
  url: string,
  credentials: EspnCredentials,
  init: RequestInit = {},
) {
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  headers.set(
    "cookie",
    `espn_s2=${credentials.espnS2}; SWID=${credentials.swid}`,
  );
  const response = await fetch(url, {
    ...init,
    headers,
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    if ([401, 403].includes(response.status))
      throw new Error(
        "ESPN did not authorize this request. Refresh the ESPN cookies in Connections.",
      );
    if (response.status === 429)
      throw new Error("ESPN is rate limiting requests. Try again later.");
    throw new Error(
      `ESPN request failed (${response.status}). No change has been confirmed.`,
    );
  }
  if (response.status === 204) return null;
  return response.json() as Promise<unknown>;
}
export async function fetchLeague(s: Settings, c: EspnCredentials) {
  const query = ["mTeam", "mRoster", "mSettings", "mMatchup", "mStandings"]
    .map((v) => `view=${v}`)
    .join("&");
  const result = leagueSchema.safeParse(
    await espnRequest(
      `${seasonBase(s)}/segments/0/leagues/${s.leagueId}?${query}`,
      c,
    ),
  );
  if (!result.success)
    throw new Error(
      "ESPN returned an unexpected league format. Writes remain paused until the adapter is checked.",
    );
  return result.data;
}
export function listTeams(league: League) {
  return league.teams.map((t) => ({ id: t.id, name: teamName(t) }));
}
export function parsePlayer(
  entry: z.infer<typeof entrySchema>,
  s: Settings,
  period: number,
  pros: ProTeams,
): Player {
  const p = entry.playerPoolEntry?.player ?? entry.player;
  if (!p) throw new Error("ESPN roster entry is missing its player.");
  const pro = pros.find((t) => t.id === p.proTeamId);
  const game = pro?.proGamesByScoringPeriod?.[String(period)]?.[0];
  const stat = (source: number) =>
    p.stats.find(
      (st) =>
        st.seasonId === s.season &&
        st.scoringPeriodId === period &&
        st.statSourceId === source &&
        st.statSplitTypeId !== 0,
    )?.appliedTotal ?? null;
  const slotId = entry.lineupSlotId ?? (s.sport === "football" ? 20 : 8);
  const position =
    s.sport === "football"
      ? (
          { 1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "D/ST" } as Record<
            number,
            string
          >
        )[p.defaultPositionId]
      : (
          { 1: "PG", 2: "SG", 3: "SF", 4: "PF", 5: "C" } as Record<
            number,
            string
          >
        )[p.defaultPositionId];
  return {
    id: p.id,
    name: p.fullName,
    position: position ?? `P${p.defaultPositionId}`,
    proTeam: pro?.abbrev ?? "—",
    slotId,
    slot:
      (s.sport === "football" ? footballSlots : basketballSlots)[slotId] ??
      `Slot ${slotId}`,
    eligibleSlots: p.eligibleSlots,
    projected: stat(1),
    actual: stat(0),
    injury: p.injuryStatus ?? "ACTIVE",
    gameTime: game ? new Date(game.date).toISOString() : null,
    locked: !game || game.date <= Date.now(),
    availability: entry.status,
  };
}
export async function fetchSnapshot(
  s: Settings,
  c: EspnCredentials,
): Promise<Snapshot> {
  const league = await fetchLeague(s, c);
  const team = league.teams.find((t) => t.id === s.teamId);
  if (!team) throw new Error("The selected team is not in this league.");
  const [proResult, freeResult] = await Promise.allSettled([
    espnRequest(`${seasonBase(s)}?view=proTeamSchedules_wl`, c).then(
      (d) => proSchema.parse(d).settings.proTeams,
    ),
    espnRequest(
      `${seasonBase(s)}/segments/0/leagues/${s.leagueId}?view=kona_player_info&scoringPeriodId=${league.scoringPeriodId}`,
      c,
      {
        headers: {
          "x-fantasy-filter": JSON.stringify({
            players: {
              filterStatus: { value: ["FREEAGENT", "WAIVERS"] },
              limit: 30,
              sortPercOwned: { sortPriority: 1, sortAsc: false },
            },
          }),
        },
      },
    ).then((d) => z.object({ players: z.array(entrySchema) }).parse(d).players),
  ]);
  const pros = proResult.status === "fulfilled" ? proResult.value : [];
  const matchupPeriod =
    league.status?.currentMatchupPeriod ?? league.scoringPeriodId;
  const matchup = league.schedule.find(
    (m) =>
      m.matchupPeriodId === matchupPeriod &&
      [m.home.teamId, m.away?.teamId].includes(s.teamId),
  );
  const opponent =
    matchup?.home.teamId === s.teamId ? matchup.away : matchup?.home;
  const own = matchup?.home.teamId === s.teamId ? matchup.home : matchup?.away;
  const standings = league.teams.map((t) => ({
    id: t.id,
    name: teamName(t),
    wins: t.record?.overall?.wins ?? 0,
    losses: t.record?.overall?.losses ?? 0,
    ties: t.record?.overall?.ties ?? 0,
    pointsFor: t.record?.overall?.pointsFor ?? 0,
    pointsAgainst: t.record?.overall?.pointsAgainst ?? 0,
    rank: t.playoffSeed ?? t.rankCalculatedFinal ?? 0,
  }));
  standings.sort(
    (a, b) =>
      (a.rank || 999) - (b.rank || 999) ||
      b.wins - a.wins ||
      b.pointsFor - a.pointsFor,
  );
  standings.forEach((t, i) => {
    if (!t.rank) t.rank = i + 1;
  });
  return {
    id: randomUUID(),
    fetchedAt: new Date().toISOString(),
    leagueId: s.leagueId,
    leagueName: league.settings.name,
    teamName: teamName(team),
    teamId: s.teamId,
    season: s.season,
    sport: s.sport,
    scoringPeriod: league.scoringPeriodId,
    matchupPeriod,
    roster: (team.roster?.entries ?? []).map((e) =>
      parsePlayer(e, s, league.scoringPeriodId, pros),
    ),
    standings,
    leagueRosters: league.teams.map((t) => ({
      teamId: t.id,
      name: teamName(t),
      roster: (t.roster?.entries ?? []).map((e) =>
        parsePlayer(e, s, league.scoringPeriodId, pros),
      ),
    })),
    freeAgents:
      freeResult.status === "fulfilled"
        ? freeResult.value.map((e) =>
            parsePlayer(e, s, league.scoringPeriodId, pros),
          )
        : [],
    opponent: opponent
      ? {
          name:
            standings.find((t) => t.id === opponent.teamId)?.name ?? "Opponent",
          score: opponent.totalPoints,
        }
      : null,
    score: own?.totalPoints ?? 0,
    slotCounts: league.settings.rosterSettings.lineupSlotCounts,
    scoringSettings: league.settings.scoringSettings,
    acquisitionSettings: league.settings.acquisitionSettings,
    tradeSettings: league.settings.tradeSettings,
    faabRemaining: (() => {
      const acquisition = league.settings.acquisitionSettings as
        | { acquisitionBudget?: number; isUsingAcquisitionBudget?: boolean }
        | undefined;
      return acquisition?.isUsingAcquisitionBudget &&
        typeof acquisition.acquisitionBudget === "number" &&
        typeof team.transactionCounter?.acquisitionBudgetSpent === "number"
        ? Math.max(
            0,
            acquisition.acquisitionBudget -
              team.transactionCounter.acquisitionBudgetSpent,
          )
        : null;
    })(),
  };
}
