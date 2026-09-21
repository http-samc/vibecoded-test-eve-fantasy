# Verification

## September 20 separate Photon project, short messages, and trade replies

- Automatic incoming accept/decline is implemented under the existing trade policy. Each reply is bound to a real offer and rechecked before execution. Acceptances can include the exact required normal-roster drops; protected players, locks, expired offers, changed ownership, and changed terms are rejected.
- Historical ESPN records establish `TRADE_ACCEPT` and `TRADE_DECLINE` request/receipt shapes. Accept receipts can omit status and include DROP items. Tests distinguish a submitted acceptance from a completed, roster-verified trade and reject failed/canceled reply evidence.
- Production remains scheduled, unpaused, and automatic for all action types. Live ESPN reads show zero active incoming offers and three canceled historical offers. No artificial trade was made to test writes.
- 45 tests and the production build pass. The PostgreSQL notification claim check passes using temporary tables; no real messages are sent by that test. Reconciliation only notifies on a state change.
- Production read-only Eve checks returned a 161-character status lead with three bullets, and a 111-character research lead with two bullets and two exact source URLs present in the search tool result.
- Eve uses `photon/eve-fantasy` in production, preview, and development. Its sender assignment differs from Oura's. The inbound route verifies Connect OIDC and allows only direct messages from the configured owner. Unsigned production webhooks return 401.
- **Photon delivery remains blocked:** the setup send is recorded as unknown and was not resent. Photon returns `Target not allowed for this project` for a read-only recipient availability check on Eve, while the same recipient succeeds on Oura. Eve's Users API and dashboard show an active shared contact; iMessage is enabled. Recreating only Eve's contact through the documented API preserved its assigned number but did not fix permission checks. No Oura contact, sender, or trigger destination was changed. The old connector remains attached until cutover can be verified.
- Provider failures now distinguish a definite recipient rejection from an uncertain send without exposing raw provider diagnostics or retrying uncertain messages.


## September 20 earlier notification and trade-inbox audit

- The cron registry contained one job. Recent cron requests belonged only to the active production deployment; no older-deployment cron traffic was found.
- September 20 produced eight review texts: one daily, one waiver, six pregame. Each ledger entry had one attempt and a distinct provider message ID; no identical sent bodies were recorded.
- Notification policy now emits one routine daily digest. Pregame, waiver, manual and conversational review summaries stay in Activity; distinct action, incoming-offer, and failure alerts remain separate. The sender suppresses same-day duplicate bodies and quiet-review messages from older runs.
- A transaction-local temporary-table integration check verified the actual PostgreSQL claim queries, duplicate suppression, quiet-review suppression, and no retry of uncertain deliveries. No user records or messages were changed by that check.
- ESPN trade activity contained three received proposals and their separate cancellation records. The new live inbox and production Eve tool correctly reported zero active incoming offers and three canceled historical offers. The dashboard displayed the same results.
- The production dispatcher returned HTTP 200 without increasing the sent-message count. Autopilot and all existing action modes remained enabled.
- 34 tests, TypeScript, and production build passed. At that point incoming offer visibility and evaluation were supported; replies were added in the later update.

Production: https://eve-fantasy.vercel.app

Vercel scope/project: `httpsamcs-projects/eve-fantasy`.

## Verified

- 26 automated tests pass, including standing automatic permissions for every supported action type, pause/approval/observe enforcement, trade deduplication identity, negative ESPN defense IDs, immediate free-agent versus waiver payloads, protected/undroppable players, roster capacity, lock handling, and phone normalization.
- TypeScript and the Next.js/Eve production build pass.
- The connected ESPN account's ownership of the selected team was verified. A real, recommended lineup adjustment was submitted once and its three assignments were verified by reading ESPN back.
- The lineup result was accepted by Photon and recorded with a provider message ID.
- Full autopilot is saved in production: scheduled reviews on, paused off, all three action modes automatic, and the corresponding production execution switches enabled.
- A fresh production review completed with current league data and web research. It found no further warranted moves, recorded its hold decisions, and sent its digest through Photon.
- The settings page shows Autopilot enabled; the previous approval-required warning is gone.
- Vercel Cron dispatches every five minutes. The application selects due daily, pregame, and pre-waiver reviews using the configured timezone and ESPN timestamps.
- Private APIs require owner authentication. Local environment files, credentials, access codes, receipts, and runtime traces remain excluded from Git and deployments.

## Operational limits

- Real lineup execution is verified. Waiver and trade submission paths have policy/payload tests and are enabled under standing authorization, but no artificial acquisition or trade was made just to test them.
- New outgoing offers use equal player counts. Incoming acceptance supports unequal counts with checked roster drops. Live acceptance and decline have not been exercised against an active real offer; request shapes are grounded in authenticated historical ESPN records and fixture tests.
- Uncertain ESPN outcomes stop further mutations until reconciliation establishes what happened. Explicit API rejections are recorded as failures rather than ambiguous writes.
- ESPN cookie expiry or exhausted Gateway credits can require owner intervention. A $10/month Gateway project budget remains configured.
- Eve is configured for its separate Photon project, but provider recipient authorization is still unresolved. Oura's connector, sender, and incoming webhook routing are preserved.
