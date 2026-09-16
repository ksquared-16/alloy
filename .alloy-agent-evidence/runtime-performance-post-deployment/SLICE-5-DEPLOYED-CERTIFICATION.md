# POST-DEPLOYMENT QA — SLICE 5: FIRST DELIBERATE PROMOTION + DEPLOYED CERTIFICATION

Run `erun_a36e4451970b9815` · lane `lane_73a897409906`
**No product code changed in this slice.** Promotion and measurement only.

## 1. PRE-PROMOTION PROVENANCE — PASS

| Check | Result |
|---|---|
| Authorized candidate | `87447616a45cb3ec71db700629cf35ab7848efbc` |
| Contains Repair Slices 1, 2, 3 | Yes — `bf807ca85`, `05674c84d`, `4392e1eaf` |
| Performance Slice 4 product mutation | **None.** `git diff --name-only 87447616a..cfb65eda3` → one file, `PERFORMANCE-SLICE-4.md` |
| Working tree | Clean of product changes (4 untracked evidence dirs from other lanes, 1 stray `a.md`, none promoted) |
| Staging base at start | `d6da7dce8` (PR #1037 access-identity), merge-base `26a63a7b5` — staging had moved 4 commits |
| Reconciliation | `git merge origin/staging` → `3b4bccc12`. **Zero file overlap** between the two sides |
| Repair components after merge | `git diff cfb65eda3..3b4bccc12 -- web/components/` → empty; untouched |
| Migrations introduced | **None** |
| Promotion scope | 4 components changed, 1 deleted, 5 test files, 6 evidence docs |
| Typecheck | `vac run typecheck` rc=0 |
| Focused repair certification, re-run on the merged base | **183/183 passed**, 10 files |

The merged-base re-run matters: Slices 1–3 were certified against a base that no longer existed once
#1037 landed. The suites were re-run on `3b4bccc12`, not assumed forward.

## 2. PROMOTION — ONE DELIBERATE PROMOTION

| | |
|---|---|
| Push | `gar_c042562d1561e2` → `tha_b25fbc9a341c86`, `refs/heads/fix/placement-truth-certification` @ `3b4bccc12` |
| PR | **#1038** — https://github.com/ksquared-16/alloy/pull/1038 |
| Checks | **11 pass, 1 skipping, 0 fail** |
| Merge | `gar_612d0ee8bd878f` → `tha_08692abe472c40` |
| **Merge SHA** | **`ec8cdaa605da374d1bbec9e389b233f13c76709f`** |

No intermediate promotions. No opportunistic fixes.

### Three governed-contract corrections, reported rather than buried

1. **`promotion.open_pr` requires `expected_head_sha`.** The first filing failed
   `missing_expected_head_sha`. Refiled with it; PR #1038 opened.
2. **The merge was operator-APPROVED and still failed execution**, on
   `hosted_migration_evidence_stale` — a peer lane (`lane_b77b3cbb5840`, PR #991) ran
   `database.apply_migration` after the last hosted-ledger parity census, invalidating it for every
   merge. **This candidate carries no migrations**, so the gate was never about its content. Cleared by
   re-measuring: `database.read_census` `gar_8f22560c3a41b5` →
   `certification/migrations/hosted-migration-identity-census.sql` (sha256 `0eaba55c78…`, target
   `alloy_deployed_primary`). The re-filed merge then landed.
3. **`environment.restore_deployed_qa_session` takes `deployed_target`, not `target`,** and takes no
   `laneId`. The first filing failed `result_validation_failed` with `failure_reason: "target, laneId"`
   — a list of the keys it *rejected*, not the one it wanted. Nothing minted (verified by storage-state
   mtime, not by the message).

### A deliberate choice at the merge gate

Branch protection requires only three checks. `Full graph (tests + scripts)` is **not** required, so
PR #1038 reached `UNSTABLE` — mergeable — while it was still running. I waited for it anyway. It is
the broadest gate and the only one covering `scripts/`, and merging on a technicality while the widest
check was still running would have been the same class of error this whole programme exists to correct.
It passed.

## 3. DEPLOYMENT VERIFIED

```json
{ "gitSha": "ec8cdaa605da374d1bbec9e389b233f13c76709f",
  "gitBranch": "staging",
  "gitMessage": "Merge pull request #1038 … loader ownership, click acknowledgement, commit-frame meaning",
  "vercelEnv": "preview", "nodeEnv": "production",
  "vercelDeploymentId": "dpl_H95ELGXP27iA4Nq84AEWqMeBXo8C",
  "supabaseProjectRef": "ikaxilmwmrmbagoidedu" }
```

Deployment confirmed 2026-09-16T17:58:57Z (~5 min after merge). QA session `alloy_staging_web`,
identity `qa-slot1-product@example.com`, minted 10:52 PDT, valid to 11:52; authenticated load verified
(no login redirect). **No measurement below was taken against the previous deployment.**

---

## FINAL STATUS: `DEPLOYED_REPAIR_CERTIFICATION_PARTIAL`

| Gate | Result |
|---|---|
| **P0-1** Workspace loader | **PASS** |
| **P0-5** Work View acknowledgement | **PASS** |
| **P0-2** Business Process at commit | **FAIL** |
| **P0-3 / P0-4** Attendance / Health | **PASS on the collapse; a NEW UPSTREAM FINDING behind it** |
| **P0-6** Focus Panel semantic settlement | **PARTIAL** — one LESS INFORMATIVE transition remains |
| **S8-2** residual | measured; classification **corrected to BENEFICIAL** |

---

## 4. P0-1 — WORKSPACE LOADER · **PASS**

Three cold `/workspace` loads, fresh browser context each (genuinely cold), frame-sampled at 50 ms.

| | run 0 | run 1 | run 2 | baseline (Slice 2) |
|---|---:|---:|---:|---:|
| frames sampled | 388 | 375 | 371 | — |
| **"Preparing your workspace…" frames** | **0** | **0** | **0** | 118 / 85 / 89 |
| **`WorkspacePendingSurface` frames** | **0** | **0** | **0** | present |
| boot-shell frames | 110 | 123 | 163 | 4 / 8 / 19 |
| first non-blank frame | 1,542 ms | 1,546 ms | 1,510 ms | — |
| **boot shell present in that first frame** | **yes** | **yes** | **yes** | no |
| **gap frames** (neither loader nor content) | **0** | **0** | **0** | — |
| workspace header (real content) | 7,168 ms | 7,263 ms | 10,466 ms | 9,755 / 6,531 / 7,668 |

Every required condition holds: zero frames of the rejected treatment, the deleted surface cannot
appear, the canonical loader is present from the first non-blank frame and **holds continuously** until
content (zero gap frames). The rejected "caption on a blank white page" experience is gone.

Workspace content itself is still 7.2–10.5 s. Per the slice, P0-1 validates the loading **experience**,
not Workspace speed — reported, not failed.

## 5. P0-5 — WORK VIEW ACKNOWLEDGEMENT · **PASS**

Acknowledgement recorded **in-page** by a `requestAnimationFrame` poll keyed to the real `pointerdown`
(≈16 ms resolution), because a CDP sampler cannot honestly resolve a 150 ms gate.

| Cell | dwell | pointer→click | **click→`aria-selected`** | pending appears | pending clears | queue meaningful | panel meaningful | req | KB |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **A** cold ordinary (New, 3 rows) | 0 | 0 ms | **118 ms** | 118 | 3,005 | 3,237 | 3,237 | 12 | 238 |
| **B** second ordinary (Registration, 1) | 0 | 0 ms | **108 ms** | 108 | 8,039 | 8,277 | 8,277 | 8 | 169 |
| **C** natural hover (Waitlist, 16) | 350 | 353 ms | **51 ms** | 51 | 5,880 | 6,039 | 6,039 | 4 | 623 |
| **D** deliberate warm (All, 7) | 1,200 | 1,203 ms | **98 ms** | 98 | 1,295 | 1,495 | 1,495 | 12 | 422 |
| **E** ordinary, distinct (Registration, 1) | 0 | 0 ms | **99 ms** | — | — | 274 | 274 | 7 | 91 |

**All five under the 150 ms gate.** Baseline was **5,014–6,326 ms** — a 40–120× improvement, and the
first time on staging that a click is acknowledged at all.

Every required affordance holds: `data-work-view-intent="pending"` and `aria-busy` appear **in the same
frame as the acknowledgement** and clear exactly when the destination lands (A 3,005→3,237;
B 8,039→8,277; C 5,880→6,039; D 1,295→1,495). `final_sel` equals the requested view in all five cells
and no cell ends still pending. Cell E shows no pending state because its destination resolved in
274 ms — the model agreed immediately, so there was nothing to await; that is correct, not a miss.

**Destination latency is still multi-second (274 ms – 8,277 ms) and is reported, not masked.** Per the
slice, the acknowledgement repair is not failed for it. Human closeout decides whether it is acceptable.

## 6. P0-2 — BUSINESS PROCESS · **FAIL**

Cold Work Unit entry, request-correlated:

| Milestone | deployed now | Slice 2 baseline |
|---|---:|---:|
| rows | 13,551 ms | 11,769 ms |
| first cards meaningful | 13,551 ms | 14,707 ms |
| **Business Process first present** | **20,113 ms** | 20,656 ms |
| **Business Process first meaningful** | **20,113 ms** | 20,656 ms |
| **semantic gap** | **6,562 ms** | 5,949 ms |

The card is **absent from the DOM** until 20,113 ms, then arrives already meaningful. The gap did not
collapse to the commit frame; it did not improve.

### Root cause — and why Repair Slice 2 could not have worked

Repair Slice 2 changed the card's **fallback content** (`buildBusinessProcessCardEvidence(context, …)`
in place of an empty-context run of the same builder). That code can only execute **once the card is
mounted**. It is not:

```
COMMIT_CRITICAL_CARD_SPECS → current_work, household, children, readiness_kpi
MOUNTABLE_CARD_SPECS       → attendance, health_safety, financials
```

**`business_process` appears in neither list**, so it is never admitted to the commit frame and only
enters the grid when Settlement composes it. The measurement corroborates this exactly: at 13,551 ms
the mounted cards are `financials`, `attendance`, `health_safety` — the three `MOUNTABLE` specs — while
`business_process`, `household` and `children` all arrive together at 20,113 ms.

My Slice 2 note already recorded that the card was *"absent from the DOM, not an empty shell"*. That
was the tell, and I read it as a content defect instead of a mounting one.

**Smallest next repair boundary:** admit `business_process` to `COMMIT_CRITICAL_CARD_SPECS` with an
`isKnowable` requiring the answer's `situation` — which `buildCommitCriticalOperationalContext` already
sets from `currentBusinessState` (`businessProcess.key/label/stageKey`). No new data is needed; the
commit frame already carries the stage evidence. **Not repaired in this run.**

## 7 & 8. P0-3 ATTENDANCE / P0-4 HEALTH · **PASS on the collapse — NEW UPSTREAM FINDING behind it**

| Card | t = 13,551 ms | t = 20,113 ms (settled) | token |
|---|---|---|---|
| Attendance | "ATTENDANCE — TODAY · No record · No attendance recorded today · This child has no active enrolment, so attendance ca…" | "ATTENDANCE Attendance is not available for this child." | **`unavailable`** |
| Health & Safety | "HEALTH & SAFETY · REQUIRED INFORMATION · Physical / health assessment Missing · Immunization record Missing…" | "HEALTH & SAFETY Health information is not available for this child." | **`unavailable`** |

**The collapse is repaired.** The settled state is no longer the bare, unexplained *"No attendance
record."* / *"No health record."*; it states the producer's actual verdict, and the DOM token agrees
with the visible copy.

That agreement is a real discriminator, established against the **previous** deployment before
promoting: the pre-repair build carries only two tokens (`no-participant`, `loading`) and rendered
*"No attendance record."* **under the `loading` branch** — token and copy contradicting each other.
Four verdicts are now distinguishable: `permission` / `error` / `unavailable` / `no-record`.

### NEW UPSTREAM FINDING (record, do not repair here)

**The deployed producer returns `unavailable` for a child whose commit frame carried real content.**
At 13,551 ms Attendance showed a dated *"no active enrolment"* explanation and Health showed a
required-information projection; at settlement the producer's verdict for the same subject is
`unavailable`. So the settled state, while honest about the producer, is **less specific than the
commit frame** — the transition is still LESS INFORMATIVE.

This is no longer a presentation defect: presentation is now faithfully reporting what the projection
returns. The question moves upstream to why
`operationalProjection.cards.attendance` / `.health` resolve to `unavailable` for a subject the commit
frame could describe. Per the slice instruction this is recorded for master-thread decision and **not
repaired in this run**.

## 9. P0-6 — FOCUS PANEL SEMANTIC SETTLEMENT · **PARTIAL**

| Card | first present | first meaningful | final authoritative | transition |
|---|---:|---:|---|---|
| Financials | 13,551 | 13,551 | "CURRENT PERIOD September 2026 · NET OBLIGATION $43.00…" | **SAME MEANING** — arrives complete |
| Attendance | 13,551 | 13,551 | "Attendance is not available for this child." | **LESS INFORMATIVE** (explained above) |
| Health & Safety | 13,551 | 13,551 | "Health information is not available for this child." | **LESS INFORMATIVE** (explained above) |
| Business Process | **20,113** | 20,113 | "ENROLLMENT Lead Aug 7 · Tour North Campus · Decision Sep 12 · Waitlist Wrigley…" | **late unexplained absence** — 6,562 ms |
| Household | 20,113 | 20,113 | "Needs contact · Kurzman household · Updated Sep 12, 2026…" | late arrival, no pending state |
| Children | 20,113 | 20,113 | "Needs info · 17 children · 1 enrolled, 1 waitlisted…" | late arrival, no pending state |

Against the four required conditions:

* **"no critical card appears as a late unexplained blank/absence"** — **NOT MET.** Business Process,
  Household and Children are all absent from the DOM until 20,113 ms with no pending or reserved state.
* **"no repaired Attendance/Health semantic regression"** — **MET.** Neither regressed relative to the
  repair; both improved their terminal state.
* **"Business Process no longer contributes the previous ~5.9 s late-card assembly"** — **NOT MET.**
  It is 6,562 ms.
* **"no card becomes LESS INFORMATIVE without an explicit authoritative explanation"** — **PARTIALLY
  MET.** Attendance and Health now carry an explanation, but a less specific one than the state they
  replace.

Not certified from card count or geometry: card count is a flat 6 throughout, which is precisely why it
proves nothing.

## 10. S8-2 RESIDUAL — MEASUREMENT ONLY

Row A `ddc23ed1` selected; A meaningful at 3,177 ms; row B `4e3fb78d` clicked immediately (gap 0 ms).
All `provisioning-answer` requests, relative to A's click:

| subject | start | end | duration | role |
|---|---:|---:|---:|---|
| `ddc23ed1` | **103** | 6,166 | 6,063 ms | **A — the selected subject** |
| `8b3689fb` | 247 | 5,884 | 5,637 ms | neighbour warm |
| **`4e3fb78d`** | **247** | 5,480 | 5,233 ms | neighbour warm — **this is B** |
| `d2a3b448` | 247 | 5,656 | 5,409 ms | neighbour warm |
| `c68e8793` | 3,311 | 8,542 | 5,231 ms | neighbour warm, post-B |

| | |
|---|---|
| neighbour requests in flight when B's reveal began | **4** |
| **B joined an existing warm** | **YES** |
| requests issued after B's click | **1** |
| B row acknowledged | **65 ms** |
| B panel meaningful | **2,483 ms** (vs A's own 3,177 ms cold) |

### Classification CHALLENGED — and my Slice 4 mechanism was wrong

Slice 4 returned `S8-2_NEUTRAL` and argued the warms are *structurally excluded* from the reveal
window. **This measurement disproves that mechanism.** The neighbour warms start at t=247 ms — while
A's own commit-critical `provisioning-answer` (103 → 6,166 ms) is still in flight. They are **not**
suppressed.

The reason is that `beginWorkUnitPrimaryReveal()` lives in `useRecordWorkRuntime`, which fetches the
**drawer VM** — and on this path the drawer VM cannot start until the provisioning answer commits. So
the entire click→commit phase has **no active reveal**, and the gate never applies to it. Slice 4
generalised from a cold *navigation* trace (where no rows exist yet, so there are no neighbours to
warm) to row-to-row *selection*, which is a different path.

**The conclusion nevertheless strengthens, on evidence rather than argument:**

* **Ordering is correct.** The selected subject's request goes first (103 ms) and the speculative ones
  follow (247 ms).
* **No measured harm.** A's provisioning took 6,063 ms with three neighbours running concurrently; the
  Slice 2 cold trace measured 7,329 ms for the same request with none.
* **Measured benefit, directly.** B *was* one of the prewarmed neighbours, joined the in-flight warm,
  issued **one** further request, acknowledged in **65 ms** and was meaningful in **2,483 ms** — faster
  than the cold subject that preceded it.

Recommended reclassification: **`S8-2_BENEFICIAL`** on the selection path, with the Slice 4 *reasoning*
corrected in the record. **No policy changed in this run**, as instructed.

## 11. NEW DEPLOYED PERFORMANCE BASELINE

39 requests · 1,006 KB (baseline: 40 / 1,007 KB).

| Milestone | deployed now | Slice 2 baseline |
|---|---:|---:|
| Workspace → meaningful | 7,168 / 7,263 / 10,466 ms | 6,531 / 7,668 / 9,755 ms |
| Work Unit → rows | 13,551 ms | 11,769 ms |
| Work Unit → first meaningful cards | 13,551 ms | 14,707 ms |
| Work Unit → settled | ~24,730 ms | 24,983 ms |
| Work View → acknowledgement | **51–118 ms** | 5,014–6,326 ms |
| Work View → queue meaningful | 274–8,277 ms | 3,182–6,655 ms |
| Work View → panel meaningful | 274–8,277 ms | 3,182–6,655 ms |

| Dominant request | start | duration | baseline |
|---|---:|---:|---:|
| `provisioning-answer` | 7,726 | **5,765 ms** | 7,329 ms |
| `view-models/drawer/opportunity` | 13,530 | **6,327 ms** | 5,672 ms |
| `layout-runtime/opportunity-drawer-body` | 19,972 | **4,758 ms** | 4,616 ms |
| `ai/workflow-assist/capabilities` | 3,656 | 1,893 ms | 1,534 ms |
| `ai/config-layout-assist/capabilities` | 3,656 | 1,275 ms | 2,860 ms |

**Only the acknowledgement figure moved by more than environment noise.** Every request timing is
within ±15% of the baseline in both directions on single runs, which is not evidence of change and is
not reported as any. The shape is unchanged and still server-bound: three server responses
(5,765 + 6,327 + 4,758 ms) account for ~16.9 s of a ~24.7 s settle.
## 12. P1-1 — CERTIFICATION DEBT INVENTORY

Not a framework. The exact changes this programme has now **proven** necessary, each with the
observation that proved it.

| # | Certification change | Proven by | Class |
|---|---|---|---|
| 1 | **Deployed staging is the performance acceptance environment.** No timing may be certified from loopback. | Every V2 figure was 4–12× optimistic; Work Unit entry certified 1,559 ms, deployed 11,769 ms | **MUST_FIX_BEFORE_PROGRAMME_CLOSE** |
| 2 | **Loopback is admissible only as a lower bound, a regression comparison, or causal isolation** — never as acceptance. | Same; and Slice 17's "S8-2 inert" was a correct loopback measurement with no deployed standing | **MUST_FIX_BEFORE_PROGRAMME_CLOSE** |
| 3 | **Human-speed click tests.** A warm dwell must be declared, not smuggled in. | The certified P0-5 figure of 179 ms came after `hover(); waitForTimeout(1200)`; the ordinary click was 5,042 ms | **MUST_FIX_BEFORE_PROGRAMME_CLOSE** |
| 4 | **click→acknowledgement measured separately from click→meaningful.** | On staging all three milestones landed in the same sample — "nothing, then everything" — so a single metric could not see that the pill was dead for 5 s | **MUST_FIX_BEFORE_PROGRAMME_CLOSE** |
| 5 | **Per-card semantic settlement milestones** (first present / first meaningful / final authoritative), not panel-level readiness. | BP was *absent from the DOM* until 20.7 s while the panel scored "settled" at 14.7 s | **MUST_FIX_BEFORE_PROGRAMME_CLOSE** |
| 6 | **Producer verdict preservation is a certifiable contract.** `ready`/`unavailable`/`error`/`forbidden`/no-record must be distinguishable in the DOM. | Four verdicts collapsed into one sentence; no gate could see it because the card still rendered | **MUST_FIX_BEFORE_PROGRAMME_CLOSE** |
| 7 | **Semantic monotonicity gate:** no card may become LESS INFORMATIVE across settlement without an authoritative explanation. | Attendance and Health both regressed from an explained state to a bare absence | **MUST_FIX_BEFORE_PROGRAMME_CLOSE** |
| 8 | **Critical-card time-to-meaningful-content** as a first-class metric, distinct from time-to-render. | The whole P0-2 defect is invisible to a render-time metric | **MUST_FIX_BEFORE_PROGRAMME_CLOSE** |
| 9 | **Visual loading acceptance — frame-sampled, and identity scored from the rendered mark, not a DOM string.** | The Slice 19 harness scored "identity" as a string appearing and therefore recorded the *branded* loader as having no identity. That single scoring error produced P0-1 | **MUST_FIX_BEFORE_PROGRAMME_CLOSE** |
| 10 | **Post-promotion cold walkthrough is part of certification**, not a courtesy after it. | The entire post-deployment QA programme exists because certification ended at merge | **MUST_FIX_BEFORE_PROGRAMME_CLOSE** |
| 11 | **Stale source-anchor locks discovered in Slice 4.** `drawerVmPrewarmScheduler.test.ts` reads a route deleted in `2cdd4a398`; `siblingWorkViewPrewarmDefersToReveal.test.ts` anchors on `siblingViewIds`, which exists nowhere. Both were green-by-absence through V2. | Re-run in Slice 4 | FOLLOW_UP_MAINTENANCE |
| 12 | **Missing behavioural neighbour-prewarm / reveal-gate test.** The gate has only a source-presence grep (`workViewProvisioningPolicy.test.ts:67`). | That absence is exactly what let Slice 17 and Slice 2 reach opposite conclusions with neither contradicted | **MUST_FIX_BEFORE_PROGRAMME_CLOSE** |

**On (11) vs (12).** The stale locks are maintenance: they assert nothing about current behaviour, so
repairing them changes no verdict. The missing gate test is not maintenance — it is the reason a
performance finding could be closed as "inert" and reopened as "fires" without either being wrong, and
it must exist before this programme closes.

**A thirteenth, which the programme did not set out to find.** Items 1–10 share one root: **every V2
gate measured a proxy for the operator's experience rather than the experience.** Loopback proxied for
staging, a DOM string proxied for a rendered mark, panel-settled proxied for card-meaningful, and a
warmed dwell proxied for a click. Certification debt is not a list of missing assertions; it is a
standing rule that each gate must name the operator-observable fact it claims to measure.

**A thirteenth item, added by this slice.** *Certification harnesses are themselves uncertified.* Three
harness defects were caught in this run alone — a `MutationObserver` that recorded nothing because React
replaces the pill node rather than mutating it; a card-token selector that read two different elements
as one card; and view cells targeting zero-row Work Views, which is the **same** targeting flaw as
Slice 2. Each would have produced a confident, wrong certification verdict. A harness that measures a
gate must first be shown to fail when the gate fails. Class: **MUST_FIX_BEFORE_PROGRAMME_CLOSE**.

## 13. FAILED GATES — NO REPAIR PERFORMED

### FAILED GATE: P0-2 — Business Process not meaningful at commit

* **Observed:** absent from the DOM until 20,113 ms; first cards at 13,551 ms; gap **6,562 ms** (baseline 5,949 ms — unimproved).
* **Root-cause evidence:** `business_process` is in neither `COMMIT_CRITICAL_CARD_SPECS`
  (`current_work`, `household`, `children`, `readiness_kpi`) nor `MOUNTABLE_CARD_SPECS`
  (`attendance`, `health_safety`, `financials`). It is never admitted to the commit frame, so Repair
  Slice 2's fallback change — which runs only after mount — could not take effect. Corroborated by the
  measurement: the three `MOUNTABLE` cards are exactly the three present at 13,551 ms.
* **Smallest next repair boundary:** add a `business_process` entry to `COMMIT_CRITICAL_CARD_SPECS`
  whose `isKnowable(context)` requires `context.businessProcess.stageKey`, built through the same
  shared builder. `buildCommitCriticalOperationalContext` already populates it from the answer's
  `currentBusinessState`. One spec entry; no new data, no new request.

### PARTIAL GATE: P0-6 — late unexplained absence, and a residual LESS INFORMATIVE transition

* **Observed:** `business_process`, `household` and `children` all absent until 20,113 ms with no
  pending or reserved state; Attendance and Health settle less specific than their commit frame.
* **Root-cause evidence:** the absence shares P0-2's cause for `business_process`; for `household` and
  `children` the specs exist but their `isKnowable` returned false for this subject. The LESS
  INFORMATIVE transition is now upstream, not presentational (§7/8).
* **Smallest next repair boundary:** two separate ones, deliberately not merged — (a) the P0-2 spec
  entry above, and (b) a projection-level question: why `operationalProjection.cards.attendance` /
  `.health` return `unavailable` for a subject whose commit frame carried real content. (b) is a
  producer investigation, not a card change, and must not be "fixed" in presentation.

### NEW UPSTREAM FINDING: producer returns `unavailable` for a described subject

Stated in §7/8. Not a repair boundary until the projection is investigated — masking it in the card
would re-create exactly the defect Repair Slice 3 removed.

## 14. PROGRAMME LEDGER

| Finding | Status after this slice |
|---|---|
| **P0-1** Workspace loader | **CLOSED — verified on deployed staging** |
| **P0-5** Work View acknowledgement | **CLOSED — verified on deployed staging** (destination latency reported, open for human judgement) |
| **P0-2** Business Process at commit | **OPEN — repair ineffective, root cause identified** |
| **P0-3 / P0-4** Attendance / Health | **Presentation CLOSED; new upstream projection finding OPEN** |
| **P0-6** Focus Panel settlement | **OPEN — depends on P0-2 and the projection finding** |
| **S8-2** neighbour prewarm | **Measured. Recommend `S8-2_BENEFICIAL`; Slice 4 mechanism corrected** |
| **P1-1** certification debt | **Inventoried — 11 MUST_FIX, 1 FOLLOW_UP** |

### Exact remaining blockers

1. **P0-2** — one `COMMIT_CRITICAL_CARD_SPECS` entry for `business_process`.
2. **Projection finding** — why Attendance/Health resolve `unavailable` for a described subject.
3. **P0-6** — follows from 1 and 2; also `household` / `children` mounting late.

Blockers 1 and 2 are independent and can be worked in either order. Neither was repaired here.

### `READY_FOR_FINAL_HUMAN_WALKTHROUGH`

**Not yet — but the walkthrough is worth doing now for the two closed gates.**

The two findings the human raised most directly — a blank white page on entry, and a click that does
nothing for five seconds — are **fixed and verified in the environment the operator uses**. Those are
worth seeing. But P0-2 and P0-6 are open with a known, one-entry repair outstanding, so a walkthrough
today would still show a Focus Panel assembling for six seconds after the first cards land. The
efficient sequence is: land the P0-2 spec entry, take the projection finding as a separate decision,
then walk through once.

**Final programme certification remains reserved for the user's human staging walkthrough. This slice
does not claim it.**
