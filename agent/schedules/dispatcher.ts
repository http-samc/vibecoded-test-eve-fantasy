import { defineSchedule } from "eve/schedules";
import { getSettings, latestSnapshot, db } from "../../lib/db";
import {
  scheduledOccurrence,
  startReview,
  queueReviewDigests,
} from "../../lib/reviews";
import { deliverNotifications } from "../../lib/notifications";
import { reconcileActions } from "../../lib/reconciliation";
import { executeReadyActions } from "../../lib/autopilot";
import { randomUUID } from "node:crypto";
export default defineSchedule({
  cron: "*/5 * * * *",
  run({ waitUntil }) {
    waitUntil(
      (async () => {
        if (process.env.VERCEL_ENV !== "production") return;
        try {
          await reconcileActions();
          await db()`UPDATE actions SET status='expired' WHERE status IN ('ready','proposed','awaiting_approval') AND expires_at<now()`;
          await executeReadyActions();
          await queueReviewDigests();
          const [settings, snapshot] = await Promise.all([
            getSettings(),
            latestSnapshot(),
          ]);
          const occurrence = scheduledOccurrence(settings, snapshot);
          if (occurrence)
            await startReview(
              occurrence.startsWith("prelock:")
                ? "before game lock"
                : occurrence.startsWith("waiver:")
                  ? "before waiver processing"
                  : "daily schedule",
              occurrence,
            );
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Scheduled check failed.";
          const category = /budget|credits|payment/i.test(message)
            ? "AI budget or credits need attention."
            : /ESPN|cookies|authorize/i.test(message)
              ? "ESPN connection needs attention. Refresh your session in Settings."
              : "A scheduled check could not complete. The next scheduled check will retry.";
          await db()`INSERT INTO notification_outbox(id,operation_key,body) VALUES (${randomUUID()},${`dispatcher:${new Date().toISOString().slice(0, 10)}:${category}`},${`Eve · ${category}`}) ON CONFLICT DO NOTHING`;
        } finally {
          await deliverNotifications();
        }
      })(),
    );
  },
});
