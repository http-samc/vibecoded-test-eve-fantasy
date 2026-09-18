import { defineTool } from "eve/tools";
import { z } from "zod";
import { dashboardData } from "../../lib/db";
export default defineTool({
  description:
    "Get league standing, latest snapshot, recorded decisions, connection health and current policy. Data is timestamped and may be stale.",
  inputSchema: z.object({}),
  async execute() {
    const data = await dashboardData();
    return {
      ...data,
      settings: { ...data.settings, photonRecipient: undefined },
    };
  },
});
