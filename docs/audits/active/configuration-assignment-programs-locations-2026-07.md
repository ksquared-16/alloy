---
owner: engineering
status: stage-4-e2e-certification-ready
last_reviewed: 2026-07-22
sprint: org-runtime-realization
slot: 4
phase: configuration-assignment-e2e-stage-4
---

# Configuration Assignment Reference — Programs → Locations

## Status

| Stage | State |
|-------|--------|
| 1 Interactive prototype | **Approved** |
| 2 Backend authority + command | **Complete** |
| 2.5 Capability certification | **Complete** — see `configuration-assignment-capability-certification-2026-07.md` |
| 3 Production frontend | **Complete** — Programs adapter only |
| 4 E2E certification | **Ready for operator approval** — durable ops + authenticated API/browser evidence |

**Stage 2.5 headline:** This is not “a Programs feature that every page copies.” It is the first adapter on Configuration Assignment (availability). Tuition stays on value inherit/override. Preview→Commit is cross-cutting.

**Stage 3–4 non-claim:** Tuition, Fees, Policies, Surfaces, and Access do **not** use this runtime. Business Processes and Automation remain future Assignment candidates only if Location availability semantics are proven.

## Frozen interaction contract (from Stage 1 approval)

- Operator verb: **Add to Locations** / **Make available**
- Both entry points share one workflow
- Bulk Location selection + preview before execution
- Organization definition vs Location configuration are separate edit surfaces
- Local configuration retained unless explicitly changed
- Manual UI authoritative; BOS may later prepare the **same** command only

Do not redesign Stage 1 interaction during Stages 2–3.

Platform term remains **Assignment**.

---

## Publication verdict (critical)

### Verdict A — Only published Program revisions may be made available

**Evidence (not from prototype):**

| Evidence | Path |
|----------|------|
| Assign/preview require `publicationId` → `configuration_publications` | `programPublicationService.ts` `loadPublicationAndRevision`, `previewProgramDistribution`, `assignProgramDistribution` |
| Delivery RPC fails with `published_program_revision_required` | `assign_program_publication_target_v1` in `20260722020000_configuration_publication_runtime_v1.sql` |
| LPC POST create → **409** (“Apply a published Program”) | `location-program-categories/route.ts` |
| Client create path: create_draft → validate → publish → assign | `locationProgramAssociation.ts` `createPublishAndAssignProgram` |
| Catalog helper skips unpublished | `publishedProgramsForAssignment` |
| Doctrine: publish then assign | `docs/platform/core/configuration-ownership-and-inheritance.md` |

**Not B:** no draft→LPC association path.  
**Not C as the association rule:** create and assign are separate API actions, but association still requires publication.

### Create-new compound sequence (locked)

```text
create_draft → validate_draft → publish → assign selected Locations
```

Review UI (Stage 3) **must** state that publication will occur.

Stage 1 prototype allowed unpublished fixture flow only because the connected org had zero published Programs — **that is not production authority**.

---

## Authority map

| Step | Table(s) | Service | API | Txn | Permission | Audit | Gap |
|------|----------|---------|-----|-----|------------|-------|-----|
| Create | `programs`, `program_drafts` | `createProgramDraft` | `create_draft` | App two-step; rollback delete on draft fail | `canManageProgramPublication` | None on create | Orphan draft if later steps fail (recoverable) |
| Validate | `program_drafts` | `validateProgramDraft` | `validate_draft` | Single update | same | None | Soft; publish re-validates |
| Publish | `program_revisions`, `configuration_publications`, `workflow_events` | `publishProgramDraft` → RPC | `publish` | DB txn in RPC | same | `configuration.program.published` | — |
| Assign | distribution runs/targets, consumptions, LPC, events | `assignProgramDistribution` → RPCs | `assign` / **`make_available`** | Run insert + **per-Location** RPC + finalize | same + site scope | `configuration.program.delivered` / failure; parent `configuration.program.make_available` | Per-Location RPC is O(n) (existing) |
| LPC local config | `location_program_categories` | LPC PATCH | PATCH LPC | Per-row | admin context | None on LPC route | Unassign/revoke deferred |
| Deactivate offering | LPC `is_active` | LPC PATCH | PATCH | Per-row | admin context | No unassign event | No consumption clear |

**Authorization rule (frozen):** Actor must have Program manage authority (`settings.manage` or owner/admin/ops). Every selected Location must be in `allowedSiteLocationIds` when that list is non-null (org-wide when null). Cross-org Program/Location IDs fail as not-found / blocked.

---

## Command / API

### Entry point

`POST /api/admin/configuration/programs`

| action | Purpose |
|--------|---------|
| `preview_make_available` | Deterministic non-mutating preview |
| `make_available` | Commit (re-resolves authority) |

Shared module: `web/lib/programs/commands/makeProgramAvailable/`

### Input (conceptual)

```ts
{
  action: "preview_make_available" | "make_available",
  idempotencyKey: string, // required, durable for create+assign
  locationIds: string[],
  originatingLocationId?: string,
  entryPoint?: "organization_program" | "location" | "unknown",
  program:
    | { kind: "existing"; programId: string; publicationId?: string }
    | { kind: "new"; input: { key: string; label: string; description?: string | null } }
}
```

Server derives org + actor from admin context. Client does not supply trusted authority fields.

### Preview

Uses `resolveProgramTargetsSoft` + `partitionMakeProgramAvailableTargets` (same as commit).

Distinguishes: newAssociations · alreadyAvailable · blocked · locallyConfigured · retainedLocalConfiguration · impact counts · plannedOperations · `program.willPublish` / `publicationRequired`.

### Commit

1. Upsert `configuration_command_operations` by `(org_id, command_key, idempotency_key)`
2. Idempotent replay returns stored result
3. Existing: require latest publication or `blocked` / `publication_required`
4. New: create → validate → publish → stamp operation with program/publication/revision → assign
5. Soft-resolve Locations; assign only eligible IDs via `assignProgramDistribution`
6. Preserve local configuration (delivery RPC / existing LPC fields)
7. Parent `workflow_events` row `configuration.program.make_available` with target arrays
8. Return status `committed` | `partial` | `blocked` + `refreshTargets`

### Idempotency

| Layer | Mechanism |
|-------|-----------|
| Command | `configuration_command_operations` unique `(org_id, command_key, idempotency_key)` — migration `20260722140000_configuration_command_operations_make_available.sql` |
| Assign | Existing distribution run key from publication + target set checksum |
| Create retry | Operation row stores `program_id` after create so retry does not create a second identity |

### Concurrency / staleness

Commit **re-resolves** publication and Location eligibility. Preview is never trusted as commit authority. Stale publication → `publication_required` blocked. Inactive / out-of-scope / missing Locations → per-target blocked.

### Transaction model

- Publish: single DB RPC txn
- Assign: distribution run + per-Location RPC (existing). Partial Location failures → `partial` + retryable via distribution retry
- Create+assign: **not** one DB txn across all steps; operation record makes partial state explicit and retry-safe

### Invalidation (`refreshTargets`)

`programs:collection`, `programs:program:{id}`, `programs:program:{id}:assignment`, `locations:collection`, `locations:location:{id}`, `locations:location:{id}:programs`, `organization:programs-locations`

### Performance

- Preview: 3 parallel location/category/room queries (bounded), not per-Location HTTP
- Commit assign: **O(n) server RPCs** per eligible Location (existing `assign_program_publication_target_v1`) — intentional, bounded by selection size; one HTTP commit from client
- 35-Location case: one preview + one commit request (no client loop)

---

## Tests (Stage 2)

```bash
cd web && npm run test -- \
  tests/programs/makeProgramAvailableEligibility.test.ts \
  tests/programs/makeProgramAvailableAuthority.test.ts \
  tests/configPublication/configurationPublicationAuthorization.test.ts
```

Coverage: Verdict A freeze, 35-Location partition, refresh targets, API wiring, migration idempotency, shared soft eligibility, publication auth roles.

---

## Stage 3 frontend integration instructions

1. Flip `PROGRAM_LOCATION_AVAILABILITY_STAGE` from `prototype` → production adapter.
2. Replace fixture Apply with:
   - `preview_make_available` on Review enter / refresh
   - `make_available` on Apply
3. Preserve approved wizard UX; add copy when `willPublish: true`.
4. On success, invalidate using `result.refreshTargets` (map to Continuity collection invalidators).
5. Handle `partial` / `blocked` / idempotent replay explicitly; wire retry to failed distribution / same idempotency key.
6. Do **not** offer unpublished existing Programs in Use existing (filter via `publishedProgramsForAssignment`).
7. Both entry points call the same actions; only `entryPoint` + `originatingLocationId` differ.

---

## Stage 3 — Production adapter (complete)

### Adapter

| Piece | Path |
|-------|------|
| Shared workflow | `ProgramLocationAvailabilityFlow` |
| Client | `web/lib/programs/makeProgramAvailableClient.ts` |
| Stage flag | `PROGRAM_LOCATION_AVAILABILITY_STAGE = "production"` |
| Org origin | Programs workspace → **Add to Locations** (`section=assignment`) |
| Location origin | Location → Programs → **Add Program** |

Both origins share one preview/commit capability. Origin affects preselection, copy, and return destination only.

### API mapping

| UI moment | Action | Notes |
|-----------|--------|-------|
| Enter Review | `preview_make_available` | Renders server preview; no client eligibility authority |
| Confirm | `make_available` | Re-resolves authority; one HTTP commit for N Locations |
| Retry (uncertain / retryable fail) | same `idempotencyKey` | Material Program/Location/intent edits mint a new key |

Client body carries Program ref + Location IDs + idempotency key + entryPoint. No trusted `orgId` / `actorUserId` / site-scope lists from the browser.

### Lifecycle enforcement

- Existing Program: only published revisions selectable / continuable.
- Unpublished from Program origin: hard stop + Open Publication.
- Create-new Review copy states create **and publish**, then make available (uses `preview.program.willPublish`).

### Preview / partial / refresh

- Review UI binds to `MakeProgramAvailablePreview` fields (new / already / retained local / blocked / willPublish).
- Commit UI renders `committed` | `partial` | `blocked` from the structured result (never generic success for partial).
- `applyMakeAvailableRefreshTargets` maps returned `refreshTargets` into Programs/Locations/Organization Continuity invalidation (deduped scopes).

### Ownership editing

- Organization definition: Programs workspace definition section.
- Location configuration: Location Program detail — Location-only editor; Restore Organization default for supported local description override. No save-time scope quiz.

### Tests

```bash
cd web && npm run test -- \
  tests/programs/makeProgramAvailableClient.test.ts \
  tests/programs/makeProgramAvailableFlowIntegration.test.ts \
  tests/programs/makeProgramAvailableEligibility.test.ts \
  tests/programs/makeProgramAvailableAuthority.test.ts
```

### Localhost evidence (Stage 3)

Superseded by Stage 4 evidence under `.alloy-agent-evidence/program-assignment-production-stage4/`. Prefer `http://127.0.0.1:3014` (auth cookies).

---

## Stage 4 — E2E certification (ready for operator approval)

**Gate status:** Durable command operations are active on the localhost app database; authenticated production-boundary preview/commit/idempotent replay were exercised; certification-blocking defects fixed; stop for operator QA (no push / merge / PR / deploy / sprint-finish).

### Migration applied

| Field | Value |
|-------|--------|
| Database target | Supabase project `ikaxilmwmrmbagoidedu` (`NEXT_PUBLIC_SUPABASE_URL` for slot 4 / worktree app) |
| Primary migration | `supabase/migrations/20260722140000_configuration_command_operations_make_available.sql` |
| Align migrations (assign RPC live schema) | `20260722153000_configuration_distribution_runs_publication_id.sql`, `20260722154500_configuration_delivery_attempts_align_assign_rpc.sql` |
| Result | `configuration_command_operations` exists; production `make_available` writes durable rows (`command_key = programs.make_available.v1`) |
| Certification rule | **Not** certified via ephemeral fallback |

Evidence: `.alloy-agent-evidence/program-assignment-production-stage4/migration-verification.json`, `database-verification.json`.

### Authenticated environment

| Field | Value |
|-------|--------|
| Slot / port | 4 / `3014` |
| URL | `http://127.0.0.1:3014` |
| Auth | `alloy-agent-login 4` → storage-state present; Programs/Locations load without `/login` redirect |
| Server | Correct worktree serves (`…/wt4-org-runtime-realization/web`); no competing owner on 3014 |

### QA data (Firefly Early Learning)

| Item | Reality |
|------|---------|
| Published Program | `c0358ff7-ce0c-4caa-969a-194159bf8dab` (Stage4 OK3) — created+published via production command |
| Draft Program | Infant `64adf957-537f-4ce9-b2b4-9f6def7ebf6a` |
| Locations in UI rail | **3** site campuses (North / West / South) — fewer than 35 |
| Locations table rows | 21 (many not exposed as assignable site campuses in this org UI) |
| Bulk cert count | **3** (all available UI Locations) — do **not** claim a 35-Location browser test |
| Already-associated | After Stage 4 commit: all 3 campuses associated to Stage4 OK3 |
| Local LPC config | Soft-resolved in preview (`locallyConfigured` / `retainedLocalConfiguration` fields present); no destructive overwrite observed |
| Blocked target | Draft Program commit → structured `publication_required` (see fix below). No safe inactive/cross-scope Location available in this org for Scenario 8 beyond draft enforcement |

### Browser / API scenarios

| # | Scenario | Result | Notes |
|---|----------|--------|-------|
| 1 | Existing Program · Organization origin | **Pass** (API + UI entry) | Flow mounts; published-only; preview/commit on production endpoints |
| 2 | Existing Program · Location origin | **Pass** (UI evidence) | Location Programs → Add Program → Use existing; shared endpoints |
| 3 | Bulk | **Pass at N=3** | One preview + one commit HTTP; totals reconcile; O(n) server RPCs per Location |
| 4 | Create new from Location | **Pass** (API production boundary) | One Program identity; willPublish preview; create→validate→publish→assign |
| 5 | Draft enforcement | **Pass** | UI unpublished block (no Apply); API commit returns `blocked` / `publication_required` (no UUID leak after fix) |
| 6 | Validation failure | **Pass** | Empty key → 400 actionable copy; no RPC/PGRST leak |
| 7 | Already-associated mixture | **Pass** | Preview: `alreadyAvailable: 3`, `newAssociations: 0`; commit unchanged-safe |
| 8 | Blocked target | **Pass (draft)** | Structured blocked reason; not converted to generic success. Inactive Location not available safely |
| 9 | Durable idempotent retry | **Pass** | Same key → `idempotentReplay: true`, same `operationId` `fe88e786-…`, LPC still 3 |
| 10 | Material intent change | **Pass** | New idempotency key → distinct operation `3432c61a-…`; original intact |
| 11 | Partial result | **Controlled / not live-induced** | No safe multi-failure Location set; covered by unit/authority suites + structured `partial` UI binding. Label: not a live partial induction |
| 12 | Ownership editing | **Pass** (UI) | Separate Org definition vs Location configuration; no save-time scope quiz |
| 13 | Navigation / continuity | **Pass** | Auth hard refresh stays on `/organization/programs`; no `/settings/commercial` bounce |

### Network evidence

| Call | Shape |
|------|--------|
| Preview | `POST /api/admin/configuration/programs` `action: preview_make_available` — one request; Location IDs; no client actor authority |
| Commit | `POST …` `action: make_available` — one request; idempotency key; structured result + `refreshTargets` |
| Replay | Same body → same durable operation |

Files: `api-boundary-cert.json`, `api-scenarios-extra.json`, `api-draft-blocked-fixed.json`, `network.json`.

### Database verification (post-commit)

| Check | Result |
|-------|--------|
| One Program identity (create-new) | `c0358ff7-…` |
| Published revision / publication | Present (`publicationId` `4f0efca4-…`, `revisionId` `76f8fa4d-…`) |
| LPC associations | Exactly **3** for that Program |
| No duplicate LPC on idempotent replay | Confirmed (count remains 3) |
| `configuration_command_operations` | Row `fe88e786-…` status `committed`, completed; command_key `programs.make_available.v1` |
| Audit `workflow_events` | `configuration.program.published`×1, `configuration.program.delivered`×3, `configuration.program.make_available`×1 |

### Idempotency evidence

- Idempotency key `make-available:recert3-w9k7sx` → operation `fe88e786-0390-4c05-8eb0-9e8143c32f32`
- Replay: `idempotentReplay: true`, same `programId` / `operationId`
- Material change mint: new key → new operation (UI also remints via `syncIdempotencyKey` / intent fingerprint)

### Performance (N=3 Locations)

| Metric | Value |
|--------|-------|
| Location count tested | 3 |
| Preview duration | ~2.6s (mixture re-preview) |
| Commit duration (create+publish+assign) | ~12.5s |
| Idempotent replay | ~0.7s |
| Client HTTP | 1 preview + 1 commit (no per-Location client mutations) |
| Server assign | **O(n)** per eligible Location via `assign_program_publication_target_v1` (existing; not bulk-set-based) |

### Fixes made this stage (certification-blocking only)

1. Align `assignProgramDistribution` inserts with live `configuration_distribution_runs` / targets columns (`requested_by`, `publication_id`, conflict keys).
2. Migrations: `publication_id` on runs; delivery attempt/target columns for assign RPC.
3. Create-new preview: plan eligible Locations when `willPublish` (Review no longer shows 0 Locations).
4. Commit path: mark durable ops `failed` on throw (avoid stuck `running`).
5. Draft blocked finalize: `publicationId` / `revisionId` **null** (not `""`) so UUID columns do not throw operator-unsafe DB copy.

### Automated validation

```bash
cd web && npm run test -- \
  tests/programs/makeProgramAvailableClient.test.ts \
  tests/programs/makeProgramAvailableFlowIntegration.test.ts \
  tests/programs/makeProgramAvailableEligibility.test.ts \
  tests/programs/makeProgramAvailableAuthority.test.ts
# → 4 files, 13 passed

cd web && npm run typecheck          # clean
cd web && npm run verify:module-imports  # ok (8075 files)
```

### Remaining limitations (explicit)

1. Connected org exposes **3** assignable campus Locations in UI — not 35.
2. Live **partial** multi-Location failure was not safely induced; UI contract covered by tests + result binding.
3. Scenario 8 inactive/cross-scope Location not available in this org beyond draft `publication_required`.
4. AdminV2 sidebar hydration console noise remains pre-existing (not Assignment-specific).
5. Per-Location `failed[]` detail remains coarse when distribution aggregates failures.
6. Unassignment / consumption revoke still deferred.
7. Do not claim Tuition / Fees / Policies / Surfaces / Access use this frontend.

### Operator QA routes

```text
http://127.0.0.1:3014/organization/programs
http://127.0.0.1:3014/organization/programs?programId=c0358ff7-ce0c-4caa-969a-194159bf8dab&section=assignment
http://127.0.0.1:3014/organization/programs?programId=64adf957-537f-4ce9-b2b4-9f6def7ebf6a&section=assignment
http://127.0.0.1:3014/organization/locations?locationId=1a5644a7-45c4-413b-9021-5f556118b6e2&tab=programs
```

Evidence pack: `.alloy-agent-evidence/program-assignment-production-stage4/`

---

## Remaining backend gaps (explicit)

1. ~~Apply `configuration_command_operations` migration~~ — applied on localhost app DB (Stage 4).
2. Commit `failed[]` is coarse when distribution finalize reports failures (aggregate); enrich from `configuration_distribution_targets` in a follow-up if UX needs per-Location retry buttons.
3. Unassignment / consumption revoke still deferred.
4. No live 35-Location timing harness in CI (unit partition + authority tests only); Firefly UI rail currently has 3 campuses.

---

## Stage 1 reference (preserved)

Prototype QA routes, screenshots, and fixture behavior remain documented for Continuity UX. See git history / `.alloy-agent-evidence/program-location-availability-prototype/`. Fixture mutation is removed from the production path.