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

## WAVE 10 — the reveal gate was guilty; child Mission ~30x

### Priority 1 — gate PROVEN guilty

`log()` in the prewarm scheduler is gated on `perfDevDetailEnabled()`
(`NODE_ENV !== "production"`), so it emits nothing in the build these measurements run against —
exactly the build where the gate needed proving. A production-visible timeline was added. On a real
Lennon ↔ Wrigley switch:

```
57128ms subject_warm_emitted     active=false     <- the warm path works
64254ms begin                    active=true
64284ms subject_warm_suppressed  active=true
64284ms subject_warm_suppressed  active=true
   ...and NO `end` event, ever.
```

**Root cause.** The commit-time arm keyed on `target::subject`, so every child-to-child switch fired
a fresh `beginWorkUnitPrimaryReveal()`. Its paired `end` lives in `useRecordWorkRuntime`, which ends
the window when the selected subject's VM is APPLIED — but a child-to-child switch inside one family
reuses the family Settlement runtime, so no VM fetch occurs, no apply happens, and no `end` runs.
The scheduler's own law — *"prewarm can never stall"* — was violated.

**Fix at the shared lifecycle**, no Waitlist escape hatch: the window defers the prewarm storm that
follows a WORK UNIT commit, which is a property of committing a Work Unit, not of moving Attention
between children of one family. Arming on the TARGET restores a cycle that closes.

### Then, and only then, the pinned window mattered

With the gate released the EXISTING preparation began emitting for the first time (+2 → +10 requests
per switch) — but the Mission did not move, because the ±2 window was still pinned to row 0: its
anchor matched `drawer_open.entity_id`, which every child row shares. Anchoring on live attention
(K1) makes the window follow the operator.

| selection | Mission before | Mission after |
|---|---|---|
| rows[6] (neighbour) | 6,818ms | **233ms** |
| rows[4] (neighbour) | 7,739ms | **209ms** |
| rows[1] (near entry anchor) | 216ms | 232ms |
| rows[5] (first visit, genuinely unprepared) | — | 6,545ms |

**~30× on the child Mission gap, for every prepared row rather than only rows near the entry
anchor.** Cost: subject-related requests 24 → 58 per session.

**Only one of the three reverted findings was reintroduced** — the pinned window — because only it
moved the number once the gate released. The `entityType` type/runtime divergence and the one-shot
idle warm remain unreintroduced, still recorded as smells.

### Preserved

Prepared entry first usable **393ms** (was 412ms — unchanged), T1/T2 identity 131–233ms, grid cells
5, avatars exactly Wrigley and Lennon with 2 distinct URLs, 6 pills, workspace counts unchanged,
latest-click-wins holds, no 5xx. **focusPanel 125/125** — the child-mission reveal contract still
passes, so a prepared Mission commits only when the answer is for the attended child.

Pre-existing failures proven by direct A/B (edits reverted vs restored — identical
`5 failed | 19 passed`): `drawerVmPrewarmScheduler` expects `begin` to no-op when
`ALLOY_OS_RUNTIME_ENABLED` is false, but the function has no flag guard at all;
`workUnitOperationalReveal` is source-inspection over a page file this change does not touch.

---

## WAVE 9 — CLS closed, Work View met, queue-subject blocker isolated

### Priority 3 — initial-load CLS: CLOSED

| path | CLS | entries |
|---|---|---|
| **prepared (operator journey)** | **0** | **0** |
| direct URL entry | 0.1829 | 3 |

**On the operator path there is no layout shift at all.** Readiness eliminated it.

The direct-path 0.1829 is attributed, and it is not a surface-composition defect: **97% of it is one
element**, `div.adminv2-bos-rail-overlay`, resizing at **t = 22,187ms** (244x716 → 164x740) — long
after first usable. The remaining three entries total 0.005. Not shell, queue, Focus Panel, cards,
avatars, or fonts.

Classified **"other — late overlay geometry settle"**, on a path operators do not take, after the
operator would already be working. Recorded for the rail's owner; no fix taken here, and no
animation added to hide it.

### Priority 6 — Work View readiness: TARGET ALREADY MET, no change needed

Prepared entry, switching between the two views that hold data:

| switch | pill | queue | identity | cards | hydrated | prep |
|---|---|---|---|---|---|---|
| → all | 265 | 265 | 265 | 265 | — | +0 |
| → waitlist | 336 | 336 | 336 | 336 | **336** | +2 |
| → all (warm) | 271 | 271 | 271 | 271 | — | +0 |
| → waitlist (warm) | 347 | 347 | 347 | 347 | **347** | +0 |

All inside the <500ms target, everything committing at the same instant (atomic reveal), and
**`prep+0` on most switches** — the Workspace idle preparation already covers Work View answers,
because the prepared destinations ARE the Work Views. **No new preloader was needed or added.**

### Priority 7 — queue-subject readiness: BLOCKER ISOLATED, no fix kept

Identity is premium everywhere. The gap is the child-scoped Mission card:

| selection | T1 | T2 identity | T3 cards | Mission commit | reserved |
|---|---|---|---|---|---|
| rows[1] (near entry anchor) | 216 | 216 | 216 | **216** | no |
| rows[5] | 143 | 143 | 143 | **7,293** | yes |
| rows[6] (neighbour of 5) | 122 | 122 | 122 | **6,504** | yes |
| rows[4] (neighbour of 5) | 152 | 152 | 152 | **7,329** | yes |

Rows near the ENTRY anchor commit their Mission in ~216ms; everything else waits 6.5–7.3s. So
neighbour preparation works — but the window never moves.

Three defects were found and each was verified NOT to be the operative blocker:

1. **The window is pinned to the entry anchor.** The anchor matches `selectedSubjectId` against the
   row id *or* `drawer_open.entity_id`. On a child-grain queue every row shares one
   `drawer_open.entity_id` (the family) and the settlement subject IS that family id, so the match
   always lands on row 0.
2. **Child-grain rows are excluded entirely.** The neighbour guard tests
   `entityType === "opportunity"`, while the provisioning answer emits `entityType: "child"`.
   (`QueueRowModel.entityType` is typed `"opportunity" | "job" | "schedule"` — a real type/runtime
   divergence, recorded, not widened inside a performance sprint.)
3. **The warm is dropped, not deferred.** `prewarmSubjectDestination` correctly refuses while the
   primary reveal is active, but the effect fires once on an idle callback with no retry, so a
   reveal in progress at that moment skips every neighbour permanently.

Fixes for all three were implemented, built and measured. **None moved the number, and the
subject-related request count never rose (24 → 24), meaning no additional preparation fires at
all.** That points upstream — most likely `isWorkUnitPrimaryRevealActive()` never releasing on this
path, since a child-grain switch reuses the family record runtime and may never run a begin/end
cycle. **All three were reverted** rather than kept unproven; they are documented here so the next
pass starts from evidence instead of repeating them.

**Next step is to instrument the reveal flag itself**, not to add more preparation.

---

## WAVE 8 — readiness policy settled; Surface 9 measured

### Priority 1 — readiness policy: KEEP the current bounded idle set

Three operator behaviours against one build (policy compared by behaviour, not by code change):

| policy | prep before click | target prepared | first usable | fully hydrated |
|---|---|---|---|---|
| control — click as soon as tiles paint | 1 | no | 8,482ms | 16,441ms |
| **hover** the tile, 2.5s settle | 6 | **yes** | **4,035ms** | 14,491ms |
| **idle** 30s settled | 9 | yes | **395ms** | **395ms** |

**The decisive finding: preparation must COMPLETE, not merely start.** Hover marked the target
"prepared" and still took 4,035ms — the answer was in flight, not warm. A provisioning answer takes
~5-6s warm, so lead time, not request count, is the scarce resource. Typical hover-to-click gives
~2.5s and cannot cover it.

**The bounded set is coverage, not waste.** Two different prepared destinations both land
sub-400ms:

  waitlist  395ms      all  314ms

Whichever visible destination the operator picks is warm. Narrowing to "active/default only" would
leave the other five at ~8s, and hover cannot substitute. (`registration` / `tours` report null
because they hold 0 rows, so the harness's "usable" predicate cannot fire — a harness limit, not a
product failure.)

**Recommendation: keep policy A.** The honest refinement is not narrowing the set but protecting
lead time.

### Priority 2 — Surface 9 (Save): MEASURED, with a full reversible round trip

Sanctioned field: Lennon → Children drill-in → Special Instructions, routed through
`identityInlineChildSave` to `/api/admin/customer-members/…`.

| phase | write | restore |
|---|---|---|
| Edit → control | 13ms | 14ms |
| **T1 visible acknowledgement** | **83ms** | **77ms** |
| **T3 local/card convergence** | **84ms** | **77ms** |
| T2 server completion | **3,238ms** | 3,100ms |
| T4 durable reload agreement | proven (`perf-probe-…` present) | proven (back to "—") |

**Acknowledgement and convergence are premium** — sub-100ms, and the UI converges *before* the
server responds, then reconciles. No full card reset, no false success, no jarring refresh.

**The item to fix is T2: ~3.1-3.2s server completion** on the shared child-scoped mutation owner.
Per the standing rule that is the shared mutation/projection owner's cost, not the field's.

**Firefly left exactly as found**, verified by reload: Allergies / Medical Notes / Special
Instructions all "—".

#### Two harness errors worth remembering

Both produced plausible but FALSE results before being caught:

* Setting `el.value` + dispatching `input` does not reach a React controlled input. The field
  committed UNCHANGED and the run reported a clean `200` with credible timings — **a no-op save
  measured as a real one**. Only `persisted=false` on reload exposed it.
* Binding the Edit control by ancestor text matched a container holding several fields and returned
  the WRONG control; the mutation went to `/api/admin/persons/…`, a person-scoped field. Correct
  binding is document order from the deepest short label match.

---

## WAVE 7 — readiness made live: the operator journey is now sub-second

### CORRECTION to wave 6

I reported "0 preparation requests — the architecture is inert". **Wrong on both counts.** One
request fires BEFORE the tiles paint (the eager primary warm) and my probe started counting after
that point. The architecture runs; it was preparing the wrong destination.

### Root cause

This Workspace renders **one process card** whose CTA is `/work-unit/new` (the process default,
0 rows) plus **six Work View rows** — the destinations an operator actually clicks.
`processEntryHrefs` was built from `processes[].entryHref` alone, so it held ONE href, `rest` was
empty, and the idle block returned early **by design**. Exactly one destination was ever prepared,
and not one the operator uses.

`WorkViewLinkModel.href` already carries the canonical destination hrefs — the same href the click
navigates to and the same URL K2 consumes. They now join the bounded readiness set. No new
preloader, no new fetch path, no hardcoded routes.

### A/B — canonical operator journey, same build

`/workspace` → click the Waitlist tile:

| | control (click at once) | prepared (30s idle) |
|---|---|---|
| **first usable** | 6,693ms | **412ms / 408ms** |
| **fully hydrated** | 17,617ms | **412ms / 408ms** |
| preparation requests | 1 | 9 |

**16× to first usable, 43× to fully hydrated**, reproducible across two runs. The prepared entry
arrives COMPLETE — 15 rows, 5 truthful cards, correct header — not a skeleton.

Preparation requests are the canonical URLs K2 consumes:

```
/api/admin/work-units/{new,active-pipeline,registration,waitlist,tours,all}/provisioning-answer
/api/admin/view-models/drawer/opportunity/{d097e1a8…,93722453…}
```

### Correctness on the prepared path

T1/T2 **98–127ms** (no regression), grid cells constant at 5, the child-mission reveal contract
still engages (`preparing: ["current_work"]`), avatars still exactly Wrigley and Lennon, no 5xx.
Workspace's own usable time unchanged within variance (11,299ms control vs 10,072–11,779ms).

---

## The three performance classes, now separated

| path | measured | operator relevance |
|---|---|---|
| **true cold / direct URL entry** | **11,708ms** | diagnostic; no operator takes it |
| Workspace → Work Unit, no preparation | **6,693ms** | canonical journey control |
| **Workspace → Work Unit, prepared** | **412ms** | **primary operator experience** |

## Re-ranked cold architecture options

| Lever | Blocking span | Removable operator wait | Risk | Complexity | Recommendation |
|---|---|---|---|---|---|
| **C — preload/readiness** | the whole journey | **6,693ms → 412ms** | low (same canonical owner, bounded, deferred) | low (one dataflow correction) | **DONE — keep** |
| A — first-use document boundary | ~7.7s stream on true cold | up to ~7s, but only on direct entry | high (hydration; streaming already measured and reverted) | high | **Deprioritise** — C removed its operator relevance |
| B — placement materialization | ~2.1s inside the compose | only on true cold | medium (write-path, repair semantics) | high | **Not justified** on current evidence |

**Option A is no longer required to reach the premium target for the operator journey.** It remains
the lever for true-cold direct entry, which is a diagnostic class, not the operating experience.

### Open tuning question — the §7 tension

`deployedAcceptanceWiring` §7 guards against an "eager Work Unit route-prefetch storm". That guard
is about Next viewport/route prefetch on links, which this change does not touch — but its spirit is
"do not warm every visible destination". This warms all six visible Work Views on idle: **9
background requests per Workspace visit, of which 1 of 6 destinations was used** in the measured
run. The cap bounds a large organization but selects by visible order, not by likelihood.

Whether the policy should narrow (active/most-likely view only, or hover-biased) is the tuning
question. It should be answered with the A/B above in hand — the benefit is large enough that
narrowing must be justified by measured waste, not assumed.

---

## WAVE 6 — Option 3 accepted; Priority 7 measured

Kelly accepted the ~11.7s cold baseline and redirected to Priority 7. Two findings from the brief
architecture pass are recorded first because they change what accepting that baseline costs.

### FINDING — the readiness architecture already exists, and it is INERT

Option C classes 1-3 are already built:

* `lib/runtime/kernel/workUnitProvisioningPrefetch.ts` — warms the EXACT provisioning-answer URL K2
  consumes (same canonical owner, 60s TTL, deduped, errors never cached);
* `ProcessSummaryCard` — hover/focus warm on each Work Unit tile;
* `useWorkspaceSurfaceRuntime` — idle preparation of up to 6 visible entry hrefs, eagerly warming the
  PRIMARY destination and **chaining that answer's default subject's complete VM** off the same
  answer, explicitly so "entering the first work unit commits from a warm provisioning answer AND
  reveals a complete Focus Panel with no cold fetch".

**Measured on /workspace: 0 preparation requests in 25 seconds of idle.** The architecture does not
run. It is gated on `processEntryHrefs`, built from `visibleProcessSnapshot.processes[].entryHref`,
and returns early when that string is empty — the most likely cause, since the rendered tiles do
carry hrefs.

### FINDING — the cold number depends on which path you measure

| path | first usable |
|---|---|
| direct URL entry (what the cold cell measures) | **11,708ms** |
| operator journey: /workspace → click the tile | **8,458ms** |
| /workspace itself usable | 11,835ms |

The cold cell navigates directly to the work-unit URL, which bypasses workspace idle preparation,
tile hover warm, and the K1 entry gesture (which commits in place rather than performing a document
navigation). It measures a path an operator does not take. **If the idle preparation were working,
the journey number is the one that would move.**

---

## Surface 8 — dropdown / editing: MEASURED, meets the bar

Canonical `AlloySelect` (`button[aria-haspopup="listbox"]` → `[role="listbox"]` → `[role="option"]`),
Site filter on the Work Unit surface, 3 passes:

| interaction | measured |
|---|---|
| dropdown → menu committed | 90ms cold, **25-30ms warm** |
| dropdown → options usable | same instant (25-90ms) |
| **network to open the dropdown** | **0 requests** |
| selection → local acknowledgement | 128-262ms |
| Edit ("Adjust") → control visible | **94ms** |

Options were already known and the menu opens with no network at all — exactly the stated bar. The
original value was restored after every pass.

Two observations worth keeping: opening the Adjust editor fires **2 requests**
(`provisioning-answer?subject_id=…` and the drawer VM for that row) that the pin dialog does not
appear to need; and the summary Focus Panel exposes **no editable fields** — only search inputs and
the AI assistant textarea.

## Surface 9 — Save: NOT MEASURED, needs Kelly

The only mutation affordance reachable from the canonical surface is the queue row's **"Adjust" →
"Apply position"**, i.e. a placement PIN on live Firefly waitlist ordering ("Hold position (pin
ordinal)", with a Reason field and a Reset pin affordance).

That is reversible in principle — an unpinned child pinned then reset returns to unpinned — but it
writes override state with a reason on a real tenant and transiently affects other children's
derived ordinals. Kelly's instruction referenced an "already-established safe reversible Firefly
technique" which is not recoverable from this lane's context, so **no mutation was performed**.
Naming the sanctioned field/technique unblocks this immediately.

## CLS — earlier figures corrected

Previously logged as "card focus CLS 0.225, Message CLS 0.184". Re-measured:

* **initial load accumulates CLS 0.1829 before any interaction** — that is the real layout movement;
* the card is **not clickable as a whole** (ASSIGNMENTS has 30 inner affordances, CHILDREN 33; a
  whole-card click and an inner-affordance click both fail to commit any destination);
* with CLS reset immediately before the click, click-induced CLS is **0**, and panel height is
  constant at 762.

So the earlier per-interaction CLS numbers were not click-induced and should not be treated as a
card-focus defect. **The load-time 0.1829 is the real item**, and "card focus" needs its actual
affordance identified before it can be called measured at all.

## /organization/processes — 89% of the payload is ONE request

  TTFB 373ms · FCP 404ms · 28 API requests · 2,853KB

| response | KB | ms |
|---|---|---|
| `admin/entity-layouts` | **2,538** | 1,370 |
| `admin/configuration/programs` | 78 | 1,809 |
| `…/lifecycle-builder` | 69 | 1,107 |
| `admin/lifecycle-builder/stage-bootstrap` | 28 | **6,417** |

The page PAINTS fast (FCP 404ms); the weight is entirely secondary. Two distinct items: one 2.5MB
response (89% of all bytes) and one 6.4s request. Neither is on the operator critical path.

---

## WAVE 5 — the confirming cell, and what it corrected

### CORRECTION: route_meta improved; first usable did NOT

The wave-4 cell was taken with a passing PRE gate and a failing POST gate, and I reported first
usable at ~11.1s (−4.9%) from it. **That was noise.** The confirming cell, bracketed by two
qualified gates, n=4, max/med 1.05:

| phase | baseline `c9ce324fa` | wave 3 | wave 4 CONFIRMED | total |
|---|---|---|---|---|
| TTFB | 4,360ms | 3,915ms | 3,894ms | −10.7% |
| route_meta | 2,473ms | 2,102ms | **1,615ms** | **−34.7%** |
| stream (TTFB → responseEnd) | — | 7,660ms | 7,712ms | — |
| **first usable** | **16,200ms** | **11,666ms** | **11,708ms** | **−27.7%** |
| fully hydrated | 30,298ms | 24,175ms | 24,066ms | −20.6% |

**route_meta is real and confirmed (−487ms). First usable did not move.** `mw_to_layout` was flat
(1,640 → 1,651) and TTFB moved 21ms while route_meta dropped 487ms — the saving was absorbed.

**So route_meta was never the gate.** First usable is gated by the **7.7s stream**, i.e. the seeded
provisioning compose, and nothing else. The department-embed change is kept as counted
round-trip removal, not as a first-usable win.

### Priority 4 — payload decomposed; serialization is NOT the cost

Provisioning answer, 203KB:

| section | KB | share |
|---|---|---|
| `rows` (15 queue rows, ~7KB each) | 101 | 49.5% |
| `focusPanelStageWork` | 65 | 32.2% |
| — of which `published_stage_inputs` | 62 | 30.6% |
| — — `departmentMetadata` | 27 | 13.5% |
| — — `process` | 24 | 11.9% |
| — — `commandProjection` | 9 | 4.3% |
| `focusPanelSummaryDoc` | 27 | 13.1% |

**Client `JSON.parse` of the whole answer: 0.96ms.** Payload size, serialization and client parse
are NOT the critical path — trimming bytes cannot move first usable. ~51KB (25%) is department and
process CONFIGURATION identical on every load and for every child, which is a tidiness finding, not
a latency one.

The cost is **dependent DB round trips**, warm:

```
child_grain_members 1,396  →  [ensure 355 → bulk_candidates 1,065 → household_facts 1,043]  →  inquiry 700
                              ≈ 4,559ms of essentially serial remote round trips (~13 RTTs at WAN latency)
```

Cold adds ~2.1s more from org-config cache misses on a fresh process (the stream is 7.7s cold vs a
5.6s warm answer).

### REVERTED — one candidates read instead of two

Hypothesis: the bulk-ensure reads `placement_candidates` for seed keys and `bulk_candidates` reads
the same table again; one read could serve both.

* **Attempt 1** — feed the preloaded seed keys to the ensure. Removed the round trip but put the
  full-row load on the serial path in FRONT of the ensure: ensure 588ms → 1,784ms, composition
  3,860ms → 4,230ms, total +400ms. **Worse.**
* **Attempt 2** — keep the preload concurrent, let the ensure keep its own cheap read. `reused:
  true` confirmed the second read was gone, but the wait merely moved: composition 3,562–3,913ms
  against wave-3's 3,833–3,888ms — inside run-to-run variance.

**Reverted.** It removes a real read, but for no measured gain at the cost of a preload promise, a
reuse condition tied to `created === 0`, a gate reorder and a new hook parameter. Recorded so the
idea is not retried blind.

---

## ARCHITECTURAL DECISION NEEDED — cold first usable below ~11.7s

Every safe, semantics-preserving win in the compose has now been taken (avatar concurrency, org
category cache + parallelism, bulk ensure, department embed). What remains in the chain is
**genuinely dependent**: candidates cannot be ranked before they are loaded, and household facts
cannot be derived before the customers are known.

Moving cold materially below ~11.7s requires one of:

1. **Reduce what the seeded answer must contain before the document flushes.** The layout AWAITS
   the compose deliberately — a pending RSC promise crashes hydration in Next 16, and a
   client-gated stream cannot deliver the seed earlier; both were measured and reverted previously.
   Revisiting that is a runtime-architecture decision.
2. **Precompute or denormalize placement ranking** so the read path does not chain three dependent
   reads. That is a data-model decision with write-path consequences.
3. **Accept cold at ~11.7s** and treat warm as the operator's real experience — warm interaction is
   already strong (T2 identity 126–185ms, warm API p50 383ms).

This is Kelly's call. Nothing further should be changed in the compose without it.

---

## WAVE 4 — the child-mission reveal contract, and route identity

## 12. CLOSED — a child's What's Next may not outlive its subject

Kelly's reveal decision, implemented at `overlayChildMissionOntoSettledFocusModel`: on a
same-family switch the new child's header commits immediately; FAMILY cards stay because they are
authoritative for the same family; only the CHILD-scoped mission cards (`current_work`,
`child_identity`) go to the canonical reserve until the new subject's provisioning resolves.

Two attempts were wrong before the third was right, and both are worth remembering:

* an **early return** from the overlay skipped composition the child grain needs — grid cells went
  5 -> 4;
* **deleting** the card entries dropped the cell out of its lane — same 5 -> 4, a card vanishing
  and reappearing rather than a hold.

The entries are kept and `current_work` is rebuilt EMPTY, so the grid keeps composing the cell and
the hold happens in place. One shared-grid change was needed: `ReservedFocusPanelCell` picked its
treatment from the surface phase, so on a settled surface the held cell rendered resolved-EMPTY —
asserting "this child has no What's Next", false in the opposite direction. An explicit `reserved`
now outranks that inference, distinguished by `cardReadiness.has(key)` from an absent key that
merely defaults to reserved (those keep resolved-empty, so a never-produced card still cannot
appear to load forever).

Browser evidence, Wrigley <-> Lennon:

| t | header | gridCells | preparing | panel height |
|---|---|---|---|---|
| +300ms | Wrigley Kurzman | 5 | `["current_work"]` | 762 |
| +6,000ms | Wrigley Kurzman | 5 | `["current_work"]` | 762 |
| +10,000ms | Wrigley Kurzman | 5 | `[]` | 762 |

Cell count and panel height constant — the hold causes no layout movement. Family card text
byte-identical during the hold. Latest-click-wins holds under A->B->A->B at 45ms.

**Regression coverage:** `tests/focusPanel/childMissionRevealContract.test.ts`, 6 cases with two
siblings at DIFFERENT stages (Lennon `tour_scheduled`, Wrigley `waitlist`) sharing one family —
the case this tenant cannot exhibit, since every child here sits at one stage. Commit `d4ff2238c`.

## 13. PARTIAL — route_meta: one of three serial round trips removed

`route_meta` is spent before the first byte and was three serial reads: access bundle, then work
units, then departments — the last unable to start until the first named its department ids.

Departments are now EMBEDDED on the work-unit select. The embed selects `org_id` deliberately, so
the explicit tenant guard the standalone read asserted is re-applied in memory rather than
downgraded to "the FK implies it". The standalone helper remains and the caller falls back to it if
the embed yields nothing while rows exist.

  route_meta_ms              2,102ms -> 1,632ms  (-22.4%)
  wu_surface / first usable 11,666ms -> 11,098ms (-4.9%)

**Directional, not certified.** That cell's PRE-run gate passed and its POST-run gate did not, and
the host then degraded to system work outside this lane's control (`mds_stores` >100%,
AddressBookManager 81%). The counted evidence — one serial RTT removed from a three-RTT chain on
the document critical path — is not load-sensitive and stands on its own. **A confirming cell is
owed.**

Correctness: all six work-unit slugs resolve with unchanged counts, six pills each, no 5xx;
`resolveWorkUnitByRouteSlug` 9/9. Commit `5f17956e5`.

## 14. KEPT, but it did NOT move the headline — the fourth module-scope cache

`adminShellContextCache` (120s TTL, meant to span requests) was per-route-bundle: 15 misses against
103 hits in one session, each miss paying `resolveAdminAccessCore` at ~1.1s. Process-wide it takes
3 misses across three loads on one process.

It did **not** move cold first usable (route_meta 2,102 -> 2,110, within noise) — a fresh process
must miss once regardless of scoping. Kept under the standing rule: it removes proven, measured
waste at no complexity, via a helper already used four times. Recorded as a non-win rather than
folded into the wave's headline.

---

## Cold Work Unit — where it stands

| phase | baseline `c9ce324fa` | wave 3 | wave 4 |
|---|---|---|---|
| route_meta | 2,473ms | 2,102ms | **1,632ms** |
| **first usable** | **16,200ms** | 11,666ms | **~11,098ms** (directional) |
| fully hydrated | 30,298ms | 24,175ms | ~23,392ms (directional) |

**Still a miss.** First usable remains gated entirely by the streamed document: middleware auth
(cold only) + route_meta + the seeded provisioning compose. Priority 4 (O-5 / seeded provisioning
decomposition) and Priorities 6-7 are NOT started.

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

## Wave 11 — shared data lifecycle, resume, and readiness that follows it

**Operations warm data lifecycle.** Operations was the one operational workspace reloading its whole
dataset per open. The shared modal host was never the gap — it unmounts children for every workspace
alike; Processing survives because its data is module-scoped, Operations' lived in `useState`/`useRef`.
Adopted the existing `lib/runtime/warmCache.ts` primitive (two freshness classes + a mutation seam).

| | requests per open | day on screen |
|---|---|---|
| before | 7, 7, 7, 7 | 2,845 ms |
| after | **8, 0, 0, 6** | **30 ms** on a warm reopen |

A second loader (`/api/admin/roster`, owned by `DailyRoster` + `AttendanceWorkspace`) was invisible to
the path-keyed harness and kept 2 requests per reopen until routed through the same cache.

**Workspace resume.** Implemented once at `lib/runtime/workspaceResume.ts`; transient state excluded
structurally by the position type. Certified Scenarios A/B/C across Processing, Work Items and
Operations — **9/9 PASS, shell 8–24 ms** against a <200 ms target.

**Readiness follows resume.** Armed on nav intent (hover/focus), not the modal's open effect: the
728 ms `records/bootstrap` prologue now resolves BEFORE the click. Resume also exposed speculative
waste — reopening on Children paid for two adjacent-week roster prefetches (~2.6 s) for a board nobody
was looking at; now gated on the roster being visible.

**Two harness defects caught, both of which had produced passing results:** a single `Escape` left the
workspace open so a "reopen" measured an already-open modal (0 ms shell, vacuous passes downstream);
and a synthetic `MouseEvent("mouseenter")` never triggers React's `onMouseEnter` (delegated via
`mouseover`), which made a working hover-warm look dead.

**Left owed:** `/api/admin/records/children` ~3.3–4.5 s (Records), Save tail ~3.2 s, Activity ~2.1 s.

## Wave 12 — card/command, Save tail, /organization, guard closure

**Card / command readiness — CERTIFIED.** Every Focus Panel destination commits through ONE shared
seam (`data-fp-depth`) in **28–155 ms**, with T3 == T2 — the destination arrives already carrying its
controls. Tour and Billing Preview commit with **zero requests**. No cross-child leakage, proven on
`data-children-focused-member` across two different children.

**Save server tail — 3,376 ms → 1,759 ms (−48%).** Authoritative persistence completes at ~1.74 s;
the 1,442 ms after it was post-write readback shaping a body every caller discards. Fixed at the
shared mutation owner via `Prefer: return=minimal` (default response unchanged) plus concurrent
pre-write guards. Acknowledgement UX untouched (T1 76–83 ms); persistence and exact restoration
re-proven.

**/organization — CERTIFIED warm (17–55 ms).** First entry to a route family costs 1.5–2.6 s and
**nav-intent prefetch measurably does not help** (hover 1,522 ms ≈ dwell 1,639 ms ≈ cold 1,537 ms) —
classified true-cold debt rather than "fixed" with a prefetch that does nothing. `entity-layouts` /
`stage-bootstrap` do NOT gate Processes interaction (controls usable at 54 ms) — SECONDARY.

**All five named guard gaps closed**, deterministic, no wall-clock: latest-click-wins + Activity
subject switching (new shared `lib/runtime/latestWins.ts`), Save no-false-success, BOS forbidden
parking, workspace resume. **55 guards across 7 files, all passing.**

**Three false findings caught and withdrawn this wave:**
1. `el.click()` left the Tour menu closed (menus open on **pointerdown**) — a working command looked
   broken.
2. The card/command CLS figures are a synthetic-input artifact — Chrome excludes shifts near real
   input via `hadRecentInput`; the panel width is stable at 895 px.
3. "Surfaces blanks while Access does not" was the **shared loading reserve** working as designed; a
   character-count metric cannot tell a calm reserve from an empty page.
