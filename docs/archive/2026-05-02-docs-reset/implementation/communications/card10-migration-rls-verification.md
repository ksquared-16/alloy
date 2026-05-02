# Card 10 — Staging Migration + RLS Verification (Runbook)

Use this checklist after deploying `supabase/migrations/20260430254100_communications_v1_foundation.sql` to staging (or locally with `supabase db reset`).

## 1. Apply migration

**Supabase-hosted (recommended):**

- Push migrations via CLI linked to project:  
  `supabase db push`  
  Or apply the SQL file in the Supabase Dashboard → SQL Editor (one-time).

**Local (optional):**

```bash
supabase start
supabase db reset   # reapplies all migrations; destroys local data
# or migrate only against running local DB:
supabase migration up
```

## 2. Verify tables exist

Run in SQL editor or `psql`:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name like 'communication%'
order by 1;
```

Expect: `communication_provider_bindings`, `communication_threads`, `communication_messages`, `communication_message_reads`.

## 3. RLS scenarios

Use the scripted checks in **`verify_rls_communications.sql`** (same directory). Summary:

| Scenario | Expectation |
|----------|--------------|
| `authenticated` org member SELECT own `org_id` | Rows visible |
| `authenticated` SELECT other org | No rows (`USING` false) |
| `anon` INSERT/UPDATE | Denied — no permissive policy (RLS enabled) |
| Service role (`createAdminClient` / backend) INSERT | Allowed (JWT bypass or policy + bypass per Supabase) |

## 4. Blockers checklist

- [ ] Migration not applied → admin/composer/bindings APIs return “relation does not exist”.
- [ ] Wrong Supabase anon key exposed in browser calling `communication_*` directly → should still deny writes via RLS; prefer never calling these tables from the browser without RLS-safe patterns.
- [ ] Policies recreated twice on same DB → PostgreSQL errors on duplicate policy names (migrate once per env).

## 5. Recording results

Paste into your PR/sprint notes:

1. Commands run (`db push`, `psql`, etc.).
2. Migration version applied (dashboard or `supabase migration list`).
3. Outcome of each query block in `verify_rls_communications.sql`.
