---
owner: platform
status: freeze-purification
last_reviewed: 2026-07-19
---

# Runtime V1 — Purification Report (freeze)

Final deletion-only purification for the freeze. Every deletion is evidence-backed (a repo-wide
dead-code audit with per-symbol grep proof). The principle: **leave one Runtime**, delete only what is
provably dead, and document — never blind-delete — anything gated by a flag or superseded-but-wired.

## Deleted (proven dead — zero live importers)

| Item | Why dead | Proof |
|---|---|---|
| `lib/adminV2/runtime/focusPanel/focusPanelCardContentModel.ts` | Fully orphaned file (types + `describeFocusPanelCardContent`) | 0 repo hits for the module or any of its 4 exports |
| `lib/adminV2/runtime/focusPanel/resolveFocusPanelIdentitySummary.ts` | Dead rename re-export shim | 0 consumers; the real consumers import the canonical `surfaceHeaderSummaryModel` |
| `components/admin/focusPanel/OpportunityFocusPanelActivityWorkspace.tsx` | `@deprecated` re-export of `OpportunityFocusPanelEmbeddedWorkspace` | Only a guard test read it; deleted the file + that test case |
| `subscribeProcessingFormsWarm` (export) | Unused after the `createWarmCache` migration | 0 importers |
| `scheduleProcessingQueueWarm` (+ `warmScheduled`, `WARM_LOAD_DELAY_MS`) | Dead scheduler | Only definition + two tests asserting its **absence** (still green after removal) |

Result: `tsc` clean; no new test failures.

## Deliberately NOT deleted — documented, needs a decision or verification (not freeze-safe blind)

| Item | Status | What's required |
|---|---|---|
| `CommunicationsDrawerSectionLegacy` (~1090 lines, `CommunicationsDrawerSection.tsx`) | **FLAG-GATED** | The `comms_v2_*` flags are default-ON but still honor `NEXT_PUBLIC_COMMS_V2_*=false`. Deleting the legacy branch requires a **product decision** to make `comms_v2_record_tab` (+ `_command_center`, `_live_workspace`) permanent. |
| `app/adminV2/communications/page.tsx` (deprecated standalone route) | **FLAG-GATED / route** | Reachable by direct URL; a product decision to return 404 / remove the route. |
| Late right-rail settlement fetch (`useWorkUnitSettlement.ts` `:140-167` + merge `:264-271`) | **SUPERSEDED-BUT-WIRED** | Redundant with the answer's `actionsProjection`, but still executes and feeds the region status. Requires a 3-part scoped change (null `rightRailTarget` in `settlementLocators.ts:103`, remove the effect, remove the merge) + verify `actionsProjection.actions` is value-identical. Medium risk — a V1.1 refactor, not a freeze delete. |
| `setCachedWorkspaceOperationalTasks` / `clearOperationalTasksWorkspaceCache` (test-only) | KEEP | Dead in production but the tasks-cache unit test depends on them. |

## Proven live — a "dead" claim here would break the freeze (KEEP)

- `OpportunityFocusPanelModeBody.tsx` — live on the **drawer** path (`OpportunityDrawerVmRuntime` →
  `AdminEntityDrawer`, ~15 importers); the inline `OpportunityFocusPanelBody` only takes over on the
  work-unit-queue surface. Both bodies are live on different surfaces.
- `CurrentWorkRuntimeCard.tsx` + `LayoutRuntimeCurrentWorkWidget.tsx` — live via
  `LayoutRuntimePlanView` non-operating branch.
- `CurrentWorkCard.tsx` — the summary trim left **no** orphaned helpers or unused imports.
- `compat.subjectVm` / drawer-VM-into-cards leakage — **none remains** (already eliminated).
- `lib/experience/surfaceHost/*`, `InboxPanel`, warm-cache infra — all have live importers. The
  runtime-experiment names (`operationalGraph`, `preparedDestination`, `surfaceRefToPath`,
  `isSameSurface`) **do not exist** anywhere — already removed in prior purification.

## Verdict

One Runtime, not two. All proven-dead code is deleted. The remaining reducible surface area is
flag-gated legacy (a product decision to make the `comms_v2` flags permanent) and one superseded-but-
wired settlement fetch (a scoped V1.1 refactor). Neither is a freeze blocker; both are documented with
the exact change required.
