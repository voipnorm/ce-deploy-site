# Private telemetry dashboard

URL: https://ce-deploy.voipnorm.com/admin/telemetry/
Project: `qgnnceoecflhbimcmrya` (existing CE-Deploy Supabase project).

## Access and privacy

Only a confirmed, non-anonymous Supabase Auth user whose verified email is
`chris.norman@hotmail.com` can retrieve aggregates. Email is checked from
Supabase Auth's `/user` response, never from request input or user metadata.
The Edge gateway also verifies the user JWT. Login requests do not create users.
Existing Supabase/Resend numeric email-code templates are reused.

GitHub Pages serves a public static login shell; private data is not in HTML,
JavaScript, the build, or static assets. The route is unlisted and noindex, but
those are not access controls. All data access is enforced by the Edge Function.
The public project key is intentionally browser-visible. Service credentials
come only from Supabase's built-in Edge environment. No secrets belong in site
or GitHub Pages build configuration.

Sessions are held only in memory and expire after at most one hour. Closing or
reloading the tab requires sign-in again. Sign-out clears the dashboard before
attempting server logout. Late responses cannot restore data after sign-out.
No background polling, browser storage, scheduled jobs, materialized views, or
new service is used. Responses use `private, no-store`; the page uses a strict
CSP and no third-party scripts. Only the production site origin is allowed by CORS.

The dashboard API calls one fixed service-only RPC. Six security-invoker views
aggregate the data inside Postgres. Browser roles have no grants on views, RPC,
or raw telemetry tables. The API independently projects and validates a bounded
response, dropping unrecognized fields. It returns generic errors without logs
of credentials, tokens, rows, or database errors.

## Metric definitions

- Active: last seen within a rolling 1/7/30/90/180-day window.
- New: active installations first seen within the same rolling window.
- Daily: retained accepted request counters over UTC calendar days including today;
  not distinct installations. Missing/deleted/expired counters appear as zero.
- Adoption: latest version/channel of active installations, top 100 combinations;
  a truncation warning appears when needed.
- Reach: sum of latest non-null counts from active installations, potentially
  overlapping; never label this as unique endpoints. Median and p95 exclude null.
- Sources/confidence: latest observations from active installations; includes
  unavailable, partial, lower-bound, and stale classifications.
- Quality: missing counts, uncertain counts, and 41.x versions that may reflect
  an Electron version. This heuristic is not a complete anomaly detector.
- `updated_at`: response-generation time, not an individual heartbeat timestamp.
- Rejections/malformed requests are not persisted in the source aggregates and
  are explicitly described as unavailable, not fabricated as zero.

## Ownership and deployment

This website repo owns the dashboard migration and function. Desktop telemetry
migrations stay in the desktop repo. Apply this idempotent additive migration
explicitly; do not run `db push` from this partial migration directory or overwrite
shared Auth configuration with this minimal function config.

```
supabase db query --linked --project-ref qgnnceoecflhbimcmrya --file supabase/migrations/20260914190000_private_telemetry_dashboard.sql
supabase db query --linked --project-ref qgnnceoecflhbimcmrya --file supabase/tests/telemetry_dashboard.sql
supabase functions deploy internal-telemetry-dashboard --project-ref qgnnceoecflhbimcmrya --use-api
npm test
ASTRO_TELEMETRY_DISABLED=1 npm run build
```

The aggregate migration is managed as an explicitly applied dashboard extension,
not inserted into the desktop project's migration ledger. It creates no raw-data
policies and leaves existing ingestion, retention, and membership behavior intact.
Website publishing uses the existing GitHub Pages workflow.

`node scripts/test-telemetry-hosted.mjs` uses the Supabase CLI authenticated session
(override `SUPABASE_CLI` for its path), keeps keys only in memory, creates one
synthetic confirmed Auth account, verifies live 401/403 and direct-read denial,
and removes that account in `finally`. It never sends email or impersonates the
owner. Do not run concurrently with its own cleanup.

## Validation evidence

- 28 handler/UI tests passed, including empty datasets, absent endpoint counts,
  request validation, 401/403/503, raw-field canaries, and late-response sign-out.
- Rollback-only hosted migration rehearsal passed for all windows and aggregate
  totals compared to raw counts inside the database (raw rows were not returned).
- Hosted anonymous and real authenticated non-owner tests passed; test account removed.
- Owner's confirmed Auth account exists. Final human email-code sign-in is required
  to verify actual mailbox delivery and the live owner dashboard end to end.

- Live response validation includes stable, legacy beta, private-beta, public-beta, and development channels.
- Existing npm audit findings affect Astro/build image-processing dependencies; no new findings were introduced by happy-dom. This static deployment exposes no Astro image-optimization server or user-upload pipeline. Dependency remediation is separate from this dashboard change.
