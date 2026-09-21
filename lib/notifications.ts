import { createiMessageAdapter } from "@photon-ai/chat-adapter-imessage";
import { connectPhotonCredentials } from "@vercel/connect/eve";
import { db, getSettings } from "./db";
import {
  suppressQuietReviews,
  suppressDuplicateMessages,
  claimNotification,
} from "./notification-queue";
export async function deliverNotifications() {
  const settings = await getSettings();
  if (!process.env.PHOTON_CONNECTOR || !settings.photonRecipient) return;
  // A crashed sender may already have delivered. Never blindly resend that row.
  await db()`UPDATE notification_outbox SET status='unknown',last_error='Delivery interrupted; check the conversation before resending.' WHERE status='sending' AND lease_until < now()`;
  const sql = db();
  await suppressQuietReviews(sql, settings.timezone);
  await suppressDuplicateMessages(sql, settings.timezone);
  for (let i = 0; i < 3; i++) {
    const [row] = await claimNotification(sql, settings.timezone);
    if (!row) break;
    let sent = false;
    try {
      const adapter = createiMessageAdapter({
        credentials: connectPhotonCredentials(process.env.PHOTON_CONNECTOR),
      });
      const thread = await adapter.openDM(settings.photonRecipient);
      sent = true;
      const result = await adapter.postMessage(thread, { raw: row.body });
      await db()`UPDATE notification_outbox SET status='sent',provider_id=${result.id},lease_until=null,last_error=null WHERE id=${row.id}`;
    } catch {
      await db()`UPDATE notification_outbox SET status=${sent ? "unknown" : Number(row.attempts) >= 3 ? "failed" : "pending"},lease_until=null,retry_at=now()+interval '10 minutes',
        last_error=${sent ? "Photon delivery could not be confirmed. Check your conversation before resending." : "Photon connection failed. Check the connector and recipient registration."} WHERE id=${row.id}`;
    }
  }
}
