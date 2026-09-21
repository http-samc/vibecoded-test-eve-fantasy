import { z } from "zod";
import type { Snapshot, TradeInbox, TradeOffer } from "./types";
const transaction = z
  .object({
    id: z.union([z.string(), z.number()]).transform(String),
    type: z.string(),
    teamId: z.number(),
    executionType: z.string().optional(),
    status: z.string().optional(),
    isPending: z.boolean().optional(),
    proposedDate: z.number().optional(),
    processDate: z.number().optional(),
    expirationDate: z.union([z.number(), z.string()]).nullable().optional(),
    relatedTransactionId: z
      .union([z.string(), z.number()])
      .nullable()
      .optional(),
    teamActions: z.record(z.string(), z.string()).optional(),
    items: z
      .array(
        z.object({
          playerId: z.number(),
          fromTeamId: z.number(),
          toTeamId: z.number(),
          type: z.string(),
        }),
      )
      .optional(),
  })
  .passthrough();
const activity = z.object({ transactions: z.array(transaction) });
type Transaction = z.infer<typeof transaction>;
function iso(value: number | string | null | undefined) {
  if (value == null || value === 0) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
export function tradeInboxError(message: string, now = new Date()): TradeInbox {
  return {
    status: "error",
    checkedAt: now.toISOString(),
    error: message,
    incoming: [],
    outgoing: [],
    history: [],
  };
}
export function parseTradeInbox(
  raw: unknown,
  context: Pick<Snapshot, "teamId" | "roster" | "leagueRosters" | "standings">,
  now = new Date(),
): TradeInbox {
  const data = activity.parse(raw);
  const own = context.teamId;
  const players = new Map(
    [
      ...context.roster,
      ...(context.leagueRosters ?? []).flatMap((t) => t.roster),
    ].map((p) => [p.id, p.name]),
  );
  const teams = new Map(context.standings.map((t) => [t.id, t.name]));
  const related = new Map<string, Transaction>();
  for (const t of [...data.transactions].sort(
    (a, b) =>
      (a.processDate ?? a.proposedDate ?? 0) -
      (b.processDate ?? b.proposedDate ?? 0),
  )) {
    if (
      t.relatedTransactionId != null &&
      (t.status === "EXECUTED" ||
        ["CANCELED", "CANCELLED"].includes(t.status ?? ""))
    )
      related.set(String(t.relatedTransactionId), t);
  }
  const offers: TradeOffer[] = [];
  for (const t of data.transactions) {
    if (
      t.type !== "TRADE_PROPOSAL" ||
      t.executionType === "CANCEL" ||
      !t.items?.some((i) => i.fromTeamId === own || i.toTeamId === own)
    )
      continue;
    const expiresAt = iso(t.expirationDate);
    const espnStatus = t.status ?? "UNKNOWN";
    let status = espnStatus;
    const event = related.get(t.id);
    if (
      event?.executionType === "CANCEL" ||
      ["CANCELED", "CANCELLED"].includes(event?.status ?? "")
    )
      status = "CANCELED";
    else if (event?.type === "TRADE_DECLINE") status = "DECLINED";
    else if (event?.type === "TRADE_VETO") status = "VETOED";
    else if (event?.type === "TRADE_ACCEPT" && event.teamId === own)
      status = "ACCEPTED";
    if (["PENDING", "PROPOSED"].includes(status)) {
      const ownerAction = t.teamActions?.[String(own)];
      if (ownerAction === "ACCEPTED") status = "ACCEPTED";
      else if (["DECLINED", "REJECTED"].includes(ownerAction ?? ""))
        status = "DECLINED";
      else if (expiresAt && new Date(expiresAt).getTime() <= now.getTime())
        status = "EXPIRED";
      else status = "PENDING";
    }
    const direction = t.teamId === own ? "outgoing" : "incoming";
    const counterparty =
      t.teamId !== own
        ? t.teamId
        : (t.items.find((i) => i.fromTeamId !== own && i.fromTeamId > 0)
            ?.fromTeamId ??
          t.items.find((i) => i.toTeamId !== own && i.toTeamId > 0)?.toTeamId ??
          0);
    const give = t.items
      .filter((i) => i.type === "TRADE" && i.fromTeamId === own)
      .map((i) => ({
        id: i.playerId,
        name: players.get(i.playerId) ?? `Player ${i.playerId}`,
      }));
    const receive = t.items
      .filter((i) => i.type === "TRADE" && i.toTeamId === own)
      .map((i) => ({
        id: i.playerId,
        name: players.get(i.playerId) ?? `Player ${i.playerId}`,
      }));
    offers.push({
      id: t.id,
      direction,
      status,
      espnStatus,
      counterpartyTeamId: counterparty,
      counterpartyName: teams.get(counterparty) ?? `Team ${counterparty}`,
      createdAt: iso(t.proposedDate),
      expiresAt,
      give,
      receive,
    });
  }
  const unique = [...new Map(offers.map((t) => [t.id, t])).values()].sort(
    (a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
  );
  return {
    status: "ok",
    checkedAt: now.toISOString(),
    error: null,
    incoming: unique.filter(
      (t) => t.direction === "incoming" && t.status === "PENDING",
    ),
    outgoing: unique.filter(
      (t) => t.direction === "outgoing" && t.status === "PENDING",
    ),
    history: unique.filter((t) => t.status !== "PENDING").slice(0, 30),
  };
}
