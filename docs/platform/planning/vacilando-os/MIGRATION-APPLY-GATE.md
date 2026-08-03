# Migration apply gate (Director / implement missions)

**Status:** Active operating rule (2026-07-29). Learned from Access & Roles V2 Phase 0 first-run.

## Problem

`awaiting_authorization` alone was enough for AC5 `operator_review`. That correctly blocked silent skip/apply, but it asked the operator to authorize **before** anyone proved the SQL was safe on the target DB (orphan grants, unexpected FKs, catalog width vs seed functions, dependents of `DROP TABLE`).

## Rule

For implement missions that introduce `supabase/migrations/*.sql`:

| Target | Worker must | AC5 outcome |
|--------|-------------|-------------|
| `local` / `none` | Account in `migrations[]` (`applied` or `awaiting_authorization`) | met or operator_review |
| `shared` / `live` / `staging` / `production` | Run **read-only preflight** on that DB → harden migration if unsafe → write evidence → set `migrations[].preflight = { ok: true, summary, evidence_path }` with `status: awaiting_authorization` | operator_review only when `preflight.ok === true`; **unmet** if preflight missing or `ok: false` |
| Authorized apply | Apply only after operator says so; then `status: applied` | met |

Never ask the operator to authorize a shared apply on a bare `awaiting_authorization` row.

## Minimum preflight checklist (adapt to the SQL)

1. Confirm migration **not already applied** on target (`list_migrations` / schema_migrations).
2. Simulate data effects: unions, upserts, backfills — count orphans.
3. For FK repoints: grants/keys that would fail the new FK after preparatory inserts.
4. For `DROP TABLE` / rename: unexpected incoming FKs and dependent views.
5. For seed / rewrite functions: catalog width vs live (new tenants must not get a thinner set).
6. Write JSON evidence under the mission QA dir; link it from `preflight.evidence_path`.

## Report shape

```json
{
  "path": "supabase/migrations/….sql",
  "status": "awaiting_authorization",
  "target": "shared",
  "note": "…",
  "preflight": {
    "ok": true,
    "summary": "orphan grants=0; unexpected FKs=0; seed width=57",
    "evidence_path": "docs/platform/planning/vacilando-os/qa/…/…-preflight.json"
  }
}
```

## Enforcement

- Compiler: implement objective + QA4 + AC5 statement require shared preflight.
- Acceptance: `migration_accounted` in `scripts/local-dev/lib/vacilando/acceptance.mjs`.
- Tests: `scripts/local-dev/tests/mission-runtime.test.mjs` (missing / failed / ok preflight cases).

## Operator judgment remains

Preflight `ok: true` does **not** auto-apply. It only unlocks the honest question: authorize apply on shared, or keep deferred.

## Accept ≠ authorize-apply (hard rule)

`mission.accept` may run **only when the acceptance gate is `pass`**.

A gate of `needs_operator` (including `migration_accounted` → `awaiting_authorization`) **must not** complete the mission or advance the objective spine — even if the operator clicks Accept, and even in autonomous mode. That bug shipped once on Access & Roles Phase 0 (2026-07-29): Accept with `gate=needs_operator` marked the phase ✓ and launched Phase 1 while the shared migration was still unapplied.

Correct sequence for shared migrations:

1. Worker: preflight → `awaiting_authorization` + `preflight{ok:true}` → gate `needs_operator`.
2. Operator: authorize apply (or explicitly defer).
3. Apply on the target DB; set `migrations[].status` to **`applied`** (or keep deferred and do **not** Accept yet).
4. Re-evaluate → gate **`pass`**.
5. **Then** Accept → spine advances.

The conductor strip must show **Needs your judgment** whenever `waiting_for_acceptance` + `acceptance_gate=needs_operator`, never “Nothing needed from you.”
