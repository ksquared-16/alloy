# RUNTIME PERFORMANCE V2 — CLOSEOUT

Lane `lane_73a897409906` · slot 1 · Slices 0–20 · final run `erun_3ec61d7eac45f3b2`
Final serving build `dgz1LXNFZlsNrkcI33Kf2`. No experimental switch remains in the tree.

**FINAL STATUS: `RUNTIME_PERFORMANCE_V2_COMPLETE_CERTIFIED`**

## 1. Objective

Audit, repair and certify the runtime performance and perceived performance of Alloy's operator
surfaces — correctness of the runtime first, then waste, then what the operator actually experiences.

## 2. Methodology

Everything reported here was measured, not inferred. Four rules did most of the work:

* **Measure before concluding.** Endpoint-path equality is not request identity (Slice 9 corrected one
  of my own misattributions); a planted defect must be verified on the mutated line, not by grep.
* **Prove a test binds.** Every repair carries a planted-defect run showing the lock failing.
* **Qualify the host.** Timing used `pe3HostGate.sh` plus a control-probe dispersion check; a foreign
  build or Playwright run mid-cell voided that cell and it was re-taken.
* **Production, not dev.** All timing came from a production build with `ALLOY_ROUTE_TIMING=1` on the
  loopback slot; 5 runs per cell, run 1 discarded, medians with ranges, 55 ms sampling and no finer
  precision claimed.

## 3. Major findings and repairs

| # | Finding | Repair |
|---|---|---|
| P0 | A subject refusal tore down the Work View and queue | Containment across all six post-cohort refusal paths |
| F-3/F-4 | Provisioning prewarm and foreground selection raced; cards remounted per switch | One inflight owner; stable card surface |
| — | Header identity oscillated on switch | Monotonic subject identity |
| S4-1 | Cards collapsed to a one-line body while resolving | Reserved geometry (Financials, then Attendance/Health/Current Work) |
| S5-3/S6-1 | `process`, `departmentMetadata`, Summary doc re-sent every selection | Client-claims/server-validates identity; ~126 KB → ~72 KB warm |
| S8-3 | Eligible-children fetched twice on command open | One request owner with preserved error semantics |
| S18-1 | Entry provisioned seven Work Views; the operator sees one | Idle sweep removed, hover intent kept |
| S19-1 | Workspace showed a centred "Thinking…" for ~3 s | Immediate identity + reserved geometry + progressive reveal |

Closed **without** a repair, because the evidence said so: S8-1 (a measurement misclassification of my
own), D-2 and D-4 (StrictMode artifacts), S8-2/R-018 (the historical subject-neighbour speculation is
absent from the production build), F-1 (consume-once kept).

## 4. Measured before → after

| Metric | Before | After |
|---|---:|---:|
| Focus Panel mounts / unmounts per switch | 4 / 3 | **0 / 0** |
| Concurrent provisioning overlaps | 4 | **0** |
| Financials requests per selection | 2 | **1** |
| Eligible-children on command open | 2 | **1** |
| Warm provisioning payload | ~126 KB | **~72 KB** (−43%) |
| Work Unit entry | 45 req / ~810 KB | **38 req / ~468 KB** |
| Work View provisioning at entry | 7 calls / ~404 KB | **1 call / ~70 KB** |
| Work Unit rows meaningful | ~1733 ms | **~1559 ms** |
| Workspace identity visible | ~3036 ms | **~415 ms** (requests and bytes unchanged) |
| Focus Panel subject acknowledged + actionable | — | **~59 ms**, zero blank frames |
| Warmed Work View pill switch | — | **~179 ms, 0 requests, 0 bytes** |

No aggregate "X% faster" number is offered. These are the honest units.

## 5. Final timing matrix

Medians, production build, 55 ms sampling. `N/M` = genuinely unmeasured.

| Surface | Cold meaningful | Warm meaningful | Actionable | Settlement | Class |
|---|---:|---:|---:|---:|:--:|
| Workspace | identity **415 ms**, content ~2.7–3.2 s | ready from retained seed | shell 8–15 ms | ~2.7–3.2 s | **A** |
| Work Unit entry | rows 1559 ms | 1228 ms | 7–38 ms | ~2.0 s | **A** |
| Work View pill (in-app) | 411 ms (no intent) | **179 ms after hover, 0 req** | same | — | **A** |
| Focus Panel subject | — | **59 ms** | 59 ms | 1.54 s | **A** |
| Settings / Organization | 247 ms | 217 ms | same | 1.52 s | **A** |
| Work Items (in-shell) | 119 ms | 173 ms, 2 req / **0 KB** | same | — | **A** |
| Communications (in-shell) | 250 ms, 31 rows | 126 ms, 11 req / 74 KB | same | — | **A** |
| Operations (in-shell) | 175 ms | 56 ms, **0 req / 0 KB** | same | — | **A** |
| Digital Mailroom (in-shell) | 62 ms | 116 ms, **0 req / 0 KB** | same | — | **A** |
| Operational Intelligence | shell 61 ms, content 949 ms | 116 ms | same | — | **A** |
| Financials (in-shell modal) | shell 174 ms, content **not observed** | same | N/M | N/M | **MONITOR** |
| Processing (in-shell) | N/M — no sidebar trigger found | N/M | N/M | N/M | N/M |
| Search → record | N/M — see §8 | N/M | N/M | N/M | N/M |

Zero false-empty frames and one distinct dialog height on every in-shell surface measured. The
`page.goto` "Work View switch" numbers from Slice 16 are **withdrawn**: they measured a full
navigation, not the in-app pill.

## 6. S5-4 — Activity prefetch: **KEEP**

Matched production builds, same subjects, 4 runs each, run 1 discarded.

| | ON | OFF |
|---|---:|---:|
| **Journey A** — hydrate, never open Activity | | |
| T1 / T2 / T3 | 59 ms [58–61] | 59 ms [58–62] |
| T4 settled | 1521 ms | 1530 ms |
| requests / bytes | 6 / 20 KB | 5 / 19 KB |
| Activity request | **1, at +193 ms** | 0 |
| **Journey B** — open Activity | | |
| Activity-open T1 | **60 ms** [59–123] | **120 ms** [119–182] |
| Activity requests on open | 0 | 0 |
| busy / skeleton frames | 0 | 0 |

**Decision: KEEP.** The prefetch costs one request, fires at +193 ms — *after* the 59 ms actionable
point, so it never competes with critical settlement — and Journey A is identical with and without it
(T1–T3 unchanged, T4 within 9 ms). Opening Activity is consistently faster with it, with barely
overlapping ranges. Two caveats recorded rather than buried: the payload is **subject-dependent**
(~1 KB on these subjects, ~66 KB on a rich timeline), and it is paid whether or not Activity is ever
opened. If payload sensitivity ever matters, **RETARGET to Activity-tab hover/focus** is the design —
the same intent signal proven in Slice 18 to commit a Work View switch with zero network. That is a
maintenance option, not a V2 repair.

## 7. Decisions explicitly NOT to optimise

* **Workspace's ~2.7 s composition.** Legitimate work; the repair was continuity, and no latency claim
  is made. Ordinary optimisation candidate, not an experience defect.
* **Waitlist's auto-selected-subject hydration** (drawer VM 176 KB + layout 173 KB + Activity 66 KB).
  Legitimate for a view that auto-selects; only the lens fan-out beside it was waste.
* **A loader for Waitlist.** Its transition is already good; a loader would mask work, not fix it.
* **A smaller Work View sweep.** A bounded guess is still a guess.
* **Financials' certified Slice 4 geometry.** Left unrefactored rather than reopened to match its
  successors.

## 8. Not measured, and why

* **Search → record timing.** The scripted keyboard path did not drive the ⌘K-activated global search
  box, and no route was guessed. Search *correctness* is closed (Phase 1 exercised the real keyboard
  path to a canonical destination); only this timing cell is absent.
* **Processing in-shell.** No sidebar modal trigger exists on this build; the six that do exist were
  measured.
* **Attendance standalone.** No launcher — product navigation owner.
* **Participant-scoped reserved-geometry window.** Never appeared naturally; never fabricated.

## 9. Architecture assessment

**The evidence supports the premise.** Every P0/P1 finding in this programme was an *ownership* defect
rather than a slow algorithm: two callers for one answer (S8-3), two owners for one inflight
(F-3), a speculative sweep with no signal (S18-1), a reveal gate that replaced a working shell
(S19-1), payloads re-sent because nobody tracked what the client already held (S5-3/S6-1). Each had a
single owner once found, and each repair was small. That is the signature of a sound foundation with
accumulated policy drift — not of a runtime that needs rebuilding.

Three supporting observations: the Focus Panel — the most heavily exercised surface — is now **59 ms**
to acknowledged and actionable with zero blank frames across every sampled switch; warm subject reuse
is **complete** (zero provisioning per switch); and a mutation converges correctly with counts, rows
and selection agreeing at every frame.

**One systemic concern remains, stated plainly:** speculative warming has repeatedly been added with a
real consumer and no signal about *when* it pays — the subject-neighbour sweep (later guarded into
inertness), the Work View sweep (removed here), and Activity prefetch (kept, but subject-dependent).
The pattern is benign individually and compounding collectively. The durable lesson is the one Slice 18
proved: **warm on intent, where the signal names the destination.** Worth a standing review rule rather
than another sprint.

## 10. Residual buckets

**CLOSED** — everything in §3 and §4.

**MAINTENANCE — PERFORMANCE**
* Workspace composition (~2.7 s) — ordinary optimisation candidate.
* Communications warm reopen still re-fetches 11 requests / 74 KB, unlike the other in-shell surfaces
  which reopen at 0.
* S5-4 RETARGET-to-hover design, if payload sensitivity ever matters.
* R-005 — historical experiment, never run; no longer gates anything.

**MAINTENANCE — PLATFORM / ARCHITECTURE**
* F-2 location-hierarchy ownership (many callers, private URL constants, no operator-visible defect).
* A standing review rule for speculative warming (§9).

**PRODUCT OWNER**
* Attendance standalone launcher.

**TOOLKIT / DEVOPS OWNER**
* `alloy-dev-start --production` applies the loopback bind to the dev command and then overwrites it
  with `ALLOY_PROD_COMMAND`, so production binds the wildcard and collides with Tailscale Serve.
  Certified workaround: `ALLOY_CONFIG_FILE` pointing at a scratch config. Two lanes have now hit this.

**MONITOR**
* S9-1 — the intermediate `rowStage=lead` has not reproduced in two subsequent mutation certifications.
* S3-4 — no new evidence.
* Financials in-shell modal — content not observed in 12 s of sampling, both cold and warm, with 46
  busy frames. My row selector may not match its layout, so this is an observation to confirm, **not** a
  reported defect.

## 11. Final status

**`RUNTIME_PERFORMANCE_V2_COMPLETE_CERTIFIED`**

Every repair this programme identified is landed, certified and locked by tests whose binding was
proven. The OPEN — IMPLEMENTABLE list is empty. Residual items are assigned to maintenance, product,
toolkit or monitoring above; none of them gates closeout.
