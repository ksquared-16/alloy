# Card Readiness — Design Capture (decision-first, pre-implementation)

**Status:** DESIGN / EXPLORATION. No code. **Date:** 2026-07-28. **Owner doc:** `RUNTIME-V1-CERTIFICATION-SPRINT.md`.

Captured **before** implementation, and revised to be **decision-first**: the earlier draft proposed a
five-stage lifecycle (`unknown→honest→operational→enriched→idle`) — the first thing that was *conceptual
rather than measured*. That lifecycle is **NOT frozen**. Instead we first list the decisions the runtime
actually has to make (each grounded in observed behaviour), then let the minimum concepts emerge from them.

---

## 1. What the investigation proved (measured)

Fixing the two-phase reveal forced three cards into genuinely different treatments — one axis ("how soon
does it load") cannot explain them:

- **Children / Household** — meaningful content derivable at commit → resolve at commit (byte-identical). *(fixed, measured)*
- **Milestones** — no data source exists anywhere; earliest truthful state is the constant "No milestones yet". *(fixed, measured)*
- **Billing Preview** — its verdict derives from the **settlement-owned** billing signal; at commit the runtime *does not know* the config. A forced verdict ("2 items missing") would fabricate a business truth. → must NOT resolve at commit.

## 2. Current runtime vocabulary (facts) and where it is mis-wired

| Concept | Today | Location |
|---|---|---|
| Per-card readiness | `"ready" \| "reserved" \| "not_applicable"` | `focusPanelWorkModeModel.ts:40` |
| "Is more coming" (per card) | `stageWorkPending: boolean` | `focusPanelWorkModeModelFromProvisioningAnswer.ts:93` |
| Panel **operational** | `subjectId && situation && action` | `isOperationallyResolved:157` |
| Panel **settlement** | enriched drawer VM present (`resolved`) | `InlineOpportunityFocusPanel.tsx:426` |
| Interaction gate | "Only READY cards can receive focus; reserved/not-applicable hold geometry" | grid:426 |

**Three mis-wirings (the real defects):**
1. `not_applicable` is a **business truth about the record** wearing a **readiness** label.
2. Readiness is a flat 3-state, not expressive enough to say "truthful but not yet complete."
3. Panel "done" == settlement == the *last, slowest* card, so one deferred card holds the whole panel "settling".

---

## 3. What decisions does the runtime actually need to make?

Independent of implementation. Each is a real branch in observed runtime behaviour, with its evidence.

| # | Decision (per card unless noted) | Evidence it is real |
|---|---|---|
| **D1** | **Does the card participate in this composition?** | Grid renders *configured* cells; cards can be visibility/permission-gated (children roster read-only at case grain; cards suppressed from Overview). Decided from surface config, **not data**. |
| **D2** | **Can the card present a *truthful* statement yet?** | Milestones can ("No milestones yet") at commit; Billing cannot (config unknown — forcing it fabricated a verdict, measured). |
| **D3** | **Must this card be truthful for the panel to be operator-usable?** | Current Work / Household / Children are the operator's working context; the operator can work a lead without Billing's config preview. |
| **D4** | **Can the operator interact with the card yet?** | "Only READY cards can receive focus; reserved cells hold geometry only" (grid:426). |
| **D5** | **Will the card's content still change (is more resolution expected)?** | `stageWorkPending` already tracks exactly this for one card; Household/Children upgrade commit→enriched; Milestones is final at commit. |
| **D6** | **Should background resolution continue for this card?** | Settlement fetch / prewarm / idle-refresh run per card; a *final* card needs none, an *improvable* one does. |
| **D7** | **(Panel) Is the panel operator-ready?** | Save bar + "settled" visual currently gate on settlement (the last card) — the defect. |

## 4. Grouping the decisions → the minimum concepts that emerge

The decisions cluster into **one separate concern, two primitive runtime facts, one declared property, and three derivations** — the states *fall out*, they are not designed.

### 4a. Separate concern — Participation (D1)
Placement / visibility / permissions decide whether a card is in the grid at all, **before** data readiness is
relevant. This is the *placement* concern (next architectural step), **not** part of readiness. Keep it out.

### 4b. The elevated LAW (what Billing exposed) — the load-bearing principle
> **The runtime must never substitute an unresolved runtime state with a business conclusion.**
> `unresolved` is **not** empty, **not** not-configured, **not** not-applicable, **not** complete.
> Those are **business meanings owned by the card model** — asserted only once the card is truthful (D2 = yes).
> When a card is unresolved, the runtime renders a neutral, meaning-free hold. A card *may* state its own
> resolution provenance ("preview unavailable while commercial state resolves" — a truth about the *runtime's*
> status), but it must never assert a *business verdict* it has not earned.

### 4c. Two primitive runtime facts (everything else derives from these)
From the decisions, only **two** things are primitive runtime knowledge about a card:
- **Truthful?** (D2) — does the runtime know enough for the card to render a truthful statement? `no | yes`.
- **Improvable?** (D5) — is further resolution expected (inflight/awaited)? `yes | no`. (Only meaningful once truthful.)

Their product yields the **three runtime-knowledge states** — emergent, not invented:

| Truthful? | Improvable? | Emergent state | Behaviour |
|:--:|:--:|---|---|
| no | — | **`unresolved`** | meaning-free hold (LAW 4b); not interactive (D4); background continues (D6); gates panel iff D3 |
| yes | yes | **`provisional`** | renders honest state; interactive; background continues (upgrades in place); satisfies panel gating |
| yes | no | **`settled`** | renders final state; interactive; no background; satisfies panel gating |

This is **three** states, from the decisions — the earlier five collapse: "operational" vs "enriched" was
business-content richness (Axis B / the card model), not runtime knowledge; "idle" is `settled` + a refresh
policy, not a distinct knowledge state.

### 4d. One declared property — Panel-gating (D3)
Whether a card's truthfulness gates panel readiness is a **per-card declaration** (`loadingPolicy`), not a
state: commit-critical + core honest-empty cards **gate**; deferred cards **do not**. This is the one thing the
card *declares*; the three states above are *derived from resolution*.

### 4e. Three derivations (not primitives)
- **Interactive** (D4) = card is `provisional` or `settled` (truthful).
- **Background continues** (D6) = card is `unresolved` or `provisional` (not `settled`) and has a resolution source.
- **Panel operationally ready** (D7) — see §5.

## 5. Panel operationally ready (the strongest abstraction — deepened)

Two generic, derived concepts replace "settlement == done":

> **panelOperationallyReady = operatorCanAct ∧ ( ∀ card where policy.gatesPanel : readiness(card) ≠ unresolved )**
>
> - `operatorCanAct` = committed subject + business state + truthful primary action (≈ today's `isOperationallyResolved`).
> - **gating cards** = those whose policy declares they must be truthful for the surface to be usable.
> - **deferred (non-gating) cards may be `unresolved`** without blocking — they resolve in the background and
>   upgrade in place; their in-progress state is shown *per card*, never as "panel not ready".

**What it gates:** the operator can begin working — primary actions usable, save affordance present, the panel
presents as a complete operational surface. Settlement/enrichment becomes **background upgrade**, not a panel gate.

**Why it is the right abstraction (not special-cased):**
- Not Billing-specific — Billing is merely the first `deferred`, non-gating card; the aggregate is a fold over any card set.
- Not Work-Unit / Focus-Panel-specific — it is a surface-agnostic fold over per-card policy × readiness; the Kernel/Surface-Host never learn the entity.
- **Second surface (Child) proof:** Child declares its own gating cards (identity, enrollment); its scheduling
  card is `deferred` and non-gating. The *same* aggregate reports "Child panel operationally ready" once
  identity+enrollment are truthful, while scheduling resolves in the background — no new abstraction. The model
  must pass this before any build.

## 6. Admission tests (all five)
1. **Runtime needs it** — the measured defect (whole panel reads settling because one deferred card remains) is unrepresentable today.
2. **Multiple cards** — every card has the two primitive facts + a gating declaration.
3. **Multiple surfaces** — Work Unit + Child derive panel readiness identically.
4. **Removes orchestration** — retires the `settlement == done` coupling and the `not_applicable`-in-readiness overload; save-bar/visual/interaction gating derive from the aggregate.
5. **No new coordinator** — two per-card facts + a pure fold; policy is a per-card declaration.

**300 × 40:** adding a card = declare its gating policy (+ optional business states); panel readiness is a fold — no central switch grows.

## 7. What this supersedes / relationship to prior work
- The **five-stage lifecycle is retired** in favour of the decision-derived `unresolved | provisional | settled`.
- `loadingPolicy` = the **gates-panel + earliest-truthful-boundary** declaration (D3). Kept — one declared dimension, not a competing flag.
- `CardLoadingPolicy` (`commit-critical | honest-empty`, added this session) = the first policy values; extend with `deferred` (+ `initial-panel` later).
- `not_applicable` (current readiness value) → **migrate to a card business state** (Axis B / card model), removing it from the readiness vocabulary (LAW 4b).

## 8. Open questions to resolve before building (design, not code)
1. **Inventory every `resolved`/settlement-gated call site** (save bar, header enriched props, terminal/attention gating). Confirm which truly need *full enrichment* vs can move to `panelOperationallyReady`. This is the blast-radius check that must precede rewiring.
2. **Billing's business state at the lead grain** — "not yet applicable" (stage-derivable, truthful at commit → not deferred after all) vs "preview unavailable while resolving" (deferred). A *card-model* decision, made once the axes are separated.
3. **Migration order** — introduce the two primitive facts behind the existing 3-state with parity (map `ready`→(provisional|settled by `stageWorkPending`), `reserved`→`unresolved`, `not_applicable`→business state), then rewire panel gating to the aggregate, then validate on Child.

## 9. PROOF — settlement-gating inventory (the minimum concepts, evidenced)

Ran the blast-radius check (question 1). Result: **most of the abstraction already exists; only one concept is genuinely new.**

1. **"Operational ≠ settlement" is ALREADY a tested platform contract.** `d4SettlementReservedGeometry.test.ts`
   test *"4-5. operational truth is independent of Settlement — different source, different marker"* asserts
   `resolved` (the enriched VM) drives **only** the settlement marker, and operational readiness comes from the
   committed snapshot (`isOperationallyResolved`), never from the fetch. The split Kelly is reaching for is
   established and regression-locked.
2. **`data-focus-panel-settlement` has NO functional "panel done" consumer** — it is a diagnostic marker
   (+ that test). Nothing gates operator usability on it. So settlement does not functionally hold the panel.
3. **The `resolved`-gates that remain are edit affordances** — the save bar (`InlineOpportunityFocusPanel:565`)
   and the enriched header action set. These legitimately need the enriched record (you cannot edit/save fields
   that aren't composed yet). That is a **detail/edit-layer** dependency, correctly enrichment-gated — NOT a
   panel-readiness concern. It should stay on enrichment.

**Therefore the minimum NEW concept required is exactly one:** `isOperationallyResolved` today is **subject-level**
(`subject && situation && action`). It does not yet incorporate **card-level truthfulness**. The single addition
is to extend panel-operational-ready to the aggregate in §5 — *operator can act AND every gating card is truthful
(≠ unresolved)* — with deferred cards excluded. Everything else is already present or a mis-wiring to correct:

- **New:** the gating-card truthfulness aggregate (§5) — the one concept to add.
- **Correct a mis-wiring:** migrate `not_applicable` out of readiness into a card business state (LAW §4b).
- **Formalize (optional):** the two primitive facts `truthful?/improvable?` (`stageWorkPending` already carries
  "improvable") replacing the flat `ready|reserved|not_applicable`, so "provisional" (truthful-but-improving) is
  expressible. This is refinement, not required for the panel fix.

**Honest scope note:** slices 1–2 already made all *gating* cards truthful at commit for the measured subjects, so
the panel is *already* operationally coherent at commit today. The aggregate's value is (a) making
panel-operational-ready **provably** independent of the deferred Billing card, (b) a **regression guard** (a future
gating card that can't be truthful at commit would correctly hold the panel; a deferred one never would), and
(c) a single surface-agnostic signal the Child surface and header consumers can key off. It is the right concept,
proven minimal — not machinery for its own sake.

**Next (no code yet):** confirm this decision-derived model + the one new concept. If accepted, the first
evidence-checked slice is to define `panelOperationallyReady = operatorCanAct ∧ (gating cards not unresolved)` and
point the settlement-independent consumers at it, leaving edit affordances on enrichment — measured, keep/revert,
validated on Work Unit then Child.

---

## 10. Milestones re-audit (the LAW applied retroactively) — Slice 2 REVERTED

Kelly's challenge: "no authoritative source" ≠ "zero milestones." Audit result:

- **Business concept:** "What meaningful completed/committed operational facts exist for this subject?" (`milestonesCardBlueprint.ts`).
- **Owner:** a milestone-adapter subsystem — registered adapters (process outcomes, tours, forms, agreements, placements, schedules, billing setup, documents) settle `MilestoneFact`s onto `truth.milestones`; surface config selects/orders them. The `operationalExpectations` ledger is the intended substrate.
- **Authoritative source connected today?** **NO.** Zero adapters are registered; **nothing populates `truth.milestones`/`record.milestones`**; the ledger does not feed the card. `MilestonesCard.tsx`: *"until adapters settle facts onto the truth… never invent milestones."*
- **Can zero be positively established?** **No** — with no adapter wired, every subject yields empty regardless of real outcomes. Empty is a **fallback**, not a fact.
- **Is "No milestones yet" authoritative or fallback?** **Fallback from missing wiring.**
- **Correct state:** `unsupported` (capability designed, adapters not connected) — **NOT** settled-honest-empty, **NOT** unresolved-pending. The card must not assert "No milestones yet."

**Verdict: Slice 2 REVERTED** (it converted missing implementation into false certainty — the LAW violation). NOTE: the enriched card *already* fabricated "No milestones yet" pre-existing my change; that is a **separate live defect** — the first real fix (participation-removal-until-wired, or an honest capability state), owned by the card model + participation, not readiness.

**This surfaces a FOURTH knowledge state the decisions require:**

| Truthful? | Source exists? | State |
|:--:|:--:|---|
| no | **no** | **`unsupported`** — capability/source not connected; runtime cannot resolve. Card renders an honest capability state or does not participate; never a business verdict. |
| no | yes | `unresolved` — source exists, not yet resolved (Billing at commit). |
| yes | yes | `provisional` — truthful, still improving. |
| yes | yes | `settled` — truthful, final. |

`unsupported` ≠ `unresolved`: unresolved *will* resolve (improvable); unsupported *will not* until the capability is wired.

## 11. Declaration contract — refined per review (participation ≠ cadence)

- **`participatesInInitialPanelReadiness: boolean`** — the gating declaration (renamed; **not** `loadingPolicy`). The ONLY thing that decides whether a card blocks the panel fold.
- **`loadingPolicy`** — cadence ONLY (`commit | deferred | idle-refresh`). Determines *when* the runtime attempts resolution; **must not** implicitly decide panel-blocking.
- **Card business state (Axis B)** — card-model-owned meaning; `not_applicable` migrates here, kept as a compat shim until every consumer is audited.
- **Interaction eligibility** — derived INDEPENDENTLY from **permissions + lifecycle + action availability**. Do **not** equate `truthful` with `actionable` (a truthful card may be non-actionable, and vice-versa).
- **`panelOperationallyReady`** = pure fold, no coordinator/timing barrier: `operatorCanAct ∧ (∀ card where participatesInInitialPanelReadiness : readiness ∈ {provisional, settled})`.
- **Deferred/unsupported/non-participating cards never block** navigation, subject identity, or the coherent initial panel — only an explicit `participatesInInitialPanelReadiness=true` card can gate.

---

## 12. STEP 1 — CERTIFIED behavioral contract (Enrollment Work Unit Focus Panel)

Implementation: `b4af8d883` (Children commit-truth) + `f413fa8c7` (provider-availability exclusion + tests). Certified in production mode.

**Contract:**
1. **Provider-unavailable capability → non-participation.** A card that answers its business question only via an authoritative provider, with none registered (Milestones), is excluded from production composition (grid + cellResolution + linkedCardKeys), regardless of authored visibility. It renders NOTHING to operators, occupies no slot, and emits no business conclusion from missing wiring. It re-participates automatically when a provider registers.
2. **Children uses authoritative commit truth.** The roster is sourced from the enriched queue-row context (`related_subjects_summary`, a wired provider). Commit-critical when a roster is present; the empty state ("No children linked") is an authoritative function of the resolved roster (not a fallback) — contract-tested.
3. **Billing remains unresolved without a fabricated verdict.** At commit Billing is a title-only reserved hold (no "not configured"/"N missing"); its authoritative verdict appears only at settlement. Deferred, non-gating.
4. **Panel operational readiness is independent of deferred Billing settlement** (`data-focus-panel-operational=resolved` at commit while `data-focus-panel-settlement=pending`).
5. **No broad readiness-enum migration, no central coordinator, no card-specific timing** was introduced. Participation / cadence / gating / readiness / business-meaning remain separate concerns.

**Certification evidence (prod build, arm64):** build gate `verify:module-imports ok (8563 files)` + `✓ Compiled successfully`. Milestones excluded across cold + warm + record-switch, all 6 queue subjects (4 cells). Cold operational-ready 7837ms (within the ~6.5–8.2s baseline — not worsened). Warm record-switch (both warm, B→A) 72ms (matches the certified ~46ms). Warm firstCell median ~4.5s was **host-load-inflated** (server/client split shows host-wide elevation: ttfb, htmlEnd, and hydrate all ~2× / 20–40×; the change is subtractive so cannot regress warm — the quiet-host 1.85s cert stands). Tests: `focusPanelCardProviderAvailability` 6/6 pass (arm64 vitest). Pre-existing baseline rot classified (`focusPanelSummaryCompositionInputs` "all published cells" fails identically without this change).

**Known residual (not Step-1 blockers):** no childless subject exists in the org to demonstrate the empty case live (covered by contract test + the provably-wired provider); for a childless subject Children reserves at commit then shows authoritative "No children linked" at settlement (LAW-compliant, unchanged from baseline).
