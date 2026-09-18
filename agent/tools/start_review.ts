import { defineTool } from "eve/tools";
import { z } from "zod";
import { startReview } from "../../lib/reviews";
export default defineTool({
  description:
    "Request a fresh full review. Returns a durable run ID; this does not mean the review has completed.",
  inputSchema: z.object({}),
  execute: (_, ctx) =>
    startReview("conversation", `conversation:${ctx.callId}`),
});
