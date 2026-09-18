import { db, getSettings } from "./db";
import { actionMode, proposedStatus } from "./policy";
import { executeLineupAction } from "./execution";
import { executeTransactionAction } from "./transactions";
import type { Proposal } from "./types";

export async function executeReadyActions(reviewId?: string) {
  const settings = await getSettings();
  if (settings.paused) return;
  const busy =
    await db()`SELECT id FROM actions WHERE status IN ('unknown','executing') LIMIT 1`;
  if (busy.length) return;
  const actions = reviewId
    ? await db()`SELECT id,proposal FROM actions WHERE status='ready' AND review_id=${reviewId} AND expires_at>now() ORDER BY created_at,id LIMIT 10`
    : await db()`SELECT id,proposal FROM actions WHERE status='ready' AND expires_at>now() ORDER BY created_at,id LIMIT 10`;
  // A single team is serialized by the database's executing-action uniqueness constraint.
  for (const a of actions) {
    const current = await getSettings();
    if (current.paused) break;
    const proposal = a.proposal as Proposal;
    if (actionMode(proposal, current) !== "automatic") {
      await db()`UPDATE actions SET status=${proposedStatus(proposal, current)} WHERE id=${a.id} AND status='ready'`;
      continue;
    }
    try {
      if (proposal.kind === "lineup") await executeLineupAction(a.id, false);
      else await executeTransactionAction(a.id, false);
    } catch {
      // Executors persist definitive failures. An ambiguous result stops the queue.
      const unresolved =
        await db()`SELECT id FROM actions WHERE status IN ('executing','unknown') LIMIT 1`;
      if (unresolved.length) break;
    }
  }
}
