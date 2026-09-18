export type Sport = "football" | "basketball";
export type PolicyMode = "observe" | "approve" | "automatic";
export interface Settings {
  sport: Sport;
  leagueId: string;
  teamId: number;
  season: number;
  timezone: string;
  digestHour: number;
  paused: boolean;
  scheduled: boolean;
  lineupMode: PolicyMode;
  waiverMode: PolicyMode;
  tradeMode: "observe" | "approve";
  monthlyAiBudget: number;
  maxWaiverBid: number;
  protectedPlayers: string[];
  photonRecipient: string;
}
export const defaultSettings: Settings = {
  sport: "football",
  leagueId: "",
  teamId: 0,
  season: 2026,
  timezone: "America/New_York",
  digestHour: 8,
  paused: false,
  scheduled: false,
  lineupMode: "observe",
  waiverMode: "observe",
  tradeMode: "observe",
  monthlyAiBudget: 10,
  maxWaiverBid: 0,
  protectedPlayers: [],
  photonRecipient: "",
};
export interface EspnCredentials {
  espnS2: string;
  swid: string;
}
export interface Player {
  id: number;
  name: string;
  position: string;
  proTeam: string;
  slotId: number;
  slot: string;
  eligibleSlots: number[];
  projected: number | null;
  actual: number | null;
  injury: string;
  gameTime: string | null;
  locked: boolean;
  availability?: string;
}
export interface Standing {
  id: number;
  name: string;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  rank: number;
}
export interface Snapshot {
  id: string;
  fetchedAt: string;
  leagueId: string;
  leagueName: string;
  teamName: string;
  teamId: number;
  scoringPeriod: number;
  matchupPeriod: number;
  season: number;
  sport: Sport;
  roster: Player[];
  standings: Standing[];
  freeAgents: Player[];
  leagueRosters?: { teamId: number; name: string; roster: Player[] }[];
  opponent: { name: string; score: number } | null;
  score: number;
  slotCounts: Record<string, number>;
  scoringSettings: unknown;
  acquisitionSettings: unknown;
  tradeSettings: unknown;
  faabRemaining?: number | null;
}
export interface Evidence {
  title: string;
  url: string;
  note: string;
}
export interface Proposal {
  kind: "lineup" | "waiver" | "trade" | "hold";
  title: string;
  rationale: string;
  expectedGain: number | null;
  playerIds: number[];
  targetTeamId?: number;
  bid?: number;
  addPlayerId?: number;
  dropPlayerId?: number;
  givePlayerIds?: number[];
  receivePlayerIds?: number[];
  terms?: string[];
  assignments?: { playerId: number; fromSlot: number; toSlot: number }[];
  sources: Evidence[];
}
export interface Review {
  id: string;
  status: string;
  trigger: string;
  started_at: string;
  completed_at: string | null;
  summary: string | null;
  error: string | null;
  snapshot_id: string | null;
  session_id: string | null;
  model_cost: number;
  evidence: Evidence[];
}
export interface Action {
  id: string;
  review_id: string;
  status: string;
  proposal: Proposal;
  created_at: string;
  expires_at: string;
  result: string | null;
  external_id?: string | null;
}
