# Performance & Frontend Experience Audit

**Path:** `docs/sprints/06_2026/claude_performance_frontend_audit.md`
**Branch audited:** `claude/layout-config`
**Mode:** Read-only audit — no application code, migrations, or config were modified.
**App under review:** Next.js 16 / React 19 frontend under `web/`.
**Date:** June 2026

---

## Scope coverage

| # | Area | Status |
|---|------|--------|
| 1 | Frontend loading behavior | Reviewed |
| 2 | AdminV2 runtime architecture | Reviewed |
| 3 | Drawer loading experience | Reviewed |
| 4 | Department page loading | Reviewed |
| 5 | Work Unit loading | Reviewed |
| 6 | Communications loading | Reviewed |
| 7 | Layout configuration architecture | Reviewed |
| 8 | Performance bottlenecks | Partial — covered via areas 1–7; dedicated bundle/tech-debt sweep not completed |
| 9 | Technical debt | Partial — same as above |
| 10 | Opportunities for improvement | Derived from above |

> The dedicated bundle-size / `as any` / TODO-density / duplicate-system (`admin` vs `adminV2`, `book` vs `book-v2`) sweep did not finish and should be re-run to fully close areas 8–9.

---

## Findings

### A. Frontend loading & runtime architecture

- **The AdminV2 runtime is well-architected and intentionally protected.** A locked doctrine (`docs/system/adminv2-runtime-performance-doctrine.md`) governs composed reveal, reveal gates, known-empty semantics, and request-ownership / stale guards. The reveal gates (`web/lib/adminV2/workspaceRevealGate.ts`, `deptRevealGate.ts`, `workUnitRevealGate.ts`) and the runtime contract system (`web/lib/adminV2/runtime/contract/`) correctly distinguish "lookup completed" from "has content." This part of the system is the safeguard, not the problem.
- **The cold-load bootstrap is good: 1 blocking round-trip on the happy path.** `web/lib/workspace/loadWorkUnitOperationalBootstrap.ts` (614 lines) collapses dept + work-unit + summaries + primary rows into a single server call with internal parallel DB queries. The dept page is likewise 1 round-trip when the bootstrap is present.
- **Workspace routes are 100% client components with deep `useEffect` waterfalls.** Zero server components under `/adminV2/workspace/`; every data load is a client `fetch()`. The legacy fan-out fallback (when bootstrap fails) degrades to **3–5 sequential round-trips**.
- **The two `loading.tsx` boundaries return `null`** and there are **no `error.tsx`** files anywhere in adminV2 — all loading/error state lives inside the page components.

### B. Monolithic components (dominant tech-debt signal)

| File | Lines | Note |
|------|------:|------|
| `web/components/admin/AdminEntityDrawer.tsx` | ~18,400 | 202 `useState`, 127 `useEffect`, 187 fetch sites — god component (PROTECTED) |
| `web/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx` | ~6,000 | Single ~900-line bootstrap effect; 50+ state atoms (PROTECTED) |
| `web/app/adminV2/workspace/dept/[departmentId]/page.tsx` | ~2,060 | 14 `useEffect`, ~11 fetches |
| `web/lib/admin/opportunityEntityRecord.ts` | ~2,300 | server entity builder, ~40 `.from()` calls (PROTECTED) |
| `web/components/admin/communications/CommunicationsDrawerSection.tsx` | ~1,320 | fans out N message fetches |
| `web/lib/communications/inboxThreadsService.ts` | ~1,050 | 7–10 sequential DB queries per call |

These concentrate risk: any change risks the protected reveal machinery, and review/onboarding cost is very high.

### C. Provider tree

- Workspace renders behind **~10 nested context providers** (`web/app/adminV2/workspace/AdminV2WorkspaceClientProviders.tsx`). `AdminDrawerContext` (607 lines) and `GlobalAssistantContext` re-render the whole subtree on state change.
- `web/app/adminV2/components/AdminV2Shell.tsx` duplicates two full layout trees; `TopNavBar` lacks a Suspense boundary in the workspace-v2 branch.
- Minor: duplicate `QuoteModalProvider` nesting in `web/app/layout.tsx`; two separate Poppins font instances (root + adminV2).

### D. Layout configuration architecture (area 7 — focus branch)

- **Config-driven and centralized**, but spread across **three tables**: `record_layouts` (global templates), `record_drawer_layouts` (org overrides), and `config_layout_assist_proposals` (AI proposals). Runtime resolution cascade lives in `web/lib/admin/effectiveRecordDrawerLayout.ts`.
- **Divergent read paths:** the live drawer uses the two-table cascade, while `web/hooks/useRecordChromeConfig.ts` reads only `record_layouts` via `/api/admin/record-layouts` — the Settings preview and the live drawer can resolve **different configs for the same org**.
- **No schema validation** on `RecordLayoutConfigJson` at parse time (`web/lib/recordChrome/types.ts`) — malformed DB JSON passes silently.
- **Only `opportunity` is editable**; `job` / `schedule` / `person` layout editing is deferred with no ticket/date (`web/lib/adminV2/layouts/layoutCompositionCapabilities.ts`).
- **No server-side TTL cache** for resolved layout; every drawer open re-queries.
- The Settings Layouts page fans out 4 uncoordinated client fetches.

### E. Communications (highest concentration of real performance bugs)

- **Unbounded queries:** `attachUnreadFlags` issues `IN (threadIds)` on `communication_messages` with **no `.limit()`** (`web/lib/communications/inboxThreadsService.ts:181`), on every folder load. A second unbounded `IN` on `communication_message_reads` immediately follows (~line 191).
- **Per-call waterfall:** `loadEntityContext` runs 7–10 sequential Supabase queries per inbox list (`web/lib/communications/inboxThreadsService.ts:273`).
- **Fan-out storms:** the 5-folder warm sweep runs sequentially on every mount and re-fires on every send/archive (`web/lib/adminV2/inboxWarmLoadCache.ts:50`); `web/components/admin/communications/CommunicationsDrawerSection.tsx:549` issues **up to 40 concurrent** message fetches, even while preloading in the background.
- **No virtualization** in any thread/message list; **no cursor pagination** anywhere in comms APIs.
- **Two always-mounted 120s pollers** (`web/app/adminV2/components/InboxNavLink.tsx:49`, `web/app/adminV2/components/OperationalTasksNavBadge.tsx:52`); `unread-count` scans 300 rows per poll.
- **Correctness bug:** the new `InboxPanel` never calls mark-read, so unread counts won't clear when reading via the new inbox modal (`web/app/adminV2/messages/InboxPanel.tsx`). The only mark-read caller is the older `CommunicationsDrawerSection`.

### F. Known/acknowledged backend item

- Cold drawer open issues **two concurrent `select("*")` on `opportunities`** (bootstrap + `drawer_primary`) for the same row. Already tracked in the backend payload-optimization phase (`docs/sprints/06_2026/adminv2_backend_query_payload_optimization_phase.md`).

---

## Risks (prioritized)

| Severity | Risk | Anchor |
|----------|------|--------|
| High | Comms unbounded `IN` queries + 7–10-query waterfall → response time and Supabase read-quota blow-up at scale | `inboxThreadsService.ts:181,273` |
| High | Up to 40 concurrent message fetches per drawer (incl. background preload) | `CommunicationsDrawerSection.tsx:549` |
| High | Repeated 5-folder warm sweeps amplify the above on every send/archive | `inboxWarmLoadCache.ts:50` |
| High | Two ~6k–18k-line god components concentrate change risk over PROTECTED reveal logic | drawer + work-unit page |
| Medium | Layout config split across 3 tables with divergent read paths → Settings preview != live drawer | `effectiveRecordDrawerLayout.ts` vs `useRecordChromeConfig.ts` |
| Medium | No schema validation on layout `config_json` → silent wrong layouts | `recordChrome/types.ts` |
| Medium | Unread counts never clear in new inbox modal (functional bug) | `InboxPanel.tsx` |
| Medium | No virtualization / no pagination in comms lists | `InboxPanel.tsx`, message history |
| Medium | Legacy dept/work-unit fan-out path = 3–5 serial round-trips when bootstrap absent | `dept/[departmentId]/page.tsx` |
| Medium | 10-deep provider stack → re-render cascades from drawer/assistant context | `AdminV2WorkspaceClientProviders.tsx` |
| Low | No `error.tsx`; `loading.tsx` stubs return null | adminV2 routes |
| Low | Duplicate `QuoteModalProvider`; double Poppins font load | `app/layout.tsx` |

---

## Recommendations

> No implementation was performed. These are proposals only.

**Quick wins (low risk, outside protected files):**

1. Add `.limit()` to the unread-flag queries in `inboxThreadsService.ts`.
2. Parallelize or gate the 5-folder warm sweep; skip `scheduled`/`archived` unless opened.
3. Cap/stagger the per-thread message fan-out in `CommunicationsDrawerSection` (batch endpoint or concurrency cap); do not fan out during background preload.
4. Wire mark-read into the new `InboxPanel`.
5. Consolidate the two 120s pollers into one shared poller; add a short server-side cache to `unread-count`.

**Structural (needs design, still outside protected reveal logic):**

6. Unify layout resolution so the Settings preview and live drawer use the **same** path; consider folding `record_layouts` + `record_drawer_layouts` reads behind one resolver and add a server-side TTL cache.
7. Add Zod validation at `config_json` ingestion/parse for `RecordLayoutConfigJson`.
8. Introduce cursor pagination + list virtualization in communications.
9. Convert `loadEntityContext` from a sequential chain to batched/parallel queries.

**Larger refactors (coordinate with Cursor; do not touch protected files unilaterally):**

10. Decompose the god components by extracting data-fetch/cache layers into hooks — only as an explicitly-scoped runtime task with the doctrine test suite, since both are PROTECTED.
11. Where reveal contracts allow, move first-paint data to server components / streaming to shrink client waterfalls.

---

## Priority ranking

1. Comms unbounded queries + entity-context waterfall (High; isolated; clear win)
2. Comms fan-out / warm-sweep amplification (High)
3. Inbox mark-read correctness bug (Med-High; small)
4. Poller / unread-count consolidation (Med; small)
5. Layout dual-read-path divergence + validation (Med; area-7 core)
6. Comms pagination / virtualization (Med)
7. Provider re-render reduction (Med)
8. `error.tsx` / loading boundaries (Low)
9. God-component decomposition (High value, high coordination cost — sequence last, with Cursor)

---

## Files reviewed (representative)

**Runtime / loading:** `docs/system/adminv2-runtime-performance-doctrine.md`, `web/lib/adminV2/workspaceRevealGate.ts`, `web/lib/adminV2/deptRevealGate.ts`, `web/lib/adminV2/workUnitRevealGate.ts`, `web/lib/workspace/loadWorkUnitOperationalBootstrap.ts`, `web/lib/workspace/adminV2WorkspaceSessionCache.ts`, `web/lib/perf/adminV2PerfLog.ts`, runtime contract registry under `web/lib/adminV2/runtime/contract/`

**Pages / shell:** `web/app/layout.tsx`, `web/app/adminV2/layout.tsx`, `web/app/adminV2/components/AdminV2Shell.tsx`, `web/app/adminV2/workspace/AdminV2WorkspaceClientProviders.tsx`, dept + work-unit `page.tsx` / `loading.tsx`, `web/app/adminV2/components/workspace/DeptPageLoadingGate.tsx`, `web/app/adminV2/components/workspace/WorkUnitPageLoadingGate.tsx`

**Contexts / hooks:** providers under `web/contexts/` (EntityLabels, AdminDrawer, WorkspaceSiteFilter, AdminAuth, AdminVertical, timezone, WorkspaceOrg, GlobalAssistant); `web/hooks/useRecordChromeConfig.ts`, `web/hooks/useDepartmentQueueData.ts`, `web/hooks/useOperationsWorkspaceData.ts`

**Layout config:** `web/lib/recordChrome/types.ts`, `web/lib/admin/effectiveRecordDrawerLayout.ts`, `web/lib/admin/recordDrawerLayoutPersist.ts`, `web/lib/adminV2/layouts/layoutCompositionCapabilities.ts`, `web/lib/adminV2/layouts/layoutMutationClasses.ts`, `web/lib/config/layoutIntegrityValidator.ts`, config-assist proposal store, Settings layout components under `web/components/adminV2/settings/`

**Drawer:** `web/components/admin/AdminEntityDrawer.tsx`, opportunity drawer coordinator/prefetch chain under `web/lib/admin/`, `web/lib/admin/drawer/composedDrawerPayload/`, `web/lib/admin/opportunityEntityRecord.ts`, person drawer entity components

**Communications:** `web/lib/communications/inboxThreadsService.ts`, `web/lib/adminV2/inboxWarmLoadCache.ts`, `web/app/adminV2/messages/InboxPanel.tsx`, `web/app/adminV2/components/InboxNavLink.tsx`, `web/app/adminV2/components/OperationalTasksNavBadge.tsx`, `web/app/adminV2/components/QuickMessageModal.tsx`, `web/components/admin/communications/CommunicationsDrawerSection.tsx`, comms API routes under `web/app/api/admin/communications/`

---

## Files to avoid — Cursor owns lifecycle / protected runtime

Do **not** modify these (read-only). Changes require Cursor's doctrine review and the runtime test suite.

- **All of `web/lib/lifecycle/`** (~100 modules) — Cursor-owned lifecycle.
- **Protected runtime-sensitive files** (per `.cursor/rules/adminv2-runtime-performance.mdc`):
  - `web/components/admin/AdminEntityDrawer.tsx`, `web/components/admin/entity/*Drawer*`, `web/components/admin/opportunity/*`
  - `web/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx`, `web/app/adminV2/components/workspace/blocks/QueueBlock.tsx`
  - `web/lib/admin/drawer/composedDrawerPayload/*`, `web/lib/admin/drawer/*Reveal*`
  - `web/lib/adminV2/runtime/contract/*`, `web/lib/adminV2/*RevealGate.ts`, `web/lib/workspace/*Queue*`
  - `web/lib/admin/opportunityDrawer*`, `web/lib/admin/prefetchPersonDrawerSnapshot.ts`
- Do not remove perf instrumentation in `web/lib/perf/adminV2PerfLog.ts` (part of the runtime contract).

**Implication:** the highest-value quick wins (Communications, layout-config unification, validation, pollers) all sit **outside** the protected set and can proceed without touching Cursor-owned lifecycle. God-component decomposition is the one large item that overlaps protected files and must be coordinated with Cursor.
