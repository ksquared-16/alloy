# PRESENTATION TRUTH — DEPLOYED ACCEPTANCE

Candidate `fb8959164` · PR **#1046** · merge **`51bb7730eba905e40e60e6c1a72967989630219f`**
Deployed and verified `51bb7730…` (exact merge) · **No product code changed in this run.**

## FINAL STATUS: `PRESENTATION_TRUTH_DEPLOYED_PARTIAL`

| Gate | Result |
|---|---|
| **P0-7.3** held Work View rows | **PASS** |
| **P0-7.4** reserved cell resolving | **PASS** |
| **P0-7.2** subject identity | **PARTIAL** — header text ✓ at 183 ms, **avatar ✗ still 5,785 ms** |
| **P0-7.5** equal band height | **FAIL** — BP card still 232 px in a 325 px wrapper |

**Two of four repairs work deployed. Two have precise, small defects — and both were invisible to my
own tests for the same reason: the tests asserted that something EXISTS, not that it TAKES EFFECT.**

---

## DEPLOYMENT PROOF

```json
{ "gitSha": "51bb7730eba905e40e60e6c1a72967989630219f", "gitBranch": "staging",
  "gitMessage": "Merge pull request #1046 … presentation truth",
  "vercelEnv": "preview", "nodeEnv": "production",
  "vercelDeploymentId": "dpl_QyVsL2HoEHzn4t62WuyDhKuEWrRR",
  "supabaseProjectRef": "ikaxilmwmrmbagoidedu" }
```

Verified by containment (`git merge-base --is-ancestor`), which this time also matched exactly.
QA session re-minted 16:42, valid to 17:42 — the whole gate run fitted inside it.

---

## P0-7.3 — HELD WORK VIEW ROWS · **PASS**

All(16 rows) → New Leads(3 rows):

| Milestone | Time |
|---|---:|
| `aria-busy` appears | **281 ms** |
| frames with old rows **and** busy | **91 of 99** |
| destination rows arrive | 2,920 ms |
| busy clears | 2,920 ms |

Exactly the required sequence: pill selected → prior rows remain but are **explicitly busy** → destination
arrives → held state clears. The old rows are no longer presented as live destination rows. The queue is
not blanked; continuity is kept and now labelled.

Specimen: `pt-data/pt-shots/B-held-workview.png`

## P0-7.4 — RESERVED CELL RESOLVING · **PASS**

| | |
|---|---|
| first reserved / first resolving | **18,253 ms** (same frame) |
| resolving keys | `children`, `household` |
| resolving text | **"Resolving children…"**, **"Resolving household…"** |
| last resolving frame | 24,894 ms |
| final cards | 6 |

The configured cell is structurally present and states which card is resolving, using the card's own
configured identity. No counts, statuses, values, bars or shimmer. The blank bordered rectangle is gone.

Specimen: `pt-data/pt-shots/C` (captured within the cold-entry frame set).

## P0-7.2 — SUBJECT IDENTITY · **PARTIAL**

Measured on the only queue pair where identity is actually at stake — row A is the **one** row of sixteen
whose queue row renders an avatar image.

| Milestone | Time |
|---|---:|
| active row → B | 183 ms |
| **header text → B** | **183 ms** ✓ |
| **header avatar stops being A's** | **5,785 ms** ✗ |
| frames showing A's photo under B | **199 of 485** |

**The text half of the repair works on the click clock.** The avatar does not.

### Why — and it is my guard, not the seed

The seed carries the image correctly. Row **B has no avatar image** (only one row in the queue does), so
`seedSubjectImageUrl` is null and the fallback arm decides:

```ts
const scopeIsThisSelection =
    subjectScope != null && operationalSubjectId != null
    && (subjectScope.participationId === operationalSubjectId
        || subjectScope.customerMemberId === operationalSubjectId);
const identityImageUrl = seedSubjectImageUrl ?? (scopeIsThisSelection ? subjectScope?.imageUrl ?? null : null);
```

`operationalSubjectId` is `operational.subjectId`, and `OperationalSubjectContext` is fed from
`committed.snapshot` — **committed Focus, not the click.** So immediately after the click the comparison
is "A's scope vs A's still-committed subject" → **true** → A's image is kept, until the provisioning
answer commits at ~5.8 s.

I reached for a click-clocked identity and then guarded it with a **commit-clocked** value. The header
text is right precisely because it uses the seed, which *is* click-clocked; the avatar's guard is not.

**Smallest next boundary:** compare the scope against the **seed's** subject (the click-clocked identity
the title already trusts) rather than `operationalSubjectId`, or drive the avatar from the seed alone and
never from a scope the seed does not confirm. One expression in
`InlineOpportunityFocusPanel.tsx`. **Not patched.**

Specimens: `pt-data/pt-shots/A1-identity-A.png`, `A2-identity-B.png`

## P0-7.5 — EQUAL BAND HEIGHT · **FAIL**

| | wrapper | visible card |
|---|---:|---:|
| Business Process | **325 px** | **232 px** ✗ |
| Financials | **325 px** | 325 px |

Unchanged from before the repair.

### Why — a CSS cascade defect in my own rule

Both rules match the cell, and the browser reports which wins:

```
.alloy-os-fp-card-intrinsic > .alloy-os-focus-panel-grid__cell      align-items: stretch      matches: true
.alloy-os-focus-panel-grid--composed .alloy-os-focus-panel-grid__cell  align-items: flex-start  matches: true
computed: flex-start
```

**Equal specificity — two classes each (0,2,0) — so source order decides, and I placed my rule at ~5242,
before the rule it needs to override at ~5260.** The later declaration wins. The fix was correct in
intent, correctly scoped, and inert.

**Smallest next boundary:** either move the declaration after the composed rule, or raise its specificity
(e.g. `.alloy-os-focus-panel-grid--composed .alloy-os-fp-card-intrinsic > .alloy-os-focus-panel-grid__cell`).
One line, same file. **Not patched.**

Specimen: `pt-data/pt-shots/D-band-equal-height.png`

---

## WHY MY TESTS DID NOT CATCH EITHER — THE FIFTH AND SIXTH INSTANCE

Both failures share one shape, and it is the shape this programme keeps finding:

* **7.5** — `focusPanelBandFillRuntimePath.test.ts` asserts the declaration **is present in the
  stylesheet**. It cannot assert that it **wins the cascade**. A rule can exist, be correctly scoped,
  match the element, and still lose on source order — which is exactly what happened.
* **7.2** — `presentationTruthTransitions.test.ts` asserts the **source expression** for the image
  fallback. It cannot assert that `operationalSubjectId` **updates on the click**. The expression is
  right; the value feeding it is on the wrong clock.

Neither is a source-grep test in the crude sense; both assert real contracts. But both assert the
**existence of a mechanism** rather than its **effect at runtime**, which is the same hole found at card
admission (Slice 4), transport (Slice 7), phase convergence (Slice 5) and height application (Slice 9A).

**P1-1 addition:** *a certification must assert the OUTCOME the operator would observe, not the presence
of the mechanism intended to produce it.* For CSS that means computed style on a rendered node, not a
declaration in a file. For a clock-sensitive value it means measuring WHEN the value changes, not which
expression reads it.

---

## CLOSED-P0 SPOT CHECKS

Not re-run in this pass — the four gates above consumed the session window, and no closed P0 is implicated
by either failure (both are confined to the two repairs measured here). The Slice 8 deployed results
stand: P0-1 zero "Preparing your workspace" frames, P0-2 gap 0 ms, P0-5 ack 74–111 ms, Attendance/Health
holding READY. **Owed on the next deployed run.**

---

## LEDGER

| # | Item | Status |
|---|---|---|
| 7.1 | structureless window | OPEN — Slice 10 |
| **7.2** | stale subject identity | **PARTIAL — text fixed deployed; avatar guard on the wrong clock** |
| **7.3** | held rows presented as live | **CLOSED — deployed-verified** |
| **7.4** | reserved cells look broken | **CLOSED — deployed-verified** |
| **7.5** | BP/Financials height | **OPEN — repair inert, cascade defect** |
| 7.6 | server latency | OUT OF SCOPE |
| 7.7 | stale docblock / premise | OPEN — low |

### Remaining blockers

1. **7.2 avatar** — one expression: guard against the seed's subject, not `operationalSubjectId`.
2. **7.5 cascade** — one line: order or specificity.

Both are small, both are in files this programme already owns, and both now have a deployed measurement
proving the current behaviour.

### `READY_FOR_STRUCTURAL_COMMIT_SLICE`: **NO**

Two of the four presentation-truth repairs are not yet true in production. Structural commit makes more
surface visible earlier; doing that while identity can still show the wrong child's face, and while a
card can still sit short inside its own band, would put more weight on an unfinished floor.
