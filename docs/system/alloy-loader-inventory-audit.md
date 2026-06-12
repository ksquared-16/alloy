# Alloy Loader Inventory Audit

**Date:** June 2026  
**Canonical loader:** `AlloyIdentityLoader` — Alloy mark · horizon · Bend Pine smoke · optional message  
**Companion:** `docs/system/bos-identity-doctrine.md` (Canonical loader section)

---

## Summary

| Category | Count (approx.) | Status |
|----------|-----------------|--------|
| **Canonical / compliant** | 8 surfaces | Uses `AlloyIdentityLoader` or wraps it |
| **Phased execution (compliant stack)** | 6 surfaces | `BosExecutionLoader` → identity stack + copy |
| **Intentional live reveal** | 3 surfaces | `BosRevealSequence` for analyze/workspace open |
| **Doctrine violations** | 25+ surfaces | Spinners, skeleton-only gates, text-only, legacy |

**Goal:** One Alloy loading language everywhere. No generic spinners, blur blobs, network diagrams, or skeleton-only blocking experiences.

---

## 1. Canonical (compliant)

| Location | Component | Visual | Notes |
|----------|-----------|--------|-------|
| `OpportunityDrawerOpeningOverlay.tsx` | `AlloyCanonicalLoadingSurface` | Mark · horizon · smoke · `Preparing {record}…` | Drawer open gate |
| `OpportunityDrawerVmRuntime.tsx` | `AlloyCanonicalLoadingSurface` | Same | Cold VM shell overlay |
| `alloyCanonicalLoadingSurface.tsx` | `AlloyIdentityLoader` | Identity stack | Shared wrapper |
| `AlloyIdentityLoader.tsx` | — | Mark above horizon, smoke behind | **Source of truth** |
| `BosExecutionLoader.tsx` | `AlloyIdentityLoader` + title/steps | Identity + phased copy | Execute / prep |
| `ActionWorkspaceExecuteState.tsx` | `BosExecutionLoader` fullscreen | Identity + Create Lead phases | |
| `AdminV2RouteLoadingState.tsx` | `BosExecutionLoader` panel/inline | Identity + route vocabulary | Dept / WU / queue |
| `AdminV2DrawerLoadingState.tsx` | `BosExecutionLoader` drawer | Identity + prep copy | |
| `DrawerComposedPreparingState.tsx` | `BosExecutionLoader` drawer | Identity in card shell | Composed payload hold |
| `AddInquiryChildModal.tsx` / `ScheduleTourActionFormModal.tsx` | `BosExecutionLoader` | Identity + action phases | |
| `DeptPageLoadingGate.tsx` | `AdminV2RouteLoadingState` | Identity (via execution loader) | Department route |
| `WorkUnitPageLoadingGate.tsx` | `AdminV2RouteLoadingState` | Identity (via execution loader) | Work unit route |
| `WorkspacePageLoadingGate.tsx` | `AdminV2RouteLoadingState` | Identity (via execution loader) | Workspace root |

**Screenshot target:** `/dev/bos-identity-system` → loader section; open Create Lead execute step; open drawer from queue.

---

## 2. Intentional non-loader identity (not violations)

| Location | Component | Use |
|----------|-----------|-----|
| `ActionWorkspacePasteCanvas.tsx` | `BosRevealSequence` mode="working" | Live paste analyze |
| `ActionWorkspaceBosShell.tsx` | `BosRevealSequence` mode="workspace" | Workspace open reveal |
| Forms review assist | `BosReviewSummaryPlaceholder` | Working reveal while generating |

These are **live BOS thinking**, not generic loading. Keep separate from route/drawer prep loaders.

---

## 3. Doctrine violations — migration required

### P0 — High visibility, wrong language

| Location | Component | Current visual | Replacement |
|----------|-----------|----------------|-------------|
| `workspaceRouteSkeletons.tsx` → `WsRouteLoadingRibbon` | Indeterminate bar only | Thin shimmer ribbon | Identity micro-loader or ribbon + mark |
| `workspaceRouteSkeletons.tsx` → `DepartmentRouteSkeletonBody` | Full-page skeleton layout | KPI + queue card shimmers | Shell-first + centered `AlloyIdentityLoader` message |
| `workspaceRouteSkeletons.tsx` → `WorkUnitRouteSkeletonBody` | Skeleton + **spinner** in queue area | Pulse bars + `animate-spin` circle | Identity loader in queue reserve |
| `AdminV2NavigationTransitionRibbon.tsx` | `WsRouteLoadingRibbon` | Bar only | Alloy transition strip |
| `app/adminV2/workspace/dept/.../loading.tsx` | Route `loading.tsx` fallbacks | Skeleton bodies | `AdminV2RouteLoadingState` only |
| `app/adminV2/workspace/dept/.../work-unit/.../loading.tsx` | Route fallback | Skeleton | `WorkUnitPageLoadingGate` pattern |
| `AdminEntityDrawerLegacy.tsx` (~1258) | Text + old loader path | "Loading record" / preparing copy without identity | `AlloyCanonicalLoadingSurface` |
| `OperationalAttentionEnhanceDraft.tsx` | Text span only | "Preparing enhanced draft…" | Inline `AlloyIdentityLoader` sm |

### P1 — Drawer / record prep

| Location | Component | Current visual | Replacement |
|----------|-----------|----------------|-------------|
| `PersonDrawerParentOverviewSkeleton.tsx` | Skeleton bars | Pulse rectangles | Identity loader until overview ready |
| `PersonDrawerChildOverviewSkeleton.tsx` | Skeleton bars | Pulse rectangles | Same |
| `DrawerAboveFoldRenderer.tsx` | `SignalStripSkeleton` | Pulse strips | Quiet reserve or identity micro |
| `OpportunityInquirySummaryRightColumn` | Review assist skeleton | Pulse block | `AlloyIdentityLoader` compact |
| `OpportunityRecordSectionRegistryActions.tsx` | Button skeleton | Pulse pills | Keep for actions OR identity hold |

### P2 — Queue / inbox (skeleton-as-content)

| Location | Component | Current visual | Replacement |
|----------|-----------|----------------|-------------|
| `WorkUnitQueueCompactRowSkeleton.tsx` | Row skeleton list | Pulse rows | **Retain for row preview** OR overlay identity on lane hold |
| `QueueBlock.tsx` | Lane row skeleton | Pulse rows | Lane-level identity when `rowsHeld` |
| `InboxPanel.tsx` → `InboxListSkeleton` | List skeleton | Pulse rows | Inbox identity loader |
| `WorkspaceQuietLoadingReserve.tsx` | Quiet skeleton reserve | Text + skeleton | Add identity anchor in reserve header |

*Note:* Row-level skeletons may remain as **content preview** inside an already-revealed shell if a parent identity loader covers the blocking phase. Violation is **skeleton-only** with no Alloy identity.

### P3 — Legacy / peripheral

| Location | Component | Current visual | Replacement |
|----------|-----------|----------------|-------------|
| `app/book-v2/SlotPicker.tsx` | Border spinner | Green `animate-spin` circle | `AlloyIdentityLoader` |
| `app/payment/PaymentClient.tsx` | Text | "Preparing your payment..." | Identity loader |
| `app/legacy-admin/**` | Various | Text / spinners | Out of scope until cutover |
| `OperationalIntakeGeometryShared.tsx` (dev) | `Loader2 animate-spin` | Spinner in findings | Dev-only; align when promoted |
| Button busy states (`Saving…`, `Sending…`) | Text / disabled | Micro busy | **Excluded** — not full loaders |

### Removed / fixed (June 2026)

| Location | Was | Now |
|----------|-----|-----|
| `ActionWorkspaceBosNeuralPulse.tsx` | Green blur blob / network graph | Removed from `BosExecutionLoader` |
| `AlloyCanonicalLoadingSurface` | `BosWorkingState` reveal blob | `AlloyIdentityLoader` |

---

## 4. Recommended migration order

1. **Route transition ribbon** — `WsRouteLoadingRibbon` → Alloy-aware transition (P0, highest frequency)
2. **Next.js `loading.tsx` fallbacks** — replace skeleton bodies with page loading gates using identity loader
3. **Work unit / department skeleton bodies** — collapse to shell-first + single identity message
4. **Legacy drawer loading paths** — `AdminEntityDrawerLegacy` remaining text-only holds
5. **Drawer overview skeletons** — person/child/parent overview holds
6. **Queue lane holds** — identity overlay when lane is `rowsHeld` / null (not per-row skeleton alone)
7. **Inbox / comms list skeletons**
8. **Peripheral flows** — book, payment, legacy admin

---

## 5. Remaining doctrine violations (checklist)

- [ ] Multiple loading systems without shared identity component
- [ ] `WsRouteLoadingRibbon` — no Alloy mark
- [ ] `WorkUnitRouteSkeletonBody` — contains `animate-spin`
- [ ] Route `loading.tsx` — skeleton-only, no identity
- [ ] Drawer overview skeletons — skeleton-only blocking
- [ ] Review assist slot — skeleton-only while BOS loads
- [ ] `ActionWorkspaceBosNeuralPulse` — file still exists (unused); delete or archive
- [ ] Book/payment spinners — non-Alloy language

---

## 6. Capture commands

```bash
# Identity loader gallery
open http://localhost:3000/dev/bos-identity-system

# Drawer opening (production path)
# Open lead from queue — observe OpportunityDrawerOpeningOverlay

# Route loading gates
# Navigate dept → work unit cold — observe DeptPageLoadingGate / WorkUnitPageLoadingGate
```

**Asset folder (recommended):** `docs/sprints/06_2026/assets/alloy-loader-audit/`

---

## 7. Acceptance

**Pass:** At a glance — "That's Alloy loading."

**Fail:** "What's that blurry thing?" / generic spinner / skeleton with no identity
