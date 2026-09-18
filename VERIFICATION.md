# Verification — September 17, 2026

Production: https://eve-fantasy.vercel.app

Vercel scope/project: `httpsamcs-projects/eve-fantasy`.

Latest verified deployment: `dpl_GRcrceyZEovbiWwkrEJEqB7KiufK` (`READY`).

## Passed

- 16 automated tests: legal lineup optimization, FLEX assignment, game locks, missing projections, stale/changed roster rejection, protected players, FAAB limits, trade ownership and item direction, ESPN normalization/error handling, session signatures, authenticated encryption, and daylight-saving scheduling.
- TypeScript check and production Next.js/Eve build.
- Dependency audit: zero reported vulnerabilities after patching the transitive OpenTelemetry core dependency.
- Browser: owner login, authenticated dashboard, connection form, saved pause setting, and restoration to unpaused observation mode.
- Production: Eve health HTTP 200, unauthenticated dashboard and Eve session requests HTTP 401, owner login HTTP 200 with Secure/HttpOnly cookie, authenticated dashboard/settings HTTP 200.
- Registered five-minute Eve dispatcher in Vercel Cron. The final deployment's dispatcher was triggered through the CLI, and an authenticated request with the Vercel schedule header returned HTTP 200 / `{"success":true}`. Anonymous cron requests return HTTP 401. A bearer-only request returns HTTP 400 because Nitro also requires `x-vercel-cron-schedule`.
- Existing `photon/oura-rivals` connector attached to the new project; credential resolution succeeds. Its Oura trigger destination is unchanged.
- $10/month AI Gateway project budget configured and read back through the CLI.

## Activation dependencies and verification limits

- No ESPN league, team, or session cookies have been provided. ESPN calls have fixture tests; the real account read and write flows have not been verified.
- No notification recipient has been entered. Photon credentials were checked, but no text was sent.
- After explicit owner approval, a one-time $5 Gateway credit top-up succeeded. Vercel charged $5.45: $5 credits plus a $0.45 payment processing fee, with no tax. No auto-recharge settings were changed.
- Production Eve now completes a durable turn using `openai/gpt-5.6-terra`, calls `get_status`, performs Gateway Exa web search, and returns a cited official ESPN scoring page. The run reached `turn.completed`; the successful step clears the dashboard Gateway blocker. Full fantasy review execution still awaits the ESPN connection.
- All live ESPN write flags remain disabled. Football lineup changes, waiver claims, and equal-count trade offers have guarded adapters, but none has been executed against the user's account.
- Daily reviews remain disabled until the owner completes setup and enables them. Scheduled dispatch itself is installed.

The deployed app is ready for private account setup; it is not yet actively managing a team.
