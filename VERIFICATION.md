# Verification — September 18, 2026

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
- The adapter supports equal-count trade offers, not incoming trade acceptance or unequal-count trades.
- Uncertain ESPN outcomes stop further mutations until reconciliation establishes what happened. Explicit API rejections are recorded as failures rather than ambiguous writes.
- ESPN cookie expiry or exhausted Gateway credits can require owner intervention. A $10/month Gateway project budget remains configured.
- Proactive messages use the existing Photon connector; Oura's incoming webhook routing is unchanged.
