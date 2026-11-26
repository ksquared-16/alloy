# POST-DEPLOYMENT QA — SLICE 1: ROOT-CAUSE MAP

Run `erun_ad6110ccbdcaa9af` · lane `lane_73a897409906`
Deployed SHA `fad44d32a8bd91886437270f5623e2ec339d3d0f` · branch staging · nodeEnv production

**Human staging QA is the acceptance authority. Nothing here argues with it.**

## 0. What is proven, and what is still owed

`git diff fad44d32a8bd HEAD` is **empty** — this worktree is byte-identical to the deployed tree, so
source tracing here is authoritative for what staging is running.

**Staging reproduction did not run.** The deployed QA session
(`~/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json`) expired
2026-09-15 17:30:38. `environment.restore_deployed_qa_session` declares
`alwaysRequiresOperatorApproval: true`; the request is filed (`gar_68d5c783c241a6`, 2026-09-16T16:42:37Z)
and sits at **`awaiting_operator`**. So P0-1 and P0-2 are root-caused from the deployed source below;
the timing/state observations for P0-3 → P0-6 are structurally traced but **not yet reproduced**.

## 1. P0-1 — Workspace loading experience · **ROOT_CAUSED**

**What I replaced, and what it was.** Before Slice 19 the pending Workspace rendered
`AlloyOperationalBootShell variant="workspace" chrome="content"`. That component is not a generic
spinner: it is the product's **single canonical "Thinking…" owner** — a centred 2× Alloy identity mark
with the word stacked below it. Its own source states the rule:

> *Single "Thinking…" owner (Kelly): the Alloy mark with the word stacked BELOW it — one calm,
> consistent loader while the surface prepares, never a per-variant "Loading work unit…"/skeleton
> chorus.*

and it carries three recorded operator decisions: **Kelly A1** (do not repaint chrome inside the
content area), **Kelly A5** (content mode centres a LARGER Alloy visual rather than a small inline
loader + skeleton), and **Kelly Blocker 3** — *never a faint skeleton that reads as an empty white
canvas*.

**What Slice 19 shipped instead:** `WorkspacePendingSurface` — an organisation-name line, the sentence
"Preparing your workspace…", and two faint bordered blocks on white with a 32rem reserved region.

**Root cause: I built the thing Blocker 3 forbids.** My own Slice 19 code comment quoted Blocker 3
while reading the old component, and then replaced the canonical branded loader with a faint reserved
skeleton on white. The operator's rejection is not a taste disagreement with a measurement — it is the
product's standing loading decision being overwritten.

**Why the Slice 19 harness did not catch it.** It measured *"identity visible"* as the appearance of a
DOM string and scored the old treatment as having **no identity until 3036 ms**. That was wrong: the
old treatment showed **Alloy brand identity and motion immediately** — what it lacked was the *org
name*. I measured the arrival of one particular string and called it identity, while the thing I
removed was already answering "where am I, and is this working" from the first frame.

**What is worth keeping.** Possibly the org-name line and the reserved footprint — but only *inside*
the canonical loader, not as a replacement for it. The default repair is to **restore
`AlloyOperationalBootShell`** and treat any identity addition as a change to that one owner.

## 2. P0-2 — Business Process settles far too late · **ROOT_CAUSED**

`BusinessProcessCard` renders from `context.operationalProjection.businessProcess.evidence`, falling
back to `EMPTY_BUSINESS_PROCESS_EVIDENCE` — an empty shell, not a pending state — when the projection
is absent.

The contract for that object is stated in `operationalContext/types.ts`:

> *SETTLEMENT-only projections. These feed drill/enrichment cards … that are RESERVED at commit and
> filled by the drawer VM. The commit-critical producer leaves them null (the cards reserve geometry);
> the enriched producer (`buildOperationalContext`) fills them. **They are NOT commit-critical — no
> first operator action depends on them.***

And `buildOperationalContext.ts:469` fills it from `subjectVm.workspace.operational_projection` — the
**drawer-VM settlement fetch**, not the commit-critical provisioning answer.

**Root cause: the Business Process card is classified as settlement-only enrichment by design, and the
declaration "no first operator action depends on them" is contradicted by the operator, who calls it
one of the most important pieces of the Work Unit.** This is a criticality misclassification, not a
slow query.

**Why it looks worse than its siblings.** Attendance, Financials and Health read
`operationalProjection.cards.*` **and each keeps its own `load()` fallback** against its own endpoint,
so they can become meaningful before settlement. `BusinessProcessCard` has **no fallback fetch at
all** — if the projection is not there, it has nothing to render but the shell. That asymmetry, not an
independent waterfall, is why it is last.

**Not caused by Slice 18.** The Work View fan-out removal touched lens provisioning, not this
projection; no code path here changed in that slice.

## 3. P0-3 — Attendance semantics · **structurally traced, reproduction owed**

The two observed states come from **two different renderers**:

| Observed | Rendered by | Condition |
|---|---|---|
| "No attendance recorded today" + "This child has no active enrollment, so attendance cannot be recorded for them." | `ApprovedAttendanceCard` (the LOADED card) | `vm` present with `vm.unavailableReason` |
| "No attendance record." | the fallback root | `vm == null`, not loading, not provisioning |

So the sequence the operator saw went from **a vm that exists and explains itself** to **no vm at
all** — a card becoming *less* informative as it settles, which is backwards.

Operability is deliberate in the first state: the card suppresses commands under
*"NO COMMANDS WHEN THERE IS NOTHING TO COMMAND. A child with no attendable enrolment…"*. The second
state offers nothing and explains nothing, and is the more likely defect.

**Owed:** which state is authoritative, what subject identity each was computed from, and whether the
vm→null transition is a projection resolving to null or a subject change.

## 4. P0-4 — Health & Safety semantics · **structurally traced, reproduction owed**

Same shape. `provisioned = context.operationalProjection?.cards?.health`; `provisioning = memberId != null
&& provisioned == null`; the effect sets `vm` from the projection and `denied` from
`provisioned?.state === "forbidden"`. The final line renders `"No health record."` when `vm` is null and
nothing is pending, while a vm carrying `unavailableReason` renders that reason instead, and the
required-information view needs a full `vm`.

So the observed *Missing-requirements → "No health record."* transition is the same regression in
kind as P0-3: richer truth replaced by a bare absence.

## 5. P0-5 — Work View switching · **ROOT_CAUSED (methodology), measurement owed**

My Slice 18 harness produced the certified "~179 ms, 0 requests" figure **after
`pill.hover(); await page.waitForTimeout(1200)`** — a deliberate 1.2-second dwell before clicking.
The same harness measured a **cold pill click with no dwell at 411 ms and one request**, and a
back-leg at **849 ms with 14 requests / 375 KB**.

**A human moving a pointer and clicking does not dwell 1.2 s.** So the headline number certified an
idealised interaction; the honest human-speed numbers were already in my own data and I led with the
warmed one. That alone explains the "slow and clunky" report without needing any new mechanism.

**Owed:** the deployed A/B/C/D interaction matrix at human speed.

## 6. P0-6 — Fragmented settlement · **structurally traced, timeline owed**

All five cards depend on the same `operationalProjection` object, so this is **not** five independent
waterfalls. The staggering comes from what each card does while that object is absent:

| Card | Source | Fallback when projection absent |
|---|---|---|
| Financials | `cards.financials` | own `load()` + `requestQuery` |
| Attendance | `cards.attendance` | own `load()` |
| Health | `cards.health` | own `load()` |
| Current Work | `currentWork` | stage-work slice |
| **Business Process** | `businessProcess.evidence` | **none — empty shell** |

**Geometry stability is not coherent settlement.** The V2 harness measured card count, heights, blank
frames and subject identity — all of which stay stable while a card sits semantically empty. Nothing
measured *time-to-meaningful-content per card*, which is exactly what the operator perceives.

## 7. P1-1 — Certification gap · **ROOT_CAUSED**

Three specific failures, not "more QA":

1. **Identity was measured as a string, not as an experience** (P0-1). The harness scored the branded
   loader as no-identity. **Contract change:** any change to a loading treatment requires a visual
   before/after (screenshot pair or frame sequence) reviewed against the standing loader decisions,
   and a check that the canonical `AlloyOperationalBootShell` owner is not being replaced per-surface.
2. **Interaction timings were taken at machine convenience** (P0-5). **Contract change:** every
   interaction cell must be measured at human speed — pointer-enter to click ≤ 150 ms — and a warmed
   variant may only be reported *alongside* the unwarmed one, never as the headline.
3. **Settlement was measured geometrically, not semantically** (P0-2, P0-6). **Contract change:** per
   card, record `shell → first subject-specific content → final authoritative content`, flag any
   semantic replacement, and assert a **time-to-meaningful-content budget for cards declared
   critical** — with Business Process explicitly on that list.

Plus a process change: **a cold human walkthrough of deployed staging after every promotion**, before
the programme may be called certified.

## 8. Shared root causes

* **P0-2 and P0-6 are the same defect**: criticality classification. Fix the classification once.
* **P0-3 and P0-4 are the same defect**: a settling card replacing explained truth with bare absence.
* **P0-1 is independent** and is a straight revert-forward of a product decision.
* **P0-5 is independent** and may need no code change at all — the measurement was wrong, and what the
  human experiences may already be the honest cost of an unwarmed switch.

## 9. Ranked repair sequence (proposed, not executed)

1. **P0-1** — restore the canonical loader. Smallest, highest-visibility, no dependency.
2. **P0-2 / P0-6** — decide Business Process criticality and give it a commit-frame source or a
   truthful pending state. One decision fixes both.
3. **P0-3 / P0-4** — settle the empty-state contract for Attendance and Health, including whether the
   operator may add records from those states.
4. **P0-5** — re-measure at human speed first; only then decide whether any warming change is warranted.

## 10. Revert-rather-than-repair

**P0-1 (Slice 19) is the one candidate for reversion rather than forward repair.** It replaced a
standing product decision with a measurement-driven composition the operator rejects; restoring
`AlloyOperationalBootShell` returns a known-good experience, and any identity improvement can then be
proposed against that one owner.

## STATUS LEDGER

**P0 — HUMAN QA**
* P0-1 Workspace loading experience — **ROOT_CAUSED**
* P0-2 Business Process late settlement — **ROOT_CAUSED**
* P0-3 Attendance semantics/operability — **OPEN** (traced; staging reproduction owed)
* P0-4 Health & Safety semantics/operability — **OPEN** (traced; staging reproduction owed)
* P0-5 Work View switching — **ROOT_CAUSED** (methodology); human-speed measurement owed
* P0-6 Fragmented Focus Panel settlement — **OPEN** (structure traced; timeline owed)

**P1 — CERTIFICATION**
* P1-1 Runtime V2 certification gap — **ROOT_CAUSED**, with three specific contract changes

**CARRIED MAINTENANCE** (not pulled into repair): Communications warm reopen 11 req / ~74 KB · F-2
location hierarchy · S5-4 Activity prefetch KEEP · R-005 · S9-1 monitor · S3-4 monitor · Financials
modal observation.

**EXTERNAL**: Attendance standalone launcher (product navigation owner) · production
`alloy-dev-start` wildcard-bind (toolkit owner).

## Recommended Slice 2

**Staging reproduction**, once the deployed QA session is approved: the cold walkthrough, the per-card
semantic settlement timeline, the human-speed Work View matrix, and the Attendance/Health state
sequence — closing P0-3, P0-4, P0-6 and confirming P0-1/P0-2 against the live environment. No repair
until that map is complete, except P0-1 if the operator wants the loader restored immediately.
