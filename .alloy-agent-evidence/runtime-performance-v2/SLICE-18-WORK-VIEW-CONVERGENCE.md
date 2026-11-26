# SLICE 18 — WORK VIEW PROVISIONING CONVERGENCE (S18-1)

Run: `erun_edbeda0392236e44` · Slot 1, port 3011 · Repair `86185f1d3`
Builds: before `JuqH3cOisBFd7Vx0pzyzD` (clean pre-repair) → after `JuqH3cOisBFd7Vx0pzyzD`
Session restored 19:23:05 (valid to 20:23:05). No experimental switch remains.

## 1. Phase A — the fan-out, fully attributed

**Owner:** `lib/presentation/runtime/useCommittedWorkUnitSurfaceRuntime.ts`, the block commented
*"PHASE H — SIBLING WORK-VIEW ADJACENCY"*.

Attribution was done with CDP initiator stacks rather than by reading: all six lens requests fire from
one stack (`prepare → run → …`) at **one identical timestamp**, which is the idle callback firing.

* **Caller:** an effect keyed on the comma-joined inactive-view id string; `for (const id of ids) prefetchWorkView(id)`.
* **Schedule:** `requestIdleCallback(timeout: 2000)`, with a reveal-gate hold-and-retry
  (`isWorkUnitPrimaryRevealActive()` → retry in 500 ms) added by an earlier amplification fix.
* **Foreground or speculative:** speculative.
* **Coalescing:** yes — it goes through `prefetchWorkView` → `prepareOperationalDestination`, keyed by
  (target, lens) in K2, the same key a pill click consumes. No private cache.
* **Intended benefit, in its own words:** *"A pill switch pays the full ~2.8 s provisioning round-trip
  because hover rarely precedes the click by that long."*
* **Cost per view:** a full provisioning compose **plus** a drawer-VM compose for that view's default subject.

**Its consumers, proven rather than assumed:**

| Consumer | Does it need inactive-view provisioning? |
|---|---|
| Pill click | **Yes** — reuses the prepared answer by (target, lens). This is the real consumer. |
| Counts / pills | **No.** `useWorkViewTotals` is the canonical owner: queue-rows API, `limit=1&count_mode=exact`, at each view's canonical location. Never a provisioning answer. |
| Queue membership | No — same rows owner. |
| Default subject | No — resolved from the **active** view's answer. |
| Current Work | No. |

## 2. Phase B — classification

| Request | Class |
|---|---|
| active/default Work View provisioning | **REQUIRED FOR CURRENT REVEAL** |
| Work View counts | **REQUIRED FOR GLOBAL ORIENTATION** — already served by a separate owner at count grain |
| pill hover/focus warm of one named view | **INTENT WARM** — keep |
| idle sweep of all six inactive views | **IDLE WARM with a real consumer but no signal** — removed |

The sweep is not blind speculation: its consumer exists. But the benefit can reach **at most one** view
— the one chosen next — and at idle time nothing indicates which, while the cost is paid for all of
them, on every entry and again on every switch (switching changes the sibling set).

## 3. Phase C — the repair

The sweep is removed. `prefetchWorkView` is **unchanged** and still fires on pill `onPointerEnter` /
`onFocus`, which is operator intent and names the exact destination. A switch with no preceding intent
loads normally under the existing transition.

Deliberately **not** replaced with a smaller sweep — a bounded guess is still a guess — and no new
cache, inflight registry, TTL or scheduler exists (locked by test). The reveal-gate hold-and-retry went
with it: it existed only because the sweep competed with the commit-critical path.

**Commit:** `86185f1d3`.

## 4. Tests and the planted defect

`web/tests/runtime/workViewProvisioningPolicy.test.ts` — **6 tests, green**: no effect sweeps the
inactive views; `prefetchWorkView` survives as the intent path; the pill strip still warms on hover and
focus; the surface still wires pill intent; no second cache/registry/TTL/scheduler; the neighbour-
**subject** warm and its reveal gate are untouched (this slice changed the view axis only).

**Planted defect:** the original sweep restored verbatim into the scheduler →
*"no effect sweeps the inactive Work Views"* failed with
`expected … not to match /for \(const id of ids\) prefetchWorkV…/`; 1 failed / 5 passed. Reverted, 6/6.

## 5. Mounted before / after

Host at measurement: CPU idle 87.8% PASS, spotlight 0.0% PASS, load trend falling PASS, control
p75/p50 **1.059**, max/p50 **1.47**, five idle foreign next-servers, no heavy foreign work. One foreign
`vitest` run started mid-slice; that measurement set was **stopped and re-taken** after it finished, per
the instruction.

### Work Unit entry

| | before | after | Δ |
|---|---:|---:|---:|
| requests | 45 | **38** | −7 |
| bytes | 810 KB | **468 KB** | **−342 KB (−42%)** |
| provisioning calls | 7 | **1** | −6 |
| provisioning bytes | 404 KB | **70 KB** | **−334 KB (−83%)** |
| rows visible (T2) | 1733 ms [1650–1816] | **1559 ms [1542–1575]** | **−174 ms**, and a much tighter spread |

### Waitlist (page-level switch)

| | before | after |
|---|---:|---:|
| requests | 49 | **42** |
| bytes | 1317 KB | **1032 KB** (−285 KB) |
| provisioning | 7 calls / 404 KB | **1 call / 227 KB** |
| lenses provisioned | bare + 6 | **bare only** |

The remaining 1032 KB is the view's own answer (227 KB) plus auto-selected-subject hydration — drawer
VM 176 KB, drawer-body layout 173 KB, Activity 66 KB — which remains legitimate and was not touched.

### Active Pipeline — no regression

18 requests / 159 KB before **and** after; 1 bare provisioning / 10 KB.

### In-app pill switching — the real transition, measured properly

Slice 16's "Work View switch" cells used `page.goto`, a full navigation; **that is not the in-app
transition**, so its continuity reading there is withdrawn. Measured through the actual
`[data-work-view-id]` control:

| leg | T1 ack | requests | bytes | provisioning |
|---|---:|---:|---:|---:|
| pill → Active Pipeline, **no hover** | 411 ms | 1 | 10 KB | 1 |
| pill → New (back) | 849 ms | 14 | 375 KB | 3 |
| pill → Active Pipeline, **after hover intent** | **179 ms** | **0** | **0 KB** | **0** |
| rapid pill A→B→C | 157 ms | 10 | 63 KB | 1 |

**The hover-intent path is proven end to end: 0 requests, 0 bytes, 0 provisioning on the click.** That
is the benefit the sweep existed to provide, still available, now paid only when the operator points at
the destination. Rapid switching is latest-intent-wins, and panel height stays constant (1 distinct
value) in every leg.

## 6. Counts, default subject, continuity

* **Counts/pills, after the repair:** New 3 · Active Pipeline 0 · Registration 1 · Waitlist 16 ·
  Tours 0 · All 7 · Enrolled children 2 — every count present and correct with **no** inactive-view
  provisioning. Confirms the separate count owner.
* **Default subject:** entry settles with active id = panel body id = `37b9593d`, header
  *"Certopp Family"*. On Active Pipeline (a genuinely empty view) there is correctly no subject —
  0 rows is the view's truth, not a failure to resolve.
* **Continuity:** subject switch after a view change — 0 zero-row frames, 0 blank-card frames, rows
  constant, one panel height, coherent subject. Focus Panel stable, no remount, header monotonic.

## 7. Mutation regression — PASS

Real `Move to Waitlist` on the `opportunity_backed` fixture family through the UI:

| | before | after |
|---|---|---|
| New | 3 | **2** |
| Waitlist | 16 | **17** |
| All | 7 | **7** |
| target row | "Certopp Family **Lead**" | "Certopp Family **Waitlist**" |

Selected subject survived (`37b9593d`, header unchanged). Across the commit: **0 zero-row frames, 0
blank-card frames**, rows constant at 7, one distinct panel height. Counts and rows never disagreed, and
the destination's membership became available under the new provisioning policy.

Fixture: `ensure` → `verify` (flagged the **pre-existing** `context_free` residue, as in Slice 8, so the
`opportunity_backed` family was used) → mutation → `reset` + `ensure` + `verify` → **ok: true,
findings: []**.

**S9-1:** the intermediate `rowStage=lead` did **not** reproduce; only one provisioning generation
followed the commit and final convergence was correct. Not enough to prove the intermediate can never
paint, so: **MONITOR**, unchanged.

## 8. Workspace re-measurement — recommendation confirmed

| | before repair | after repair |
|---|---:|---:|
| T1 (shell) | 8 ms | 8 ms [7–9] |
| T2 (content) | 2728 ms [2573–3019] | **2688 ms [2549–2707]** |

Within noise. The Work View fan-out does **not** contribute to Workspace content delay, so the Slice 16
recommendation stands unchanged and can be implemented against a stable number: immediate
organization/workspace identity, reserved section/process-grid geometry, progressive content, shell
usable throughout. **No full-page spinner or skeleton.**

## 9. Not completed this slice

S5-4 Activity A/B (needs its own build pair; cost side already measured at 66 KB per record hydration) ·
R-005 · in-shell Work Items / Processing / Communications · search → record · remaining Settings
surfaces. Attendance remains `NOT_MEASURABLE — PRODUCT NAVIGATION OWNER`; reserved-geometry mounted
window remains `TEST-CERTIFIED / MOUNTED WINDOW NOT OBSERVED`.

## 10. Consolidated status

**CLOSED** — runtime foundation · perceived performance · configuration freshness · payload convergence
(~126 KB → ~72 KB warm) · mutation certification (re-certified this slice) · S4-1 · S8-3 · D-2 ·
S8-2/R-018 (inconclusive-because-inert) · seven-surface timing baseline · **S18-1 Work View
provisioning convergence**.

**OPEN — IMPLEMENTABLE**
1. **Workspace transition** — the only remaining evidenced repair. Confirmed by re-measurement.

**OPEN — DECISION / EXPERIMENT** — S5-4 (one build pair) · R-005 · S9-1 (monitor) · F-2 · S3-4.

**OPEN — MEASUREMENT** — in-shell modules · search → record · remaining Settings.

**BLOCKED / EXTERNAL** — production `alloy-dev-start` wildcard-bind defect (toolkit-owned; scratch-config
workaround certified and still in use).

**NEW this slice** — the fan-out's true owner and schedule · counts proven independent of provisioning ·
the hover-intent path proven to commit with zero network · Slice 16's view-switch continuity reading
withdrawn as a `goto` artifact.

## 11. Ready for FINAL REPAIR?

**Yes.** One implementable repair remains — the Workspace transition — and its number has now been
re-measured after the change underneath it, which was the stated precondition. Everything else is
closed, inert, or a secondary experiment that does not gate closeout.

**Recommended final slice:** implement the Workspace transition (immediate identity + reserved section
geometry + progressive content), re-measure it, and run the S5-4 build pair in the same window. Leave
R-005 and the in-shell matrix cells as ordinary maintenance unless they gate something.
