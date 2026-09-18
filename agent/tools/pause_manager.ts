import { defineTool } from "eve/tools";
import { z } from "zod";
import { getSettings, saveSettings } from "../../lib/db";
export default defineTool({
  description:
    "Pause or resume the manager when the owner explicitly requests it. Does not change action permissions or reverse submitted actions.",
  inputSchema: z.object({ paused: z.boolean() }),
  async execute({ paused }) {
    const settings = await getSettings();
    await saveSettings({ ...settings, paused });
    return { paused };
  },
});
