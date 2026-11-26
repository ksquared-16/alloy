# P0-7.6 SLICE 12B — DOCUMENT INTERNAL DIAGNOSIS

**`P0_7_6_SLICE_12B_DOCUMENT_DIAGNOSIS_COMPLETE`** · programme **OPEN** · run `erun_03740d0ebcc791fd`

| | |
|---|---|
| Dependency `gdep_4101c86bc29562` | **SATISFIED** |
| Deployed SHA | `236578d88` — contains Slice 12A instrument `ae3795d59` by ancestry |
| Samples | **5** cold authenticated entries, same Work Unit / Work View |

---

## ⚠ FIRST — A CORRECTION I OWE

**My eight previous "the flag is off" reports were wrong.** They rested on an invalid probe.

I tested with an **unauthenticated** `HEAD /workspace`. `middleware.ts` sets the timing headers on the `response` object, then — on the unauthenticated path — constructs a **brand-new** `NextResponse.redirect(...)`, sets only `x-alloy-admin-mw: redirect:/login` on that new object, and returns it. The timing headers are on the discarded response.

So an unauthenticated probe **can never** observe those headers, flag on or off. Worse, the `x-alloy-admin-mw: redirect:/login` I repeatedly cited as *"proof the middleware ran"* was in fact proof I was on the **one branch that drops the headers**.

An authenticated request returns them immediately:

```
HTTP/2 200
x-alloy-admin-mw: next
x-alloy-mw-t0: 1789665524834
x-alloy-mw-auth-ms: 340
x-alloy-mw-auth-source: claims
```

The control plane's "SATISFIED on corrected canonical evidence" was right and my blocker was not.

---

## 7–12 · FULL-INSTRUMENTATION PROOF + SELF-CHECK

| check | result |
|---|---|
| `x-alloy-mw-t0` / `x-alloy-mw-auth-ms` | **present on all 5** |
| `__alloy_route_timing` in the document | **present on all 5** |
| `compose_wall_ms` nonzero on the real compose path | **4,855–8,300 ms** |
| `seeded` reflects the page result | **true on all 5** |
| `compose_sections` present | **yes** (full-breakdown composer) |
| `composition_ready_ms` present | **yes** |
| negative durations | **none** |
| `composition_ready_ms ≤ compose_total_ms` | **yes, all 5** (delta 2–13 ms) |
| warm-up leakage | excluded — only `startRel ≥ 0` counted |

---

## 13–15 · PER-SAMPLE AND DISTRIBUTION

| n | doc | TTFB | page_total | compose_wall | inner total | **PRELUDE** | ready (inner) | unattrib |
|---|---|---|---|---|---|---|---|---|
| 1 | 7,926 | 1,052 | 7,199 | 7,199 | 3,029 | **4,170** | 3,016 | 727 |
| 2 | 8,780 | 676 | 8,300 | 8,300 | 4,431 | **3,869** | 4,426 | 480 |
| 3 | 7,786 | 1,053 | 7,183 | 7,183 | 2,739 | **4,444** | 2,735 | 603 |
| 4 | 5,850 | 1,133 | 5,345 | 5,345 | 2,298 | **3,047** | 2,295 | 505 |
| 5 | 5,337 | 575 | 4,855 | 4,855 | 1,890 | **2,965** | 1,888 | 482 |

| metric | median | min | max |
|---|---|---|---|
| document duration | **7,786** | 5,337 | 8,780 |
| document TTFB | 1,052 | 575 | 1,133 |
| middleware auth | **6** | 4 | 7 |
| route_meta / layout_total | 493 / 494 | 164 | 570 |
| page_total = compose_wall | **7,183** | 4,855 | 8,300 |
| compose inner `total_ms` | 2,739 | 1,890 | 4,431 |
| **PRELUDE** | **3,869** | 2,965 | 4,444 |
| unattributed document | 505 | 480 | 727 |
| destination shell | 1,266 | 813 | 1,408 |
| published structure | **7,879** | 5,411 | 8,883 |
| first / last critical meaning | **7,879** | 5,411 | 8,883 |
| Track-A meaningful | 15,510 | 11,108 | 21,069 |
| final settlement | 33,938 | 33,843 | 33,969 |

---

## 16–21 · DOCUMENT ATTRIBUTION

Median document **7,786 ms** decomposes as:

| owner | median | share |
|---|---|---|
| **compose prelude** (inside `composeProvisioningAnswerForRoute`, before the inner composer's clock) | **3,869** | **49.7 %** |
| inner compose (`composeWorkUnitProvisioningAnswer`) | 2,739 | 35.2 % |
| unattributed document (React render / RSC serialization / streaming, outside the page) | 505 | 6.5 % |
| layout (`route_meta`, runs concurrently) | 494 | — |
| middleware auth | 6 | 0.1 % |

**`page_total_ms` equals `compose_wall_ms` exactly in every sample** — the page segment does nothing but the compose.

### THE FINDING: a 3,869 ms hole the compose's own instrument cannot see

`compose_wall_ms` (7,183) − the compose's own `total_ms` (2,739) = **3,869 ms median, 53.9 % of the compose and 49.7 % of the whole document**, occurring *inside the awaited call* but *before* `composeWorkUnitProvisioningAnswer` starts its clock.

`routeTimingDiagnostic`'s own docblock predicted this — *"the route-identity resolution that `composeProvisioningAnswerForRoute` performs before that clock starts… on a cold process those phases measured LARGER than the compose itself"*. It is now **quantified for the first time**, and it is larger than the inner compose in **4 of 5** samples.

What lives there, from source: `resolveWorkUnitRouteIdentity(rawSlug)` → `loadAdminRouteGate()` plus `fetchWorkUnitsForSlugResolution` (and a department fallback read), then `createAdminClient()` and `documentActorFromAdminGate(gate)`.

**The split within the prelude is not measured**, and I will not guess it. Note the tension worth resolving: the layout's `route_meta_ms` is only 493 ms and calls the same `cache()`-memoized resolver, so either the two do not share the resolution or the prelude's cost is dominated by something other than that resolver.

---

## 22–26 · COMPOSE BREAKDOWN

| section | median | min | max |
|---|---|---|---|
| `presentation_ms` | 2,191 | 1,635 | 4,198 |
| `composition_ms` | 1,660 | 1,223 | 3,381 |
| `projection_ms` | 741 | 527 | 921 |
| `records_ms` | 132 | 0 | 301 |
| `configuration_ms` | 1 | 1 | 282 |
| `work_unit_ms` | 0 | 0 | 280 |
| `authorization_ms` | 0 | 0 | 0 |
| inner `total_ms` | 2,739 | 1,890 | 4,431 |

**These sections NEST — they must not be summed.** `presentation_ms` + `composition_ms` + `projection_ms` alone exceed `total_ms`; the source states `composition_ms` is an outer span that "named nothing within it". Treating them as a partition would be fabricated arithmetic.

Named spans (median): `child_grain_avatar` **1,408** (max 3,155) · `child_grain_waitlist` 793 (max 2,872) · `child_grain_members` 741 · `child_grain_inquiry` 356 · `focus_panel_operational_projection` 3.

| section | classification | basis |
|---|---|---|
| prelude (gate + route identity) | **CRITICAL_FOR_STRUCTURE** | the composition cannot exist before it; everything waits |
| `presentation_ms`, `composition_ms` | **CRITICAL_FOR_FIRST_MEANING** | produce the answer the four critical cards render from |
| `child_grain_avatar` (1,408) | **SECONDARY_ONLY** — candidate | avatars are queue-row enrichment; absence degrades to initials (R-019), it does not block meaning |
| `child_grain_waitlist` / `inquiry` / `members` | **UNKNOWN** | feed child-grain rows; ownership not traced far enough to classify honestly |
| `authorization_ms` = 0 | — | authorization is resolved in the prelude by the route gate, not inside the composer |

---

## 34 · PUBLISHED COMPOSITION — **LOW_VALUE**, and this overturns the standing hypothesis

`composition_ready_ms` vs the compose's **inner** `total_ms`, same clock, all five samples:

| ready | inner total | delta |
|---|---|---|
| 3,016 | 3,029 | **13** |
| 4,426 | 4,431 | **5** |
| 2,735 | 2,739 | **4** |
| 2,295 | 2,298 | **3** |
| 1,888 | 1,890 | **2** |

**The published composition becomes available 2–13 ms before the inner compose completes.** Exposing it earlier saves single-digit milliseconds. **`POST_COMPOSITION_COMPOSE_MS` ≈ 2–13 ms**, not seconds.

> **A clock trap, recorded because it would have produced a confident wrong answer.** Computing `compose_wall_ms − composition_ready_ms` gives **3,874 ms** and looks like a headline finding. It is invalid: `composition_ready_ms` is measured from the **inner** composer's `t0`, which starts ~3,869 ms after the outer await begins. The two numbers have different origins. Only the same-clock comparison above is meaningful.

**P0-7.6 item 13 is answered and should be closed as LOW_VALUE.** Theoretical maximum contribution: ~13 ms.

---

## 27–31 · PRODUCT + CORRECTNESS

| | median | budget | |
|---|---|---|---|
| destination shell | 1,266 | ≤ 500 | over |
| published structure | 7,879 | ≤ 1,000 | over |
| **first critical meaning** | **7,879** | **≤ 2,000** | **over** |
| **CARD_COHERENCE_WINDOW** | **0 ms (all 5)** | ≤ 250 | **met** |
| final settlement | 33,938 | ≤ 3,000 | over |

**Correctness intact — no truth traded for latency:**

* `unstable_or_false_construction_ms = 0` — destination shell truthful, no fabricated grid
* **all six configured cells at structure commit, identical set at settlement** in all 5 samples — no late structural insertion
* Track-A resolving inside existing geometry
* **client provisioning HTTP requests: 0 in all 5** — no Slice 11 regression
* `seeded: true` in all 5
* requests 144–146, API 37–39

## 11 · INSTRUMENTATION OVERHEAD

Middleware auth is **6 ms** median and the marks are a handful of clock reads plus one small script tag. Document durations (5,337–8,780) sit within the range measured *before* enablement (5,108–8,325 across Slices 11B/10B). **No evidence of material instrument overhead**; the variance is environmental and I am not attributing it either way.

---

## 32–33 · GAP TO THE HARD TARGET

```
MEDIAN_TIME_TO_FIRST_CRITICAL_MEANING   7,879 ms
HARD TARGET                             2,000 ms
REMAINING_BUDGET_GAP                    5,879 ms
```

**~5.9 seconds must leave the critical path.** Cosmetic gains cannot reach this. Ranked by measured median contribution:

| # | work | median | classification |
|---|---|---|---|
| **1** | **compose prelude** — route gate + route-identity resolution | **3,869** | **REUSE / CACHE / PARALLELIZE** — org+dim+slug grain, not subject-specific |
| 2 | inner compose `presentation` + `composition` | ~2,739 combined | **MOVE_OFF_CRITICAL_PATH / DEFER** in part |
| 3 | `child_grain_avatar` | 1,408 | **DEFER** — degrades to initials, blocks nothing |
| 4 | unattributed document (React/RSC/stream) | 505 | **UNKNOWN** — needs its own boundary before it can be classified |
| 5 | destination shell latency | 1,266 | tied to document TTFB (1,052) |

Even removing the entire prelude (3,869) leaves ~4,010 ms — **still 2× the target**. Closing the gap requires the prelude **and** a material reduction inside the compose. This is an architectural problem, not a tuning one, and the evidence says so rather than the target being relaxed.

## 35–36 · CACHE / REUSE AND DEFERRAL

| candidate | median | grain | reuse safety |
|---|---|---|---|
| route-identity resolution (slug → work unit + departments) | part of 3,869 | **ORG + dim + platformKey** | cacheable across requests and operators within an org; invalidated by work-unit/department configuration changes |
| `loadAdminRouteGate()` | part of 3,869 | **per-operator** | **NOT safely cacheable across users** — authorization |
| `child_grain_avatar` | 1,408 | per-actor, ~300 s minted URLs | **CAN_DEFER_AFTER_CRITICAL** |

| secondary request | start | duration | classification |
|---|---|---|---|
| drawer VM `view-models/drawer/opportunity` | 7,896 | 12,811 | **ALREADY_SECONDARY** (starts at first meaning) |
| drawer body `layout-runtime` | 20,710 | 5,812 | ALREADY_SECONDARY |
| `departments/…/work-unit-queue-summaries` | 3,586 | 3,555 | **CAN_DEFER_AFTER_CRITICAL** — overlaps the compose, competes for connections |
| `communications/*` ×3, `activity`, `metrics/resolve`, `queue-view-totals` | 7,150–22,462 | 2,416–2,787 each | ALREADY_SECONDARY / CAN_DEFER |

**Nothing is deferred, cached or reused in this run.**

---

## 39–41 · RECOMMENDED SLICE 12C

> **Split and attack the compose prelude.**

| | |
|---|---|
| **Owner** | `composeProvisioningAnswerForRoute` — everything before `composeWorkUnitProvisioningAnswer`'s `t0` |
| **Measured cost** | **3,869 ms median** (2,965–4,444) — **49.7 % of the document**, the single largest block |
| **Work** | instrument the prelude's three awaits (`loadAdminRouteGate`, `fetchWorkUnitsForSlugResolution` + department fallback, `createAdminClient`/`documentActor`) with the **existing** span mechanism, then repair the dominant one in the same slice |
| **Theoretical maximum** | **3,869 ms** if fully removed from the critical path |
| **Expected target impact** | 7,879 → **~4,010 ms**. Does **not** reach ≤ 2,000 alone — no candidate does |
| **Risks** | `loadAdminRouteGate` is **authorization**; it must not be cached across operators. The safe reuse grain is the slug→work-unit resolution (org + dim), not the gate |
| **Why it outranks the alternatives** | it is 2.7× the next candidate, it is configuration-grain rather than subject-specific so reuse is plausible, and it blocks *everything* — structure, meaning and shell all wait on it |

**One honest caveat:** this slice necessarily begins with a small instrumentation increment, because the prelude is currently one opaque number. Choosing which of its three awaits to repair without that split would be guessing — and guessing is how this programme produced its earlier confident wrong answers. The increment is ~10 lines using the mechanism already in place.

**DO NOT IMPLEMENT — not implemented here.**

## 42 · `ALLOY_ROUTE_TIMING`

**REMAIN ENABLED temporarily.** Slice 12C needs the prelude split from the same instrument, and no material overhead was observed. Disable and rebuild when P0-7.6 closes — deliberately, not by forgetting.

## 43–44 · LEDGER

| | state |
|---|---|
| 11 serialization | CLOSED deployed-verified, 6,579 ms removed |
| 12A instrument | COMPLETE + CERTIFIED + DEPLOYED |
| **12B document diagnosis** | **COMPLETE** |
| **13 published-composition decoupling** | **CLOSED — LOW_VALUE**, ~13 ms maximum |
| **12C prelude split + repair** | **OPEN — recommended next**, 3,869 ms |
| 14 defer non-visible work | OPEN — `child_grain_avatar` 1,408 ms now a named candidate |
| 15 cache org/department-scoped reads | OPEN — route-identity resolution is the concrete instance |
| 16 drawer VM | ALREADY_SECONDARY, deprioritised |
| unattributed document time (505 ms) | OPEN — needs its own boundary |

**`READY_FOR_DOCUMENT_OPTIMIZATION = YES`** — the section breakdown now exists.

Programme **OPEN**: 7,879 ms median against a 2,000 ms hard target. The evidence does not yet prove an architectural boundary prevents the target; it proves no single measured candidate reaches it alone.
