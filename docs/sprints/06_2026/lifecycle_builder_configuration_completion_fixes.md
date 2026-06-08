# Lifecycle Builder — Configuration Completion Fixes

**Sprint:** June 2026  
**Scope:** Lifecycle Builder setup/config correctness and save performance.  
**Out of scope:** Lifecycle visibility evaluator, QueueService visibility semantics, runtime shell parity, Create Lead binding, assignment home.

## Problems addressed

1. **Configuration-only warning** — Removed from guided/compact Required Information UI; waitlist-specific helper copy replaces generic enforcement messaging.
2. **Stage / work unit ordering** — `reorder_stage` syncs `work_units.sort_order` from builder stage `sort_order`; runtime lists already sort by `sort_order`.
3. **Waitlist required info** — Helper text and waitlist-oriented palette fields (program, desired start, site/location, priority).
4. **Entity dropdown labels** — `entity_display_labels` from org `entity_labels` (e.g. Lead, Guardian).
5. **Save reliability** — Dev-only `logLifecycleBuilderSaveTiming`, double-submit guards, targeted queue sync after status save, post-save status fallback.
6. **Tour / Waitlist counts** — Status PATCH syncs `lifecycle_wu_*` `queue_definition` from full stage buckets (not explicit-only metadata).
7. **Enrolling custom stage** — Builder stage keys (`enrolling`) supported for required info, statuses, and work units without aliasing to `enrollment` / `enrolled` keys.
8. **Actions matrix order** — Row reorder UI, `lifecycle_action_display_order` on placements, `lifecycle_actions_matrix_order_v1` on department metadata.
9. **Custom stage status save** — Checkbox selections on newly created stages were cleared when `stage-bootstrap` or `status-stages` reload completed after the user clicked a status (draft synced from empty server bucket). Draft is preserved until Save & continue; `onStageCreated` reloads `status-stages` so dynamic stage keys exist before assignment.

## Key modules

| Module | Role |
|--------|------|
| `lifecycleBuilderStageFieldRules.ts` | Per-builder-stage-key field rules metadata |
| `lifecycleBuilderStagePalette.ts` | Palette aliases (palette-only), waitlist helper |
| `lifecycleStageWorkUnitQueueSync.ts` | Sync `lifecycle_wu_*` queue filters after status assignment |
| `lifecycleStageWorkUnitIdentity.ts` | Stage work unit identity resolver, upsert, filter-key alignment, audit |
| `lifecycleRequirementsStagePayload.ts` | Shared GET/bootstrap stage payload builder |
| `lifecycleRequirementEntityLabels.ts` | Customer-facing entity labels |
| `lifecycleActionsMatrixOrder.ts` | Persisted matrix row order |
| `syncWorkUnitSortOrderFromBuilder.ts` | Stage reorder → work unit `sort_order` |
| `lifecycleActivationStep3.ts` | `shouldSyncStatusDraftFromServer`, status step confirm helpers |

## Custom stage status assignment (root cause)

**Symptom:** User selects statuses on a new custom stage; UI still shows “Select at least one status to continue” and Save & continue stays disabled.

**Cause:** `applyStageBootstrap` and a `useEffect` on `[stageKey, statusesPayload]` always called `syncStatusKeysFromPayload`, resetting `draftStatusKeys` after async bootstrap returned (often empty for a new stage). Checkbox looked selected briefly, then draft was cleared.

**Fix:**
- Single source of truth: `statusDraftByStageKey[normalizedStageKey]` — `resolveLifecycleStatusesSaveState()` drives **checkbox checked**, amber hint, and **Save Statuses** disabled state (no parallel `Set` / ref reads).
- `LifecycleStatusesCard` is the only statuses UI; mount registry exposes `statusesCardInstancesMounted` in the debug panel.
- `selectStage` uses `flushSync` for `stageKey` before async load/sync; skips server sync when that stage’s draft is dirty.
- Save PATCH reads `statusDraftKeysForStage(statusDraftByStageKey, stageKey)` from React state (not a lagging ref).
- Visible debug panel on the Statuses card when `NEXT_PUBLIC_LIFECYCLE_DEBUG_UI=1` (amber box under checkboxes).
- Fail-fast: console `LIFECYCLE_STATUS_STATE_SPLIT` if checkbox keys ≠ save keys.
- `onStageCreated` calls `loadStatusStages()` then `selectStage(stage, { statusesPayload })` so `status-stages` includes the new builder stage key before assignment.

**Status draft stability (May 2026):** `lifecycleStatusDraftReducer` atomically updates `draftByStage` + `dirtyByStage`. `dispatchStatusDraft` syncs `statusDraftRef` before React re-render (never copy dirty ref from lagging state). `selectStage` re-checks dirty after `await`; bootstrap skips payload sync when stage is dirty. Status rows are `<button type="button">` toggles; debug JSON panel removed from `LifecycleStatusesCard`. Tests: `lifecycleStatusDraftReducer.test.ts`, `lifecycleStatusDraftSyncRace.test.ts`.

**Save → Complete (May 2026):** After PATCH, `commitSaved` writes saved+draft keys even when the stage is still dirty (sync was skipped before). `resolveAssignedStatusKeysForStage` falls back when builder explicit bucket is empty. Bootstrap cache patched with PATCH response so refresh does not revert. Guided **Statuses** shows **Complete** when `savedStatusKeys.length > 0` and not dirty; Save scrolls to Work Unit Queue.

**Work unit queue create (May 2026):** `LifecycleStageWorkUnitCard` POST must send `stage: activeStageKey` for custom builder stages (not only `asOperatorStageKey`). Guided board must not call `onPipelineUpdated(pipeline)` after save (stale null wiped created queue). Tests: `lifecycleStageWorkUnitCardCreate.test.ts`.

**Stage-scoped work unit identity (Jun 2026):** Work unit identity is `org_id` + `department_id` + `work_units.key = lifecycle_wu_{stageKey}` (not display name). `POST /api/admin/enrollment-process/stage-work-unit` **upserts** (no 409 when `lifecycle_wu_enrolling` already exists). Shared resolver: `resolveLifecycleStageWorkUnitIdentity` / `resolveLifecycleStageQueueFilterKeys` in `lifecycleStageWorkUnitIdentity.ts` — used by create/update, status sync, runtime validation, repair, and guided UI state (`not_created` | `synced` | `needs_sync` | `conflict`). GET returns `snapshot` + `identity` + `needs_sync` (fixes pipeline load drift). Audit: `npx tsx --tsconfig tsconfig.json scripts/auditLifecycleStageWorkUnitIdentity.ts` with `DEPARTMENT_ID` + `STAGE_KEY`. Tests: `lifecycleStageWorkUnitIdentity.test.ts`.

**Enrolling queue filters (Jun 2026):** Empty `queue_definition` status filters no longer mean “all records” — `requireLifecycleStageQueueStatusKeys`, POST `status_keys` from saved draft, `assertLifecycleStageOpportunityQueryHasStatusFilters` in QueueService for `lifecycle_wu_*`, runtime validation compact check scoped to `activation.stage_key`. Tests: `lifecycleStageQueueFilters.test.ts`.

**Status → Work Unit Queue handoff (Jun 2026):** Statuses card uses `statusDraft.savedByStage`; queue sync no longer depends only on `resolveAssignedStatusKeysForStage` from a stale DB payload. `resolveLifecycleStageStatusKeysForQueueSync` priority: explicit keys (board/card) → status-stages payload → error with both sources. POST/PATCH `stage-work-unit` and status-stages PATCH pass `status_keys`; follow-up PATCH sync includes saved keys. Tests: `lifecycleStageStatusKeysHandoff.test.ts`, `lifecycleStageWorkUnitCardCreate.test.ts`.

**Stage runtime config contract (Jun 2026):** Canonical `saveLifecycleStageRuntimeConfig` (`lib/lifecycle/saveLifecycleStageRuntimeConfig.ts`) — one transaction: persist status assignments, upsert `lifecycle_wu_{stageKey}`, write `queue_definition` + `metadata.status_keys` from the same `selectedStatusKeys`. API: `POST /api/admin/enrollment-process/stage-runtime-config`. Guided UI uses this path (no POST+PATCH loop). Validation reads `contractSelectedStatusKeys` from the snapshot. **Root cause fixed:** `normalizeStatusDefinitionMetadata` was stripping custom builder stage keys (e.g. `enrolling`) on status save, so DB buckets stayed empty while UI showed Complete. Tests: `lifecycleStageRuntimeConfigContract.test.ts` (enrolling E2E: save → DB asserts → validation pass → idempotent re-save).

**API:** `GET/PATCH /api/admin/enrollment-process/status-stages` already uses `configuredStageKeysForMetadata` (dynamic keys, not hardcoded `LIFECYCLE_STAGE_ORDER` only).

## Lifecycle work-unit row_preview repair (Jun 2026)

**Root cause:** `applyStatusKeysToLifecycleStageQueueDefinition` updated status filters only; existing `work_units.queue_definition` kept stale `ui.row_preview.fields` (waitlist missing `phone`/`email`; standard lanes missing `tour_date`).

**Fix:** `mergeLifecycleStageRowPreviewIntoQueueDefinition` on status sync, repair-work-units, and runtime overlays (`QueueService.resolveWorkUnitRowListUi`, work-unit page `applyLifecycleWorkUnitQueueUiOverlay`).

**Audit/repair scripts (from `web/`):**
- `npx tsx --tsconfig tsconfig.json scripts/auditLifecycleWorkUnitRowPreview.ts`
- `DRY_RUN=0 npx tsx --tsconfig tsconfig.json scripts/repairLifecycleWorkUnitRowPreview.ts`

## Verification

```bash
cd web && npx tsc --noEmit
cd web && npm run test -- tests/lifecycle/lifecycleBuilderConfigurationCompletion.test.ts
cd web && npm run test -- tests/lifecycle/lifecycleStageWorkUnitIdentity.test.ts
cd web && npm run test -- tests/lifecycle/lifecycleStageStatusKeysHandoff.test.ts tests/lifecycle/lifecycleStageQueueFilters.test.ts
cd web && npm run test -- tests/lifecycle/lifecycleStageRuntimeConfigContract.test.ts
cd web && npm run test -- tests/lifecycle/lifecycleStatusesCardState.test.ts tests/lifecycle/lifecycleStatusesCardInteraction.test.ts tests/lifecycle/lifecycleStatusDraftReducer.test.ts tests/lifecycle/lifecycleStatusDraftSyncRace.test.ts tests/lifecycle/lifecycleStatusStepSaveFix.test.ts
```

## Work unit right rail (Schedule Tour)

**Root cause:** `rightRailResolvedFromActionsPayload` returned only `right_rail` surface bucket actions. Lifecycle Builder saves Work Unit rail as `surface: work_unit`, `slot: primary`, so matrix actions were dropped when any legacy `right_rail` surface row existed.

**Fix:**
- Flatten `right_rail` + `primary` + `secondary` for workspace rails.
- Filter lifecycle-builder placements by `lifecycleViewStageKey` from work unit metadata in `loadRightRailActionsBundleServer`.
- Persist `order_index` from matrix display order on save.

## Manual test plan

- [ ] Tour required info (Tour Date / Time) saves with no configuration-only banner in guided board.
- [ ] Reorder stages; dept tabs, work unit pills, and `/work-unit` siblings follow builder order.
- [ ] Waitlist stage shows helper copy; palette includes child/program/start/site/priority fields.
- [ ] Entity dropdown shows configured labels (Lead, Guardian, etc.).
- [ ] Save statuses on Tour/Waitlist; `/work-unit` counts match records for selected status keys.
- [ ] Create **Enrolling** stage (`enrolling` key): required info, statuses, work unit queue all save.
- [ ] Actions matrix reorder persists; department/work-unit rails honor order.
- [ ] Schedule Tour with Work Unit right rail placement appears on `/work-unit` right rail (Tour stage only when stage-restricted).
- [ ] Create custom stage → select status → Save & continue enabled → PATCH persists under custom `stage` key.
