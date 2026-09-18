import { z } from "zod";
export function normalizePhone(value: string) {
  const trimmed = value.trim();
  if (!trimmed || !/^[+\d\s().-]+$/.test(trimmed)) return trimmed;
  const compact = trimmed.replace(/[\s().-]/g, "");
  if (/^\d{10}$/.test(compact)) return `+1${compact}`;
  if (/^1\d{10}$/.test(compact)) return `+${compact}`;
  return compact;
}
export const settingsSchema = z.object({
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
  waiverMode: z.enum(["observe", "approve", "automatic"]),
  tradeMode: z.enum(["observe", "approve", "automatic"]),
  monthlyAiBudget: z.number().min(0).max(100),
  maxWaiverBid: z.number().min(0).max(1000),
  protectedPlayers: z.array(z.string().trim().min(1).max(100)).max(50),
  photonRecipient: z
    .string()
    .max(64, "Enter a valid phone number.")
    .transform(normalizePhone)
    .refine(
      (v) => v === "" || /^\+[1-9]\d{7,14}$/.test(v),
      "Enter a US phone number or include the country code, such as +14155550123. Extensions are not supported.",
    ),
});
