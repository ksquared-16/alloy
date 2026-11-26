# Business Processes Product UI — Discovery & Classification

UI-only convergence of `/settings/processes` onto Collection → Selected Process → Focused
Workspace (same family as Access Users and Tuition Plans). No new process/stage runtime, no
parallel builder, no schema changes. Every mutation reuses an existing lifecycle API with its
existing guard; `LifecycleActivationBoard`'s stage/work-view/actions/health editors are reused
verbatim, not rewritten.

Product owner doc: `docs/platform/operator/business-processes-product-ui.md`

## What changed vs. what stayed

Stayed exactly as-is (reused, not touched):

- `LifecycleActivationBoard.tsx` internal Stages / Work Views / Actions / Automation / Health
  rendering, `StageEditorV2` accordion, `LifecycleActionsMatrix`, `BusinessProcessAutomationShell`
  (copy softened only), work-view setup workspace, ready-check validation.
- All lifecycle mutation endpoints (`lifecycle-catalog`, `lifecycle-builder` PATCH,
  `stage-runtime-config`, `process-work-views`, `lifecycle-actions-matrix`,
  `lifecycle-activation/validate`, catalog repair/delete).
- `CONFIGURATION_PROCESS_QUEUE_SECTIONS` — the frozen 5-item internal Configure/Process/Health nav
  inside the board is untouched; doctrine tests locking that array still pass unmodified.

Changed (this sprint):

- Page entry always mounts the collection workspace; the tile-landing page is no longer the
  default render path for `/settings/processes`.
- Chip/dropdown process selector strip replaced by a left collection rail (Access Users pattern).
- Selected Process gets a compact header (name, Active/Inactive badge, meta, Edit/More actions)
  with a 7-tab bar: **Overview · Stages · Work Views · Actions · Automation · Health · History**.
- New **Overview** tab (presentation-only) and new **History** tab (calm Planned empty state).
- Automation placeholder copy calmed to explicit "Planned" language.

## Files touched

| File | Change |
|---|---|
| `web/app/adminV2/settings/processes/page.tsx` | Always renders `ProcessesConfigurationPage`. Parses `?section=` via `normalizeBusinessProcessSection` and `?processId=`; no longer imports `OrganizationDomainLanding`. |
| `web/components/adminV2/settings/businessProcess/ProcessesConfigurationPage.tsx` | Added `initialProcessId` passthrough to `LifecycleBuilderPrimary`. |
| `web/components/adminV2/settings/lifecycle/LifecycleBuilderPrimary.tsx` | Rewritten: `BusinessProcessCollectionRail` left rail replaces `BusinessProcessProcessSelectorStrip`; Selected Process header + `ConfigWorkspaceTabBar` (7 tabs); no-selection `ConfigurationEmptyState`; auto-select prefers `?processId=` deep link, falls back to first catalog row; exposes `renameTrigger` from the board for the header's Edit action. |
| `web/components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx` | Added controlled `activeProcessSection` / `onProcessSectionChange` / `onRenameTriggerReady` props (two-way binding with the header tab bar); `listColumn` returns `null` for `overview`/`history`; new render branches for `overview` (`BusinessProcessOverviewPanel`) and `history` (calm Planned card, `data-capability="planned"`). Existing Stages/Work Views/Actions/Automation/Health branches untouched. |
| `web/components/adminV2/settings/businessProcess/BusinessProcessCollectionRail.tsx` | **New.** Collection rail: search, "New Business Process", rows show `{n} stages · {healthHint}` — health hint derived only from `workspace.runtime_status` / `department_is_active` / `user_has_access` (never fabricated). Reuses `QUEUE_ROW_CARD_*` / `locations-collection-rail*` classes. |
| `web/components/adminV2/settings/businessProcess/BusinessProcessOverviewPanel.tsx` | **New.** Presentation-only: Process Snapshot, Journey (ordered stage chips), Operator Experience (stage/work-view counts + tab-jump buttons), Configuration Readiness (from the board's existing ready-check state). No independent fetch; no fabricated history. |
| `web/components/adminV2/settings/businessProcess/BusinessProcessAutomationShell.tsx` | Copy calmed to `BUSINESS_PROCESS_AUTOMATION_PLANNED_BODY`; body + create button both marked `data-capability="planned"`. |
| `web/lib/lifecycle/businessProcessUiLabels.ts` | Extended `BusinessProcessWorkspaceSection` with `"overview"` / `"history"`; added `BUSINESS_PROCESS_HEADER_TABS`, `normalizeBusinessProcessSection`, collection/no-selection/edit/health-hint/overview/history copy constants. |
| `web/lib/configRuntime/businessProcessesLandingModel.ts` | `summaryCards: []`; `purpose` set to "Create and manage how operational work moves through Alloy."; tiles retained (still valid deep-link hrefs) but the model is no longer the page's default render path. |
| `web/lib/businessProcesses/businessProcessPresentationContracts.ts` | **New.** Type-only VM stubs (`BusinessProcessCollectionVm`, `BusinessProcessOverviewVm`, `BusinessProcessHistoryVm` (Planned), `BusinessProcessAutomationVm` (Planned), `BusinessProcessLocationAvailabilityVm` (Planned)). |
| `web/tests/configRuntime/organizationDomainLandings.test.ts` | Updated Business Processes assertions for collection-first entry (`summaryCards: []`, page no longer imports the landing model). |
| `web/tests/businessProcesses/businessProcessesProductUi.test.ts` | **New.** Page-entry, section list, rail replacement, no-selection state, Planned-surface hygiene. |

`BusinessProcessProcessSelectorStrip.tsx` is left in the tree unused by the primary UX (not
deleted, to avoid an unrelated blast radius in this pass).

## API reuse (no new endpoints)

| UI action | Endpoint | Notes |
|---|---|---|
| Load process catalog (collection rail) | `GET /api/admin/lifecycle-catalog` | Existing. Unchanged shape (`LifecycleCatalogEntry`). |
| Repair visibility | `POST /api/admin/lifecycle-catalog/repair` | Existing. |
| Repair work units | `POST /api/admin/lifecycle-catalog/repair-work-units` | Existing. |
| Attach records | `POST /api/admin/lifecycle-catalog/attach-records` | Existing. |
| Delete process | `POST /api/admin/lifecycle-catalog/delete` or `DELETE /api/admin/departments/[id]/lifecycle-activation` | Existing; branch already present in `LifecycleBuilderPrimary`, untouched. |
| Stage / process editing | `lifecycle-builder` PATCH family | Existing, inside `LifecycleActivationBoard` / stage cards — untouched. |
| Stage runtime config | `stage-runtime-config` | Existing — untouched. |
| Work Views | `process-work-views` | Existing — untouched (`BusinessProcessWorkViewsSetupWorkspace`, `WorkViewsConfigurationContext`). |
| Actions matrix | `lifecycle-actions-matrix` | Existing — untouched (`LifecycleActionsMatrix`). |
| Ready-check / validation | `lifecycle-activation/validate` | Existing — untouched (`LifecycleActivationValidation`); Overview's Configuration Readiness card reads the same in-memory result, no second call. |

## Classification: Real vs Planned

| Surface | Status | Why |
|---|---|---|
| Collection rail, Selected Process header, tab navigation | **Real** | Pure presentation over the existing catalog + board state. |
| Overview tab (Snapshot, Journey, Operator Experience, Readiness) | **Real** | Composed entirely from data the board already loads; no new fetch. |
| Stages, Work Views, Actions, Health tabs | **Real** | Unmodified existing editors, only reachable through the new header tabs instead of the old chip strip. |
| Availability line on Overview ("Organization definition") | **Real, truthful** | States the process is org-owned; does **not** claim a location-override matrix exists. |
| Location availability overrides | **Planned** | `BusinessProcessLocationAvailabilityVm` stub only. No per-location override API for Business Processes exists today — the Overview card shows a calm `data-capability="planned"` note instead of inventing a matrix. |
| Automation tab | **Planned** | Unchanged `BusinessProcessAutomationShell`, copy calmed. `BusinessProcessAutomationVm` stub documents the eventual shape; no automation-runtime fetch is made. |
| History tab | **Planned** | `BusinessProcessHistoryVm` stub. No configuration-history/event table exists for Business Processes yet. Renders a static card, `data-capability="planned"`, "No events are fabricated." |

## Rules followed

- **UI-only.** No migrations, no new mutation endpoints, no changes to `CONFIGURATION_PROCESS_QUEUE_SECTIONS` or any runtime reveal gate.
- **Doctrine-safe.** `overview` and `history` exist only as Selected-Process header tabs (`BUSINESS_PROCESS_HEADER_TABS`), deliberately excluded from the board's internal 5-item queue-section nav so existing doctrine tests for that array are unaffected.
- **Planned ≠ fake fetch.** History, Automation, and location-override cards render static Planned copy with `data-capability="planned"`; none issues a request to a non-existent endpoint.
- **Honest health hint.** Collection rail health text (`Healthy` / `Needs attention` / `Not visible`) is derived only from fields already on `LifecycleCatalogEntry.workspace` — never invented.
- **Rail pattern parity.** Reuses `QUEUE_ROW_CARD_*` / `QUEUE_ROW_SELECTED_RAIL_CLASS` / `locations-collection-rail*` / `programs-collection-controls*` classes, matching Access Users and GL Codes rather than inventing new list-row styling.
- **Auto-select kept.** First catalog entry auto-selects on load (operator convenience, consistent with prior behavior) unless `?processId=` names a specific row.

## Known gaps / follow-ups (explicitly out of scope here)

1. `StageEditorV2`'s internal accordion sections were not rewritten or re-titled beyond what already existed — deferred per the sprint's own scope note ("do not rewrite StageEditorV2 accordion in this pass unless quick wins").
2. Work View "Advanced · Technical identity" fields are still visible in the Work Views tab exactly as before — full raw-key hiding across every advanced subsection was not attempted this pass.
3. `BusinessProcessProcessSelectorStrip.tsx` is unused but not deleted; a follow-up cleanup pass can remove it once nothing imports it.
4. Full stage-level Overview cards (per-stage snapshot inside the Stages tab, distinct from the process-level Overview tab added here) are deferred.
5. Location availability remains Planned — no override matrix should be built until a real API/schema decision is made; this pass intentionally avoided inventing one.

## Shell follow-up applied

- Duplicate left **Configure / Process / Health** section queue was removed from
  `BusinessProcessConfigurationShell` — Selected Process header tabs own section switching.
  Nested `listColumn` remains for Stages / Work Views / Actions / Health collections.
- `BusinessProcessConfigurationNav.tsx` remains in tree for doctrine tests that assert its
  frozen 5-section inventory; it is no longer mounted in the live product shell.

## Browser QA

Authenticated evidence (slot 2, `http://127.0.0.1:3012`):

`.alloy-agent-evidence/business-processes-ui-discovery/qa/` — collection, selected header,
Overview, Stages, Work Views, Actions, Automation, Health, History, narrow viewport + `qa-report.json`.
