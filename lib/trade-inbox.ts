import { createHash, randomUUID } from "node:crypto";
import { db, getSettings, getCredentials, latestSnapshot } from "./db";
import { fetchTradeActivity } from "./espn";
import { parseTradeInbox, tradeInboxError } from "./trades";
import type { Settings, TradeInbox } from "./types";

export async function readTradeInbox(): Promise<TradeInbox> {
  const [settings, credentials, snapshot] = await Promise.all([
    getSettings(),
    getCredentials(),
    latestSnapshot(),
  ]);
  let inbox: TradeInbox;
  try {
    if (!credentials || !settings.leagueId || !settings.teamId)
      throw new Error("not configured");
    const matches =
      snapshot?.leagueId === settings.leagueId &&
      snapshot.teamId === settings.teamId &&
      snapshot.season === settings.season;
    const context = matches
      ? snapshot!
      : {
          teamId: settings.teamId,
          roster: [],
          standings: [],
          leagueRosters: [],
        };
    inbox = parseTradeInbox(
      await fetchTradeActivity(settings, credentials),
      context,
    );
  } catch {
    inbox = tradeInboxError(
      "ESPN's trade inbox is unavailable. Do not interpret this as no incoming offers.",
    );
  }
  await cacheTradeInbox(settings, inbox);
  return inbox;
}
export async function cacheTradeInbox(
  settings: Pick<Settings, "leagueId" | "teamId" | "season">,
  inbox: TradeInbox,
) {
  const value = {
    leagueId: settings.leagueId,
    teamId: settings.teamId,
    season: settings.season,
    inbox,
  };
  await db()`INSERT INTO app_settings(key,value) VALUES ('trade_inbox',${JSON.stringify(value)}::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`;
}
export async function pollTradeInbox(settings: Settings) {
  if (!settings.scheduled || settings.paused) return null;
  const inbox = await readTradeInbox();
  if (inbox.status !== "ok" || !inbox.incoming.length) return null;
  const scope = `${settings.leagueId}:${settings.season}:${settings.teamId}`;
  for (const offer of inbox.incoming) {
    const body = `Eve · New incoming trade from ${offer.counterpartyName}\nGive: ${offer.give.map((p) => p.name).join(", ")}\nReceive: ${offer.receive.map((p) => p.name).join(", ")}\n${offer.expiresAt ? `Expires ${new Date(offer.expiresAt).toLocaleString("en-US", { timeZone: settings.timezone })} ${settings.timezone}.\n` : ""}I can assess this offer. Incoming acceptance/decline is not implemented; this is not an executed trade.`;
    await db()`INSERT INTO notification_outbox(id,operation_key,body) VALUES (${randomUUID()},${`incoming-trade:${scope}:${offer.id}`},${body}) ON CONFLICT DO NOTHING`;
  }
  const fingerprint = createHash("sha256")
    .update(
      inbox.incoming
        .map((t) => t.id)
        .sort()
        .join(","),
    )
    .digest("hex")
    .slice(0, 24);
  return `trade-inbox:${scope}:${fingerprint}`;
}
