import type { Evidence, Proposal, TradeOffer } from "./types";
import { appOrigin } from "./site";
export const SUMMARY_LIMIT = 280;
export const BULLET_LIMIT = 160;
export function shortText(value: string, limit: number) {
  const text = value.replace(/\s+/g, " ").trim();
  if (Array.from(text).length <= limit) return text;
  const slice = Array.from(text)
    .slice(0, limit - 1)
    .join("");
  const boundary = slice.lastIndexOf(" ");
  return `${boundary > limit / 2 ? slice.slice(0, boundary) : slice}…`;
}
function sourceLinks(sources: Pick<Evidence, "url">[]) {
  const urls: string[] = [];
  for (const source of sources) {
    try {
      const u = new URL(source.url);
      if (u.protocol !== "https:") continue;
      const url = u.href;
      if (!urls.includes(url)) urls.push(url);
    } catch {
      /* Ignore invalid links. */
    }
    if (urls.length === 2) break;
  }
  return urls;
}
export function formatUpdate({
  summary,
  bullets = [],
  sources = [],
  detailUrl,
}: {
  summary: string;
  bullets?: string[];
  sources?: Pick<Evidence, "url">[];
  detailUrl?: string;
}) {
  const lead = shortText(
    summary.replace(/^Eve\s*[·:]\s*/i, ""),
    SUMMARY_LIMIT - 5,
  );
  const points = bullets
    .filter(Boolean)
    .slice(0, 3)
    .map((b) => `- ${shortText(b.replace(/^[-*]\s*/, ""), BULLET_LIMIT)}`);
  const links = sourceLinks(sources);
  return [
    `Eve: ${lead}`,
    points.length ? points.join("\n") : "",
    links.length ? `Sources:\n${links.join("\n")}` : "",
    detailUrl ? `Details: ${detailUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
export function formatReviewMessage(
  summary: string,
  evidence: Evidence[],
  counts: { status: string; count: number }[],
) {
  const [lead, ...rest] = summary.split(/\n+/).filter(Boolean);
  const names: Record<string, string> = {
    verified: "confirmed",
    submitted: "sent",
    unknown: "not confirmed",
    failed: "failed",
    rejected: "not made",
    expired: "expired",
    awaiting_approval: "need approval",
    proposed: "ideas",
    ready: "queued",
  };
  const outcomes = counts.length
    ? `Moves: ${counts.map((c) => `${c.count} ${names[c.status] ?? c.status}`).join(", ")}.`
    : "";
  return formatUpdate({
    summary: lead ?? "Your team review is complete.",
    bullets: [outcomes, ...rest].filter(Boolean),
    sources: evidence,
    detailUrl: `${appOrigin()}/activity`,
  });
}
export function formatTradeNotice(offer: TradeOffer, timezone: string) {
  const expiry = offer.expiresAt
    ? `Reply by ${new Date(offer.expiresAt).toLocaleString("en-US", { timeZone: timezone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} (${timezone}).`
    : "I will check the offer.";
  return formatUpdate({
    summary: `You have a new trade offer from ${offer.counterpartyName}.`,
    bullets: [
      `Give: ${offer.give.map((p) => p.name).join(", ")}.`,
      `Get: ${offer.receive.map((p) => p.name).join(", ")}.`,
      expiry,
    ],
    detailUrl: `${appOrigin()}/decisions`,
  });
}
export function formatActionMessage(
  proposal: Proposal,
  status: string,
  result: string,
) {
  let summary = result;
  if (status === "verified")
    summary =
      proposal.kind === "lineup"
        ? "I changed your starters. ESPN confirmed the change."
        : proposal.kind === "trade_response" &&
            proposal.tradeResponse === "decline"
          ? "I declined the trade offer. ESPN confirmed it."
          : "ESPN confirmed the roster change.";
  else if (status === "submitted")
    summary =
      proposal.kind === "trade_response"
        ? "I accepted the offer. ESPN has not completed the trade yet."
        : proposal.kind === "trade"
          ? "I sent a trade offer. The other team must respond."
          : "I sent the player request. ESPN has not confirmed the roster change yet.";
  else if (status === "unknown")
    summary =
      "I cannot confirm the result yet. I will check ESPN before I try again.";
  else if (status === "failed")
    summary = "I could not make this move. Your team may need a new plan.";
  const detail =
    status === "failed" || status === "unknown"
      ? [result]
      : (proposal.terms ??
        (proposal.kind === "lineup" ? [result] : [proposal.title]));
  return formatUpdate({
    summary,
    bullets: detail,
    sources: proposal.sources,
    detailUrl: `${appOrigin()}/activity`,
  });
}
