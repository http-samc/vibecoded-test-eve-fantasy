import { defineHook } from "eve/hooks";
import { db, failReview } from "../../lib/db";
export function createAuditHook(
  dependencies = {
    async findActiveReviews(sessionId: string) {
      return db()`SELECT id FROM reviews WHERE session_id=${sessionId} AND status IN ('queued','running')`;
    },
    failReview,
  },
) {
  return defineHook({
    events: {
      async "step.completed"(event, ctx) {
        const usage = event.data.usage;
        if (!usage) return;
        const key = `${ctx.session.id}:${event.data.turnId}:${event.data.sequence}:${event.data.stepIndex}`;
        const sql = db();
        await sql`INSERT INTO model_usage(operation_key,session_id,cost,input_tokens,output_tokens) VALUES (${key},${ctx.session.id},${usage.costUsd ?? 0},${usage.inputTokens ?? 0},${usage.outputTokens ?? 0}) ON CONFLICT DO NOTHING`;
        await sql`UPDATE reviews SET model_cost=(SELECT COALESCE(sum(cost),0) FROM model_usage WHERE session_id=${ctx.session.id}) WHERE session_id=${ctx.session.id}`;
        await sql`INSERT INTO app_settings(key,value) VALUES ('gateway_health','{"status":"ready"}'::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`;
      },
      async "input.requested"(event, ctx) {
        const limit = event.data.requests.find(
          (request) => request.kind === "session-limit",
        );
        if (!limit) return;
        const kind = limit.action.input.kind;
        const reason =
          kind === "input"
            ? "I reached this review's data limit before I could save the result."
            : kind === "token-cost"
              ? "I reached this review's AI cost limit before I could save the result."
              : "I reached this review's response limit before I could save the result.";
        for (const row of await dependencies.findActiveReviews(ctx.session.id))
          await dependencies.failReview(row.id, reason);
      },
      async "turn.completed"(_event, ctx) {
        const rows = await dependencies.findActiveReviews(ctx.session.id);
        for (const row of rows)
          await dependencies.failReview(
            row.id,
            "I stopped before saving the review. I will check your team at the next scheduled review.",
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
        const rows = await dependencies.findActiveReviews(ctx.session.id);
        for (const row of rows) await dependencies.failReview(row.id, reason);
      },
    },
  });
}
export default createAuditHook();
