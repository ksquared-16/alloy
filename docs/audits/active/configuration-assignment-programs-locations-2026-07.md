---
owner: engineering
status: stage-2-backend-ready
last_reviewed: 2026-07-22
sprint: org-runtime-realization
slot: 4
phase: configuration-assignment-backend-stage-2
---

# Configuration Assignment Reference — Programs → Locations

## Status

| Stage | State |
|-------|--------|
| 1 Interactive prototype | **Approved** (operator gate passed) |
| 2 Backend authority + command | **Complete** — await Stage 3 frontend wiring |
| 3 Production frontend | Not started |
| 4 E2E certification | Not started |

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

## Remaining backend gaps (explicit)

1. Apply migration `20260722140000_configuration_command_operations_make_available.sql` to the target database before production use.
2. Commit `failed[]` is coarse when distribution finalize reports failures (aggregate); enrich from `configuration_distribution_targets` in a follow-up if UX needs per-Location retry buttons.
3. Unassignment / consumption revoke still deferred.
4. No live 35-Location timing harness in CI (unit partition + authority tests only).
5. Stage 1 prototype still permits unpublished fixture until Stage 3 wiring removes it.

---

## Stage 1 reference (preserved)

Prototype QA routes, screenshots, and fixture behavior remain documented for Continuity UX. See git history / `.alloy-agent-evidence/program-location-availability-prototype/`.
