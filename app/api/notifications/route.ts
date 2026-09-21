import { randomUUID } from "node:crypto";
import { authorize, apiError, ApiError } from "@/lib/api";
import { db, getSettings } from "@/lib/db";
import { deliverNotifications } from "@/lib/notifications";
export async function POST(request: Request) {
  try {
    authorize(request);
    const s = await getSettings();
    if (!s.photonRecipient)
      throw new ApiError("Save your Photon phone number in settings first.");
    const id = randomUUID();
    await db()`INSERT INTO notification_outbox(id,operation_key,body) VALUES (${id},${`test:${id}`},'Eve: This is my new number. Your daily summary and team moves will appear here. You can reply to ask about your team.')`;
    await deliverNotifications();
    const rows =
      await db()`SELECT status,last_error FROM notification_outbox WHERE id=${id}`;
    return Response.json(rows[0]);
  } catch (e) {
    return apiError(e);
  }
}
