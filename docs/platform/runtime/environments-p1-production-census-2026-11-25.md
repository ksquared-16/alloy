---
owner: runtime
status: proposed
last_reviewed: 2026-11-25
supersedes: []
status_note: Evidence record for objective WALDEN_ENVIRONMENTS_AND_PROMOTION_B9E42B66 — not doctrine.
---

# Environments and promotion — P1 read-only production census (2026-11-25)

Objective: Environments and promotion (`WALDEN_ENVIRONMENTS_AND_PROMOTION_B9E42B66`), slice P1.
Run window: 2026-11-25 22:06–22:15 UTC. Every session was `default_transaction_read_only = on` or
`BEGIN READ ONLY … ROLLBACK`. No writes, no exports, no row content read.

## Access used

- Login: keychain item `alloy-production-readonly-db` (account `walden`). Connection URI → Supabase pooler,
  project ref `vslwnntzzgpnmrpjipat` (the ref the repo pins as production, `QA_PRODUCTION_PROJECT_REF`).
  Password and URI not recorded.
- Role `walden_readonly`: not superuser, **not BYPASSRLS**, no role memberships, SELECT-only grants on 140 relations
  (139 in `public`, plus `auth.users`). It has no INSERT/UPDATE/DELETE/TRUNCATE grants.

## Database census

Queries were catalog reads (`pg_roles`, `information_schema.table_privileges/column_privileges/columns`,
`pg_class`, `pg_policies`, `pg_stat_user_tables`) plus a `count(*)` visibility probe on the four target tables.
Production uses the older schema: organizations live in `public.orgs`, payment status/time in `public.payments`,
outbound delivery status/time in `public.messages_outbox` and `public.messages`.

### Row-level visibility: blocked by RLS

| Table | RLS | Probe result as `walden_readonly` |
|---|---|---|
| `orgs` | enabled, no policies | `count(*) = 0` — a policy-filtered zero, not proof of emptiness |
| `payments` | enabled | ERROR `infinite recursion detected in policy for relation "app_users"` |
| `messages` | enabled | same recursion error |
| `messages_outbox` | enabled, **forced** | `count(*) = 0` — policies only grant `authenticated` |

Because the role has no BYPASSRLS and no matching policy, **it cannot read any row** in these tables. Per the plan,
row-level inspection stopped here. Organization names/slugs/status, payment status and `paid_at`, and delivery status
and `sent_at` were **not** read. Real vs test organizations **cannot be distinguished** with this login.

### Catalog statistics (counts only, no content)

From `pg_stat_user_tables` — cumulative since the last stats reset (reset time not visible to this role), so these
are indicators, not an audit.

| Table | live rows | inserted | updated | deleted | last analyze |
|---|---|---|---|---|---|
| `orgs` | 1 | 1 | 22 | 0 | never |
| `payments` | 0 | 15 | 57 | 0 | 2026-03-22 21:24 UTC |
| `messages` | 0 | 63 | 118 | 67 | 2026-03-28 17:05 UTC |
| `messages_outbox` | 12 | 28 | 25 | 0 | never |

Reading: production holds **one** organization row, no current payment rows (15 were inserted and later went away
without deletes counted — likely a stats reset or truncate; not determinable), no current `messages` rows, and 12
outbox rows. That is not the footprint of material customer activity, but whether the single org is a test org is
**unknown** without row visibility.

### Recent sign-ins: not assessed

`auth.users` was not queried, per the plan. The role cannot reach it anyway: the schema `auth` lacks USAGE
(`permission denied for schema auth`). Recent sign-ins were not counted or inferred.

**Security note for the owner:** despite that, `walden_readonly` holds a SELECT grant on `auth.users` covering every
column, including `encrypted_password`, `recovery_token`, `confirmation_token` and the email-change tokens. Only the
missing schema USAGE stops it. Granting `USAGE ON SCHEMA auth` later (e.g. to allow sign-in counts) would expose
credential material. If sign-in counts are wanted, the safer grant is column-level (`id`, `last_sign_in_at`) after
revoking the table-wide SELECT.

## Settings-key comparison (Vercel, Render, Supabase): blocked

Not performed. No platform access is available on this Mac:

- Vercel: no `vercel` CLI and no CLI auth token (`com.vercel.cli` holds only telemetry config).
- Render: no `render` CLI and no API key in keychain or environment.
- Supabase: CLI present but not logged in (`LegacyPlatformAuthRequiredError`); no `SUPABASE_ACCESS_TOKEN`.

No staging or production keys or values were read. Missing capability: a read-only token per platform
(Vercel team token with env-read scope, Render API key, Supabase personal access token) able to list env/secret
**names** for both the staging and production projects.

## What would unblock P1

1. A database role (or policy) that can read the minimum columns — `orgs(id, status, created_at)`,
   `payments(org_id, status_key, paid_at)`, `messages_outbox(org_id, status, sent_at)` — e.g. `BYPASSRLS` on the
   read-only role, or a SECURITY DEFINER aggregate view returning counts per org only.
2. Read-only platform tokens for Vercel, Render and Supabase as above.
3. Optionally, the auth.users grant tightening described in the security note.
