import { defineTool } from "eve/tools";
import { z } from "zod";
import { dashboardData } from "../../lib/db";
export function createStatusTool(loadStatus = dashboardData) {
  return defineTool({
    description:
      "Get league standing, latest snapshot, recorded decisions, connection health and current policy. Data is timestamped and may be stale.",
    inputSchema: z.object({}),
    async execute() {
      const data = await loadStatus();
      const { photonRecipient: _recipient, ...settings } = data.settings;
      const status = {
        ...data,
        settings,
      };
      // Neon returns timestamp columns as Date instances. HTTP responses stringify
      // them automatically, but Eve validates tool values before JSON encoding.
      return JSON.parse(JSON.stringify(status)) as typeof status;
    },
  });
}
export default createStatusTool();
