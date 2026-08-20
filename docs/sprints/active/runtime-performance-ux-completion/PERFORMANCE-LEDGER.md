---
owner: runtime
status: active
last_reviewed: 2026-08-20
supersedes: []
---

# Runtime performance ledger — current evidence

One current ledger, per the mission. Every entry carries baseline → root cause → fix → after →
certification. Entries without all five are listed as **open**, not as findings.

**Base:** `origin/staging c9ce324fa`. **Environment for every number below:** production build
(`ALLOY_PROD_CERT_DIST=1`, `ALLOY_ROUTE_TIMING=1`), slot 5 :3015, arm64 node v22.21.1, hosted
Supabase (remote), host qualified by `scripts/pe3HostGate.sh` before **and** after each cell.

---

## 0. Two measurement-validity facts that govern every number here

**The server is local and the database is remote.** Every server-side round trip pays WAN latency
that a hosted deployment (app and Supabase in one region) does not. Absolute milliseconds are
therefore inflated and must not become budgets. **Round-trip counts, duplicate requests, call
counts and payload bytes are architecture, not environment** — those are quoted as authoritative,
and every fix below was chosen because it removes round trips, not because it moved a local clock.

**The control-request host gate was disproven.** See `QUIET-HOST-RUNBOOK.md` §2. Under full CPU
saturation the control request got *faster* (p50 5.3ms at load 7.2 vs 9.1ms at load 2.5), because
an idle Apple Silicon host parks cores and drops clocks. It is now recorded as environment;
admissibility rests on counted criteria plus a max/median ≤ 1.5 dispersion check on the cell.

---

## 1. CLOSED — middleware asked the Auth server who the user was, on every request

| | |
|---|---|
| **Baseline** | middleware auth **377ms p50 / 404ms p90**, 48% of total API request time; 14,388ms across 30 requests; ~15x per Work Unit load |
| **Root cause** | `middleware.ts` called `supabase.auth.getUser()` — a remote Auth round trip — on every matched request, then DISCARDED the result for `/api/*`, where the route gate resolves identity independently. The route layer had already moved to local verification; middleware was never converted. |
| **Fix** | `getClaims()` (local WebCrypto signature verification), `getUser()` retained as fallback for symmetric keys / missing WebCrypto |
| **After** | **4ms p50 / 6ms p90**, 1% of request time, 134ms across 30 requests |
| **Certification** | positive + negative controls: authenticated stays (`mw-source=claims`); anonymous → `/login`, API 401; **tampered token → `/login`, API 401** (claims rejected it, proving verification is not a decode) |

Commit `3bb47e536`.

## 2. CLOSED — the process JWKS cache was per-route-bundle, so it never hit

| | |
|---|---|
| **Baseline** | `jwks_ms` **167–196ms on every call**, 6 per Work Unit load — a 100% miss rate |
| **Root cause** | The cache was a module-level `Map`. Next gives each route entrypoint its own module registry in a production build, so every server route held a separate copy. Middleware is one Edge bundle, so *its* copy worked (4ms) — which is exactly what disguised the scoping bug as a route-layer problem. |
| **Fix** | store on `globalThis` |
| **After** | `auth.session_resolve` **6 calls / 1,125ms → 1 call / 194ms** per cold load; **once in total** across three sequential loads on one warm process |
| **Certification** | per-phase `client_ms` / `jwks_ms` retained in the timing log — the aggregate alone actively concealed this |

Commit `953915f4b`.

## 3. CLOSED — the same scoping bug across the org-configuration caches

| | |
|---|---|
| **Baseline** | three caches documented as "process caches", each with a 90s TTL, each missing on **every** load well inside that TTL |
| **Root cause** | identical module-scope issue: `ORG_OP_TZ_PROCESS_CACHE`, `USER_DISPLAY_TZ_CACHE`, `STATUS_EFFECTIVE_CACHE`, `WU_QUEUE_DEF_CACHE` |
| **Fix** | `lib/perf/processCache.ts` — a `globalThis`-backed Map registry. Only the Map's *location* changes; TTL, keys, eviction, invalidation all stay with the caller. |
| **After** | over 3 sequential loads, one warm process: `orgs.industry_key_resolve` 2,585ms x3 → 1,876ms x2 · `status_definitions.merge_parallel_boot` 1,850ms x2 → 1,113ms x1 · `org_settings.metadata_for_timezone` 1,811ms x4 → 1,402ms x2 · `industry_defaults_select` 1,122ms x3 → 745ms x2 · **total server db time 14,182ms → 11,472ms (−19.1%)** |
| **Certification** | call-count reductions are counted evidence and load-insensitive |

Commit `6cbce4b99`. **Ceiling not reached** — several still resolve more than once per three loads.

---

## 4. CLOSED — the queue-definition preload existed and no caller passed it

| | |
|---|---|
| **Baseline** | `work_units.queue_definition_row` **x7, 355–757ms each, ~3.4s** on a cold Work Unit load, inside a `work-unit-queue-summaries` response of **4,960ms real server TTFB** — the largest single item on the cold critical path |
| **Root cause** | `getDepartmentWorkUnitQueueSummaries` accepts and consumes `workUnitPreloadById` ("avoids per-WU queue_definition refetch"). No caller supplied it, so each work unit ran its own single-row SELECT. The function already queries `work_units` for the department — it just selected `id`. |
| **Fix** | widen that one select to the columns the preload needs and build the map in the shared owner, so every caller benefits |
| **After** | `queue_definition_row` **x7 → x0**; summaries cold **4,500ms → 3,611ms (−20%)**; warm unchanged (~2.8s) |
| **Certification** | /workspace counts unchanged (Waitlist 15, All 1, rest 0), 15 rows, 7 pills, 5 cards, same subject, no 5xx |

Commit `6aaa05578`. Warm is unchanged because `WU_QUEUE_DEF_CACHE` already absorbed loads 2+. It
matters more in production than locally: on serverless the process cache often does not survive
between requests, so those 7 round trips were paid far more often there.

## 5. CLOSED by evidence — D-3 / R-018 sibling prewarm is NOT a critical-path cost

The prewarm is real and confirmed: Work Unit entry fetches **5 sibling provisioning answers**
(`new_leads`, `new_work_view_2/3/5/6`), 10KB each plus one at 106KB.

**They fire at 28,677ms. `wu_surface` is at 15,560ms.** The prewarm begins ~13 seconds *after* the
surface is usable — it is an idle prefetch with **zero critical-path cost**. The mission's rule is
to keep prefetch whose benefit exceeds its critical-path cost; that cost is zero here.

**No A/B was run and none is warranted.** Removing it could only lose the warm benefit the
historical note recorded (~46ms on record-switch) and could not recover critical-path time that is
not being spent. D-3 / R-018 is closed against current production evidence, not deferred.

## 6. CLOSED by evidence — D-4 `family-workspace` x2 is two scopes, not a duplicate

Both calls are real (36KB each), but they carry **different cache keys**: one unscoped, one
thread-scoped (`thread_id`). The unscoped fetch lands at 15,549ms (before the surface); the
thread-scoped one at 20,080ms (**after** it). This is "load the workspace, then load it scoped to
the selected thread", which is a product behaviour, not accidental duplication.

`metrics/resolve` x2 on `/workspace` remains genuine waste: two callers request overlapping key
sets, re-resolving 3 of 4 keys. Kept open as O-4.

---

## Combined effect

**Warm API request** (same probe, same host, prod build, 30 requests) — this is the operator's
actual steady state:

| | baseline | after §1 | after §2+§3 |
|---|---|---|---|
| request total p50 | 785ms | 394ms | **383ms (−51%)** |
| middleware auth p50 | 377ms | 4ms | **4ms (−99%)** |
| auth share of request | 48% | 1% | **1%** |

**Cold Work Unit** (`/workspace/work-unit/waitlist?subject_id=…`, n=4, run 1 discarded, host
qualified before and after both cells):

| phase | before | after | delta |
|---|---|---|---|
| TTFB | 4,193ms | 4,484ms | +6.9% |
| responseEnd | 7,541ms | 7,460ms | −1.1% |
| **wu_surface / fp_boundary** | **11,044ms** | **10,717ms** | **−3.0%** |
| route_meta_ms | 2,528ms | 2,240ms | −11.4% |

**Reported plainly: cold first paint barely moved.** A cold process cannot benefit from a warm
cache, and its first request still pays one JWKS fetch. Cold is gated by the document path —
`route_meta` ~2.2s plus ~3.0s of streaming plus ~3.2s of client work — not by the API fan-out
these fixes address. The win is on warm interaction, which is Surfaces 4–9.

---

## Cold critical path as it now stands

```
0 ────────── 4.5s ────────── 7.5s ─────────── 10.7s
  middleware auth (cold)      streaming/RSC     client hydrate
  + route_meta 2.2s                             + provisioning-answer 3.1s
                                                → wu_surface / first Focus Panel
```

`route_meta` is `loadAdminRouteGate` → `fetchWorkUnitsForSlugResolution` →
`fetchDepartmentsForSlugResolution`, three **serial** round trips (the departments fetch genuinely
depends on the work-units result).

---

## OPEN — measured, not yet fixed, ranked

| # | Item | Current evidence |
|---|---|---|
| O-1 | `auth.cached_user_hydrate` ~490ms **per load** | `loadAdminAuth` calls `getCachedAuthUser()` purely to populate `user` after it already holds `userId`. Repo-wide only `.id` (22 sites) and `.email` (12) are ever read — both present in the already-verified claims. A remote round trip per load for two fields we hold. |
| O-4 | `metrics/resolve` x2 on `/workspace` | Two callers request overlapping key sets; 3 of 4 keys are re-resolved. See §6 — the `family-workspace` half of D-4 is closed. |
| O-5 | Drawer opportunity VM = **173–178KB, 11.5s** | Larger than the 128KB carried figure, and it starts at `wu_surface` and lands ~11.5s later, so it gates Focus Panel content. Now the single biggest remaining critical-path item. Compose/transfer/parse split still unattributed. |
| O-6 | Two AI capability probes on the cold critical path | `ai/workflow-assist/capabilities` and `ai/config-layout-assist/capabilities`, 2.1–3.2s each, gating nothing the operator needs |
| O-7 | Card focus produces **CLS 0.225** | Clicking the `active-work` card shifts layout by 0.225 — "poor" by web-vitals thresholds. Surface 11 (motion) evidence; no timing fix will mask it. |
| O-8 | `/workspace` issues **19 API requests** to first useful state | Includes both `metrics/resolve` calls and two `departments/{id}/…` calls |

## BLOCKED — Surface 5 cannot be measured on the only work view with data

The Firefly tenant's queues: **Waitlist 15 rows, All 1 row**, every other work view 0.

Clicking any Waitlist row acknowledges the row in **~125ms** (`data-queue-row-active` flips,
latest-click-wins holds on the row) but the Focus Panel subject **never changes**. Each click
404s on `/api/admin/view-models/drawer/opportunity/<row entity id>`, and those ids resolve as
**neither opportunity, child, nor person** — all three drawer grains return 404. `assertRowOrg`
on `opportunities` is what rejects them, so the row identity is a grain with no Focus Panel
destination.

This is a correctness question, not a performance one, and this sprint is explicitly not a
correctness sprint — recorded here because it blocks Surface 5 (queue row → Focus Panel), the
mission's most frequent interaction, on the only work view carrying real data. **Surfaces 5, 6, 7,
8 and 9 remain unmeasured for this reason.**

Two of the 404'd ids were never clicked, so something also **prefetches drawer VMs speculatively**
for rows that cannot resolve.

## Tooling defects found and fixed on the way

- The quiet-host gate could never pass: it counted the measurement server as a competitor, its
  first control sample was an unacknowledged warm-up, and its central statistic is anti-correlated
  with load. Commit `b161cefd2`.
- `ALLOY_PROD_CERT_DIST=1` did not isolate the build. Next rewrites the **tracked** `next-env.d.ts`
  to the active distDir, and `tsconfig` includes `.next/dev/types`, so a stale dev validator from
  2026-08-17 referencing a deleted `adminV2` route failed the production build with a type error
  unrelated to the source tree. `scripts/pe3ProdBuild.sh` handles both.
- Spotlight indexed each fresh build at >100% CPU for minutes, disqualifying the host on the very
  gate needed to remeasure the change just built. Build output is now marked
  `.metadata_never_index`.
- `pe3InteractionHarness.mjs` (new) drives Surfaces 4–9. Two instrumentation bugs were found and
  fixed *before* any number was quoted: an unguarded MutationObserver meant every mark collapsed
  onto the settle timeout, and predicates that were not target-relative stamped the PREVIOUS
  subject at ~2ms, making every surface look instantaneous.
- The validation broker pins `--max-old-space-size=4096` for typecheck while `package.json` uses
  8192; typecheck OOMs (rc=134) on this tree. Pre-existing; the broker lives in another worktree.
