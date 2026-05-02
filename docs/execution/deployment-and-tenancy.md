# Deployment and tenancy

## Purpose

Deployment, environment, **multi-tenant** behavior, and **operational performance** notes for Admin V2 — consolidated to keep the active doc set under twenty files.

## Current state

- **Tenancy:** Production data is segregated by **`org_id`**; admin flows call `getAdminContextCached` to establish org + user roles.
- **Supabase:** Server uses service role clients only on the server (`createAdminClient`, `serverServiceClient` patterns); browser uses anon/authenticated clients where applicable.
- **Envs:** Booking/public flows may use `ALLOY_PUBLIC_ORG_ID` in action-link consume paths when org id missing — understand before changing.
- Archived **`implementation/DEPLOYMENT.md`** and **`OPERATIONS.md`** were moved to `docs/archive/2026-05-02-docs-reset/` — treat as historical unless refreshed.

### Performance (workspace / admin)

- **AdminV2PerfOverlay** is mounted in **`AdminV2Shell`** for client-side timing markers via **`window.__alloyPerf`**.
- **`web/lib/perf/alloyPerfGlobal.ts`** documents global hook; use when profiling drawer or workspace interactions.
- **QueueService** can be heavy on large orgs — rely on allowlists, indexes, and scope (work unit) to limit queries; profile changes with realistic `queue_definition` sizes.

## How it works

1. Deploy `web` as Next.js app with secrets for Supabase + Stripe + communications providers.
2. Migrations applied in Supabase project; RLS policies must match server access patterns.
3. Operational changes follow `documentation-doctrine.md` — update this file when deploy topology changes.

## Source of truth / key files

| Concern | Location (current code) |
|---------|-------------------------|
| Admin client | `web/lib/supabaseAdmin.ts` |
| Server service client | `web/lib/supabase/serverServiceClient.ts` |
| Admin context | `web/lib/admin/getAdminContext.ts` |
| Perf overlay | `web/components/admin/AdminV2PerfOverlay.tsx`, `web/lib/perf/alloyPerfGlobal.ts` |
| Queue hot path | `web/lib/queues/QueueService.ts` |

## Guardrails

- **Do not** run migrations that bypass RLS assumptions without coordinated policy updates.
- **Do not** log PII-heavy payloads in perf hooks.
- Treat archived DEPLOYMENT/OPERATIONS as **non-authoritative** until reconciled with production.

## Known gaps / risks

- **Needs verification:** Current hosting topology (Vercel vs other), CDN, and edge configuration.
- **Needs verification:** Server APM / log aggregation stack.

## When this doc must be updated

Hosting changes, secret/env additions, tenancy/session model changes, or meaningful perf instrumentation changes.
