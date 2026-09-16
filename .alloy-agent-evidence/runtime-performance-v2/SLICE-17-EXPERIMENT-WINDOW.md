# SLICE 17 — EXPERIMENT WINDOW: S8-2 RESOLVED, AND THE REAL FAN-OUT FOUND

Run: `erun_a0597ae03a1bba98` · Lane: `lane_73a897409906` · Slot 1, port 3011
Builds: ON `qdYy1cNvxh3Vph4lE6xYt` → OFF `R9V6bKugZD3EIWc70eAAL` → restored clean `5li2XLsWhQ6XYhqwMERuV`
**No product change. The experimental switch was removed and the tree rebuilt clean.**

## 1. Conditions

Production build (`ALLOY_PROD_CERT_DIST=1 ALLOY_ROUTE_TIMING=1`), authenticated loopback slot-1
session, 55 ms in-page sampling, 4 runs per cell with run 1 discarded, medians with [min–max].

| | |
|---|---|
| ON arm measured | 18:59–19:02 |
| OFF build | 19:04–19:06 (rc=0, peak 10.94 GB) |
| OFF arm measured | 19:08–19:13 |
| Host at 19:02 (inside the window) | load 3.23 PASS · idle 87.70% PASS · spotlight 0.0% PASS · control p50 5.98 ms, max/p50 1.96 |
| Heavy foreign work | none at any point — `next build`, `playwright test`, `vitest` absent from the host |

**Neither arm was measured during a build.** The closing gate at 19:15 is degraded (idle 24%,
max/p50 11.02) purely because this lane's own *restore* build was running by then — after every
measurement. It is recorded, not used.

## 2. S8-2 / R-018 — sibling speculative prefetch: **INCONCLUSIVE, because it is already inert**

The switch disabled the blind **neighbour fan-out** in `prewarmSubjectDestination`'s caller loop
(`useCommittedWorkUnitSurfaceRuntime.ts`), leaving **hover-warm** — which is operator intent, not
speculation — untouched, so the A/B isolates the speculative half.

| | PREFETCH ON | PREFETCH OFF |
|---|---:|---:|
| Entry: rows visible (T2) | 1733 ms [1650–1816] | 1751 ms [1672–1830] |
| Entry: requests / KB | 45 / 810 | 44 / 802 |
| Entry: provisioning calls / KB | 7 / 404 | 7 / 404 |
| **Entry: subject-scoped provisioning** | **0** | **0** |
| A→B first visit (T1=T2=T3) | 58 ms | 60 ms |
| B→C first visit | 59 ms | 59 ms |
| B→A return (warm) | 58 ms | 59 ms |
| Per-switch requests / KB | 6 / 20 | 6–7 / 20–32 |
| **Per-switch provisioning** | **0** | **0** |
| Blank frames | 0 | 0 |

Every difference is inside run-to-run noise. The decisive fact is not the comparison but what both
arms show: **there is no subject-scoped provisioning at all** — not at entry, not on any switch. The
seven entry provisioning calls carry `work_view_id=` and **no `subject_id`**.

So the sibling-subject fan-out does not fire on this surface in the production build. That is
consistent with the amplification guard a previous slice added
(`if (isWorkUnitPrimaryRevealActive()) { … return; }`), which suppresses neighbour warms during the
primary reveal — the window in which they used to fire.

**Verdict: INCONCLUSIVE — and stated as such deliberately.** The A/B cannot distinguish "the switch
worked" from "there was nothing to switch off", because both produce identical numbers. What it *can*
say is that the cost S8-2 was opened to investigate — 27 provisioning calls and 2,863 KB of sibling
speculation — **is not present on the production build.** No policy change is recommended on this
evidence, and none is needed: the behaviour it would govern is not running.

## 3. NEW — the real speculative fan-out is by WORK VIEW, not by subject

Entry to a Work Unit provisions **seven work views**: the bare view plus `new_leads`,
`new_work_view_2`, `_3`, `_4`, `_5`, `_7`. That is **404 KB of an 810 KB entry**, and the single
largest item in the whole entry is one lens at **199 KB**. The operator sees **one** view.

This is the speculative cost the programme has been looking for. It is a different axis from the one
S8-2 named, it is measured in both arms identically, and it is contained: one fan-out, one owner.

## 4. Waitlist payload diagnosis — not cohort size

Switching to Waitlist against switching to Active Pipeline, same session, same build:

| | Waitlist | Active Pipeline |
|---|---:|---:|
| requests / KB | 49 / **1317** | 18 / **159** |
| provisioning calls / KB | **7 / 404** | **1 / 10** |
| lenses provisioned | bare + 6 | bare only |
| largest single response | 227 KB (bare provisioning) | 74 KB (lifecycle-builder) |
| drawer VM for auto-selected subject | 176 KB | — |
| drawer-body layout | 173 KB | — |
| Activity | **66 KB** | none |
| second drawer VM (previous subject) | 108 KB | — |

The difference is **not** cohort size and **not** candidate-grain enrichment. It is two things:

1. **the work-view lens fan-out** (7 provisioning vs 1) — ~394 KB; and
2. **auto-selected-subject hydration** on Waitlist (drawer VM + drawer body + Activity ≈ 415 KB),
   which Active Pipeline does not pay because it auto-selects nothing.

Classification: **contained optimization candidate**, not a transition problem. The transition itself
is already good — prior view retained, T1 ~150 ms, no blank frame — so **do not add loading treatment
here**; that would mask work that should simply not all be done at once.

## 5. Warm Work Unit — answered

Slice 16 observed warm entry was not faster than cold and left it open between three explanations.
The evidence now settles it as **(1) warm reuse is working, but T2 is dominated by work warmth cannot
help**:

* a warm **subject switch** issues **zero provisioning calls** and costs 6 requests / 20 KB — subject
  reuse is complete, which is why T1/T2/T3 are ~59 ms;
* a warm **Work Unit entry** still re-provisions all seven work views (404 KB), and that is what T2
  waits on. Warm subject state cannot shorten it.

No repair is proposed here; the lever is §3, not the cache.

## 6. S5-4 Activity prefetch — cost measured, A/B not run

The ON/OFF build pair did not run (window exhausted), so the decision stays **INCONCLUSIVE**. But the
cost side is now precise, which is most of the remaining work:

* **66 KB**, one request, on record hydration (`/api/admin/activity?entity_type=opportunities&entity_id=…`)
  — matching the ~67.5 KB in the standing evidence;
* **~0–1 KB, 1 request** on a warm subject switch.

So Activity is **not** paid on every selection as the standing framing assumed — it is paid once per
record hydration. The remaining question is only the benefit side: how much it improves Activity-open
T2/T3. One build pair answers it.

## 7. S9-1 — not observed, by instruction

The S8-2 experiment needed no membership-changing mutation, and the instruction says not to create one
solely for S9-1. **Unchanged: MONITOR.**

## 8. R-005 — not run

The window was spent on S8-2 and the diagnostics above. **OPEN**, methodology unchanged, not merged
with D-2 (which stays CLOSED).

## 9. Matrix cells still missing

Work Items · Processing · Communications (in-shell triggers, not routes) · global search → record ·
remaining Settings surfaces · Attendance (still `NOT_MEASURABLE — PRODUCT NAVIGATION OWNER`) ·
reserved-geometry mounted window (`TEST-CERTIFIED / MOUNTED WINDOW NOT OBSERVED`).

## 10. Consolidated status

**CLOSED** — runtime foundation · perceived performance · configuration freshness · payload
convergence (~126 KB → ~72 KB warm) · mutation certification · S4-1 · S8-3 · D-2 · timing baseline for
seven surfaces (Slice 16) · **S8-2/R-018 closed as INCONCLUSIVE-because-inert (this slice)**.

**OPEN — IMPLEMENTABLE (with evidence and a defined repair)**
1. **Work-view lens fan-out** — provision the view the operator is on, not seven. 404 KB per entry and
   per view switch. The single biggest measured waste remaining.
2. **Workspace transition** — shell at 8 ms, content at ~2.73 s: immediate org identity + reserved
   geometry for the section grid. Slice 16's hypothesis stands; nothing this slice contradicts it.

**OPEN — DECISION / EXPERIMENT** — S5-4 (one build pair) · R-005 · S9-1 (monitor) · F-2 · S3-4.

**OPEN — MEASUREMENT** — the five matrix cells in §9.

**NEW this slice** — the work-view fan-out (§3) · the Waitlist composition (§4) · the warm-entry
explanation (§5) · Activity's real cost profile (§6) · S8-2's inertness (§2).

## 11. Is Runtime Performance V2 ready for FINAL REPAIR?

**Almost — one contained repair is now fully evidenced, and one more experiment would complete the
picture.** The lens fan-out has a measured cost (404 KB per entry and per view switch), a single
owner, and an obvious correct behaviour. The Workspace transition has a measured gap and an agreed
treatment. Everything else is either closed, inert, or needs one more build pair.

**Recommended next slice:** *repair the work-view lens fan-out*, with the S5-4 build pair run in the
same window (it needs one build and two journeys), then the remaining matrix cells if the session
allows. That sequence closes the last implementable item and the last cheap experiment together.
