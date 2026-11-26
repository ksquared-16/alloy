# AdminV2 Runtime & Navigation Performance — Execution Plan

- **Status:** Planning. No code implemented yet.
- **Date:** 2026-06-03
- **Source audit:** [`adminv2_runtime_navigation_performance_audit_v1.md`](./adminv2_runtime_navigation_performance_audit_v1.md)
- **Mission:** Take AdminV2 runtime/navigation from "powerful system" to "premium product." Keep working until performance is **materially improved and re-audited as production-grade.**

## Mission rules

- **Primary mission.** This supersedes other work until Phase 6 acceptance passes.
- **User-visible performance only.** Optimize the felt path: drawer open, drawer-to-drawer navigation, entity switching, list load, bootstrap, provider re-renders, query waterfalls, cache/prefetch. Do **not** chase synthetic metrics.
- **Out of scope** unless explicitly approved: Lifecycle, Needs Attention, Automation, Tasks, Layout Configuration, Forms, Messaging/BOS expansion, and Cursor-owned files. If a fix appears to require touching these, stop and request approval.
- **Measure before and after.** Phase 0 lands first; no optimization card is "done" without a measured delta where a baseline exists.
- **One card = one reviewable PR.** Each card is independently shippable and reversible.

## Card conventions

- **Risk levels:** 🟢 Low (surgical, isolated) · 🟡 Medium (touches shared code/data shapes) · 🔴 High (architectural / broad blast radius).
- **"Tests/checks"** lists the concrete verification for that card; **"Definition of done"** is the merge gate.
- Findings IDs (C1–C3, H1–H9, M1–M10, L1–L4) refer to the audit.

---

## Phase 0 — Measurement & instrumentation

**Goal of phase:** Establish ground-truth baselines and a repeatable way to prove deltas, so every later card is judged on measured user-felt latency.

### Card 0.1 — Server query timing & count instrumentation on hot routes
- **Exact goal:** Wrap the hot admin routes (`entity/[type]/[id]`, `related/[entity]/[id]`, `jobs`) with dev-only timing that logs query count and total handler duration per request.
- **User-visible outcome:** None directly; enables proving C1/C2/H5 gains.
- **Likely files:** `app/api/admin/entity/[type]/[id]/route.ts`, `app/api/admin/related/[entity]/[id]/route.ts`, `app/api/admin/jobs/route.ts`, a new `lib/admin/perfTrace.ts` helper.
- **Risk:** 🟢 Low (additive, dev-gated, no behavior change).
- **Tests/checks:** Open a job drawer and confirm the log reports the query count; confirm zero overhead when the dev flag is off; no production log spam.
- **Definition of done:** Query-count + duration logged for the three routes behind an env/dev flag; baseline numbers captured in a scratch note for Phase 6.

### Card 0.2 — Client drawer-open TTI + navigation timing markers
- **Exact goal:** Add `performance.mark`/`measure` markers for: drawer-open → first content paint, drawer-to-drawer transition, and list route → data painted.
- **User-visible outcome:** None directly; produces the felt-latency numbers the mission is graded on.
- **Likely files:** `components/admin/AdminEntityDrawer.tsx`, `contexts/AdminDrawerContext.tsx`, `components/admin/AdminLayout.tsx`, new `lib/admin/clientPerf.ts`.
- **Risk:** 🟢 Low (instrumentation only).
- **Tests/checks:** Markers appear in the Performance panel; measure drawer open, person→opportunity→customer chain, and Jobs list load; confirm no markers fire in production build if gated.
- **Definition of done:** Reproducible measurement recipe documented; baseline captured for drawer open, drawer-to-drawer, and the four list pages.

### Card 0.3 — Performance budgets & baseline record
- **Exact goal:** Record current baselines and set target budgets used as Phase 6 acceptance gates.
- **User-visible outcome:** None directly; defines "production-grade."
- **Likely files:** New `docs/sprints/archive/06_2026/perf_baselines.md`.
- **Risk:** 🟢 Low.
- **Tests/checks:** Baselines reproducible via the 0.1/0.2 recipe on a known seed dataset.
- **Definition of done:** Baseline + target table committed. Proposed initial budgets (tune against real data):
  - Drawer open (cold) < **400ms** to first content; drawer-to-drawer < **250ms**.
  - Back-nav / repeat-open of a just-viewed record: **0 network refetch** (served from cache, revalidate in background).
  - List load (Jobs/Customers/People/Schedules) < **600ms** to data painted.
  - Entity route: < **6** dependency levels of awaited queries; Jobs list: **O(1)** balance queries (not O(rows)).
  - AdminV2 `/admin/v2/workspace` idle main-thread: no sustained animation cost under `prefers-reduced-motion`.

---

## Phase 1 — Quick wins

**Goal of phase:** Land the surgical, low-risk, high-leverage fixes that move the two most-felt surfaces (drawer open, Jobs queue) in week one.

### Card 1.1 — Memoize all four provider value objects (H6)
- **Exact goal:** Wrap each context `value` in `useMemo` keyed on its real dependencies; keep callbacks `useCallback`-stable.
- **User-visible outcome:** Snappier drawer open/close and navigation; fewer dropped frames from incidental re-render fan-out across 70+ consumers.
- **Likely files:** `contexts/AdminAuthContext.tsx`, `contexts/AdminVerticalContext.tsx`, `contexts/EntityLabelsContext.tsx`, `contexts/AdminDrawerContext.tsx`.
- **Risk:** 🟢 Low.
- **Tests/checks:** React DevTools Profiler shows consumers no longer re-render on unrelated provider renders; existing admin smoke flows unaffected; `npm run lint` + `vitest run`.
- **Definition of done:** All four `value`s memoized; profiler confirms eliminated spurious consumer re-renders on a drawer open.

### Card 1.2 — Batch the Jobs list balance snapshot (C2)
- **Exact goal:** Replace the per-row `computeJobBalanceSnapshot` loop with one (or two) batched aggregate queries grouped by `job_id`; map results back onto rows.
- **User-visible outcome:** Jobs queue loads in a few hundred ms instead of multiple seconds; filter changes feel instant.
- **Likely files:** `app/api/admin/jobs/route.ts:242`, `lib/admin/jobPaymentBalances.ts` (add a batch function, e.g. `computeJobBalanceSnapshotsBatch`).
- **Risk:** 🟡 Medium (financial display numbers must stay identical).
- **Tests/checks:** Add/extend a vitest covering charge-model and pricing/allocation paths; assert batched output equals per-row output for a fixture set; `npm run test:payments-smoke`; query-count log (0.1) shows O(1) not O(rows).
- **Definition of done:** Receivable paid/outstanding values byte-identical to current output on fixtures; query count for the list independent of row count.

### Card 1.3 — Cache server-side reference/lookup tables (H5)
- **Exact goal:** Add a short-TTL cache (in-memory or `unstable_cache`, keyed by `(orgId, entityType)`) for status definitions, field/section definitions, option sets, and org→industry resolution; dedupe the 3× `fetchEffectiveStatusDefinitions` in the vendors path.
- **User-visible outcome:** Faster drawer opens and list renders; lower DB contention under concurrent operator use.
- **Likely files:** `lib/admin/statusDefinitionsResolve.ts`, `lib/admin/entityFieldRegistryAttach.ts`, entity route vendors branch, new `lib/admin/referenceCache.ts`.
- **Risk:** 🟡 Medium (staleness — config edits must invalidate or expire quickly).
- **Tests/checks:** Verify a status/label change is reflected within TTL; confirm vendors route resolves status defs once; query-count log drops by ~5–10 per request.
- **Definition of done:** Reference reads served from cache within TTL; no stale-label regressions in entity-labels/statuses admin pages; documented invalidation/TTL.

### Card 1.4 — Stop Schedules pulling the full Jobs API for a dropdown (H4)
- **Exact goal:** Replace `/api/admin/jobs?limit=500` on Schedules mount with a lightweight id+title options source (lazy on filter open, or a slim `job-options` endpoint).
- **User-visible outcome:** Schedules page loads without paying the Jobs N+1 cost.
- **Likely files:** `app/admin/schedules/SchedulesClient.tsx:105`, possibly a new lightweight options route.
- **Risk:** 🟢 Low.
- **Tests/checks:** Job filter still lists correct jobs; no `computeJobBalanceSnapshot` triggered by Schedules load (verify via 0.1 log); schedules filter behavior unchanged.
- **Definition of done:** Schedules load no longer hits the heavy jobs route; filter parity confirmed.

---

## Phase 2 — Server data-layer optimization

**Goal of phase:** Make every first-load fast by removing waterfalls, duplicate work, and over-fetching at the API contract — pure backend, no client risk.

### Card 2.1 — Parallelize the entity route branches (C1)
- **Exact goal:** Convert independent sequential lookups in each entity branch (jobs, schedules, then the rest) into `Promise.all` groups respecting true data dependencies (~2–4 levels).
- **User-visible outcome:** Drawer opens 3–6× faster TTFB; content arrives in one pass instead of trickling.
- **Likely files:** `app/api/admin/entity/[type]/[id]/route.ts` (per-branch), shared display helpers in `lib/admin/*`.
- **Risk:** 🔴 High (response shape must remain identical across 17 entity types).
- **Tests/checks:** Snapshot the JSON response per entity type before/after on fixtures and assert equality; query-count unchanged but dependency depth reduced (0.1 log); manual drawer open for jobs/schedules/persons/vendors/customers.
- **Definition of done:** Identical payloads per entity type; measured TTFB improvement recorded; no new race in dependent lookups.

### Card 2.2 — Column projection + de-duplicate entity vs related payloads (M1, M9)
- **Exact goal:** Replace `select("*")` on wide primary rows with explicit column lists; move embedded related-list payloads (person/vendor lists) out of the entity route into the lazy related tab; collapse the `related/job` schedules→assignments→vendors chain.
- **User-visible outcome:** Smaller, faster responses; person/vendor opens no longer compute the same heavy lists twice.
- **Likely files:** `app/api/admin/entity/[type]/[id]/route.ts`, `app/api/admin/related/[entity]/[id]/route.ts`.
- **Risk:** 🔴 High (must confirm the drawer doesn't read a now-removed embedded field; coordinate with C3 which controls when related loads).
- **Tests/checks:** Grep drawer for each removed field; response snapshot tests for the trimmed entity payload + the related payload; manual related-tab verification per entity.
- **Definition of done:** No drawer field reads a removed column; related lists load via the related route only; payload size reduced (recorded).

### Card 2.3 — Per-request auth/org resolution optimization (M2, M3)
- **Exact goal:** Verify the JWT locally instead of a network `getUser()`, memoize `user_roles`/org per request, and resolve org id once in the server layout (it's currently resolved twice).
- **User-visible outcome:** Lower fixed latency on every admin request and on first paint.
- **Likely files:** `lib/admin/getAdminContext.ts`, `lib/supabaseAdmin.ts`, `lib/admin/entityLabelsServer.ts`, `app/admin/layout.tsx`.
- **Risk:** 🟡 Medium (auth correctness — must not weaken access control).
- **Tests/checks:** Auth still rejects unauthenticated/cross-org access; org scoping audit paths still pass (`docs/ADMIN_API_ORG_SCOPING_AUDIT_V1.md`); request-time log shows fewer auth round-trips.
- **Definition of done:** Auth/scoping behavior unchanged; redundant org lookups removed; measured per-request overhead reduced.

---

## Phase 3 — Client cache & request ownership

**Goal of phase:** The marquee win — convert "fast on first load" into "instant on every revisit," and make in-flight responses obey the current selection.

### Card 3.1 — Introduce a shared client fetching/cache layer (H1)
- **Exact goal:** Adopt one data layer (SWR or React Query) for admin entity/related/list reads, with stale-while-revalidate and request de-duplication. Establish keying conventions (`['entity', type, id]`, `['related', entity, id]`, `['list', kind, filters]`).
- **User-visible outcome:** Re-opening a record or navigating back is instant (cached), with a quiet background revalidate; no full "Loading…" cycle on revisit.
- **Likely files:** New `lib/admin/dataClient.ts` (+ provider in `components/admin/AdminLayout.tsx`); first consumers wired in `AdminEntityDrawer.tsx` and one list page as the reference implementation.
- **Risk:** 🔴 High (introduces a dependency + caching semantics; staleness vs the existing `admin-entity-saved` event must be reconciled).
- **Tests/checks:** Back-nav and repeat-open show 0 network calls (0.2 markers) with background revalidate; saving a record invalidates its key and updates the drawer; no stale data after edits.
- **Definition of done:** Cache layer in place; drawer + one list migrated; revisit shows cache hit; save→invalidate verified.

### Card 3.2 — Drawer request ownership + AbortController (H2)
- **Exact goal:** Tie every drawer fetch to the active `drawer.id` (abort on change and/or guard `.then` against the current id), covering all secondary panels, not just the primary body.
- **User-visible outcome:** No stale flashes when clicking quickly through records or navigating drawer-to-drawer; the drawer you land on always wins.
- **Likely files:** `components/admin/AdminEntityDrawer.tsx` (all fetch effects), `contexts/AdminDrawerContext.tsx`.
- **Risk:** 🟡 Medium (must ensure abort doesn't cancel a still-valid request after benign re-render).
- **Tests/checks:** Rapidly switch records and confirm no panel shows a previous record's data; in-flight requests for the abandoned drawer are aborted (Network panel); no console errors from aborted fetches.
- **Definition of done:** All drawer fetches are ownership-guarded; manual fast-switch test shows no stale overwrite.

### Card 3.3 — Tab-gate drawer secondary fetches + seed from clicked list row (C3)
- **Exact goal:** Defer financials/payout/payments/option-list fetches until the relevant tab or edit-mode is entered; seed the drawer with the row data the list already has so the overview paints instantly.
- **User-visible outcome:** Drawer opens to populated overview immediately; on-open requests drop from ~13 to ~3–4.
- **Likely files:** `components/admin/AdminEntityDrawer.tsx`, list `*Client.tsx` (pass row as initial data via the cache from 3.1).
- **Risk:** 🟡 Medium (deferred data must load correctly and indicate loading per-tab).
- **Tests/checks:** 0.2 markers show fewer on-open requests; each deferred tab loads on first activation; overview shows seeded data with no flash; edit-mode still has all options.
- **Definition of done:** On-open request count reduced (recorded); deferred tabs verified; seeded overview confirmed.

### Card 3.4 — Honor EntityLabels cache + dedupe verticals fetches (M4, M8)
- **Exact goal:** Respect the existing labels cache/seed in the seeded branch (skip refetch when fresh); route the 7 direct `/api/admin/verticals` callers and duplicate status/department/work-unit fetches through cached providers.
- **User-visible outcome:** Fewer redundant requests on every page; lower bootstrap noise.
- **Likely files:** `contexts/EntityLabelsContext.tsx:127`, `contexts/AdminVerticalContext.tsx`, list `*Client.tsx` files, `JobDetailClient.tsx`.
- **Risk:** 🟢 Low.
- **Tests/checks:** Network panel shows single fetch for verticals/labels per session within TTL; dropdowns still populate; departments/work-units fetched once.
- **Definition of done:** Duplicate reference fetches eliminated; dropdown parity confirmed.

---

## Phase 4 — Drawer & runtime render hygiene

**Goal of phase:** Make the operator's core surface cheap to render and stop edit/typing jank.

### Card 4.1 — Memoize drawer children + stabilize callbacks (H8, part 1)
- **Exact goal:** `React.memo` the heavy drawer children (`EntityDrawerOverview`, `RelatedRecordsTabs`, field/section components) and `useCallback`/`useMemo` the props they receive.
- **User-visible outcome:** Typing in fields and switching tabs no longer re-renders the whole drawer; editing feels smooth.
- **Likely files:** `components/admin/AdminEntityDrawer.tsx`, `components/admin/entity/EntityDrawerOverview.tsx`, related drawer sub-components.
- **Risk:** 🟡 Medium (stale closures if deps are wrong).
- **Tests/checks:** Profiler shows children skip re-render on unrelated state changes; edit + save flow unchanged; field updates still reflect immediately.
- **Definition of done:** Per-keystroke render scope reduced (profiler evidence); no regressions in edit/save.

### Card 4.2 — Split AdminDrawerContext into actions vs state (M5)
- **Exact goal:** Expose a stable actions context (`openDrawer`/`goBack`/`closeDrawer`) separate from volatile `drawer`/`stack` state, so open-only triggers don't re-render on every drawer change.
- **User-visible outcome:** Opening a record no longer re-renders unrelated trigger components across the shell.
- **Likely files:** `contexts/AdminDrawerContext.tsx`, the 23 `useAdminDrawer` consumers (migrate trigger-only ones to the actions hook).
- **Risk:** 🟡 Medium (consumer migration surface).
- **Tests/checks:** Profiler shows trigger-only consumers stable on open; all open/back/close flows work; drawer stack navigation intact.
- **Definition of done:** Actions/state split shipped; trigger consumers no longer re-render on open.

### Card 4.3 — Begin per-entity code-split of the monolithic drawer (H8, part 2)
- **Exact goal:** Extract per-entity drawer bodies into lazily-loaded modules so a single open mounts only that entity's subtree, not all 8,677 lines.
- **User-visible outcome:** Lighter drawer mount; smaller initial JS for the drawer path; faster transitions.
- **Likely files:** `components/admin/AdminEntityDrawer.tsx` → new `components/admin/entity/bodies/*` (incremental, one entity at a time).
- **Risk:** 🔴 High (large refactor — do incrementally behind parity tests).
- **Tests/checks:** Per-entity snapshot/visual parity; bundle analysis shows the drawer split into per-entity chunks; each entity opens and edits correctly.
- **Definition of done:** At least the highest-traffic entities (jobs, opportunities, persons, customers) extracted with parity; remainder tracked as follow-up.

### Card 4.4 — Sidebar nav memoization + hoist icon map (L2)
- **Exact goal:** Hoist `getLinkIcon`'s map to module scope; memoize nav rendering so navigation doesn't rebuild the tree.
- **User-visible outcome:** Marginally smoother navigation on lower-end devices.
- **Likely files:** `components/admin/AdminLayout.tsx:164`.
- **Risk:** 🟢 Low.
- **Tests/checks:** Active-link highlighting still correct; profiler shows reduced nav re-render work.
- **Definition of done:** Map hoisted; nav memoized; highlight parity.

---

## Phase 5 — Navigation & bootstrap polish

**Goal of phase:** Remove blank flashes, warm navigation, and calm the AdminV2 surface so the whole system feels intentional and premium.

### Card 5.1 — Server-render the list pages (H3)
- **Exact goal:** Move initial data fetch for Jobs/Customers/People/Schedules to the server component (mirroring the proven `opportunities/page.tsx` pattern), seeding the client cache (3.1) as `initialData`.
- **User-visible outcome:** Lists paint with data in one pass on every visit — no shell→blank→data flash.
- **Likely files:** `app/admin/{jobs,customers,people,schedules}/page.tsx` + their `*Client.tsx`.
- **Risk:** 🟡 Medium (filter/state hydration parity).
- **Tests/checks:** 0.2 markers show data on first paint; filters/sorting still work; back-nav cache-hit (with 3.1).
- **Definition of done:** Four list pages SSR their first load; perceived load improvement recorded.

### Card 5.2 — Server-hydrate verticals (H7)
- **Exact goal:** Add an `initialVerticals` prop fetched in the server layout and seed `AdminVerticalProvider`, mirroring `initialEntityLabels`.
- **User-visible outcome:** Vertical dropdown is populated on first paint; no empty/stale flash; one fewer bootstrap round-trip.
- **Likely files:** `app/admin/layout.tsx`, `components/admin/AdminLayout.tsx`, `contexts/AdminVerticalContext.tsx`.
- **Risk:** 🟢 Low.
- **Tests/checks:** Dropdown populated immediately; selecting a vertical still works; no client verticals fetch on mount when seeded.
- **Definition of done:** Verticals server-hydrated; no on-mount fetch when seed present.

### Card 5.3 — Prefetch warm navigation (M6)
- **Exact goal:** Add hover/intent prefetch for the drawer entity endpoint (`/api/admin/entity/{type}/{id}`) on list rows, and `Link prefetch` for detail routes where appropriate.
- **User-visible outcome:** Drawer opens feel near-instant on rows the operator hovers before clicking.
- **Likely files:** list `*Client.tsx`, `components/admin/AdminEntityDrawer.tsx` (prefetch hook via the 3.1 cache).
- **Risk:** 🟢 Low (avoid prefetch stampede — debounce/limit).
- **Tests/checks:** Hover triggers a single prefetch; click then resolves from cache; no excessive prefetch traffic on fast mouse-over.
- **Definition of done:** Hover-prefetch live for the drawer path; cache-hit on click verified.

### Card 5.4 — Job detail page: parallelize joins + cache tabs (M7)
- **Exact goal:** `Promise.all` the six sequential joins in `jobs/[id]/page.tsx`; cache tab data so revisiting a tab doesn't refetch.
- **User-visible outcome:** Job detail opens 200–500ms faster; tab toggles are instant after first load.
- **Likely files:** `app/admin/jobs/[id]/page.tsx:26-81`, `app/admin/jobs/[id]/JobDetailClient.tsx:164`.
- **Risk:** 🟡 Medium (payload parity).
- **Tests/checks:** Detail content identical; tab revisit shows no refetch; measured open improvement.
- **Definition of done:** Joins parallelized; tab cache verified.

### Card 5.5 — Calm the AdminV2 ambient layer + remove debug/proof scaffolding (H9, M10, L3)
- **Exact goal:** Gate all ambient animation behind `@media (prefers-reduced-motion: reduce)`, cut drift-dot/orbital density ~70%, add `will-change` only where it helps, remove the dead `DEBUG_EXAGGERATE_WORKSPACE_AMBIENT` flag and "proof-pass" exaggeration, and memoize workspace shells/blocks.
- **User-visible outcome:** `/admin/v2/workspace` stops burning idle CPU/GPU; the surface feels intentional and premium rather than jittery/unfinished.
- **Likely files:** `app/adminV2/components/WorkspaceAmbientLayer.tsx`, `app/adminV2/adminV2.css`, `app/adminV2/components/AdminV2Shell.tsx`, `app/adminV2/components/canvas/companyFieldAmbient.ts`, `app/adminV2/workspace/page.tsx`, shells/blocks.
- **Risk:** 🟢 Low (visual-only; mock data path).
- **Tests/checks:** With reduced-motion on, no sustained animation; idle main-thread cost drops sharply (Performance panel); no dead flags remain; visual review at company/department levels.
- **Definition of done:** Reduced-motion honored; density tuned to production tokens; debug/proof scaffolding removed; idle-CPU improvement recorded. *(The unreachable `SystemCanvas`/reactflow branch, L4, stays untouched unless routed.)*

---

## Phase 6 — Re-audit & performance acceptance

**Goal of phase:** Prove the system is production-grade against Phase 0 budgets and guard against regression.

### Card 6.1 — Re-measure against baselines
- **Exact goal:** Re-run the 0.1/0.2 recipe on the same seed dataset and produce a before/after delta table for every budgeted metric.
- **User-visible outcome:** Documented, defensible proof of improvement.
- **Likely files:** `docs/sprints/archive/06_2026/perf_baselines.md` (update with after-numbers + deltas).
- **Risk:** 🟢 Low.
- **Tests/checks:** Each Phase 0 budget met or exceeded; any miss has a tracked follow-up card.
- **Definition of done:** Delta table committed; all budgets green or explicitly waived with rationale.

### Card 6.2 — Closure re-audit + regression guardrails
- **Exact goal:** Re-audit each finding C1–C3/H1–H9/M1–M10/L1–L3 as resolved/partial/deferred; add lightweight guardrails (e.g. a test asserting Jobs list query count is row-independent; a profiler/assert check that provider values are memoized).
- **User-visible outcome:** Sustained premium feel; protection against silent re-introduction.
- **Likely files:** `docs/sprints/archive/06_2026/adminv2_runtime_navigation_performance_audit_v1.md` (V2 closure section), targeted tests under `tests/`.
- **Risk:** 🟢 Low.
- **Tests/checks:** Each finding has a status + evidence link; guardrail tests pass in CI.
- **Definition of done:** Every finding dispositioned; regression guardrails merged; mission declared production-grade or remaining gaps re-scoped.

### Acceptance criteria (production-grade gate)

| Metric | Target | Evidence |
|---|---|---|
| Drawer open (cold) → first content | < 400ms | 0.2 markers |
| Drawer-to-drawer transition | < 250ms | 0.2 markers |
| Repeat-open / back-nav of recent record | 0 refetch, background revalidate | Network panel |
| List load (Jobs/Customers/People/Schedules) | < 600ms to data painted | 0.2 markers |
| On-open drawer request count | ≤ 4 | 0.1/Network |
| Entity route awaited dependency depth | ≤ 6 levels | 0.1 log |
| Jobs list balance queries | O(1), row-count independent | 0.1 log + guardrail test |
| Provider consumer re-renders on unrelated render | ~0 | Profiler |
| AdminV2 idle animation under reduced-motion | none sustained | Performance panel |
| No stale-data flash on fast record switching | pass | Manual fast-switch |

---

## Execution order (concrete)

1. **Phase 0** (0.1 → 0.2 → 0.3) — instrument and baseline first.
2. **1.1** memoize provider values · **1.2** batch Jobs snapshot · **1.3** cache reference tables · **1.4** Schedules dropdown. *(week one)*
3. **2.1** parallelize entity route · **2.2** projection/dedup · **2.3** auth/org.
4. **3.1** cache layer → **3.2** request ownership → **3.3** tab-gate + seed → **3.4** dedupe reference fetches.
5. **4.1** memo children · **4.2** split drawer context · **4.3** code-split drawer (incremental) · **4.4** nav memo.
6. **5.1** SSR lists · **5.2** hydrate verticals · **5.3** prefetch · **5.4** job detail · **5.5** AdminV2 ambient.
7. **Phase 6** re-measure + closure re-audit against acceptance criteria.

Cards 1.1–1.4 are surgical and ship first. The cache layer (3.1) is the architectural investment that delivers the largest felt win and unblocks 3.2/3.3/5.1/5.3.
