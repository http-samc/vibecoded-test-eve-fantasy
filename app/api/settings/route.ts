import { z } from "zod";
import { authorize, apiError } from "@/lib/api";
import { getSettings, saveSettings } from "@/lib/db";
const schema = z.object({
  timezone: z.string().refine((v) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: v });
      return true;
    } catch {
      return false;
    }
  }),
  digestHour: z.number().int().min(0).max(23),
  paused: z.boolean(),
  scheduled: z.boolean(),
  lineupMode: z.enum(["observe", "approve", "automatic"]),
  waiverMode: z.enum(["observe", "approve"]),
  tradeMode: z.enum(["observe", "approve"]),
  monthlyAiBudget: z.number().min(0).max(100),
  maxWaiverBid: z.number().min(0).max(1000),
  protectedPlayers: z.array(z.string().trim().min(1).max(100)).max(50),
  photonRecipient: z
    .string()
    .refine((v) => v === "" || /^\+[1-9]\d{7,14}$/.test(v)),
});
export async function POST(request: Request) {
  try {
    authorize(request);
    const data = schema.parse(await request.json());
    const current = await getSettings();
    await saveSettings({ ...current, ...data });
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
