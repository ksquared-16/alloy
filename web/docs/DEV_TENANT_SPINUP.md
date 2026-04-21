# Internal dev: childcare tenant spin-up

Repeatable flow (no UI) for validating tenant creation, **generated** tenant config, bootstrap apply, and demo seed — aligned with future onboarding: **org → config → apply → seed**.

## Prerequisites

- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (service role; server-side only).
- `industries` row with `key = childcare` (and active).
- `verticals` row with `slug = childcare` (and active) — required for demo seed.
- A real **`auth.users.id`** UUID to attach as org admin (`user_roles`; one row per user in this schema).

## One-command spin-up

From the `web/` directory (loads `.env.local` / `.env`):

```bash
export DEV_SPINUP_ADMIN_USER_ID="<your-auth-user-uuid>"
npm run dev:tenant:childcare
```

Optional:

- `DEV_SPINUP_ORG_NAME` — defaults to a timestamped name.
- `NEXT_PUBLIC_APP_URL` — printed “open in browser” base (default `http://localhost:3000`).

The script runs `spinChildcareTenantFlow`: **create org** → **`generateTenantConfig`** → **`applyTenantBootstrap`** → **`seedChildcareDemo`**.

## End-to-end test (no UI)

Runs the same flow against your Supabase project and asserts DB shape (departments, work units, statuses, seeded opportunities with priced/unpriced mix).

```bash
export TENANT_E2E_ENABLED=true
export TENANT_E2E_ADMIN_USER_ID="<same-auth-user-uuid>"
export SUPABASE_URL="..."
export SUPABASE_SERVICE_ROLE_KEY="..."
npm run test:tenant:e2e
```

Skipped automatically if `TENANT_E2E_ENABLED` is not `true` or env is incomplete (CI-safe).

## Limitations

- **`user_roles`** is upserted by `user_id`; the admin user’s org is **replaced** for that user — intended for dev accounts only.
- Creates a **new org** each script/test run (unique name) to avoid collisions.
- Demo seed is idempotent per `metadata.seed_key`; a **new org** avoids re-seed skips.

## Related API

- `POST /api/admin/dev/create-org` — requires `DEV_TENANT_SPINUP_ENABLED=true` (separate guard from the script).
