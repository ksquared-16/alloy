# P0-7 — OPERATOR-PERCEIVED LATENCY AUDIT

Deployed `9368c44846bc…` (staging · nodeEnv production · vercelEnv preview · supabase `ikaxilmwmrmbagoidedu`).
Verified `git merge-base --is-ancestor 88a4667a 9368c4484` — the Slice 8 repairs are live.
**NO PRODUCT CODE CHANGED.** Forensic only.

## FINAL STATUS: `P0_7_OPERATOR_LATENCY_AUDIT_COMPLETE`

---

## 0. THE ONE CAUSAL MODEL

> **The Work Unit surface renders nothing until one request returns, then renders everything at once —
> even though the tenant's real card composition is already in hand before that request completes.**

Measured cold entry on deployed staging:

| Phase | What is on screen |
|---|---|
| **0 → 10,604 ms** | the boot shell and nothing else. `"STAGING — NOT PRODUCTION … QS Thinking"`. **Zero** grid areas, **zero** cards, **zero** queue rows, **zero** Work View pills, **zero** panel body |
| **10,604 ms** | **everything at once** — 6 grid areas, 4 cards, 16 queue rows, 8 pills, panel body |
| 10,687 → 19,184 ms | two reserved cells (`household`, `children`) as empty bordered boxes, 120 px each — **8.5 s** |
| 17,266 ms | cards 4 → 6 |

The operator's four complaints are three symptoms of this one shape plus one independent defect:

* *"secondary settlement visibly slow"* → the 8.5 s reserved window, and the 4→6 card fill
* *"destination transition slow"* → the same withhold-until-commit rule on the lens axis (3.3 s)
* *"Focus Panel assembles itself"* → the 10.6 s blank followed by a staged fill
* *"stale identity"* → **independent**: a subject-identity ownership defect (§D)

**The single most consequential fact in this audit:** the published composition doc — the tenant's real
card geometry — **is carried on the provisioning answer** (`workUnitProvisioningAnswer.ts:381`
`focusPanelSummaryDoc`), threaded to the panel as `summaryDocSeed`, and consumed **record-independently**
(`OpportunityFocusPanelModeGrid.ts:190-219` passes no `cards` to the derivation). Geometry does not wait
on data. It waits on a *policy*.

---

## A. INITIAL COMPOSITION — PHASE TIMELINE AND READINESS CLASSIFICATION

Structure and meaning arrive at the **same instant**; there is no progressive structure at all.

| Region | first present | classification | knowable earlier? |
|---|---:|---|---|
| Work Unit header | 10,604 | SUBJECT-SEED-KNOWN | **yes** — lens identity is in the current snapshot |
| Work View pills | 10,604 | CONFIGURATION-KNOWN BEFORE DATA | **yes** — `lensSet` + settlement pill counts |
| queue rail (16 rows) | 10,604 | COMMIT-CRITICAL | row *count* yes; row contents no |
| card grid (6 cells) | 10,604 | **CONFIGURATION-KNOWN BEFORE DATA** | **yes** — `focusPanelSummaryDoc` seed |
| Business Process | 10,604 | COMMIT-CRITICAL | already commit-critical (Slice 4) |
| Financials | 10,604 | SELF-LOADING | mountable on `customer.id` |
| Attendance / Health | 10,604 | SELF-LOADING | mountable on `child.customer_member_id` |
| Household / Children | **19,184** | SETTLEMENT-ONLY *(Track A, accepted)* | needs a read — decided against |
| Readiness KPI | never | SETTLEMENT-ONLY *(Track A)* | shares Household's basis |
| avatars / images | 5,960 after a click | PURE ENRICHMENT | **yes** — the clicked row already holds the URL |
| statuses / chips | commit-clocked | SETTLEMENT-ONLY in practice | partially seed-knowable |

### Earliest truthful structural commit

**At the moment the provisioning answer commits — which is already happening — the panel could render the
real configured grid, the real queue rail and the real pills.** It does. The problem is not *what* it
renders at 10.6 s; it is that it renders **nothing** for the 10.6 s before, while holding information
that would let it draw the destination's true shape.

What could be committed *before* the answer, without claiming business truth: the Work Unit target and
lens identity, the pill set with its settled counts, and — on a lens switch — the destination row count.
What could not: row contents, subject identity, any card's content.

**STRUCTURAL COMMIT vs SEMANTIC COMMIT.** The runtime has no vocabulary for this distinction. Every gate
in the path is semantic (`isOperationallyResolved` requires a *situation* and an *answered action*), and
each one withholds structure as a side effect.

---

## B. CURRENT REVEAL POLICY — WHY IT LOOKS LIKE THIS

| Concern | Owner |
|---|---|
| surface reveal | `SurfaceHostContext.tsx:269/303/343` — boot shell until `showWorkUnit` |
| **panel reveal** | `InlineOpportunityFocusPanel.tsx:819` — `resolved \|\| heldPrior \|\| operationallyResolved`, else a centered "Thinking…" |
| reveal predicate | `OperationalSubjectContext.tsx:227` `isOperationallyResolved` — needs `subjectId` **and** `situation` **and** an answered action |
| geometry | `focusPanelPublishedLayout.ts:456` → `FocusPanelCardGrid.tsx:285` → band solver `focusPanelRowHeights.ts` |
| card admission | `COMMIT_CRITICAL_CARD_SPECS` / `MOUNTABLE_CARD_SPECS`, consumed at `OpportunityFocusPanelModeGrid.tsx:703-737` |
| settlement | `useRecordWorkRuntime` → `focusPanelWorkModeModelFromDrawerVm` |
| **composition** | **on the answer** (`workUnitProvisioningAnswer.ts:381`), seed wins over the client fetch (`usePublishedFocusPanelSummaryDoc.ts:376-393`) |

**The grid itself gates nothing.** `renderCell` always returns something, under the stated law
*"a configured cell is ALWAYS present. Readiness decides content."* The withholding is entirely upstream,
at the two reveal gates.

### Does the runtime conflate "not semantically ready" with "do not construct structure"? — **YES**

Four distinct places:

1. **Whole panel** — `InlineOpportunityFocusPanel.tsx:819`. Absence of *Situation/Action* suppresses *all*
   structure, while `operational.summaryDocSeed` (the geometry) sits on the same object.
2. **Admission** — `focusPanelCommitCriticalCards.ts:162-167` withholds `scheduling` because "this producer
   cannot tell" whether the tenant places it. **That premise is now false** — the answer carries the doc;
   admission and geometry read the same answer and do not talk to each other.
3. **Height solving** — `focusPanelRowHeights.ts:94` skips any band containing an unmeasured card.
4. **Skeleton path** — `FocusPanelSummarySkeleton.tsx:148` withholds the composed grid until the doc fetch
   settles. It renders the real grid with reserved cells — *exactly "structure without data"* — and **is
   not used by the Work Unit panel at all.** `InlineOpportunityFocusPanel.tsx:28-31` still documents it as
   the pending contract. **That docblock is stale; the real cold arm is the centered loader.**

### Reserved cells — measured, after correcting my own instrument

`ReservedFocusPanelCell` (`OpportunityFocusPanelModeGrid.tsx:77-106`) renders `.alloy-os-ucard` — a real
bordered, shadowed card box — with `minHeight: 7.5rem` and only an 11 px title. In the published-grid path
it is stretched to the solved band height.

Measured: **2 reserved cells, `household` and `children`, present 10,687 → 19,184 ms — 8.5 seconds**, at
120 px each. That is the operator's *"large empty bordered regions"*, precisely located.

> **Instrument correction, recorded rather than quietly fixed.** My first probe reported
> `reserved_peak: 0` and I nearly reported "reserved cells never render". The attribute is
> `data-focus-panel-cell-reserved`; I had queried `data-focus-panel-reserved`, which exists nowhere. The
> zero was my selector, not the product. This is the same harness-defect class this programme has now hit
> five times, and it is why §J matters.

### Over-constraining doctrine — what any change must renegotiate

* **`visible_construction_ms = 0` (absolute)** — `runtime-implementation-authorization.md:257,445`,
  `runtime-realization-architecture.md:594`: *"Did the operator ever watch the application assemble
  itself? (must be 0)"*. **This metric forbids, by definition, rendering geometry before content.** It is
  the single hardest lock and the direct obstacle to the operator's own hypothesis.
* `d4SettlementReservedGeometry.test.ts` — pins the literal reveal predicate and source text.
* `cardReadinessContract.test.ts` — admission may never be unconditional.
* `focusPanelMountability.test.ts:80-92` — the dormant-capability law.
* `focusPanelRowHeightSolver.test.ts:158-173` — *"assigns nothing to a band holding an unmeasured card"*;
  `:248` — authored `rowSpan` prescribes no height.
* `CARD-READINESS-LIFECYCLE.md` §4a — **on our side**: placement/visibility is decided *before* readiness
  and is explicitly "not part of readiness". The doctrine already separates geometry from data; the
  current `isOperationallyResolved` is **narrower than the doctrine it cites**.

---

## C. WORK VIEW SWITCHING

Measured: All(16 rows) → New Leads(3 rows). Pill acknowledges immediately (Slice 6: 74–140 ms).
**Old rows remain 3,308 ms**, then queue and panel become meaningful in the same sample.

| Boundary | Behaviour |
|---|---|
| pill click | `WorkViewPillStrip` sets local intent — *"Intent is not data… Nothing is optimistically claimed"* |
| attention | `ATTENTION_SCOPE.LENS` move only |
| committed focus | `focus.ts:168-181` — the outgoing is **RETAINED**; `current` changes only at the atomic commit |
| surface host | `SurfaceHostContext.tsx:255-273` — a lens exchange **deliberately HOLDS** the prior surface |
| rows model | `workUnitSurfaceModelFromSnapshot.ts:409` — `loading: false`, *"Never loading: this model exists only because a terminal already arrived"* |

**Old-content ownership: the committed snapshot, held deliberately.** This is sanctioned policy in three
places, not an accident.

**But the held rows are presented as live.** Because `loading` is hard-coded false, `QueueRegion`'s hold
treatment and `aria-busy` never engage, and the modelled `yielding` phase has **no consumer** on this path
(`outgoingYielding` is false precisely because a lens exchange sets `showWorkUnit`). So for 3.3 s the
operator sees the *previous* lens's rows, fully interactive, indistinguishable from the destination.

**Earliest destination structure:** row **count** is already known before the click — settlement resolves
每 pill's count from server-supplied locators, and the configured Default row composition is keyed on
`(surfaceId, processKey)`, not the lens. **Nothing consumes either during the transition.**

**Serialization:** queue and Focus Panel commit-critical are *parallel* — fields of one frozen snapshot,
by design. The panel's **settlement** is serialized after that commit (its subject derives from it).

**Dominant wait:** the destination `provisioning-answer` (3,002 ms in this specimen), then the drawer VM
(5,420 ms) for panel settlement.

---

## D. RECORD-TO-RECORD STALE IDENTITY — AN INDEPENDENT DEFECT

Measured, row A → row B:

| Milestone | Time after click |
|---|---:|
| queue row highlights | **121 ms** |
| panel subject attribute changes | **5,960 ms** |
| panel images change | **5,960 ms** |

**≈5.8 seconds during which the old subject's identity — including its avatar — is presented as the newly
selected subject.**

### Root cause: `SUBJECT_IDENTITY_OWNER_DEFECT`

1. There **is** a click-clocked identity owner — the queue-row seed — and the **title** uses it. But
   `focusPanelSeedFromQueueRow.ts:78` returns `{ title, statusLabel, familyOpportunityId }` — **no image
   field exists on the seed**, although the clicked row rendered one (`CondensedQueueRow.tsx:213`). The
   avatar structurally *cannot* follow the click.
2. The avatar's actual owner is `subjectScope` — plain React state (`InlineOpportunityFocusPanel.tsx:101`)
   whose only writer is the body, fed from `model.context.participantScope`, which during a hold is **the
   prior subject's VM**. Commit-clocked by construction, and never reset on subject change.
3. The child overlay **actively launders** it: `overlayChildMissionOntoSettledFocusModel.ts:226` falls back
   to `settled.context.participantScope?.imageUrl` — the previous subject's photo — presenting it as the
   new child's.
4. Nothing is keyed by subject. The body wrapper was deliberately de-keyed (`key="focus-panel-body"`), and
   `subjectScope` is neither a self-fetching card nor covered by the hold contract's clearing — so the
   de-keying stopped it resetting.

**Not** `PAYLOAD_HOLD_POLICY`: holding prior *content* is doing exactly what it says. The defect is that
*identity* was allowed to ride the content hold. The status chip has the same shape (held VM's label wins
over the new row's seed), so the operator can see **B's title beside A's avatar and A's status**.

### The correct transition contract — and the doctrine gap

The only statement of the right rule is a **code comment**, scoped to the title
(`InlineOpportunityFocusPanel.tsx:502-511`): *"once chrome has acknowledged a selection, that identity does
not move backwards… nothing here relabels held content as belonging to the new subject."*

Platform doctrine says only *"Hold prior payload… the last good content is shown until the next is ready"*
(`operational-experience-doctrine.md:74`) — **content**, with no identity carve-out.

> **Proposed contract (not implemented):** old business CONTENT may be held for continuity; old subject
> IDENTITY may never be. Identity elements — name, avatar, status chip, subject chips — move on the click
> clock or render empty. Never the prior subject's value.

---

## E. DEPLOYED CRITICAL PATH — DOMINANT WAITS AND CLASSIFICATION

71 requests · 1,770 KB across the session.

| Wait | Measured | Classification |
|---|---:|---|
| `provisioning-answer` (cold) | **11,689 ms** (5,558–11,689 across runs) | **MUST_BLOCK_CRITICAL_MEANING** — but **MUST NOT block structure**: it carries the composition it is being waited on for |
| `view-models/drawer/opportunity` | **7,499 ms** | CAN_DEFER — settlement enrichment; blocks nothing structural |
| `layout-runtime/opportunity-drawer-body` | **6,292 ms** | CAN_DEFER |
| `work-unit-queue-summaries` | 4,238 ms | CAN_PARALLELIZE |
| destination `provisioning-answer` (lens switch) | 3,002 ms | MUST_BLOCK_CRITICAL_MEANING |
| `communications/*` (family-workspace, threads, recipients) | 1.2–2.0 ms ×4 | CAN_DEFER / CACHEABLE |

**The classification matters more than the numbers, and it is lopsided:** exactly **one** request must
block critical meaning, and **none** must block structure. Everything else is deferrable, parallelisable
or cacheable. The 10.6 s blank is not paid for by work that needs to happen first — it is paid for by a
policy that will not draw a shape it already knows.

**SERVER_BACKEND_DEBT** is nonetheless real and dominant in wall-clock: a single `provisioning-answer`
ranging 5.5–11.7 s, plus a 7.5 s drawer VM, is not a client-orchestration problem and no reveal policy
fixes it. **CLIENT_ORCHESTRATION_DEBT** is what turns that latency into a *blank screen* rather than a
*filling screen*.

---

## F. SECONDARY ENRICHMENT

| Item | Source | Observed | Blocks anything? | Could start earlier? | Stale retained? |
|---|---|---:|---|---|---|
| Children | drawer VM settlement | reserved 10,687 → 19,184 | no | only with a new read (**Track A: declined**) | no — reserved, not false |
| Household | same | reserved 10,687 → 19,184 | no | same | no |
| Readiness KPI | same identity basis | never mounted | no | same | no |
| KPIs / statuses | held VM | commit-clocked | no | partially — seed carries status | **yes** — held VM's status wins |
| avatars / images | `participantScope` via VM | 5,960 ms after click | no | **yes** — the row already holds the URL | **yes — the prior subject's** |
| process rail participants | BP evidence | with the card | no | rail needs settlement | no |

Only two items retain stale values, and both are identity, not content — §D.

---

## G. STRUCTURAL-COMMIT HYPOTHESIS — **PARTIALLY_VIABLE**

**Viable, and cheaper than it looks, because the composition already arrives at commit.** The grid is
already record-independent and already renders every configured cell unconditionally. Nothing needs a new
card system, a second runtime, or fabricated data.

**What makes it only *partially* viable — three real obstacles, none cosmetic:**

1. **`visible_construction_ms = 0` is an absolute, documented acceptance metric.** The operator's own
   hypothesis is, in the current doctrine's vocabulary, *the thing that must never happen*. This is a
   contract renegotiation, not an implementation detail. It cannot be quietly ignored.
2. **Band heights cannot be solved before measurement** (`focusPanelRowHeights.ts:94`, locked by test).
   Structure committed early would be *unequalised* and would re-equalise as cards measure — visible
   movement, which is the defect the solver exists to prevent.
3. **The pre-commit window has no composition at all.** Before the provisioning answer returns there is no
   `summaryDocSeed`, so the 10.6 s blank cannot be filled with the *real* grid — only with the shell,
   header and pills. Filling it with a *generic* grid is exactly the "skeleton chorus" the constraints
   forbid.

**Therefore the viable form is narrower than the hypothesis, and it is worth stating exactly:**

* **Pre-commit (0 → answer):** commit the *shell* — header, Work View pills with their known counts, and
  an explicitly-pending queue region. Not cards. Not a fake grid.
* **At commit (answer returns):** unchanged — the real grid already renders here.
* **Post-commit:** unchanged.

That converts "10.6 s of nothing" into "10.6 s of a real, identifiable destination with pending content" —
without drawing one card boundary the tenant did not configure.

### Smallest architectural boundary that would own STRUCTURAL COMMIT

**`SurfaceHostContext` + the panel's reveal predicate — two gates, no new system.**

`isOperationallyResolved` currently requires a *situation* and an *answered action* to show *any* structure.
`CARD-READINESS-LIFECYCLE.md` §4a already says placement precedes readiness, and §5 already defines
`panelOperationallyReady` as a fold over *gating* cards only. **The predicate is narrower than the doctrine
it cites.** Splitting it into `structurallyResolved` (subject identity known) and `semanticallyResolved`
(today's predicate) is the whole change. No new owner, no duplicated truth.

**Not implemented. Not authorized by this audit.**

---

## H. VISUAL HEIGHT REGRESSION

**Measured deployed:** Business Process **232 px**, Financials **325 px** — a 93 px difference, matching
the operator's report of whitespace under Enrollment.

**The equal-height contract is real, implemented and tested.** `focusPanelVisualBands.ts` names this exact
pair and equalises cards sharing a *visual band*; `focusPanelRowHeightSolver.test.ts:63-74` uses the live
Firefly composition and asserts **both cards = 325 px**.

**So the test expects exactly what the operator did not get.** Two candidate causes, and code alone cannot
choose between them:

1. **The band is skipped while any member is unmeasured** (`focusPanelRowHeights.ts:94`). During settlement
   churn the pair sits at raw intrinsic heights — unequal. If the panel settles with a card still
   unmeasured, they stay unequal. *The 232 px I measured is exactly the "unequalised" shape.*
2. **Strategy is not `grid`.** The band solver runs only on `strategy === "grid"`; a `lanes`/`rows`/
   `collapsed` plan (below 560 px) does no equalisation at all.

**Smallest future repair boundary:** read `window.__focusPanelGridDiag` / `__focusPanelLayoutSource` on the
deployed panel to determine which of the two it is, then fix that one. **This is a ~30-minute diagnosis,
not a redesign** — and it should not be bundled with the latency work.

---

## I. ARCHITECTURE VERDICT — **B: SUBSTANTIAL RESTRUCTURING OF PRESENTATION/REVEAL WITHIN RUNTIME V2**

Not **A**: four slices of targeted repair have now closed every correctness defect and left the operator's
verdict unchanged. The remaining failure is structural, not local.

Not **C**: nothing in the evidence indicts the architecture. The kernel's atomic commit is sound and is
what makes the panel coherent. The composition already arrives at commit. The grid already renders
configured cells unconditionally. The card registries are honest. **Replacing this would discard working
machinery to fix a policy.**

### KEEP

* the K1/K2/K3 kernel and the atomic operational commit — it is why the panel is never incoherent
* the published-composition seed on the provisioning answer — it is the *enabler* of any structural commit
* `COMMIT_CRITICAL_CARD_SPECS` / `MOUNTABLE_CARD_SPECS` and their evidence-gated laws
* the band height solver and its "never guess a height" rule
* hold-prior-payload for **content**
* the server-side participation resolver and its authorization boundary (Slices 5 + 7)

### CHANGE

* **`isOperationallyResolved`** — split structural from semantic resolution (§G)
* **the identity clock** — name, avatar, status chip move on the click clock; add an image to the queue-row
  seed (the row already has it)
* **`overlayChildMissionOntoSettledFocusModel.ts:226`** — stop falling back to the prior scope's `imageUrl`
* **held-rows presentation on a lens switch** — held rows must not present as live destination rows
* **`visible_construction_ms = 0`** — renegotiate deliberately, or the operator's hypothesis stays illegal

### RETIRE

* `FocusPanelSummarySkeleton` **as documented contract** — either wire it to the Work Unit panel or delete
  the stale docblock claiming it is the pending contract; today it is neither used nor true
* the stale premise in `focusPanelCommitCriticalCards.ts:162-167` that the composition "arrives from a
  SEPARATE client fetch long after commit" — it is carried on the answer

---

## J. WHY `SLICE_8_DEPLOYED_PRODUCT_PASS` ≠ HUMAN ACCEPTANCE

**It is not a contradiction. Slice 8 measured exactly what it claimed, and every claim remains true.** The
gates proved *correctness*: does the card say a true thing, does the participant survive settlement, does
the click acknowledge. They did not measure **how long the operator waits to see anything**, because no
gate ever asserted on the *absence* of structure.

Concretely, five things automation proved and five it never looked at:

| Proved | Never measured |
|---|---|
| BP meaningful at first-card commit | that "first-card commit" is 10.6–20.7 s after navigation |
| Attendance/Health hold READY | that two cards sit as empty boxes for 8.5 s |
| click → `aria-selected` < 150 ms | that the destination takes a further 3.3 s with old rows shown as live |
| producer verdicts correct | that the avatar shown belongs to the previous subject for 5.8 s |
| no LESS_INFORMATIVE transition | structural coherence — geometry absent, then whole |

**The deeper reason:** every gate was written as *"when X appears, is it right?"*. None was written as
*"how long is the operator looking at nothing?"* A suite of such gates can go green on a surface that
shows a spinner for ten seconds — which is precisely what happened.

These become P1-1 requirements (§27). **Not implemented here.**

---

## K. LEDGER, SEQUENCE AND BATCHING

### P0-7 itemized ledger

| # | Item | Evidence | Severity |
|---|---|---|---|
| **P0-7.1** | 10.6 s with no destination structure while the composition is already in hand | §0, §A | **highest** — causes complaints 2, 3, 7 |
| **P0-7.2** | old subject identity (avatar, status) presented as the new subject for ~5.8 s | §D | **high** — trust, not just speed |
| **P0-7.3** | held rows on a lens switch present as live destination rows for 3.3 s | §C | high |
| **P0-7.4** | Household/Children reserved as empty bordered boxes for 8.5 s | §B | medium — Track A accepted the delay, not the treatment |
| **P0-7.5** | BP/Financials height divergence (232 vs 325 px) | §H | medium — visual only |
| **P0-7.6** | `provisioning-answer` 5.5–11.7 s, drawer VM 7.5 s | §E | **server debt** — separate programme |
| **P0-7.7** | stale docblock + stale admission premise | §I RETIRE | low |

### P1-1 human-acceptance gaps

1. time-to-first-destination-structure (not first card)
2. duration of any "nothing on screen" window
3. reserved-cell dwell time and count
4. stale-identity window per identity element (name, avatar, status)
5. destination-switch latency with held-content classification
6. **harness instrument validation** — my `reserved_peak: 0` was a wrong attribute name; this is the fifth
   harness defect in this programme and every one produced a confident wrong reading

### Recommended finite repair sequence

| Slice | Content | Certifiable together? |
|---|---|---|
| **1** | **P0-7.2** identity clock — seed carries the image; avatar/status move on the click clock; overlay stops laundering the prior scope | yes — one contract, one test family |
| **2** | **P0-7.3 + P0-7.4** held-content presentation — held rows marked pending; reserved cells given a calmer treatment | yes — both are "how held/absent state looks" |
| **3** | **P0-7.1** structural commit — split `isOperationallyResolved`; requires the `visible_construction_ms` renegotiation first | alone — it is the architectural one |
| **4** | **P0-7.5** height diagnosis | trivially, with any slice |

**Batching:** slices 1 + 2 are low-risk presentation changes with no server impact and should promote
**together** in one deployment. Slice 3 promotes **alone** — it changes the reveal contract and needs its
own deployed judgement. Slice 4 rides along.

**Do slices 1 + 2 first.** They address the two complaints that read as *broken* rather than *slow* (stale
identity, wrong-looking held state), they are independently valuable, and they do not require renegotiating
a documented acceptance metric.

### Exact next implementation slice

**Repair Slice 9 — subject identity clock (P0-7.2).** Smallest boundary: add an image to
`focusPanelSeedFromQueueRow` (the row already carries it), bind the header avatar and status chip to the
click-clocked identity owner rather than the held payload, and remove the prior-scope `imageUrl` fallback
in the child overlay. Certified by asserting **which subject's identity is on screen at each frame after a
click**, with a planted defect restoring the fallback.

---

## SEPARATE, NOT PART OF P0-7

**FINANCIALS WORKSPACE OVERHAUL — FOLLOW-UP PRODUCT PROGRAMME.** The operator reports the Financials
Workspace as slow and clunky and needing a major overhaul. Explicitly **excluded** from this runtime audit
and not investigated here. It needs its own discovery.

**SERVER LATENCY (P0-7.6)** is also its own programme: a 5.5–11.7 s `provisioning-answer` and a 7.5 s
drawer VM are backend debt. No presentation change fixes them, and the structural-commit work exists
precisely to make that latency *survivable* rather than to hide it.
