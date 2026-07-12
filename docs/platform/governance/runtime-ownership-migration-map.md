---
owner: platform
status: canonical
last_reviewed: 2026-07-12
supersedes: []
---

# Runtime ownership migration map

**Status:** Canonical reference (July 2026 platform stabilization — frozen).  
**Purpose:** Document major AdminV2 / Presentation Runtime ownership moves so tests, docs, and contributors target production owners — not deleted compat paths.

**Cutover commit (PRV2 legacy tree deletion):** `2cdd4a398` — removed dept work-unit page, `QueueBlock`, `useWorkUnitQueueRuntime`, and related compat presentation tree.

---

## Work unit and queue

| Historical owner | Current owner | Notes |
| ---------------- | ------------- | ----- |
| `app/adminV2/workspace/dept/.../work-unit/[workUnitId]/page.tsx` | `components/presentation/workUnit/WorkUnitSurface.tsx` | Canonical operator URL: `/workspace/work-unit/:slug` (internal: `app/adminV2/workspace/**`) |
| `app/adminV2/components/workspace/blocks/QueueBlock.tsx` | `components/presentation/workUnit/QueueRegion.tsx` | Queue-lane hold via `queueRegionRenderState` |
| `lib/adminV2/runtime/queue/useWorkUnitQueueRuntime.ts` | `lib/presentation/runtime/useWorkUnitSurfaceRuntime.ts` | Single runtime hook on WU surface |
| `shouldApplyWorkUnitQueueRowsResponse` (`workUnitQueueRowFetchApply.ts`) | `queueRequestSeq` in `useWorkUnitSurfaceRuntime.ts` | Stale async queue responses dropped at apply time |
| `rowsHeld` / `rowsLoading` (page + QueueBlock model) | `queueRegionRenderState` (`cold-loading` \| `empty` \| `rows` \| `error`) | `"rows"` while refetching with prior rows = hold |
| Dept work-unit compat route | Workspace work-unit route | Compat page deleted; do not reference in new tests |

**Supplemental hold tests (not in protected doctrine list):**

- `tests/presentation/workUnit/queueRegionHold.test.ts`
- `tests/presentation/workUnit/workUnitSurfaceHold.test.ts`

---

## Drawer and record presentation (July 2026 — legacy eliminated)

| Historical owner | Current owner | Notes |
| ---------------- | ------------- | ----- |
| `AdminEntityDrawerLegacy.tsx` (~19k LOC monolith) | **Deleted** | PR #148 `e94811914` — no legacy fallback |
| Monolithic `AdminEntityDrawer.tsx` runtime | Thin `AdminEntityDrawer.tsx` VM router | VM entities only; `return null` for unsupported |
| Drawer header actions restore wiring tests | VM runtime + `opportunityDrawerHeaderActionsCache` | Assert on canonical VM owners |
| Inline record surface on work-unit host | Focus Panel (`FocusPanelSurface`) + Presentation Runtime V2 | Queue row open → Focus Panel |
| Location drawer opens | Settings Configuration Runtime | `/settings/locations` + `?locationId=` deep links |
| Legacy reveal controller (page-owned coordinated reveal) | `workUnitPageRevealPolicy.ts` + PRV2 surface hold (`resolveWorkUnitSurfaceRenderMode`) | Warm path: `coordinated_reveal_completed` |

---

## Reveal and above-fold pipeline (retained modules)

These modules **remain authoritative**; only surrounding owners changed:

| Module | Role |
| ------ | ---- |
| `lib/workspace/workUnitQueueLaneRevealState.ts` | Lane reveal state machine (`hidden_until_settled`, `ready_empty`, …) |
| `lib/adminV2/workUnitPageRevealPolicy.ts` | Critical bundle + coordinated reveal gate |
| `lib/admin/drawer/composedDrawerPayload/*` | Composed drawer payload readiness |
| `lib/adminV2/runtime/contract/*` | Drawer section runtime contract |

**Removed export:** `workUnitRevealRowsReady` from `workUnitRevealGate.ts` — use `workUnitQueueLaneRevealSettled` + page reveal policy instead.

---

## Focus Panel Activity communications (July 2026) — **frozen**

| Concern | Owner | Notes |
| ------- | ----- | ----- |
| Activity cockpit layout / flex height chain | `InlineOpportunityFocusPanel.tsx`, `OpportunityFocusPanelEmbeddedWorkspace.tsx`, `alloyOsRuntime.css` | Protected flex chain — see `adminv2-runtime-performance-doctrine.md` |
| Communications **presentation** in Activity | `FamilyCommunicationWorkspaceView.tsx` (`activity_embed` branch only) | Topic rail + read pane + collapsed reply composer; Command Center modal path unchanged |
| Communications **data + send** | `FamilyCommunicationWorkspace.tsx`, `resolveFamilyCommunicationWorkspace`, `family-send` API | Preview VM → warm cache → full VM; post-send thread lifecycle via `sendCompleteToken` |
| Topic title / participant derivation | `threadTopicPresentation.ts` | Pure helpers; transport thread → business topic; email subject vs SMS session |
| Preview VM first paint | `resolveFamilyCommunicationWorkspacePreview.ts`, drawer VM compose | Path C — `communicationsPreviewVm` on selected record |
| Preview VM doctrine (canonical embed pattern) | `docs/sprints/2026-07/communications-preview-vm-doctrine.md` | Reuse for Processing, Documents, Scheduling, Billing, Attendance embeds |
| Performance timing marks | `drawerFamilyWorkspacePrefetchTiming.ts` | Dev-only `performance.mark` — retained infrastructure |

Do **not** move send eligibility, provider bindings, or compliance into Activity embed UI-only work. **Sprint frozen** — next Communications work is a new sprint on a new branch.

Closeout: `docs/sprints/2026-07/communications-activity-sprint-closeout.md`.

---

## Protected doctrine test suite

When updating tests after an ownership migration:

1. Retarget **source-string** and **structural** assertions to the current owner path.
2. Keep **behavioral** assertions equivalent (do not weaken).
3. Run the locked suite in `docs/system/adminv2-runtime-performance-doctrine.md` § Required tests.

---

## Related docs

- `docs/system/adminv2-runtime-performance-doctrine.md`
- `docs/platform/experience/presentation-runtime-v2.md`
- `docs/platform/governance/testing-and-quality.md`
