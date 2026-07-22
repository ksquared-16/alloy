---
owner: engineering
status: stage-3-production-frontend-ready
last_reviewed: 2026-07-22
sprint: org-runtime-realization
slot: 4
phase: configuration-assignment-frontend-stage-3
---

# Configuration Assignment Reference — Programs → Locations

## Status

| Stage | State |
|-------|--------|
| 1 Interactive prototype | **Approved** |
| 2 Backend authority + command | **Complete** |
| 2.5 Capability certification | **Complete** — see `configuration-assignment-capability-certification-2026-07.md` |
| 3 Production frontend | **Complete** — Programs adapter only; awaits operator QA |
| 4 E2E certification | Not started |

**Stage 2.5 headline:** This is not “a Programs feature that every page copies.” It is the first adapter on Configuration Assignment (availability). Tuition stays on value inherit/override. Preview→Commit is cross-cutting.

**Stage 3 non-claim:** Tuition, Fees, Policies, Surfaces, and Access do **not** use this runtime. Business Processes and Automation remain future Assignment candidates only if Location availability semantics are proven.

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

### Localhost evidence

Slot 4 · prefer `http://localhost:3014` · evidence dir `.alloy-agent-evidence/program-assignment-production-stage3/`

Agent automated browser pass on 2026-07-22 reached the login wall (`storage-state` expired; `alloy-agent-login 4` requires interactive sign-in). Unit/integration adapter tests passed. Operator should refresh auth, keep ≤3 localhost servers (stop another slot if wt4 flaps), then certify:

- Existing published Program → one Location / 35 Locations
- Create → validate → publish → make available (one and bulk)
- Unpublished blocked; preview/commit network shape; partial; restore Organization default; Back/Forward; projection refresh

Screenshots / `qa-report.json` / `network.json` land in the evidence directory after operator or refreshed-auth agent pass.

### Unresolved gaps

1. Apply migration `20260722140000_configuration_command_operations_make_available.sql` on the live app DB for durable compound idempotency. Until applied, commit degrades to ephemeral ops (create+publish+assign still runs; durable replay requires the table).
2. Per-Location failure detail in `failed[]` remains coarse when distribution finalize aggregates failures.
3. Unassignment / consumption revoke still deferred.
4. Stage 4 operator E2E certification (35-Location live timing, partial fixture, timeout replay) still open.
5. Do not claim Tuition / Fees / Policies / Surfaces / Access use this frontend.

---

## Remaining backend gaps (explicit)

1. Apply migration `20260722140000_configuration_command_operations_make_available.sql` to the target database before durable production idempotency.
2. Commit `failed[]` is coarse when distribution finalize reports failures (aggregate); enrich from `configuration_distribution_targets` in a follow-up if UX needs per-Location retry buttons.
3. Unassignment / consumption revoke still deferred.
4. No live 35-Location timing harness in CI (unit partition + authority tests only).

---

## Stage 1 reference (preserved)

Prototype QA routes, screenshots, and fixture behavior remain documented for Continuity UX. See git history / `.alloy-agent-evidence/program-location-availability-prototype/`. Fixture mutation is removed from the production path.