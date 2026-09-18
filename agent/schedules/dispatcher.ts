import { defineSchedule } from "eve/schedules";
import { getSettings, latestSnapshot, db } from "../../lib/db";
import { scheduledOccurrence, startReview } from "../../lib/reviews";
import { deliverNotifications } from "../../lib/notifications";
import { reconcileActions } from "../../lib/reconciliation";
export default defineSchedule({
  cron: "*/5 * * * *",
  run({ waitUntil }) {
    waitUntil(
      (async () => {
        if (process.env.VERCEL_ENV !== "production") return;
        await reconcileActions();
        await deliverNotifications();
        await db()`UPDATE actions SET status='expired' WHERE status IN ('proposed','awaiting_approval') AND expires_at<now()`;
        const [settings, snapshot] = await Promise.all([
          getSettings(),
          latestSnapshot(),
        ]);
        const occurrence = scheduledOccurrence(settings, snapshot);
        if (occurrence)
          await startReview(
            occurrence.startsWith("prelock:")
              ? "before game lock"
              : "daily schedule",
            occurrence,
          );
      })(),
    );
  },
});
