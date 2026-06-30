# Work-Unit Runtime Simplification — Batch Close-out & Migration Status

**Status:** IMPLEMENTED (landed to `staging`, June 2026). This batch is closed. The next step is UI verification against the integrated runtime, not further implementation.

This records the runtime ownership transferred out of the operator compat surfaces during the Runtime Simplification batch, the layers removed, the runtime score before/after, and what remains.

Governing principle (unchanged): **remove runtime.** Every slice left the runtime objectively smaller — fewer owners, providers, gates, and compatibility paths — or moved ownership from the compat page to a canonical runtime module. Runtime flags are migration tools only (prove → merge → delete), never permanent product modes.

---

## 1. Runtime ownership removed (domains transferred)

Each domain moved from page-owned orchestration to a canonical owner:

| Domain | From (compat page owned) | To (canonical owner) | PR |
|---|---|---|---|
| **Workspace reveal** | client reveal-readiness layer + loading gate | server-composed Workspace Route VM owns reveal | #13 |
| **Workspace Route VM** | first-paint seed + Surface VM | `workspaceRouteVm` (server-composed) | #13 |
| **Work-Unit sibling switching** | `handleQueueTabChange` in-page pill switch | canonical navigation (`resolveLifecycleSiblingNavHref` → slug route) | #17 |
| **Work-Unit switching runtime** | `activeWorkUnitId` + optimistic setters + suppress/skip guards + history hack | route-owned identity (`workUnitId = routeWorkUnitId`); each work unit is its own route entry | #18 |
| **Work-Unit context/banner** | local `routeWorkUnitDisplayName` derivation + session-cache warm-start | Work-Unit Route VM (`workUnitName` + new `departmentName`) | #19 |
| **Work-Unit perspective** | `stageOperationalViews` memo + 2 publish effects | `useWorkUnitRuntimePerspective` (canonical hook) | #21 |
| **Queue fetch orchestration** | 649-line `fetchQueueItems` + nested `runNetwork` | `useWorkUnitQueueRuntime` (canonical hook) | #25 |
| **Queue runtime state** | `queueItems*` state + `queueItemsLastFetchSigRef`/`queueRowLeaseSigsRef`/`queueItemsRequestSeq` | `useWorkUnitQueueRuntime` owns + returns them | #28 |

---

## 2. Runtime layers / modules removed

- **Loading gate:** `WorkspacePageLoadingGate` — deleted (#13).
- **Reveal-readiness layer:** workspace reveal-gate computation + `workspaceRevealGate.ts` — deleted (#13).
- **Surface VM:** `workspaceSurfaceViewModel.ts` + first-paint seed runtime — deleted (#13).
- **Dead zero-importer components:** `OipOverviewPulseRow`, `OpportunityLifecyclePanel`, `ActionWorkspaceBosNeuralPulse`, `DeleteLeadModal` — deleted (#15).
- **In-page switching runtime:** `activeWorkUnitId` state, `applyActiveLifecycleWorkUnitSelection`, the ~115-line in-page switch fallback, `replaceWorkUnitLocationHref` history hack — deleted (#18).
- **Switch-only guard writes:** removed (the shared guard refs stay for bootstrap/lane logic) (#18).
- **Context switch-artifact:** `routeWorkUnitDisplayName` state + session-cache warm-start effect — deleted (#19).
- **Perspective ownership:** `stageOperationalViews` memo + both `setActiveRuntimePerspective` effects — moved out of page (#21).

No new runtime flags were introduced in this batch.

---

## 3. Runtime score (before → after)

| Metric | Before (batch start) | After | Notes |
|---|---|---|---|
| Workspace loading gate | 1 | **0** | deleted (#13) |
| Workspace reveal-readiness layer | 1 | **0** | deleted (#13) |
| Workspace Surface VM | 1 | **0** | deleted (#13) |
| Work-Unit client-side switching runtime | present | **0** | navigation-only (#17/#18) |
| Compat-page runtime ownership domains | 5 (switch, context, perspective, queue-fetch, queue-state) | **0 owned** | all delegated to canonical owners |
| Compat-page `useState` | 60 | **54** | net of relocations to canonical hooks |
| Compat-page `useRef` | 54 | **52** | |
| Compat-page `useEffect` | 52 | **50** | |
| Compat-page LOC | 7,786 | **6,962** | −824; queue/perspective/nav orchestration relocated to canonical modules |
| Canonical runtime hooks/modules added | — | **3** | `useWorkUnitQueueRuntime`, `useWorkUnitRuntimePerspective`, `lifecycleSiblingNavTarget` |
| New runtime flags | — | **0** | flags remain migration-only |
| Queue runtime deps interface (page→hook) | n/a | 32 → **20** | after state migration (#28) |

The headline is **ownership**, not raw LOC: the compat page no longer *owns* switching, context, perspective, or queue fetch/state — those live in canonical runtime modules with the page as a consumer. Workspace shed three real runtime layers (loading gate, reveal layer, Surface VM) outright.

---

## 4. Code reduction

- **Deleted:** `WorkspacePageLoadingGate.tsx`, `workspaceRevealGate.ts`, `workspaceSurfaceViewModel.ts`, `workspaceFirstPaintSeed.tsx`, 4 dead components (#13/#15), plus the in-page switch + context + perspective runtime blocks from the compat page.
- **Added (canonical runtime):** `workspaceRouteVm.ts` (+context), `lifecycleSiblingNavTarget.ts`, `useWorkUnitRuntimePerspective.ts`, `useWorkUnitQueueRuntime.ts`, server loaders (`loadWorkUnitSlugRouteServer` extended with `departmentName`).
- **Canonicalized:** work-unit route identity (server-resolved Route VM), sibling switching (navigation), context (Route VM), perspective (hook), queue fetch + state (hook).
- **Moved:** the 649-line `fetchQueueItems` + queue-items state/dedup refs (page → `useWorkUnitQueueRuntime`).

---

## 5. Remaining runtime domains (accurate status)

Still compat-page-owned (NOT yet transferred):

- **Queue summaries + bootstrap** — `queueSummaries` state, `fetchQueueSummaries`, bootstrap lane-selection sequencing. (Next candidate; bootstrap-sequenced, careful.)
- **Queue lane state** — `selectedQueueKey`/`attentionBucketKey`/filters + URL sync (lane selection drives the page).
- **KPI ownership** — KPI fetch + resolver composition (`workUnitKpiContext`, placement KPIs).
- **Reveal coordination** — `workUnitRevealGate` + coordinated reveal orchestration (evidence-test guarded; the canonical gate functions exist, page still orchestrates).
- **Settings runtime** — out of scope for this batch (separate surface).
- **Save runtime** — already canonical (`useResumeSessionWriter` / `resumeSession`); not page-owned.

---

## 6. Validation at close-out

- `typecheck:build` — **clean (0 errors)**.
- Scoped runtime/work-unit/queue suites — pass except a known pre-existing baseline of source-evidence tests (asserting strings that drifted out of the page independently of this work; each verified pre-existing by restoring the page to HEAD and observing identical failures). No runtime regressions.
- Each behavior-changing slice (#17, #18, #25, #28) was UI-verified before its merge, except #28 which is landed pending integrated UI verification per the close-out directive.

---

## 7. Next step

UI verification against the integrated `staging` runtime — then evaluate product experience before opening the next runtime batch (queue summaries / bootstrap, then KPI / reveal coordination).
