import { settingsSchema } from "@/lib/settings-schema";
import { authorize, apiError, ApiError } from "@/lib/api";
import { getSettings, saveSettings } from "@/lib/db";

export async function POST(request: Request) {
  try {
    authorize(request);
    const parsed = settingsSchema.safeParse(await request.json());
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new ApiError(`${issue.path.join(".")}: ${issue.message}`);
    }
    const data = parsed.data;
    const current = await getSettings();
    await saveSettings({ ...current, ...data });
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
