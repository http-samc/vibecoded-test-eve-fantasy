import { z } from "zod";
import { authorize, apiError, ApiError } from "@/lib/api";
import {
  getSettings,
  saveSettings,
  saveCredentials,
  saveSnapshot,
  db,
  failReview,
} from "@/lib/db";
import { fetchLeague, fetchSnapshot, listTeams } from "@/lib/espn";
const schema = z.object({
  league: z.string().min(1).max(1000),
  teamId: z.number().int().nonnegative(),
  sport: z.enum(["football", "basketball"]),
  season: z.number().int().min(2020).max(2100),
  espnS2: z
    .string()
    .min(10)
    .max(10000)
    .regex(/^[^\r\n;]+$/),
  swid: z.string().regex(/^\{?[0-9a-fA-F-]{36}\}?$/),
});
export async function POST(request: Request) {
  try {
    authorize(request);
    const data = schema.parse(await request.json());
    let leagueId = data.league.trim();
    let teamId = data.teamId;
    if (leagueId.startsWith("http")) {
      const url = new URL(leagueId);
      if (url.hostname !== "fantasy.espn.com")
        throw new ApiError("Use your ESPN fantasy league URL.");
      leagueId = url.searchParams.get("leagueId") ?? "";
      teamId = teamId || Number(url.searchParams.get("teamId"));
    }
    if (!/^\d+$/.test(leagueId))
      throw new ApiError("Enter a valid ESPN league ID or league URL.");
    const current = await getSettings();
    const settings = {
      ...current,
      sport: data.sport,
      season: data.season,
      leagueId,
      teamId,
    };
    const credentials = {
      espnS2: data.espnS2.trim(),
      swid: `{${data.swid.replace(/[{}]/g, "")}}`,
    };
    if (!teamId) {
      const league = await fetchLeague(settings, credentials);
      return Response.json({ teams: listTeams(league) });
    }
    const snapshot = await fetchSnapshot(settings, credentials);
    const changed =
      current.leagueId !== leagueId ||
      current.teamId !== teamId ||
      current.sport !== settings.sport ||
      current.season !== settings.season;
    if (changed) {
      const runs =
        await db()`SELECT id FROM reviews WHERE status IN ('queued','running')`;
      for (const run of runs)
        await failReview(
          run.id,
          "The ESPN connection changed. Start a fresh review.",
        );
      await db()`UPDATE actions SET status='expired',result='The connected team changed.' WHERE status IN ('proposed','awaiting_approval')`;
    }
    await saveCredentials(credentials);
    await saveSettings({
      ...settings,
      scheduled: changed ? false : current.scheduled,
      lineupMode: changed ? "observe" : settings.lineupMode,
    });
    await saveSnapshot(snapshot);
    return Response.json({ ok: true, teamName: snapshot.teamName });
  } catch (e) {
    return apiError(e);
  }
}
