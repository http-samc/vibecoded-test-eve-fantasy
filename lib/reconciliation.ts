import { randomUUID } from "node:crypto";
import { db, getSettings, getCredentials, saveSnapshot } from "./db";
import { espnRequest, fetchSnapshot, seasonBase } from "./espn";
import type { Proposal } from "./types";
import { describeLineupChange } from "./lineup";
export async function reconcileActions() {
  const sql = db();
  const interrupted =
    await sql`UPDATE actions SET status='unknown',result='Execution was interrupted. ESPN must be checked before any retry.' WHERE status='executing' AND execution_started_at<now()-interval '3 minutes' RETURNING id`;
  for (const a of interrupted)
    await sql`INSERT INTO notification_outbox(id,operation_key,body) VALUES (${randomUUID()},${`interrupted:${a.id}`},'Eve · An ESPN action was interrupted. I will reconcile it before considering another change.') ON CONFLICT DO NOTHING`;
  const actions =
    await sql`SELECT a.*,s.data AS original FROM actions a JOIN reviews r ON r.id=a.review_id JOIN snapshots s ON s.id=r.snapshot_id WHERE a.status IN ('submitted','unknown') ORDER BY a.created_at LIMIT 10`;
  if (!actions.length) return;
  const [settings, credentials] = await Promise.all([
    getSettings(),
    getCredentials(),
  ]);
  if (!credentials) return;
  // Reconciliation reads state even while paused; it never submits a new mutation.
  const current = await fetchSnapshot(settings, credentials);
  await saveSnapshot(current);
  let transactions: { id: string | number; status: string }[] = [];
  if (actions.some((a) => a.external_id)) {
    try {
      const data = (await espnRequest(
        `${seasonBase(settings)}/segments/0/leagues/${settings.leagueId}?view=mTransactions2`,
        credentials,
      )) as { transactions?: { id: string | number; status: string }[] };
      if (Array.isArray(data.transactions)) transactions = data.transactions;
    } catch {
      return;
    }
  }
  for (const action of actions) {
    if (
      action.original.leagueId !== current.leagueId ||
      action.original.teamId !== current.teamId ||
      action.original.season !== current.season
    )
      continue;
    const proposal = action.proposal as Proposal;
    let status: string | undefined;
    let message = "";
    if (
      proposal.kind === "lineup" &&
      action.original.scoringPeriod === current.scoringPeriod &&
      proposal.assignments?.every(
        (m) =>
          current.roster.find((p) => p.id === m.playerId)?.slotId === m.toSlot,
      )
    ) {
      status = "verified";
      message = `Lineup verified on ESPN: ${describeLineupChange(proposal, current)}.`;
    } else if (action.external_id) {
      const raw = transactions.find((t) => String(t.id) === action.external_id);
      const inbox = current.tradeInbox;
      const offer =
        proposal.kind === "trade" && inbox?.status === "ok"
          ? [...inbox.incoming, ...inbox.outgoing, ...inbox.history].find(
              (t) => t.id === action.external_id,
            )
          : undefined;
      const tx = offer ? { id: offer.id, status: offer.status } : raw;
      if (tx?.status === "EXECUTED") {
        const rosterMatches =
          proposal.kind === "waiver"
            ? Boolean(
                current.roster.some((p) => p.id === proposal.addPlayerId) &&
                (!proposal.dropPlayerId ||
                  !current.roster.some((p) => p.id === proposal.dropPlayerId)),
              )
            : Boolean(
                proposal.receivePlayerIds?.every((id) =>
                  current.roster.some((p) => p.id === id),
                ) &&
                proposal.givePlayerIds?.every(
                  (id) => !current.roster.some((p) => p.id === id),
                ),
              );
        if (rosterMatches) {
          status = "verified";
          message =
            "ESPN executed the transaction and the resulting roster is verified.";
        }
      } else if (
        tx &&
        ([
          "CANCELED",
          "CANCELLED",
          "REJECTED",
          "DECLINED",
          "FAILED",
          "EXPIRED",
          "VETOED",
        ].includes(tx.status) ||
          tx.status.startsWith("FAILED"))
      ) {
        status = "failed";
        message = `ESPN reports this transaction as ${tx.status.toLowerCase()}.`;
      } else if (tx?.status === "PENDING" && action.status === "unknown") {
        status = "submitted";
        message =
          "ESPN confirms the transaction is pending. No duplicate request was sent.";
      }
    }
    if (status) {
      await sql.transaction([
        sql`UPDATE actions SET status=${status},result=${message} WHERE id=${action.id} AND status IN ('submitted','unknown')`,
        sql`INSERT INTO notification_outbox(id,operation_key,body) VALUES (${randomUUID()},${`reconciled:${action.id}:${status}`},${`Eve · ${proposal.title}: ${message}${action.external_id ? `\nESPN transaction: ${action.external_id}` : ""}`}) ON CONFLICT DO NOTHING`,
      ]);
    }
  }
}
