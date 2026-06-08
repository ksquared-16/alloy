# AdminV2 Runtime & Navigation Performance Audit — V1

- **Status:** Read-only audit. No code modified.
- **Date:** 2026-06-03
- **Branch at audit time:** `claude/serene-ishizaka-933b7f`
- **Companion:** [`adminv2_runtime_navigation_performance_execution_plan.md`](./adminv2_runtime_navigation_performance_execution_plan.md)
- **Scope:** Runtime + navigation performance of the operator admin surface. Lifecycle, Needs Attention, automation, tasks, layout config, forms, and Cursor-owned files are out of scope unless explicitly approved.

---

## 1. Executive diagnosis

Alloy is a powerful system whose performance ceiling is set by **three architectural choices, not by feature weight**:

1. **The server data layer fans every request into a long chain of dependent, one-at-a-time DB round-trips** — and, for the Jobs queue, one expensive multi-query computation *per row*. Latency is the *sum* of 20–30 sequential queries.
2. **The client has no data cache and no request ownership.** Every drawer open, every list visit, and every back-navigation refetches from scratch; in-flight responses for a record the operator already navigated away from still land and overwrite the screen. There is no SWR/React-Query layer anywhere.
3. **The React runtime leaks re-renders.** All four context providers hand consumers a fresh value object every render, and the operator's core surface — the entity drawer — is a single 8,677-line component whose children re-render wholesale on every keystroke.

These are the reasons Alloy feels *slow, heavy, jittery, and over-rendered*. None require feature work to fix; they are infrastructure.

**Verified positives (templates to reuse):**
- The admin shell does **not** re-mount on navigation — Next.js layouts persist providers; only `children` swaps.
- [`app/admin/opportunities/page.tsx`](../../../web/app/admin/opportunities/page.tsx) already **server-renders** its list — the pattern the other list pages should copy.
- The AdminV2 reactflow `SystemCanvas` is well-memoized (and currently unreachable — see L4).

**Measurement caveat:** there is no performance instrumentation in the codebase today. Every estimate below is a static-analysis projection, **not a profiled number**. Phase 0 of the execution plan exists precisely to replace these projections with measured before/after numbers so we optimize the felt path, not a synthetic metric.

---

## 2. How the audit was performed

Read-only inspection of the operator surface, fanned across five focus areas with direct source verification of the two highest-impact claims:

| Focus area | Primary surface inspected |
|---|---|
| Drawer internals | `components/admin/AdminEntityDrawer.tsx` (8,677 lines), `entity/EntityDrawerOverview.tsx`, `AdminDrawerContext.tsx`, `lib/entityPresentation.ts` |
| Server data layer | `app/api/admin/entity/[type]/[id]/route.ts`, `app/api/admin/related/[entity]/[id]/route.ts`, `app/api/admin/jobs/route.ts`, `lib/admin/*` |
| Navigation & lists | `app/admin/layout.tsx`, `components/admin/AdminLayout.tsx`, `app/admin/{jobs,opportunities,customers,people,schedules}/*Client.tsx`, `jobs/[id]/*` |
| Runtime / providers | `contexts/*`, provider composition, bootstrap path |
| AdminV2 canvas | `app/adminV2/**`, `lib/ui-v2/**` |

**Directly verified in source:** the Jobs N+1 ([`jobs/route.ts:242`](../../../web/app/api/admin/jobs/route.ts)) and the entity-route serial waterfall ([`entity/[type]/[id]/route.ts:141`](../../../web/app/api/admin/entity/[type]/[id]/route.ts)).

---

## 3. Findings

Severity reflects **user-felt impact × frequency**, not code aesthetics. IDs are stable and referenced by the execution plan.

### 🔴 Critical — make every interaction slow

#### C1 — Entity API route is a serial query waterfall
- **User-visible impact:** Every drawer open blocks on the *sum* of ~20–30 dependent DB round-trips (~0.5–1.5s+) before anything paints.
- **Technical cause:** `entity/[type]/[id]/route.ts:141-344` (jobs) and `:672-931` (schedules) `await` independent lookups (opportunity → person → contact → person → customer → vertical → status → schedule → discount → details → work-unit → fields …) one at a time. `Promise.all` is used in only a few isolated spots, proving the pattern is known but not applied to display-field hydration.
- **Estimated gain:** **3–6× faster** drawer TTFB (~1.2s → ~250ms) by collapsing into ~2–4 dependency levels.

#### C2 — Jobs list runs an N+1 payment-balance computation per row
- **User-visible impact:** The primary operator queue is the slowest page to load and to re-filter; it re-runs on every filter change and every save event.
- **Technical cause:** `jobs/route.ts:242` runs `await Promise.all(result.map(row => computeJobBalanceSnapshot(...)))` — one snapshot per row (limit 200). Each snapshot is 4–7 queries (`lib/admin/jobPaymentBalances.ts:485`) → ~800–1,400 queries per list load.
- **Estimated gain:** **5–15× faster** Jobs list (multi-second → few hundred ms) via one batched aggregate grouped by `job_id`.

#### C3 — Entity drawer fires ~13 parallel requests on open, most not needed for the first tab
- **User-visible impact:** Drawer opens to "Loading…", then content pops in piecemeal — feels janky, especially on slower connections.
- **Technical cause:** `AdminEntityDrawer.tsx` eagerly fetches record, related, vendors-for-assign, ~6 option lists, financials, payout, and payments on open regardless of the active tab (lines 1043, 1379, 1399, 2191, 2272, 2400, 2418, …).
- **Estimated gain:** **~60–70% fewer on-open requests** (13 → 3–4) by deferring form-options/financials/payout to their tab or edit-mode.

### 🟠 High — broad, frequently-felt friction

#### H1 — No client-side cache anywhere
- **Impact:** Re-opening a record viewed seconds ago, or navigating back, replays the full loading cycle every time.
- **Cause:** Bare `fetch().then(setData)` throughout; no SWR/React-Query/module cache; `force-dynamic` on every route. `goBack` (`AdminDrawerContext.tsx:103`) restores `{type,id}`, re-triggering all effects → full refetch.
- **Gain:** **Near-instant** repeat-opens and back-nav (eliminate 100–500ms cycle each). Highest felt win.

#### H2 — No request ownership / `AbortController`
- **Impact:** Fast-clicking through records can flash stale data; secondary panels overwrite the wrong drawer.
- **Cause:** Drawer fetches have no abort and no current-`id` re-check on `.then(setX)` (e.g. `setJobFinancials`, `setCustomerRelatedData`). Only the primary body is guarded via `dataMatchesDrawer` (`AdminEntityDrawer.tsx:3404`).
- **Gain:** Correctness + frees bandwidth for the drawer the user actually landed on.

#### H3 — List pages fetch client-side after hydration (waterfall)
- **Impact:** Jobs/Customers/People/Schedules show shell → blank/skeleton → data on every visit. Opportunities (SSR) feels noticeably faster.
- **Cause:** `*Client.tsx` fetch in `useEffect` on mount; page wrappers do no server fetch, unlike `opportunities/page.tsx`.
- **Gain:** **300–800ms** off perceived load per visit; removes blank flash.

#### H4 — Schedules page pulls the entire Jobs API for a dropdown
- **Impact:** Opening Schedules silently pays the full Jobs N+1 cost (C2).
- **Cause:** `SchedulesClient.tsx:105` calls `/api/admin/jobs?limit=500` just to fill a filter `<option>` list needing only id + title.
- **Gain:** **Multi-second** on orgs with many jobs.

#### H5 — Reference tables re-queried on every request; no caching
- **Impact:** Constant redundant DB latency on every open and list render.
- **Cause:** No HTTP/`unstable_cache`/in-memory cache. `status_definitions`/`field_definitions`/`option_sets`/`industries` re-resolved per request (`statusDefinitionsResolve.ts:97`, `entityFieldRegistryAttach.ts:45`); the vendors path calls `fetchEffectiveStatusDefinitions` **3×** per request.
- **Gain:** Removes ~5–10 queries per request; meaningful under concurrent use.

#### H6 — All 4 provider `value` objects recreated every render
- **Impact:** Any provider re-render fans out to dozens of consumers (25 label, 23 auth, 23 drawer, 6 vertical) that re-render needlessly.
- **Cause:** No `useMemo` on `value` in `AdminAuthContext.tsx:32`, `AdminVerticalContext.tsx:56`, `EntityLabelsContext.tsx:143`, `AdminDrawerContext.tsx:120`. Callbacks *are* `useCallback`'d — only the wrapper object leaks.
- **Gain:** Trivial fix, broad benefit; snappier drawer open/close and nav.

#### H7 — Verticals bootstrap is a client-fetch waterfall
- **Impact:** Vertical dropdown is empty/stale until a client round-trip resolves on every load.
- **Cause:** `AdminVerticalContext.tsx:33` fetches on mount with `loading=true`; there is no `initialVerticals` server-hydration (entity labels already do this via `initialEntityLabels`).
- **Gain:** Removes one round-trip from the bootstrap critical path + the empty-dropdown flash.

#### H8 — Monolithic 8,677-line drawer; unmemoized children + inline props
- **Impact:** Typing/tab-switching re-executes the entire drawer render (~4,000 lines of JSX, 201 `.map`s).
- **Cause:** Single component (`AdminEntityDrawer.tsx:620`); children (`EntityDrawerOverview`, `RelatedRecordsTabs`) are not `React.memo`'d and receive fresh inline callbacks/objects each render. 152 `useState`, 61 `useEffect`, only 11 `useMemo`.
- **Gain:** Memo + stable callbacks sharply cut per-keystroke render cost; per-entity code-split shrinks the mounted tree 70–90%.

#### H9 — AdminV2 workspace ambient layer: ~343 perpetually-animated nodes, no reduced-motion
- **Impact:** The one *reachable* AdminV2 surface burns CPU/GPU while idle ("fan spins, never settles") — reads as un-premium and jittery.
- **Cause:** `WorkspaceAmbientLayer.tsx:36` renders 291 drift dots + 52 orbital specs, animating transform + opacity + box-shadow on `infinite` loops. `adminV2.css` has 53 `infinite` animations, zero `prefers-reduced-motion`, zero `will-change`.
- **Gain:** Large idle-CPU reduction; gate behind reduced-motion + cut density ~70%.

### 🟡 Medium

| ID | Finding | Cause / location | Est. gain |
|---|---|---|---|
| **M1** | Over-fetch: `select("*")` on every primary row; entity payload embeds related lists also fetched by the related route (persons/vendors fetched twice per open) | entity route persons `1629-1729` vs `related/person` `631-772`; vendors `1233-1277` vs `related/vendor` | Smaller payloads; removes a full duplicate of the heaviest person/vendor queries |
| **M2** | Per-request auth = network `getUser()` + `user_roles` query + new client built per call | `getAdminContext.ts:45`, `supabaseAdmin.ts:30`, multiplied across the on-open fan-out | Local JWT verify + per-request role memo removes 1 RTT + 1 query per admin call |
| **M3** | Server layout resolves org id twice (up to 6 DB queries) | `app/admin/layout.tsx:25,30` | Resolve once; removes up to 3 redundant queries from first-paint TTFB |
| **M4** | EntityLabels refetches on mount even when server-seeded; 10-min cache bypassed in seeded branch | `EntityLabelsContext.tsx:127-140` | One fewer round-trip per admin load |
| **M5** | `AdminDrawerContext` mixes stable actions + volatile state → 23 consumers re-render on every open | `AdminDrawerContext.tsx:60-120` | Open-only triggers stop re-rendering on drawer open |
| **M6** | No `Link` prefetch / hover-prefetch anywhere (grep: 0 hits in `app/admin`) | Rows open via `onClick`; `<Link>` under `force-dynamic` doesn't prefetch data | Hover-prefetch of `/api/admin/entity/{type}/{id}` → near-instant drawer opens |
| **M7** | Job detail page: 6 sequential joins + per-tab refetch, no memo | `jobs/[id]/page.tsx:26-81`, `JobDetailClient.tsx:164` | 200–500ms off detail open; no refetch on revisited tab |
| **M8** | List clients duplicate reference fetches (status-options per page; departments+work-units fetched in both JobsClient and JobDetailClient; verticals fetched by 7 callers) | `JobsClient.tsx:75-123`, `JobDetailClient.tsx:100-141` | Centralize into cached providers; 1–3 fewer requests per page |
| **M9** | N+1 chain in `related/job`: schedules → assignments → vendors serial | `related/[entity]/[id]/route.ts:226-282` | Modest; collapse 3 dependency levels to 2 |
| **M10** | AdminV2 ships "proof-pass" CSS + dead `DEBUG_EXAGGERATE_WORKSPACE_AMBIENT` flag | `adminV2.css:1`, `AdminV2Shell.tsx:30` | Removes "obviously unfinished/AI-built" tells; fixes H9's over-density |

### 🟢 Low

- **L1** — Duplicate `customer_member` related fetches on open (`AdminEntityDrawer.tsx:1667-1742`).
- **L2** — Sidebar re-renders full nav tree on every nav; `getLinkIcon` rebuilds a 40-entry map per call (`AdminLayout.tsx:164`).
- **L3** — AdminV2 shells/blocks unmemoized; all 4 workspace models recomputed per drill though only 1 renders (`workspace/page.tsx:66-107`). Harmless on mock data; fix before real data lands.
- **L4** *(informational)* — The `SystemCanvas`/reactflow branch (`AdminV2Shell.tsx:119`) is **unreachable** (no route renders it) and well-memoized. Do not invest until/unless routed.

---

## 4. Severity → impact summary

| Tier | IDs | Net felt effect when resolved |
|---|---|---|
| Critical | C1, C2, C3 | Drawer opens fast; Jobs queue loads fast; no piecemeal pop-in |
| High | H1–H9 | Repeat/back-nav instant; no stale flashes; SSR lists; no provider re-render churn; calm AdminV2 |
| Medium | M1–M10 | Lower DB load, faster bootstrap, prefetch-warmed navigation |
| Low | L1–L4 | Long-tail polish |

---

## 5. Recommended direction (detailed in the execution plan)

1. **Phase 0** — Measure the felt path before changing anything.
2. **Phase 1** — Quick wins: H6, C2, H5, H4 (surgical, first week).
3. **Phase 2** — Server data-layer: C1, M1, M2, M3, M9.
4. **Phase 3** — Client cache + request ownership: H1, H2, C3, M4.
5. **Phase 4** — Drawer/runtime render hygiene: H8, M5, L2.
6. **Phase 5** — Navigation/bootstrap polish: H3, H7, M6, M7, M8, H9, M10, L3.
7. **Phase 6** — Re-audit against acceptance criteria.

The marquee win is the **client cache layer (Phase 3)**: it converts Alloy from "fast on first load" to "instant on every revisit" — the difference operators read as *premium*.
