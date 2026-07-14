# Operational Expectations — Wave C live Postgres certification

Reproducible real-database certification of the OE Wave C migration set (governed
Authority model, self-ratifying authoring, immutable ratification). It exercises the
**actual** DDL, triggers, RLS policies, `SECURITY DEFINER` functions, and
transactions on real Postgres.

**Scope.** Targeted certification of the OE migration set on a minimal
Supabase-compatible base (roles `authenticated`/`anon`/`service_role`, `auth.uid()`/
`auth.role()`, and the OE dependency tables). A full 250-migration replay from empty
requires the Docker Supabase stack (`supabase db reset`) and is not what this proves.

## Run

```bash
createdb oe_wavec_cert
psql -q -d oe_wavec_cert -f supabase/tests/operational_expectations/wave_c_min_base.sql
for m in 20260717000000_operational_expectations_ledger_p1_wave_a \
         20260719000000_operational_expectations_authoring_intake_p1_wave_b \
         20260720000000_operational_expectations_author_permission_and_idempotency \
         20260721000000_operational_expectations_ratification_p1_wave_c \
         20260722000000_operational_expectations_authority_model_p1_wave_c \
         20260722010000_operational_expectations_authority_enforcement_p1_wave_c; do
  psql -q -d oe_wavec_cert -v ON_ERROR_STOP=1 -f "supabase/migrations/$m.sql"
done
psql -d oe_wavec_cert -f supabase/tests/operational_expectations/wave_c_live_cert.sql
dropdb oe_wavec_cert
```

## Certified (2026-07-14, Postgres 14.17)

- Full OE migration set replays cleanly from the minimal base.
- Catalog: unique authority_key/org, same key cross-org, no executable-rule column.
- Assignments: ungoverned rejected, AI holder rejected, append-only (UPDATE/DELETE
  blocked), effective/inactive/future/expired honored, scope isolation, revocation.
- Resolver: holds/not-holds, AI never holds, inactive/future not effective,
  location scope isolation, revoked no longer holds — real rows + timestamps.
- Self-ratifying authoring: held-authority human → binding + assignment evidence +
  ONE Authoring Act + NO Ratification Act; no-authority/ungoverned → proposed;
  predicted → model; AI → proposed; forgery-resistant (caller `standing` ignored);
  recorded time DB-assigned; idempotent (one row/event).
- Explicit ratification: sufficient authority → binding + one immutable row + one
  Ratification Act; insufficient → `oe_insufficient_authority` (no row, no event);
  rows immutable; idempotent.
- Security posture (`pg_proc`/`information_schema`/`pg_class`): every Wave C function
  `SECURITY DEFINER` + `search_path=public`, EXECUTE denied to PUBLIC/anon/
  authenticated, granted only to `service_role`; RLS enabled on all tables; no
  authenticated INSERT, no anon read; zero dynamic SQL; real role-exercise:
  `authenticated` INSERT → permission denied.
