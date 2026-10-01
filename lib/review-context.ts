import type { Snapshot, Player } from "./types";

// One shared header avoids repeating ESPN field names for every league player.
// Keep all player fields, including null/unknown values and execution locks.
export const leagueRosterColumns = [
  "id",
  "name",
  "position",
  "proTeam",
  "slotId",
  "slot",
  "eligibleSlots",
  "projected",
  "actual",
  "injury",
  "gameTime",
  "locked",
  "availability",
  "droppable",
  "rosterLocked",
  "tradeLocked",
  "waiverProcessAt",
] as const satisfies readonly (keyof Player)[];

export function reviewSnapshot(snapshot: Snapshot) {
  return {
    ...snapshot,
    leagueRosterColumns,
    leagueRosters: snapshot.leagueRosters?.map((team) => ({
      teamId: team.teamId,
      name: team.name,
      roster: team.roster.map((player) =>
        leagueRosterColumns.map((column) => player[column] ?? null),
      ),
    })),
  };
}
