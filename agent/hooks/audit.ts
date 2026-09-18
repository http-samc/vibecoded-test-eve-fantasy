import { defineHook } from "eve/hooks";
import { db, failReview } from "../../lib/db";
export default defineHook({
  events: {
    async "step.completed"(event, ctx) {
      const usage = event.data.usage;
      if (!usage) return;
      const key = `${ctx.session.id}:${event.data.turnId}:${event.data.sequence}`;
      const sql = db();
      await sql`INSERT INTO model_usage(operation_key,session_id,cost,input_tokens,output_tokens) VALUES (${key},${ctx.session.id},${usage.costUsd ?? 0},${usage.inputTokens ?? 0},${usage.outputTokens ?? 0}) ON CONFLICT DO NOTHING`;
      await sql`UPDATE reviews SET model_cost=(SELECT COALESCE(sum(cost),0) FROM model_usage WHERE session_id=${ctx.session.id}) WHERE session_id=${ctx.session.id}`;
      await sql`INSERT INTO app_settings(key,value) VALUES ('gateway_health','{"status":"ready"}'::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`;
    },
    async "turn.completed"(_event, ctx) {
      const rows =
        await db()`SELECT id FROM reviews WHERE session_id=${ctx.session.id} AND status IN ('queued','running')`;
      for (const row of rows)
        await failReview(
          row.id,
          "The agent finished without completing its review record. Run another review.",
        );
    },
    async "turn.failed"(event, ctx) {
      const needsCredits =
        /paid credits|BYOK|Free tier|payment|credit balance/i.test(
          event.data.message,
        );
      const reason = needsCredits
        ? "AI Gateway requires paid credits for the configured model. Add credits in your personal Vercel scope, then retry."
        : "The agent could not complete this turn. Check its connection and try again.";
      if (needsCredits)
        await db()`INSERT INTO app_settings(key,value) VALUES ('gateway_health',${JSON.stringify({ status: "blocked", message: reason })}::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`;
      const rows =
        await db()`SELECT id FROM reviews WHERE session_id=${ctx.session.id} AND status IN ('queued','running')`;
      for (const row of rows) await failReview(row.id, reason);
    },
  },
});
