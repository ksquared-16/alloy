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

## `02-write-guard.sql` — publication is the only sanctioned writer

Proves `20260730130000_business_process_projection_write_guard.sql`. Recorded run, 2026-07-30 —
22/22 passing. Highlights:

```
PASS  direct lifecycle projection write REJECTED: lifecycle_builder_v1 is publication-owned; …
PASS  rejected bypass left the projection untouched
PASS  bootstrap-style whole-column replace REJECTED
PASS  projection DELETE rejected
PASS  sibling key lifecycle_activation_v1 writes freely
PASS  sibling key opportunity_attention_rules writes freely
PASS  bootstrap MAY initialize absent configuration
PASS  bootstrap may NOT overwrite established configuration
PASS  explicit migration mode permits a repair write
PASS  runtime projection == latest publication payload
PASS  an invalid draft may be saved
PASS  invalid draft did NOT become runtime truth
```

Two halves matter equally: the bypass is **blocked**, and the guard is **narrow** — sibling metadata
keys and non-metadata columns keep writing freely, which is what stops this from becoming a
department-metadata migration.

### A bug this harness caught

The first run failed at `direct lifecycle projection write REJECTED`. The capability token is a
transaction-local GUC, so after the publish RPC set it, it stayed set for the remainder of the
transaction — any later write in that transaction inherited a standing bypass. Fixed by releasing
the token immediately after the projection UPDATE (`end_lifecycle_projection_write`). Worth noting
because the contract tests alone would not have found it; only executing the sequence did.

## `03-stage-save.sql` — the migrated stage save survives `enforce`

Proves the write shape produced by `lib/lifecycle/saveLifecycleStageRuntimeConfig.ts` after the
editor-slice-1 migration. Recorded run, 2026-07-30 — 13/13 passing:

```
PASS  setup: published revision 1
PASS  stage draft write succeeds under enforce
PASS  draft write did NOT change the runtime projection
PASS  unknown fields survived the draft write
PASS  companion field-rules write succeeds: identical builder passes the guard
PASS  companion write preserved the projection byte-for-byte
PASS  companion write landed its sibling keys
PASS  un-migrated stage write REJECTED: lifecycle_builder_v1 is publication-owned; …
PASS  publish -> revision 2
PASS  runtime projection now carries the stage edit
PASS  publication preserved the unrelated sibling keys
PASS  publication preserved unknown fields
--- STAGE SAVE: ALL SCENARIOS PASSED ---
```

The one that justifies the file: **`companion field-rules write succeeds`**. The field-rules
companion is a *whole-column* `departments.metadata` update that rewrites the identical
`lifecycle_builder_v1` alongside a changed sibling. Whether the guard permits that is not decidable
from the application tests — it depends on the trigger comparing values (`IS NOT DISTINCT FROM`)
rather than counting writes. Paired with **`un-migrated stage write REJECTED`**, the two together
say the migrated shape passes for the right reason and the old shape still fails.

## `04-publication-workflow.sql` — draft edit -> validate -> publish -> runtime

The editor vertical. Recorded run, 2026-07-31 — 24/24 passing. Highlights:

```
PASS  publish -> revision 1
PASS  draft rebased onto the publication it produced
PASS  draft edit with the current token succeeds
PASS  stale draft-edit token writes ZERO rows
PASS  the losing edit did not land
PASS  payload change without advancing the token REJECTED: business_process_draft_revision_not_advanced …
PASS  a non-payload draft update needs no token
PASS  runtime projection unchanged by draft edits
PASS  publish with blocking issues REJECTED: business_process_draft_not_validated
PASS  blocked publish created no revision
PASS  blocked publish created no publication act
PASS  blocked publish left runtime on revision 1
PASS  exactly two revisions exist
PASS  runtime projection now carries the draft edit
PASS  unknown fields survived load -> save -> publish
PASS  STALE PUBLICATION BLOCKED: business_process_draft_stale (current_revision=… attempted_base=…)
PASS  no revision 4 was created
PASS  revision 3 remains the latest publication
PASS  A's unpublished edit is still safely in the draft, not silently rebased
```

The two that carry the most weight:

- **`payload change without advancing the token REJECTED`** — the draft-edit token is structural,
  not a convention a future writer can forget. Without the trigger, compare-and-set would be
  optional and therefore not a guarantee.
- **`A's unpublished edit is still safely in the draft, not silently rebased`** — a stale publication
  is refused *and* the losing operator's work survives. Refusing without preserving would trade one
  data-loss defect for another.

## Running the whole harness

```bash
psql -h 127.0.0.1 -p 5432 -d postgres -c "DROP DATABASE IF EXISTS alloy_bp_pub_test;" -c "CREATE DATABASE alloy_bp_pub_test;"
```

then, against `alloy_bp_pub_test`, in order: `00-stubs.sql`, the three migrations
(`20260730120000`, `20260730130000`, `20260731120000`), then `01` … `04`.
Recorded total: **76/76** (18 + 22 + 12 + 24).

## Scope

Publish-path CAS **and** projection write authority. What is *not* yet done: the ~15 product writers
(Lifecycle Builder saves, Work Views persistence, stage/outcome editors) still attempt direct
projection writes. The guard now makes them fail loudly rather than corrupt silently, but they must
be routed onto draft persistence before the guard can run in `enforce` for a live product. Until
then the guard supports a `warn` posture:

```sql
ALTER DATABASE <db> SET alloy.lifecycle_guard = 'warn';
```

`enforce` is the default and the end state.
