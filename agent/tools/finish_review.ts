import { defineTool } from "eve/tools";
import { finishReview, reportSchema } from "../../lib/reviews";
export default defineTool({
  description:
    "Record a short summary and up to three details, assess each incoming offer through tradeResponses, and execute eligible moves under the configured policies. Only daily reviews send routine digests. Never equate a sent reply with a completed roster change.",
  inputSchema: reportSchema,
  execute: finishReview,
});
