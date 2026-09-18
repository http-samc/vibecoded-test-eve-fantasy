import { defineTool } from "eve/tools";
import { z } from "zod";
import { prepareReview } from "../../lib/reviews";
export default defineTool({
  description:
    "Fetch and persist the current ESPN state and evaluate legal lineups for an existing review.",
  inputSchema: z.object({ reviewId: z.string().uuid() }),
  execute: ({ reviewId }, ctx) => prepareReview(reviewId, ctx.session.id),
});
