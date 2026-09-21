import { defineTool } from "eve/tools";
import { z } from "zod";
import { readTradeInbox } from "../../lib/trade-inbox";
export default defineTool({
  description:
    "Read incoming and outgoing trade offers directly from ESPN now, plus recent trade history. Resolves cancellation events and expired offers. Use this for trade questions; app-created actions are not the ESPN inbox. An error means the inbox is unknown, never that it is empty.",
  inputSchema: z.object({}),
  execute: readTradeInbox,
});
