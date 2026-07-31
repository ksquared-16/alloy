# Root cause: Firefly `work_views_v1` silently overwritten

Sprint: `bp-config-integrity` (slot 6). Phase A — precondition investigation.
Status: **root cause identified; writer contained, not yet fixed.**

## Verdict

The configuration was not lost to caching, a rogue background job, or a race.

It was destroyed by a **lossy read–modify–write of a single shared JSONB blob**, executed by
ordinary application saves, amplified by **every managed worktree pointing at one live tenant**.

A revision check would **not** have prevented it. The writer that destroyed the data held a
perfectly current snapshot. The loss happens during `parse`, before any concurrency question
arises. This distinction drives the integrity contract in this sprint.

## The storage shape

There is no `work_views_v1` table. The entire business-process configuration for a department —
processes, stages, tracks, transitions, outcome rules, work views, participation, command sets —
lives in one column:

```
departments.metadata → lifecycle_builder_v1 → processes[] → work_views_v1[]
```

Postgres has no partial update here. Every writer, however "surgical" it looks in TypeScript,
emits `UPDATE departments SET metadata = <entire new object>`.

## The mechanism

### 1. The parser is an allowlist reconstructor, not a validator

`parseLifecycleBuilderV1` (`web/lib/lifecycle/lifecycleBuilderConfig.ts:146`) does not validate the
stored blob and pass it through. It **rebuilds** each process and stage field-by-field from a fixed
allowlist. Consequences:

- Any process/stage key not on the allowlist is silently discarded.
- A process missing `id`/`key`/`name` is `continue`d out of existence (`:159`).
- A stage missing `id`/`key`/`label` is dropped (`:168`).
- Each sub-blob (`tracks_v1`, `work_views_v1`, `queue_membership_v1`, `status_rollup_v1`,
  `stage_operating_plan_v1`, `perspectives_v1`, `action_catalog_v1`, `participation_v1`,
  `command_set_v1`) is dropped entirely if its own sub-parser returns null (`:169`–`:213`).
- `active_process_id` is silently rewritten to `processes[0].id` when it does not resolve (`:225`).

`parseWorkViewRow` (`web/lib/lifecycle/workViewsConfigV1.ts:139`) is the same shape one level down:
it constructs `const stored = { id, label }` and copies only ~9 known keys.

Worst case: `lifecycleBuilderFromDepartmentMetadata` (`:230`) falls back to
`emptyLifecycleBuilderV1()` on any parse failure — so a blob that fails to parse becomes
`{processes: []}` in memory, and **the next save writes that empty config over the real one**.

### 2. Every save writes the whole blob back from the lossy parse

`mergeLifecycleBuilderIntoMetadata` (`:238`) is `{...metadata, lifecycle_builder_v1: config}` — a
full key replace, never a deep merge. So renaming one stage rewrites the entire process inventory
for the department through the parser.

### 3. No concurrency control anywhere in this domain

`departments` has no `revision`, `version`, `etag`, or `lock_version` column
(`supabase/migrations/20260329165048_remote_schema.sql:1372`). Every writer filters on
`.eq("id", …).eq("org_id", …)` only. `updated_at` is written but **never compared**. Last write
wins, silently. The in-blob `version: 1` is a schema-format literal, not a counter.

There is **no chokepoint** — ~15 modules issue their own `.update({ metadata })`.

### 4. No audit trail

No trigger on `public.departments`. No config writer emits an audit/event row. There is no actor,
timestamp, source surface, or prior/new revision recorded for any `lifecycle_builder_v1` change.
This is why the prior session could observe the effect but not the writer.

### 5. No atomicity

`runPlatformTransaction` is a saga, not a DB transaction
(`web/lib/platform/transaction/platformTransaction.ts:30`), and no config path uses it.
`saveLifecycleStageRuntimeConfig` (`web/lib/lifecycle/saveLifecycleStageRuntimeConfig.ts:174`)
performs **six or more sequential full-blob writes** threading one stale in-memory snapshot; a
failure midway leaves the blob half-applied with no rollback and no record.

## Why `row_grain_v1` specifically vanished

`row_grain_v1` **does not exist on `origin/staging`**. It exists only on the Runtime convergence
branch `agent/claude/3-runtime-bp-convergence` @ `8973febcd`:

```
8973febcd:web/lib/lifecycle/workViewsConfigV1.ts
8973febcd:web/components/adminV2/settings/businessProcess/WorkViewProcessEditorCard.tsx
8973febcd:web/lib/runtime/provisioning/workUnitProvisioningAnswer.ts
```

`git grep row_grain_v1` on a staging-based branch returns nothing.

**58 of 59 managed worktrees share one tenant** — `DEV_QUEUE_ORG_ID=93667019-bd28-49b5-a688-acc9bb1e0a19`
on project `ikaxilmwmrmbagoidedu` (only `wt3-runtime-continuity` uses a local stack). During the
prior session, slots 2, 3 and 4 were all serving that tenant.

So the sequence was:

1. Author `row_grain_v1` through slot 3, whose code understands the field.
2. Any lifecycle-builder save from a **staging-based** server — a stage rename, a surface edit, a
   track change — re-parses the whole builder without `row_grain_v1` on its allowlist.
3. The stripped blob is written back wholesale. No revision guard objects, because nothing is stale.

Four disappearances, four such round-trips. **No concurrency is required for this bug to fire.**

## Aggravating findings

- `persistWorkViewsV1.ts:48` — an empty list becomes `undefined`, **deleting the key** instead of
  storing `[]`.
- `normalizeCatchAllWorkViewCompatBinding` (`workViewsConfigV1.ts:78`) mutates config **at load
  time**; a read-then-save launders that mutation into durable state. This matches "lenses silently
  returned to grain-ambiguous behavior."
- `parseWorkViewRow:151` drops an explicitly-empty `filters_v1`, converting an explicit empty-filter
  view into an absent-filters view — which `isWorkViewCatchAll` then treats as catch-all.
- **Compatibility-seed promotion.** `WorkViewsConfigurationContext.tsx:100` seeds editable client
  state from the GET response's `effective` field — the *synthesized* seed, not
  `saved_work_views_v1`. `resolveProcessWorkViews` falls back to a hardcoded
  `createEmptyWorkViewDraft("New families today")` (`workViewsCompatibility.ts:71`). An operator who
  merely opens the panel and saves **persists a placeholder as authored tenant config**.
- `applyVerticalBootstrap.ts:102` — unconditional full replace of the entire `metadata` column from
  a blueprint constant, never merged with what is in the DB.
- `repairCatchAllWorkViewCompatBindings.ts:36` — `ORG_ID` is optional; with `DRY_RUN=0` and no
  `ORG_ID` it rewrites work-view bindings **across every org in the database**.
- `supabase/migrations/20260711000000_...:126` — rewrites the metadata column by **text
  substitution over the whole JSONB**, hitting `work_views_v1[].filters_v1[].field_key` collaterally.

## Precedents already in this codebase

The platform already solves this problem twice, in other domains. The integrity contract should
adopt these rather than invent a third mechanism:

- **Optimistic concurrency via RPC** — `work_units.queue_definition` uses `SELECT … FOR UPDATE` then
  `IF v_old IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'agent_v0:stale_…'`
  (`supabase/migrations/20260412200000_agent_v0_atomic_commit_rpc.sql:38`).
- **Draft/revision/publication split** — the Programs domain has `program_drafts`,
  `program_revisions`, `configuration_publications` with `base_revision_id`, `revision_number`,
  `payload_checksum` and an immutability trigger
  (`supabase/migrations/20260722020000_configuration_publication_runtime_v1.sql:30`).

## Containment applied

Only slot 6 now serves the Firefly tenant; slots 2, 3, 4 dev servers stopped and verified
(`lsof -iTCP:3011-3016 -sTCP:LISTEN` shows 3016 only).

This is containment, not a fix. It holds only while no other worktree is served.

## The invariant this sprint must enforce

The brief's law — *a configuration write must not overwrite newer configuration from a stale
snapshot* — is necessary but **not sufficient**. It must be paired with:

> **A configuration write must not drop fields the writer does not understand.**

Round-tripping must be lossless: unknown keys preserved, and a blob that fails to parse must **fail
the write**, never degrade to an empty config that is then persisted.
