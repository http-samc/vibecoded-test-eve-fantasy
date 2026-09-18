import { defineTool } from "eve/tools";
import { finishReview, reportSchema } from "../../lib/reviews";
export default defineTool({
  description:
    "Record the finished review and considered moves, apply configured lineup policy, and queue a Photon digest. Never equate recorded proposals with verified changes.",
  inputSchema: reportSchema,
  execute: finishReview,
});
