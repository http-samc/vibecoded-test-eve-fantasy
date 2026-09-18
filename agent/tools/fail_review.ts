import { defineTool } from "eve/tools";
import { z } from "zod";
import { failReview } from "../../lib/db";
export default defineTool({
  description:
    "Mark an active review as failed with a useful, non-sensitive explanation.",
  inputSchema: z.object({
    reviewId: z.string().uuid(),
    reason: z.string().max(500),
  }),
  async execute({ reviewId, reason }) {
    await failReview(reviewId, reason);
    return { status: "failed" };
  },
});
