# POST-DEPLOYMENT QA — SLICE 2: DEPLOYED REPRODUCTION + REPAIR MAP

Run `erun_92b6ce38c13afd56` · deployed SHA `fad44d32a8bd91886437270f5623e2ec339d3d0f`
**No product code changed. No revert performed.**

## A. Deployed environment proof

`https://staging.workwithalloy.com/api/build-info` → gitSha `fad44d32a8bd…`, gitBranch `staging`,
nodeEnv `production`, vercelEnv `preview`, supabaseProjectRef `ikaxilmwmrmbagoidedu`.
Session: `alloy_staging_web`, identity `qa-slot1-product@example.com`, restored 09:45:22, verified by an
authenticated `/workspace` load (no login redirect, "STAGING — NOT PRODUCTION" banner present).
Subject surface: Enrollment · Work Unit `waitlist` (`new_work_view_4`, `data-queue-total=16`),
work unit `99bc2a38-6d47-…`, department `3933ac47-077a-…`. No product data was mutated.

## B. THE HEADLINE: the certified numbers do not describe this environment

Every V2 timing was taken on a loopback production build. Deployed staging is **4–12× slower on the
same interactions**, and behaves differently in kind.

| Interaction | certified (loopback) | **deployed staging** |
|---|---:|---:|
| Work Unit entry → rows | 1,559 ms | **11,769 ms** |
| Work View click → selection acknowledged | 411 ms | **5,042 ms** |
| Work View warmed (1.2 s dwell) → meaningful | 179 ms | **3,182 ms** |
| Workspace content | ~2,700 ms | **6,531–9,755 ms** |

This single fact explains most of the human complaint, and it is the certification defect underneath
P1-1: **the programme certified an environment the operator does not use.**

## C. P0-1 — Workspace, live (3 cold runs)

| | run 0 | run 1 | run 2 |
|---|---:|---:|---:|
| canonical boot-shell frames | 4 | 8 | 19 |
| **"Preparing your workspace…" frames** | **118** | **85** | **89** |
| → seconds of the rejected treatment | **≈7.1 s** | **≈5.1 s** | **≈5.3 s** |
| workspace header (real content) | 9,755 ms | 6,531 ms | 7,668 ms |

The screenshot at 2,500 ms shows the operator's complaint exactly: org name, the sentence
"Preparing your workspace…", and **an otherwise blank white page**. The two reserved slots I added are
`bg-white/60` with a `border-alloy-stone/18` on white — **visually null**. So this is not "faint
blocks"; on staging it is a caption on an empty canvas, which is Blocker 3 verbatim.

Locally this state lasted ~2.7 s. On staging it lasts **5–7 s**. I certified the short version of an
experience the operator sees for twice as long.

## D. P0-2 — Business Process critical path, measured

Cold Work Unit entry, single run, request-correlated:

* first cards present: **14,707 ms**
* **Business Process first present: 20,656 ms** — the card is *absent from the DOM*, not an empty
  shell, until then
* at **14,695 ms** the browser issues `/api/admin/view-models/drawer/opportunity/d097e1a8-…` — the
  drawer VM, which is the producer that fills `operationalProjection`
* that request starts in a burst of **11 requests within ~110 ms** (stage-membership-ack,
  entity-layouts/focus-panel-summary, metrics/resolve, queue-view-totals, right-rail-bundle,
  queue-row-layout, lifecycle-builder, communications family-workspace/threads/bindings)

**Measured time-to-meaningful-content for Business Process: ~20.7 s cold; ~5.9 s after its siblings.**

Answers to the specific questions:
* **Producer:** `/api/admin/view-models/drawer/opportunity/<id>` → `subjectVm.workspace.operational_projection`.
* **Begins:** at commit, ~14.7 s, together with ten other requests.
* **Already available at commit?** The *stage rail* is: `buildOperationalContext` computes
  `businessProcess` (stage key, label, process name, ordered stages) from the subject VM's lifecycle
  rail — but the card renders `operationalProjection.businessProcess.**evidence**`, a different and
  larger object. A meaningful subset (current stage + ordered stages) is therefore conceptually
  available earlier than the full evidence payload.
* **Would making it commit-critical block unrelated cards?** Yes, if the whole evidence payload were
  moved into the commit frame — it is the same drawer VM the other settlement cards wait on.
* **Could a truthful pending state satisfy the requirement without a new fetch?** Yes. The card
  currently falls back to `EMPTY_BUSINESS_PROCESS_EVIDENCE`, which renders as *nothing*. A pending
  state that says the process is resolving — or that renders the stage rail already known at commit —
  requires no new request and no new runtime.

## E/F. P0-3 Attendance and P0-4 Health — the sequences, verbatim

Captured live during cold hydration (distinct states, in order):

**Attendance**
1. `"ATTENDANCE — TODAY No record No attendance recorded today This child has no active enrolme…"`
2. `"ATTENDANCE No attendance record."`

**Health & Safety**
1. `"HEALTH & SAFETY REQUIRED INFORMATION Physical / health assessment Missing Immunization rec…"`
2. `"HEALTH & SAFETY No health record."`

Both settle **LESS INFORMATIVE**. State 1 is the loaded card (`vm` present — for Attendance carrying
`unavailableReason`, for Health carrying the required-information projection); state 2 is the fallback
root (`vm == null`, nothing pending). At the settled observation the subject attribute on both cards
was `bf7bb266`, and both cards agreed on it — so this is **not** held prior-subject content.

**What I could not close in this window:** the projection value (`operationalProjection.cards.attendance`
/ `.health`) at each milestone, and therefore *why* the vm becomes null. That needs either in-page
access to the projection or added read-only instrumentation, and I did not add instrumentation to a
deployed build. **E and F are therefore reproduced but not fully attributed.**

## G. P0-5 — Work View matrix at four interaction speeds (deployed)

| Cell | dwell | pointer→click | **selection ack** | queue meaningful | panel meaningful | req | KB |
|---|---:|---:|---:|---:|---:|---:|---:|
| **A cold → All** | 0 ms | 0 ms | **5,042 ms** | 5,042 | 5,042 | 12 | 247 |
| **A2 cold → Enrolled children** | 0 ms | 0 ms | **5,014 ms** | 5,014 | 5,014 | 12 | 261 |
| **B immediate repeat → Waitlist** | 0 ms | 0 ms | **6,326 ms** | 6,326 | 6,326 | 9 | 726 |
| **C natural hover ~350 ms → Registration** | 350 ms | 353 ms | — | 6,655 | 6,655 | 9 | 726 |
| **D deliberate warm 1,200 ms → Enrolled children** | 1,200 ms | 1,202 ms | — | 3,182 | 3,182 | 13 | 335 |

Two findings, and the first is the important one:

1. **Selection acknowledgement itself takes ~5 seconds.** The pill does not visibly select for five
   seconds after the click. No warming policy can fix that — the operator gets no feedback that their
   click registered. Every milestone lands in the *same sample*, so there is no progressive
   acknowledgement on staging at all: nothing, then everything.
2. Warming still helps (3.2 s vs 5–6.7 s) but **the warmed figure is 3.2 s, not 179 ms**. The
   certified headline was a loopback artifact.

**Does P0-5 need code?** Yes — but not in the warming policy. The repair boundary is
**immediate selection acknowledgement**, which is a presentation concern, not a prefetch one.

## H. Correlated network timeline (cold Work Unit entry)

```
 0 ms        navigation commit
 …           (queue/provisioning work)
11,769 ms    rows + first cards visible; Financials, Attendance, Health all meaningful together
14,692 ms    burst of 11 requests in ~110 ms — incl. view-models/drawer/opportunity (the BP producer),
             entity-layouts/focus-panel-summary, lifecycle-builder, right-rail-bundle,
             communications family-workspace + threads + bindings
15,3–16,2 s  those responses land
20,656 ms    Business Process card first present and meaningful
24,983 ms    settled · 40 requests · 1,007 KB
```

Serialization is real: the settlement burst cannot start until commit lands at ~14.7 s, and BP needs a
response from inside that burst. Concurrency inside the burst is not itself a defect and is not
reported as one.

**One contradiction of a previous finding, reported rather than buried:** on an ordinary row click,
staging issued **three `provisioning-answer?subject_id=…` requests for three different subjects within
255 ms** — the neighbour-subject prewarm. My Slice 17 A/B concluded that fan-out was "inert in
production"; that conclusion was drawn on loopback, where the reveal gate suppressed it. **On deployed
staging it fires.** S8-2 should be reopened as OPEN, not closed-as-inert.

## I. Semantic monotonicity

| Card | Hydration | Note |
|---|---|---|
| Financials | SAME MEANING | arrives complete |
| Attendance | **LESS INFORMATIVE** | explained unavailability → bare absence |
| Health & Safety | **LESS INFORMATIVE** | required-information → bare absence |
| Business Process | SAME MEANING, but absent for 20.7 s | no pending state at all |
| Current Work | not separately isolated this window | — |

The operator was misled in both LESS INFORMATIVE cases: state 1 explains *why* there is nothing and
state 2 does not, so the card appears to lose knowledge it had.

## J. Final root-cause map

**P0-1 Workspace** · ROOT_CAUSED · live reproduced **YES** · cause: Slice 19 replaced the canonical
`AlloyOperationalBootShell` content-mode loader with a visually-null reserved surface, against standing
decisions (A1/A5/Blocker 3) · shared owner: none · **repair boundary: `WorkspaceSurface.tsx` pending
branch only** · do not change: the settled path, the retained scrollport, `model.ready` · regression
test: the pending branch renders the canonical loader owner · human check: cold `/workspace` on staging.

**P0-2 + P0-6** · ONE repair boundary, confirmed · live reproduced **YES** · cause: Business Process
renders settlement-only `operationalProjection.businessProcess.evidence` with an empty-evidence
fallback that renders nothing; its producer is the drawer VM starting at ~14.7 s · **repair boundary:
the card's pending contract and/or seeding the stage rail already computed at commit — NOT a new
fetch** · do not change: the drawer VM ownership, sibling fallbacks · regression test:
time-to-meaningful and a truthful pending state · human check: Work Unit entry on staging.

**P0-3 + P0-4** · ONE repair boundary, confirmed · live reproduced **YES**, attribution incomplete ·
cause: a card with a vm that explains itself is replaced by a vm-less bare absence · **repair boundary:
the empty-state contract of the two cards** · do not change: the clear-on-subject-change rule, the
producer · regression test: monotonicity — a settled card may not lose an explanation it had · human
check: both cards on a child with no record.

**P0-5** · ROOT_CAUSED · live reproduced **YES** · cause: ~5 s to selection acknowledgement on
deployed staging; warming is secondary · **repair boundary: immediate selection acknowledgement on the
pill** · do not change: the intent-warm policy (it helps: 3.2 s vs 5–6.7 s) · regression test:
click→`aria-selected` budget measured at human speed · human check: ordinary switching on staging.

**P1-1** · ROOT_CAUSED and now quantified · the certification ran in an environment 4–12× faster than
the one the operator uses.

## K. Ranked repair sequence and batching

1. **P0-1** — restore the canonical loader (smallest, no dependencies).
2. **P0-5 acknowledgement** — immediate pill selection feedback.
3. **P0-2/P0-6** — Business Process pending contract / commit-frame stage rail.
4. **P0-3/P0-4** — empty-state operability contract for Attendance and Health.

1 and 2 are independent, tiny, and touch different files — **batchable into one promotion**. 3 and 4
each change a semantic contract and deserve their own certification, though they could share a
promotion if both land with their own tests.

## L. Certification contract (refined with deployed evidence)

1. **Timing is only valid where the operator is.** Loopback numbers may be reported as a lower bound,
   never as the certification. Every timing cell must be re-taken on deployed staging.
2. **Human-speed interaction**: pointer→click ≤ 150 ms; warmed variants reported alongside, never as
   the headline; **click→visible acknowledgement has its own budget**.
3. **Per-card semantic milestones**: shell → first subject-specific content → final authoritative
   content, with a **monotonicity assertion** (no card may become less informative) and a
   time-to-meaningful budget for critical cards, Business Process included.
4. **Visual acceptance** for any loading treatment: screenshot pair reviewed against the standing
   loader decisions, plus a check that the canonical loader owner is not replaced per-surface.
5. **Empty-state operability**: a settled empty card must state why and offer whatever canonical
   action exists, or explain why none does.
6. **Cold deployed walkthrough after every promotion**, before any programme may be called certified.

## Ledger

* P0-1 **ROOT_CAUSED / LIVE REPRODUCED** · P0-2 **ROOT_CAUSED / LIVE REPRODUCED**
* P0-3 **REPRODUCED, attribution incomplete** · P0-4 **REPRODUCED, attribution incomplete**
* P0-5 **ROOT_CAUSED / LIVE REPRODUCED** · P0-6 **ROOT_CAUSED (merged into P0-2)**
* P1-1 **ROOT_CAUSED / quantified**
* **NEW: S8-2 neighbour prewarm reopened** — fires on deployed staging; the Slice 17 "inert" finding
  was loopback-only.
* Carried maintenance and external items unchanged.
