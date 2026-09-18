import { z } from "zod";
import { authorize, apiError, ApiError } from "@/lib/api";
import { db } from "@/lib/db";
import { executeLineupAction } from "@/lib/execution";
import { executeTransactionAction } from "@/lib/transactions";
import { deliverNotifications } from "@/lib/notifications";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    authorize(request);
    const { id, action } = z
      .object({ id: z.string().uuid(), action: z.enum(["approve", "skip"]) })
      .parse(await request.json());
    if (action === "skip") {
      await db()`UPDATE actions SET status='rejected',result='Skipped by owner.' WHERE id=${id} AND status IN ('proposed','awaiting_approval')`;
      return Response.json({ ok: true });
    }
    const rows = await db()`SELECT proposal FROM actions WHERE id=${id}`;
    if (!rows.length) throw new ApiError("This action does not exist.");
    const result =
      rows[0].proposal.kind === "lineup"
        ? await executeLineupAction(id, true)
        : await executeTransactionAction(id, true);
    await deliverNotifications();
    return Response.json(result);
  } catch (e) {
    return apiError(e);
  }
}
