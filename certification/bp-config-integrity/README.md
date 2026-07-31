# Law 4 certification — Configuration Publication model

Behavioural proof of `supabase/migrations/20260730120000_business_process_configuration_publication_v1.sql`
against **real Postgres**. The vitest suite
(`web/tests/configPublication/businessProcessPublicationMigration.test.ts`) guards the migration's
*contract*; this harness proves its *behaviour*.

Design: [`docs/platform/governance/configuration-publication-model.md`](../../docs/platform/governance/configuration-publication-model.md)

## Running it

Needs any Postgres 15+. It creates its own throwaway database and touches nothing else — in
particular it does **not** apply migrations to an existing Alloy stack.

```bash
psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c "DROP DATABASE IF EXISTS alloy_bp_pub_test;" -c "CREATE DATABASE alloy_bp_pub_test;"
```

Then, against `alloy_bp_pub_test`, in order: `00-stubs.sql`, the migration itself, `01-scenarios.sql`.

`00-stubs.sql` creates only the prerequisites the RPC touches (`orgs`, `departments`, `auth.users`,
`workflow_events`, `configuration_publications`, the generic immutability guard, `has_org_role`).
`configuration_publications` and the guard are copied **verbatim** from
`20260722020000_configuration_publication_runtime_v1.sql` so the harness proves reuse of the real
shape, not a convenient substitute.

## What it proves

Recorded run, 2026-07-30 — 18/18 passing:

```
PASS  unvalidated draft rejected
PASS  first publish -> revision 1
PASS  publication row recorded on the generic table
PASS  audit event emitted
PASS  runtime projection written
PASS  projection preserves unrelated metadata siblings
PASS  draft rebased onto new revision
PASS  rebased draft publishes -> revision 2
PASS  STALE DRAFT BLOCKED: business_process_draft_stale (current_revision=… attempted_base=…)
PASS  no revision created by the blocked publish
PASS  runtime projection still the newer revision, not the stale payload
PASS  revision UPDATE blocked
PASS  revision DELETE blocked
PASS  rollback creates revision 3 (forward-only)
PASS  rollback records provenance
PASS  rollback rewrote the runtime projection to revision 1 payload
PASS  history is append-only (3 revisions retained)
PASS  publish resumes after rollback -> revision 4
--- ALL SCENARIOS PASSED ---
```

The three that matter most:

- **`STALE DRAFT BLOCKED`** — the Law 4 boundary, and the check the Programs implementation lacks.
- **`no revision created by the blocked publish`** + **`runtime projection still the newer
  revision`** — the refusal is atomic. A blocked publish leaves nothing behind, which is the
  difference between a conflict and a partial write.

## Scope

Publish-path CAS only. It does **not** prove that the ~15 direct `departments.metadata` writers are
prevented from bypassing publication — they are not, yet. Converging them onto the publication
boundary is the follow-on work, tracked in the design document.
