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

## WAVE 3 — identity commits from the click; the read path stops repairing per child

## 10. CLOSED — row -> Focus Panel identity waited 11.9s for data the client already had

**The identity was never missing.** Every child-grain queue row carries canonical `QueueRowContext`:
`row_subject.display_name` ("Wrigley Kurzman"), `subject_type: "child"`, `subject_id`, `stage_key`,
`image_url`, `row_status_label`, and `case_context.case_id` as the family settlement anchor.
`opportunityQueuePreviewSeedFromRowContext` already turns that into the seed the panel itself calls
"INSTANT-IDENTITY".

It was keyed on the **committed** Record of Attention, so it was only instant on cold open. On a row
-> row switch the committed subject does not move until the provisioning answer lands. The seed is
now keyed on **live attention (K1)**, which moves on the click, and the header prefers it over the
answer's identity truth — which is also latest-click-wins applied to identity.

| | before | after |
|---|---|---|
| T1 row selected | ~150ms | 108-187ms |
| **T2 correct identity** | **10,799-12,071ms** | **108-187ms** |
| T3 primary usable | after T2 | 108-187ms |
| T4 fully hydrated | after T2 | 108-187ms |

**Atomic subject coherence preserved.** The header names the child (Attention); the body renders the
family opportunity (Settlement) — the certified composition. They can only disagree when the body is
HOLDING a payload across a settlement change (a different FAMILY); there the prior subject still owns
the header, so one child's name never appears over another family's cards.

**Verified the body is not stale under the new header:** every card is family-scoped and identical
across children (ASSIGNMENTS "15 children", HOUSEHOLD "Kurzman household", CHILDREN "15 children ·
2 waitlisted", BILLING PREVIEW) and NOTHING changed between 1.2s and 17s after a click.
Latest-click-wins verified under three rapid patterns (A->B at 60ms, A->B->A->B at 40ms, C->A) —
newest intent won every time. Commit `525089ef9`.

**RESIDUAL RISK for Kelly:** WHAT'S NEXT is child-scoped stage work and still arrives with the
provisioning answer. Every child in this tenant shares one stage, so a differing stage-work card
cannot be observed here. If two children of the SAME family sit at different stages, that one card
would trail the header. Choosing between reserving the cell and holding it is a reveal-doctrine
decision, not a performance one.

## 11. CLOSED — ensure_candidates: bulk, with semantics proven unchanged

**Ownership answers.** The invariant is that every waitlisted child has a `placement_candidates` row
keyed `pc_v1_pi:{opportunity}:{member}:{cohort}`; without it the rank renders "—". A cohort change
(programKey or DOB) makes the key move. **Two mutations already maintain it** —
`updateOpportunityCustomerMemberLifecycleStatus` and `stageOutcomeRuleTargetExecutor` — so the read
path was a third, redundant net. **It does not gate membership:** membership is process-instance
owned ("Membership stays PI-owned; ranking authority is placement_candidates + overrides"), so it
affects only the rank column.

Repair semantics were NOT changed. `derivePlacementCandidateSeedRow` is now THE ONE definition of a
candidate's seed key and row; the per-child hook derives through it unchanged (mutations unaffected),
and a new bulk form reads the same facts in 4 concurrent queries and inserts exactly the children
whose seed key is absent. Duplicating the derivation was deliberately avoided — a second definition
is what produced 13-vs-8 here, and a drifted copy would silently stop repairing children.

| scenario | before | after |
|---|---|---|
| candidate already correct | skip | skip |
| candidate missing | insert | insert |
| child cohort changed | insert (new key) | insert (new key) |
| candidate on previous cohort | insert new | insert new |
| partially created | hook's own existence check | unchanged |
| concurrent readers/mutations | insert path unchanged | pre-filter can only err toward MORE work |

  ensure_candidates  1,772-2,480ms -> 355-367ms warm (711ms cold)

**Proven against real data, not by inspection:** the bulk pass reports `created: 0,
skipped_existing: 15` — every seed key it derived matched a stored key exactly; any drift would have
inserted instead. Ranks still render on all 15 rows ("1 / 12", "2 / 12", …), no "—". Commit `73e6a3bbb`.

## Provisioning answer — cumulative

| | wave-1 baseline | wave 2 | wave 3 |
|---|---|---|---|
| composition_ms | 8,241ms | 5,339ms | **3,853ms (−53%)** |
| total_ms | 10,003ms | 7,050ms | **5,588ms (−44%)** |

## Cold Work Unit (bare path) — cumulative, all cells gated before AND after

| phase | baseline `c9ce324fa` | wave 2 | wave 3 | total |
|---|---|---|---|---|
| TTFB | 4,360ms | 3,936ms | 3,915ms | −10.2% |
| stream complete | 16,142ms | 12,612ms | 11,609ms | −28.1% |
| **first usable surface** | **16,200ms** | 12,672ms | **11,666ms** | **−28.0%** |
| fully hydrated | 30,298ms | 24,821ms | **24,175ms** | −20.2% |

max/median 1.05 on first usable.

### Re-ranked: what gates cold FIRST USABLE now

Everything else finishes earlier than the document. `work-unit-queue-summaries` completes at
~10.4s and `queue-view-totals` at ~13.2s, both before `wu_surface` at 11.7s, so **first usable is
gated entirely by the streamed document**:

```
0 ──── 3.9s ─────────────────── 11.6s ── 11.7s
  mw auth 1.6s (cold only)       stream    first usable
  + route_meta 2.1s              7.7s
```

Ranked by contribution to FIRST USABLE (not aggregate DB time):

| rank | span | ms | note |
|---|---|---|---|
| 1 | seeded provisioning compose (in-stream) | ~7.7s | child_grain_members 1.4s · waitlist 2.5s · inquiry 0.7s · projection 1.4s |
| 2 | route_meta | 2.1s | gate -> work units -> departments, genuinely serial (departments needs the work-unit ids) |
| 3 | middleware auth, cold process only | 1.6s | one JWKS fetch per process; already 4ms warm |
| — | AI capability probes, queue summaries, queue-view-totals | — | complete before the document; contend for connections but gate nothing |

---

## WAVE 2 — the Waitlist "block" was a harness error, and cold had never been measured

### The reconciliation: the product works; the harness read the wrong contract

Wave 1 reported Surfaces 5-9 as BLOCKED because clicking a Waitlist row never changed
`data-inline-focus-panel-subject`. **That conclusion was wrong.** A human clicking Lennon/Wrigley
on current staging gets the correct child: the panel header goes "Lennon Kurzman" -> "Test
Process5" -> "PassA Kid", `resolved: true`, `error: false`.

`data-inline-focus-panel-subject` carries a settlement anchor and does NOT follow the selected row
— it stays pinned to one family opportunity (`d097e1a8`) across every child. The only attribute
that tracks identity is the Focus Panel HEADER TEXT. Reading the wrong contract made a working
surface look broken, and the accompanying 404 made the misreading look corroborated.

The 404 on `/api/admin/view-models/drawer/opportunity/<row id>` is real but is NOT the panel's
data path — the panel resolves from the provisioning answer. It is a failing speculative fetch the
product tolerates: ~1.4s of wasted server work per row click, and 10 console errors per session.
Recorded as O-9, not a functional break.

**Harness corrections made before any number was quoted:** signals re-based on the header
contract; an instrumentation assertion that fails loudly if the init script does not install;
route navigation measured with Navigation Timing (a full navigation destroys the in-page observer,
which had produced four blank Organization rows); and the settle window raised, because it was
SHORTER than the product's own latency — which is how the "never commits" reading arose.

### The defect that was actually there: 11-12s to change subject

| point | measured |
|---|---|
| T1 row highlight | **~150ms** |
| T2 subject identity visible | **10,799 / 11,751 / 12,071ms** |

The row acknowledges immediately, then the operator reads the PREVIOUS child's Focus Panel for
eleven seconds. Root cause: `provisioning-answer?subject_id=…` takes ~11.9s and the header commits
at 12,071ms — immediately after it resolves.

### Where the provisioning answer's time goes

`ProvisioningTimings` is already in the payload; `composition_ms` was 8.2s of a 9.9s answer and
named nothing inside itself. Added sub-spans:

| span | before | note |
|---|---|---|
| child_grain_waitlist | 4,482ms | of which ensure_candidates ~2.1-2.5s, bulk_candidates ~1.07s, household_facts ~1.05s, location_categories ~0.35s |
| child_grain_avatar | 2,236ms | reads only `subjectId` — no placement dependency |
| child_grain_members | 1,384ms | full projection (deliberate: a cheaper count is a second definition of membership) |
| child_grain_inquiry | 698ms | genuinely depends on placement |

All four ran **serially**, summing to ~8.8s ≈ the whole of composition.

## 7. CLOSED — child avatars resolved behind placement for no reason

Avatar reads only `row.subjectId` (member -> person -> photo, one batch) and touches no placement
field. It now starts before the placement chain and joins after inquiry, on COPIES — the avatar
step mutates rows in place and placement can expand one child into several candidate rows, so
mutating the shared input would write onto objects the final page no longer contains. The merge
re-applies by `subjectId`, the same key the avatar step uses internally.

  composition_ms  8,241ms -> 5,877ms (-29%) · total_ms 10,003ms -> 7,602ms (-24%)

**R-019 verified after the change:** exactly Wrigley and Lennon Kurzman carry avatars, 2 distinct
signed URLs across 2 rows (1:1, no cross-child leakage), other 13 rows none. Commit `fcb12d0ec`.

## 8. CLOSED — org category config was serialised behind placement candidates

`loadLocationProgramCategoriesForOrg` is org configuration that depends on neither candidates nor
household facts, yet sat third in a serial chain and was re-read every answer. Now 90s
process-cached (matching its sibling org-config caches, held via `processMap`, callers get a copy)
and started concurrently.

  child_grain_waitlist 4,482ms -> 3,917ms · composition 5,877ms -> 5,339ms · total 7,602ms -> 7,050ms

Cumulative: **composition 8,241ms -> 5,339ms (-35%), total 10,003ms -> 7,050ms (-30%)**. Commit `8005da8a1`.

## 9. CLOSED — child work-view counts were counted one lens at a time

`queue-view-totals` awaited `countChildGrainMembersForLens` inside a `for` loop; each call runs a
full projection, so the cost multiplied by the number of child lenses. Now concurrent, each view
keeping its own try/catch so a failing lens still yields UNKNOWN for itself.

  /api/admin/queue-view-totals 3,082-3,802ms -> 2,483ms

Counts verified unchanged on /workspace and the pills. Commit `3670502ff`.

---

## PRIORITY 1 RESULT — cold Work Unit, on the path an operator actually takes

**Wave 1's "~10.7s cold, -3%" was measured on the DEEPLINK path, which short-circuits
provisioning** (`?subject_id=` for an opportunity outside this queue returns a 1KB answer in 1.7s
instead of a 203KB answer in ~10s). The bare path — what an operator gets by clicking into a Work
Unit — had never been measured.

Clean A/B, same host, **both cells host-qualified before AND after**, n=4, run 1 discarded,
max/median ~1.01:

| phase | baseline `c9ce324fa` | current | delta |
|---|---|---|---|
| TTFB | 4,360ms | 3,936ms | −424ms (−9.7%) |
| stream complete (responseEnd) | 16,142ms | 12,612ms | **−3,530ms (−21.9%)** |
| **first usable surface** | **16,200ms** | **12,672ms** | **−3,528ms (−21.8%)** |
| first truthful card | 16,200ms | 12,673ms | −3,527ms (−21.8%) |
| **fully hydrated** | **30,298ms** | **24,821ms** | **−5,477ms (−18.1%)** |
| HTML document | 300,192 bytes | 300,318 bytes | unchanged |

Cold Work Unit has moved materially — but **12.7s to first usable is still nowhere near Grade A.**

### The cold critical path as it now stands

```
0 ─── 3.9s ────────────────── 12.6s ──── 12.7s ─────────── 24.8s
  mw auth 1.6s (cold only)     stream     first usable      fully hydrated
  + route_meta 2.1s            8.7s       surface
```

The dominant cost is the **8.7s streamed document (300KB)**: the layout deliberately AWAITS the
seeded provisioning compose rather than streaming it, because a pending RSC promise crashes
hydration in Next 16 and a client-gated stream cannot deliver the seed earlier — both were
measured and reverted previously. So the way to move cold is to make the compose itself cheaper,
which is what §7-§9 do. That trade is certified architecture and is not being reopened.

---

## OPEN — measured, ranked, not yet fixed

| # | Item | Evidence |
|---|---|---|
| **O-10** | `ensure_candidates` **~1.8-2.2s per answer** — LARGEST remaining span | Calls an idempotent per-child lifecycle hook for all 15 rows on a READ path; each makes 4-6 serial round trips (opportunities, process_instances, customer_members, optional category, existence check) almost always to conclude the candidate already exists — ~75 queries per answer. **NEEDS KELLY:** the existence key is `pc_v1_pi:{opportunity}:{member}:{cohort}` and the cohort is only known AFTER those reads, so any bulk pre-filter changes WHEN placement data is repaired for a child whose cohort moved. That is a decision about repair semantics, not performance. |
| O-9 | Drawer VM 404 per row click | ~1.4s wasted server work + 10 console errors/session; not the panel's data path |
| O-11 | `POST /api/admin/actions/execute` takes **10,271ms** on cold load | Fires at 13.3s, off first-paint, but 10s of server work on a page load |
| O-1 | `auth.cached_user_hydrate` ~490ms/load | Only `.id` (22 sites) and `.email` (12) are read; both in the verified claims |
| O-5 | Drawer opportunity VM 173-178KB / 11.5s | Not the Focus Panel's gate (provisioning is) — reclassified |
| O-6 | 2 AI capability probes on cold path, 1.8-2.1s each | Gate nothing the operator needs |
| O-7 | Card focus CLS **0.225**, Message command CLS 0.184 | "Poor" by web-vitals; no timing fix masks it |
| O-12 | `/organization/processes` pulls **2,853KB over 28 requests** | Largest config-page payload by far |

---

## Surfaces 4-10 — T1 acknowledgement vs T3 primary usable

Warm, prod build. **T1 is uniformly excellent; T2/T3 is where Alloy is not Grade A.**

| interaction | T1 ack | T2 identity | T3 usable | T4 hydrated |
|---|---|---|---|---|
| Work View switch (empty lens) | 121-162ms | 137ms | — | — |
| Work View return (with data) | 51-56ms | 51-56ms | 51-56ms | 237-248ms |
| Work View return (cold-ish) | 1,670-2,683ms | same | same | 1,893-2,901ms |
| **Queue row -> Focus Panel** | **105-165ms** | **10,799-12,071ms** | after T2 | after T2 |
| Card focus (active-work) | 2,235ms | — | 2,235ms | 2,235ms · **CLS 0.225** |
| Command: Manage | 51ms | — | 51ms | 51ms |
| Command: Message | — | — | — | **CLS 0.184** |
| Organization home (cold route) | TTFB 2,146ms | FCP 2,180ms | domInteractive 2,268ms | 18 req / 183KB |
| Organization locations (warm) | TTFB 382ms | FCP 408ms | domInteractive 1,800ms | 20 req / 185KB |
| Organization processes (warm) | TTFB 361ms | FCP 396ms | domInteractive 1,440ms | 28 req / **2,853KB** |
| Organization home (return) | TTFB 379ms | FCP 412ms | domInteractive 1,403ms | 19 req / 184KB |

Organization warm navigation is genuinely good (TTFB ~380ms, FCP ~410ms). Surfaces 8 (dropdown)
and 9 (save) are still unmeasured — the dropdown probe found no `[role=combobox]` on the Focus
Panel summary surface, and no safe reversible write has been exercised yet.

---

## WAVE 1 — combined effect

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
