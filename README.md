# Eve Fantasy

Private ESPN fantasy dashboard and manager, deployed to [eve-fantasy.vercel.app](https://eve-fantasy.vercel.app) in `httpsamcs-projects`. Eve runs on Vercel Workflow; its dispatcher is a Vercel Cron job every five minutes. Model calls and provider web search use AI Gateway. PostgreSQL stores snapshots, actions, and notification delivery records.

Current deployment note: the separate Photon project is configured, but its provider rejects the registered recipient. Trade management and web chat work; text delivery and replies still need verification. See [VERIFICATION.md](VERIFICATION.md).

## Connect your team

1. Open the site and enter the owner access code from `.local/access-code.txt` on the setup computer. This file is ignored by Git and excluded from deployments.
2. In Settings, supply the sport, season, league URL, and ESPN `espn_s2`/`SWID` cookies. If the URL does not identify your team, the form lists the league's teams after verification.
3. Save your phone number registered with `photon/eve-fantasy` and send a test text. Eve uses its own Photon project for outgoing texts and owner-only direct replies; Oura keeps its separate connector and routing.
4. Ensure AI Gateway credits are available, choose Full autopilot to enable scheduled reviews and automatic execution, or choose individual action modes.

Cookies are encrypted with AES-256-GCM in Postgres. The encryption key, owner authentication secrets, and service token live in Vercel environment variables. Secrets never enter model context. The owner session is signed, expires in seven days, and uses an HTTP-only SameSite cookie. The browser and Eve APIs both require authentication.

## Current capabilities

- ESPN connection discovery, league standings, scores, full league rosters, free agents, projections, and game start times.
- A deterministic lineup optimizer, grounded research through Eve's Gateway search tool, and stored candidate decisions and citations.
- Daily review scheduling in the configured timezone plus 60- and 15-minute pregame windows, when game times are available. A run key and database uniqueness prevent overlapping team reviews.
- Eve chat, pause/resume, per-action policy settings, review activity, and a durable Photon outbox.
- A guarded football lineup transaction adapter with fresh-state checks and ESPN read-back. A real lineup adjustment has been verified against the connected league. Production execution is enabled by `ESPN_LINEUP_WRITES_ENABLED=true`; previews stay disabled.
- Football free-agent adds, waiver claims, and equal-count trade offers in observe, approve, or automatic mode, with exact visible player terms, protected-player and FAAB checks, transaction receipts, and background reconciliation. Production capabilities use `ESPN_WAIVER_WRITES_ENABLED` and `ESPN_TRADE_WRITES_ENABLED`. Full autopilot is standing authorization to submit eligible actions; individual approvals are required only in approve mode. Incoming trade acceptance and decline follow the trade policy. Acceptance supports unequal player counts with exactly the necessary roster drops; fresh offer terms, expiry, ownership, locks, and protected players are checked before sending. A submitted offer or claim is never reported as a completed roster change.

ESPN is an unofficial cookie-authenticated integration. Missing game times conservatively lock players; missing projections cause the optimizer to hold. NBA reads are supported by the common adapter but scoring-category strategy and NBA writes are not enabled. ESPN is the only structured projection source currently configured. Research may corroborate or challenge it, but does not fabricate replacement projections.

## Development

Node.js 24 is required. Dependencies are pinned in the lockfile.

```sh
npm ci
vercel link --yes --scope httpsamcs-projects --project eve-fantasy
vercel env pull .env.local --yes --scope httpsamcs-projects
npm run db:migrate
npm run dev
```

Use project OIDC for local Gateway tests; an inherited `AI_GATEWAY_API_KEY` takes precedence and may belong to another scope. `scripts/dev.mjs` removes that inherited value from the child dev process. Production authenticates through project OIDC. The local UI test override `.env.development.local`, if present, is not deployed; delete it to use the owner access code locally.

```sh
npm test
npm run typecheck
npm run build
vercel deploy --prod --yes --scope httpsamcs-projects
vercel crons ls --scope httpsamcs-projects
```

The migration is idempotent. Preview deployments must keep scheduling and writes disabled. The initial database integration connects the same database across environments; provision an isolated preview branch before testing real mutations.

## Reliability and budgets

Eve persists agent sessions through Workflow. Postgres is the durable source of business state. Completed reviews and outbox intents are committed together; repeat calls do not duplicate action rows. Unknown write or delivery outcomes are recorded as `unknown`, never blindly retried. Concurrent mutations are serialized; stale proposals expire. Pending transaction receipts are checked on scheduled ticks. If ESPN cannot identify an uncertain transaction, execution stays blocked for manual reconciliation. FAAB checks reserve pending app bids, but external bids can still race; ESPN remains the final budget authority.

A $10/month AI Gateway project budget is configured. The app's model budget blocks new reviews once reported model spend reaches the selected threshold. Provider search, Photon, hosting, and database billing are separate; a model call in progress can cross the app threshold. Changing the app setting does not automatically change the Gateway budget. Gateway BYOK spend is not covered by its system-credential budget.

The paid model route initially returned `byok_requires_paid_credits`. An owner-approved one-time $5 top-up resolved it; production model calls, application tool use, and Gateway web search are now verified. Do not substitute an unrelated team's API key for project OIDC.

## References

- [Eve documentation](https://eve.dev/docs)
- [ESPN read reference](https://github.com/jwulff/fantasy-sports)
- [Published ESPN transaction shape reference](https://github.com/heyitaki/espn-fantasy-football-mcp/blob/327d58c41dfcb8cc8ddefcf62fb39674cb43ebff/src/espn/transactions.ts)
- [AI Gateway search](https://vercel.com/docs/ai-gateway/models-and-providers/web-search)
- [Detailed original plan](PLAN.md)

## Full autopilot

The owner authorized unattended management. Automatic proposals enter a durable `ready` queue; the review and recurring dispatcher both drain it, so a crash after review completion does not lose the move. Every executor rechecks current policy, ownership, roster state, and ESPN locks. Definitive 4xx rejections are recorded as failed; ambiguous outcomes are reconciled before another mutation. Exact pending offers and claims are deduplicated. Digests are queued after execution settles and include recorded outcomes. ESPN cookie expiry and exhausted AI credits can still need owner intervention.

## Notification and trade-inbox behavior

The five-minute dispatcher runs one active production schedule. Daily, pregame, and waiver reviews share durable occurrence keys, but only the daily scheduled review queues a routine text. Other review summaries remain in Activity. Distinct action outcomes, new incoming offers, and operational failures may produce additional texts. Identical messages for the same local day are suppressed; ambiguous sends are not retried. The sender also suppresses quiet-review messages queued by older workflow versions.

ESPN trade activity is read through `mTransactions2` with trade filters. Both review snapshots and the live `get_trade_offers` tool include incoming, outgoing, and historical offers. Related cancellation/decline events and expiry override stale PENDING flags. An unavailable inbox is explicitly reported as unknown. The dispatcher checks for incoming offers and starts a deduplicated assessment run for a changed active inbox. Every review records an accept, decline, or hold decision for each active incoming offer. Automatic mode sends eligible replies without asking again. An acceptance remains submitted until ESPN completes the trade and the resulting roster is verified. Failed or canceled receipts cannot prove a successful reply.

Messages use ASD-STE100-inspired simple English: a lead of at most 280 characters, up to three short bullets, and up to two links to sources used. This is a writing preference, not formal certification.

Run `node --env-file=.env.local --import tsx scripts/check-notification-claims.ts` to test the actual send-claim SQL in transaction-local temporary tables. It never sends a message or changes application records.
