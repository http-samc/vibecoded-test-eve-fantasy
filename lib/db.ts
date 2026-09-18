import { neon } from "@neondatabase/serverless";
import { randomUUID } from "node:crypto";
import {
  defaultSettings,
  type Settings,
  type EspnCredentials,
  type Snapshot,
  type Review,
  type Action,
} from "./types";
import { seal, unseal } from "./crypto";
export function db() {
  if (!process.env.DATABASE_URL) throw new Error("Database is not configured.");
  return neon(process.env.DATABASE_URL);
}
export async function getSettings(): Promise<Settings> {
  const rows =
    await db()`SELECT value FROM app_settings WHERE key = 'preferences'`;
  return { ...defaultSettings, ...(rows[0]?.value ?? {}) };
}
export async function saveSettings(value: Settings) {
  await db()`INSERT INTO app_settings (key, value) VALUES ('preferences', ${JSON.stringify(value)}::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;
}
export async function getCredentials(): Promise<EspnCredentials | null> {
  const rows =
    await db()`SELECT value FROM app_settings WHERE key = 'espn_credentials'`;
  return rows[0] ? unseal<EspnCredentials>(rows[0].value.encrypted) : null;
}
export async function saveCredentials(value: EspnCredentials) {
  await db()`INSERT INTO app_settings (key, value) VALUES ('espn_credentials', ${JSON.stringify({ encrypted: seal(value) })}::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;
}
export async function saveSnapshot(snapshot: Snapshot) {
  await db()`INSERT INTO snapshots (id, data) VALUES (${snapshot.id}, ${JSON.stringify(snapshot)}::jsonb) ON CONFLICT DO NOTHING`;
}
export async function latestSnapshot(): Promise<Snapshot | null> {
  const rows =
    await db()`SELECT data FROM snapshots ORDER BY created_at DESC LIMIT 1`;
  return rows[0]?.data ?? null;
}
export async function claimReview(trigger: string, occurrence: string) {
  const settings = await getSettings();
  if (settings.paused)
    throw new Error(
      "Eve is paused. Resume in settings before running a review.",
    );
  if (!settings.leagueId || !settings.teamId)
    throw new Error("Connect your ESPN league and team first.");
  // One active review prevents cron, text, and dashboard from racing on this team.
  const stale =
    await db()`SELECT id FROM reviews WHERE status IN ('queued','running') AND started_at < now() - interval '20 minutes'`;
  for (const run of stale)
    await failReview(
      run.id,
      "Review timed out; no further actions are authorized.",
    );
  const id = randomUUID();
  const rows = await db()`INSERT INTO reviews (id, occurrence, trigger, status)
    VALUES (${id}, ${occurrence}, ${trigger}, 'queued') ON CONFLICT DO NOTHING RETURNING id`;
  return rows[0]?.id as string | undefined;
}
export async function failReview(id: string, message: string) {
  const sql = db();
  await sql.transaction([
    sql`INSERT INTO notification_outbox(id,operation_key,body) SELECT ${randomUUID()},${`review-failed:${id}`},${`Eve · Fantasy review needs attention. ${message}`}
      WHERE EXISTS(SELECT 1 FROM reviews WHERE id=${id} AND status IN ('queued','running')) ON CONFLICT DO NOTHING`,
    sql`UPDATE reviews SET status='failed', error=${message}, completed_at=now() WHERE id=${id} AND status IN ('queued','running')`,
  ]);
}
export async function dashboardData() {
  const [
    settings,
    snapshot,
    reviews,
    actions,
    credentials,
    deliveries,
    usage,
    health,
  ] = await Promise.all([
    getSettings(),
    latestSnapshot(),
    db()`SELECT * FROM reviews ORDER BY started_at DESC LIMIT 20`,
    db()`SELECT * FROM actions ORDER BY created_at DESC LIMIT 40`,
    db()`SELECT key FROM app_settings WHERE key='espn_credentials'`,
    db()`SELECT id,status,created_at,last_error FROM notification_outbox ORDER BY created_at DESC LIMIT 5`,
    db()`SELECT COALESCE(sum(cost),0) AS total FROM model_usage WHERE created_at >= date_trunc('month',now())`,
    db()`SELECT value FROM app_settings WHERE key='gateway_health'`,
  ]);
  return {
    settings,
    snapshot,
    reviews: reviews as Review[],
    actions: actions as Action[],
    connected: credentials.length > 0,
    photonConfigured: Boolean(process.env.PHOTON_CONNECTOR),
    deliveries,
    monthCost: Number(usage[0].total),
    gatewayHealth: (health[0]?.value ?? null) as {
      status: string;
      message?: string;
    } | null,
    lineupWritesEnabled: process.env.ESPN_LINEUP_WRITES_ENABLED === "true",
    waiverWritesEnabled: process.env.ESPN_WAIVER_WRITES_ENABLED === "true",
    tradeWritesEnabled: process.env.ESPN_TRADE_WRITES_ENABLED === "true",
  };
}
