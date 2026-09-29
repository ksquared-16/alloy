---
status: frozen
programme: WORKSPACES_OPERATOR_EXPERIENCE_RELIABILITY_COMPLETE
frozen_at: 2026-09-29
supersedes: []
---

# Workspaces Operator Experience — FREEZE

This document freezes a **contract**, not the product. Future work may extend Workspaces freely.
What it may not do is quietly change one of the laws in §3, because each one was bought with a
measured defect and a certification. Changing one requires the procedure in §9.

Read this before touching any seam in §5.

## 1. Programme classification and baselines

| | |
|---|---|
| Classification | `WORKSPACES_OPERATOR_EXPERIENCE_RELIABILITY_COMPLETE` |
| **Certified product tree** | `76ed350ae` — the last commit that changed product behaviour, and the tree Gate R actually passed against |
| Evidence merge | `52a410e7a` (PR #1314) — evidence only, 0 source files |
| Freeze baseline (this document) | `a7c521225` |
| Runtime placement | `fra1::pdx1` |
| Final gates | A PASS · B PASS · C PASS · D PASS · R PASS |

**The certified product tree and the current staging head are deliberately different things.**
Staging advances continuously; peers promoted six commits between the evidence merge and this
freeze. The freeze is therefore verified by **content**, not by demanding that `76ed350ae` stay
HEAD: every seam in §5 was compared object-for-object against `a7c521225` and is byte-identical.
That is the check to repeat in future — not "is the SHA still there".

## 2. The reliability result being preserved

One defect owned **both** operator symptoms, which is why neither could be reproduced on its own:

- apparently random resets to `/workspace`;
- Work Units that sometimes never became usable.

A soft-navigation reload floor was armed **only** by sidebar navigation. Work Unit entry did not
supersede it. About 15 seconds later it executed `window.location.assign("/workspace")`. Fired
between opens it read as a random refresh; fired mid-open it read as a Work Unit that never became
usable.

The repair origin-scopes the predicate, so a valid Work Unit navigation supersedes the stale
`/workspace` reload authority.

| | resets | actions |
|---|---|---|
| Before | 12 | 94 |
| Initial after | 0 | 60 |
| **Final certification** | **0** | **275** |

Final certification also recorded 55 Work Unit opens, 0 never-usable opens, 0 destroyed contexts,
and 55/55 clean Work Unit shell mounts.

## 3. Canonical laws

These are the frozen contracts. They are stated **once, here**; §4 of
[`operator-runtime-performance-certification.md`](operator-runtime-performance-certification.md)
points at this list rather than restating it, so the two cannot drift.

1. **HOVER MAY WARM BUT MAY NOT NAVIGATE.** Hover may prefetch, prewarm and populate reusable data.
   It may not navigate, commit a Work View, change the URL, change queue authority, or reach K3 as
   navigation authority.
2. **DATA REUSE != NAVIGATION AUTHORITY.** These are separate decisions that happen to share a code
   path. Every regression in this programme came from conflating them.
3. **VISITED != CURRENT.** Cache reuse must not suppress explicit navigation authority. A view
   already visited this session must still commit when explicitly selected.
4. **LATEST EXPLICIT OPERATOR INTENT WINS.**
5. **SUBJECT SELECTION DOES NOT OWN WORK VIEW.** Selecting a queue row changes the subject, not the
   Work View.
6. **SUBJECT SELECTION DOES NOT REDEFINE QUEUE MEMBERSHIP.**
7. **NO A TRUTH UNDER B.** No mixed-subject frame, ever — not even for one paint.
8. **UNKNOWN IS NOT ZERO.** Nor is it not-applicable. The absence of an answer is not an answer;
   `phase_settled_unresolved` and `not_applicable` are different facts and must stay different.
9. **`ALL_FIRST_ORDER_READY` IS THE OPERATOR READINESS CONTRACT.** For committed subject B, every
   configured first-order cell must be `ready`, `self_loading`, or truthfully `not_applicable`, and
   must belong to B. Canonical definition: [`../../runtime/CARD-READINESS-LIFECYCLE.md`](../../runtime/CARD-READINESS-LIFECYCLE.md) §8.
10. **FULL DRAWER COMPLETION IS NOT REQUIRED FOR FIRST ACTIONABILITY.** Do not recouple them. T6 is
    not "the generic preparing indicator disappeared" and not "the drawer finished".
11. **VALID REUSE SHOULD BE CONSUMED.** A warm answer that a click can use must be used. Return
    visits may be dramatically faster than first visits; that bimodal distribution is CORRECT and
    must not be "normalised" by removing valid reuse.
12. **STALE BACKGROUND WORK CANNOT OUTRANK PRIMARY OPERATOR INTENT.**
13. **A `/workspace` RELOAD FLOOR CANNOT SURVIVE A SUPERSEDING WORK UNIT ENTRY.**
14. **FINANCIALS DETAILS OWNS ITS SCROLL VIEWPORT.** The load-bearing flex chain must permit
    shrinking.
15. **`pdx1` IS INTENTIONAL COMPUTE PLACEMENT FOR THE OREGON PRIMARY.** Rationale:
    [`../governance/deployment-and-environments.md`](../governance/deployment-and-environments.md)
    § "Compute placement — `pdx1`, beside the primary database".

## 4. Certified interaction figures

Recorded so a future change has a **before** to argue against. These are not budgets to optimise.

**Queue-row switching** (continuous natural hover+click):

| milestone | P50 | P95 | max |
|---|---|---|---|
| ack / safe | 46 ms | 64 ms | 69 ms |
| FIRST ACTIONABLE | 55 ms | 1106 ms | 1232 ms |
| ALL FIRST ORDER | 55 ms | 1417 ms | 1791 ms |

No wrong subject, no mixed-subject frames. The spread is first-visit vs valid reuse (law 11).

**Financials Accounts — usable Details:** P50 818 ms · P95 974 ms · max 1028 ms. Client propagation
~20 ms median; the rest is shared environment/runtime cost, **not** Financials-owned architecture.
Do not add Financials-specific caching to mask it.

**Runtime placement effect:** the prior `iad1` default cost ~116 ms per Supabase REST hop; `pdx1`
reduced it to ~37 ms, improving the whole application. The Supabase primary is West US (Oregon),
AWS `us-west-2`.

## 5. Load-bearing seam map

Current paths on `a7c521225`. Function names are authoritative; **line numbers drift — grep for the
symbol.**

| contract | file | owner |
|---|---|---|
| Provisioning reuse + redelivery | `web/lib/runtime/kernel/provisioning.ts` | `prepare(ref, opts)`, `isReusable`, and the reuse branch `if (!speculative) this.instr.onTerminal?.(reused)` |
| Speculative preparation guard | `web/lib/runtime/kernel/provisioning.ts` | `const speculative = opts?.speculative === true`, and the miss path `if (!f.speculative) this.instr.onTerminal?.(terminal)` |
| The only speculative caller | `web/lib/runtime/prep/prepareOperationalDestination.ts` | `prepareOperationalDestination` → `prepare(ref, { speculative: true })` |
| K3 / Focus commit | `web/lib/runtime/kernel/focus.ts` | `FocusOwner.onPreparationTerminal` — **the only cause of a commit** |
| Kernel wiring K1→K2→K3 | `web/lib/runtime/kernel/RuntimeKernelContext.tsx` | feeds Focus from `instrumentation.onTerminal` **only**, discarding the promise value |
| Canonical readiness emission | `web/components/admin/focusPanel/OpportunityFocusPanelModeGrid.tsx` | `resolveReservedCellSettledReason`, `ReservedFocusPanelCell`, and the mounted branch |
| Latest-wins / subject authority | `web/lib/runtime/latestWins.ts` | `createLatestWinsGate`, `createSubjectGate` |
| Reload-floor predicate | `web/lib/adminV2/navigation/adminV2SoftNavReloadFloor.ts` | `shouldFireReloadFloor` (the `originPathname` arm), `normalizeSoftNavReloadPathname`, `armSoftNavReloadFloor`, `DEFAULT_SOFT_NAV_RELOAD_FLOOR_MS = 15000` |
| Work Unit entry supersession | `web/lib/adminV2/navigation/adminV2SoftNavLinkCommit.ts` | `shouldSoftNavigate`, `commitAdminV2NavLinkNavigation` — the only arming path |
| Financials Details scroll | `web/app/adminV2/components/alloyOsRuntime.css` | the `.alloy-accounts-account-card [data-financials-surface-role="floor"] .alloy-os-billing--detail` rule: `flex: 1 1 auto; min-height: 0` on the wrapper **and** its `> .alloy-os-ucard` |
| Compute placement | `web/vercel.json` | `"regions": ["pdx1"]` |
| Bounded truth-patch diagnostic | `web/lib/adminV2/viewModel/drawer/opportunity/drawerTruthPatchDiag.ts` | `MAX_SUBJECTS = 24` with insertion-order eviction |

Two seams deserve a warning because they have already produced a regression:

- **The reuse branch and the hover path are the same call.** Making reuse redeliver through
  `onTerminal` (law 3) is what created a hover-navigates regression, because hover reaches
  `prepare` with a ref spread from *current* attention, so K3's version guard admits it. The
  `speculative` flag is what separates them. Removing it re-opens both defects at once.
- **`onReused` is not the consumer.** Focus consumes `onTerminal`. Anything wired to `onReused`
  alone is invisible to navigation — that was the return-to-visited defect.

## 6. Regression guards

All six suites are on `a7c521225` and green: **45 cases, 6 files.**

| law | guard | kind |
|---|---|---|
| 1 hover cannot commit | `tests/runtime/returnToVisitedWorkView.test.ts` — "HOVER WARMS AND DOES NOT NAVIGATE, even for a view already visited" | UNIT |
| 11 warm result stays consumable | same file — "the warmed answer is CONSUMED by the click that follows" | UNIT |
| 3 return-to-visited commits | same file — "PLANT 6 — commits a RETURN to a view already visited this session" | UNIT |
| 4, 12 late old lens cannot override | same file — "PLANT 4 — a reused answer for an older lens cannot commit over a newer explicit lens" | UNIT |
| 5 subject move ≠ lens change | same file — "PLANT 2 — a SUBJECT movement cannot express a lens change" | UNIT |
| 4, 6, 7 queue subject safety | `tests/runtime/latestWinsOrderingContract.test.ts` (7) | UNIT |
| 8, 9, 10 canonical T6 | `tests/adminV2/runtime/reservedCellSettledReason.test.tsx` (7) — including "a settled surface that never readied the card is UNRESOLVED, not an answer" | MOUNTED (jsdom) |
| 13 reload-floor origin scoping | `tests/adminV2/navigation/softNavReloadFloor.test.ts` (18) — "does NOT fire when the nav arrived and the operator then moved on" / "STILL fires when the operator never left the origin" | UNIT |
| 13 supersession by a newer entry | same file — "supersession: an older watchdog never fires once a newer nav is armed", "navigating to a SECOND destination while the first is pending cancels the first's timer" | UNIT |
| 7 no mixed-subject frame | `tests/adminV2/runtime/noATruthUnderB.test.tsx` (5) — renders the real grid, asserts one frame carries exactly one subject across both branches, and that a LATE A render leaves B byte-identical | MOUNTED (jsdom) |
| 14 Financials scroll shrink rule | `tests/runtime/accountsDetailsScrollOwner.test.ts` (3) — reads the CSS and asserts both links of the chain may shrink | STATIC GUARD |
| diagnostic boundedness | `tests/adminV2/drawer/truthPatchDiagIsBounded.test.ts` (4) | UNIT |
| 15 `pdx1` placement | `tests/runtime/frozenRuntimePlacement.test.ts` | STATIC GUARD |
| 2, no random reset in a long session | `web/playwright/tests/zz-gateR-reliability.spec.ts` — 275 actions, `MODE=control` must pass first | MOUNTED CERTIFICATION (not in CI; needs a deployed QA session) |

### 6a. Mutation check on the subject-safety guard

A guard nobody has seen fail is not known to work. Recorded 2026-09-29 against
`OpportunityFocusPanelModeGrid.tsx`:

**Mutation.** A module-level `__plantStaleSubject` holder was added to `ReservedFocusPanelCell`, so the
reserved branch labelled its cell from the PREVIOUS subject once one existed — the stale-source bug
shape, where a cell's label comes from separately-held state instead of the committed model.

**RED (3 of 5 cases, exit 1):** "ONE frame carries exactly ONE subject", "selecting B leaves NO trace
of A's subject identity anywhere in the frame", and "a LATE A result cannot reshape B". The two that
stayed green are the observability case and the B-bound case, neither of which is the mixed-frame
detector — the mutation did not remove the stamp, only corrupt its source.

**Restored: GREEN (5 of 5, exit 0),** with the component byte-identical to HEAD (sha256 prefix
`014f0b1b92718a5d`, `git diff` clean, 0 plant markers remaining).

**Load-bearing items with weak or no durable guard — call-outs, not tasks:**

- **Law 7 (NO A TRUTH UNDER B) — CLOSED 2026-09-29** by `noATruthUnderB.test.tsx`, a mounted guard
  that renders the real grid and was mutation-checked (see §6a). It covers subject IDENTITY across a
  frame. It does NOT cover contamination *inside* a card body: a synthetic operational context
  surfaces no card-body truth, so that half stays browser-certified by Gates B and D. Anyone
  strengthening this should start there, with a fixture built from a real drawer VM.
- **Law 2's end-to-end shape is only browser-certified.** The unit plants cover the seam; the
  "no reset in a long session" claim is a probe result, which CI never runs.
- `zz-gateR-navkind`, `zz-gateA-cert` and `zz-sliceB-continuous` carry no in-file positive control;
  their controls live in the evidence text beside them. A re-run that skips the control measures
  nothing (see §8).

## 7. Certification evidence locations

On `a7c521225`, under `certification/`:

| gate | location |
|---|---|
| Gate A (hover/click authority) | `gate-a-deployed/` |
| Gate B (continuous queue-row) | `slice-b/` — `sb-hover.txt`, `sb-nohover.txt` |
| Gate C (Financials scroll) | `gate-c/`, `gate-c-deployed/` |
| Gate D (usable Details, T6) | `gate-d/`, `gate-d-final/` |
| Gate R (broad reliability) | `gate-r/` — 8 files incl. `positive-control.txt`, `bad-sequence-after-76ed350ae.txt`, `recertification-76ed350ae.txt` |
| Navigation incident | `nav-incident/` |
| Runtime closeout | `runtime-closeout/` |
| Programme closeout | `closeout/RECORD-CLOSEOUT.md` |
| Cold-tail / T6 convergence | `ox-j5-t6/`, `ox-j5-tail/`, `ox-j5-carrier/`, `ox-j5-gate-a/`, `ox-j5-identity/` |

## 8. Diagnostics — retained, and why

| diagnostic | classification |
|---|---|
| `data-focus-panel-cell-key` / `-readiness` / `-subject` / `-settled-reason` / `-mounted` | **PERMANENT_OPERABILITY** — the canonical readiness instrument. Every T6 measurement reads these; without them the contract is unobservable. |
| `drawerTruthPatchDiag.ts` (`MAX_SUBJECTS = 24`, insertion-order eviction, counters still count every event) | **PERMANENT_OPERABILITY** — bounded by construction and guarded. |
| `web/playwright/tests/zz-gate*` , `zz-j5-*`, `zz-rt-*`, `zz-sliceB-*`, `zz-reset-forensics` | **CERTIFICATION_ONLY** — deliberately retained; they are how a frozen contract gets re-certified. Not run by CI. |
| `certification/gate-r/probe-exoneration-navkind.txt`, `positive-control.txt` | **PERMANENT_OPERABILITY (record)** — these are what stop a known-bad probe from being read as a product result. |

Verified at freeze: no PII or business values in any retained diagnostic (classifications, booleans,
counts, opaque ids and URL paths only); no unbounded maps; the truth-patch diagnostic is capped.

**A probe is not a measurement until its control passes.** This programme produced four false
findings from instruments that could not observe what they claimed — a T6 predicate that counted
skeletons document-wide and reported "27 of 27 material misses" that were its own fault; a
positive control that accepted page structure as meaning; a plant wired more generously than the
production caller, which passed while the defect was live; and a bundle-content probe that reported
all nine markers absent because its session had expired and it had landed on `/login`. Any re-run
of a §6 MOUNTED CERTIFICATION must run its control first.

## 9. Accepted debt

**`SHARED_AUTH_CARD_ADMISSION_CONVERGENCE` — TARGET_MET / SEMANTIC_DIFFERENCE_REQUIRED /
EQUIVALENCE_UNPROVEN.** Financials card auth measures ~75.7 ms P50 against a <100 ms target: PASS.
The existing path is more restrictive than `loadAdminRouteGate` because it preserves an additional
portal-admission decision. **Do not remove that decision to save ~73 ms.** Authority is not a
latency optimisation. This is accepted, non-blocking debt and stays open deliberately.

**Shared connection residual — ENVIRONMENT_SPECIFIC, not product-owned.** ~203 ms browser↔fra1,
~343 ms fra1→pdx1 transit and invocation, ≤58 ms middleware bound. It is paid by 401/405 responses
that never reach a handler, so no handler change can remove it.

## 10. What a future change to a frozen contract requires

This freeze is not a prohibition on development. Extending Workspaces needs nothing from this
document. **Changing one of the §3 laws requires all five of:**

1. an **explicit objective** naming the law being replaced;
2. a **before measurement** on the current product — the §4 figures are the comparison, and
   re-deriving them is part of the work;
3. a **correctness proof** that the new contract does not reintroduce the defect the old one closed
   (§2 and §5 name them specifically);
4. **regression certification** — the §6 guards updated to assert the new contract, with a positive
   control proving each can fail;
5. **documented replacement doctrine** — this file updated, not bypassed.

Removing any of these without replacement is a regression regardless of what the measurement says:
the `speculative` flag, the reuse redelivery through `onTerminal`, the reload-floor origin
predicate, the Financials `min-height: 0` shrink chain, `"regions": ["pdx1"]`, and the additional
portal-admission decision in the card auth path.
