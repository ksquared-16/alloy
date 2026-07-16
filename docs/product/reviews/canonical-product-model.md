---
owner: product
status: draft
last_reviewed: 2026-07-16
supersedes: []
---

# Canonical Product Model — Business Process → Operator

**Status:** Draft — Product Office review artifact, pending Kelly's approval. Not doctrine until ratified.

**Purpose:** Establish one stable product model that the Current Work review and the Runtime Realization effort can align behind. This is **not** implementation guidance and **not** a redesign.

**Central finding:** *Alloy already has this model.* It is stated — coherently — across five frozen or canonical sources. It has never been assembled in one place, which is why surfaces drift from it. This document assembles it; it does not author it.

**Evidence levels:** `VERIFIED` = observed running. `HIGH CONFIDENCE` = sourced, not executed. `HYPOTHESIS` = requires validation.

---

## 1. The sources that already state the model

| Source | Status | What it establishes |
|---|---|---|
| `docs/platform/core/operational-truth-flow-doctrine.md` | Ratified | Five layers L1–L5; **Law 2: "Projections are derived / non-authoritative — Expectations are authored"** |
| `docs/platform/rfcs/operational-expansion-phase1.md` | **FROZEN / APPROVED** (gate cleared 2026-07) | **D7** Current Work threshold; **D3** *"Consumers … request resolved values and place actions; they never compute"*; governing principle *"no childcare-specific platform abstractions"* |
| `web/lib/lifecycle/operationalProjection.ts` | Canonical (code doctrine) | *"the single source of runtime work truth"*; `count === rows.length`; *"Analytics metrics … must not masquerade as operational queue truth"* |
| `08f2a99a6` — *Enrollment Alignment S4: collapse durable status + persist stage* | Shipped decision | **Stage is persisted, written only by outcome — no longer derived from status** |
| `docs/platform/operator/current-work-surface.md` | Canonical | **Summary → Focus** grammar; *"never invent lists"*; *"never silent no-op"* |
| `docs/platform/operator/operational-context-boundary.md` | Canonical | The **Queue → Operational Context → Focus Panel → Cards** spine; *"rows are previews, never operational truth"*; *"cards observe; they never fetch"* |
| `docs/platform/operator/operational-mode-default-state-doctrine.md` | Canonical | **Default Operational Subject** — a Work Unit–owned strategy; *"the runtime no longer opens the 'first row'"* |
| `docs/platform/operator/operational-grain-doctrine.md` | Canonical | **Rule G-5** — *"the Focus Panel is always case-grain"* |
| `supabase/migrations/20260713000000_process_instances.sql` | Shipped | *"a Process Instance is the running operational journey of a SUBJECT through a PROCESS, within a CONTEXT"*; one instance per `(process, subject, context)` |

---

## 2. Resolving the Stage tension — *it is not a contradiction*

Deliverable #2 classified these as a contested principle. **That was wrong**, and the layering test is what disproves it.

> A. *"Records land here when an outcome moves them to this stage. **Membership is the persisted stage — not a status filter**."* — `VERIFIED`, `StageEditorV2.tsx:847`, rendered live
>
> B. *"**Stages are rollups.** Records appear in this stage when their status matches the rules below."* — `businessProcessUiLabels.ts:55`

**Three findings dissolve the contradiction:**

1. **B is never rendered to any human.** `BUSINESS_PROCESS_SECTION_MEMBERSHIP_SUMMARY` has **zero live consumers** — `VERIFIED` by grep. Its only references are three test files asserting on source text (`expect(workspace).toContain("BUSINESS_PROCESS_SECTION_MEMBERSHIP")`), and the dead `LifecycleStageWorkspace` component. It is a **fossil**, not a competing belief.

2. **The product already decided, by name and date.** `08f2a99a6 — "Enrollment Alignment S4: collapse durable status + persist stage"`. `operationalProjection.ts` marks the old model `@deprecated`: *"Stage is no longer derived from status (S4 collapse). Kept only as a legacy-safety fallback."* B is **pre-S4 doctrine**.

3. **They address different layers anyway.** What "rolls up" is **Work View membership** (L3, derived, recomputable). What is "persisted" is **Stage** (the operational position, authoritative). The projection *materializes* stage onto rows to evaluate predicates (`enrichRowsWithDerivedStage`) — which is precisely what Law 2 permits: *"materialized snapshots … only as a clearly non-authoritative, recomputable cache — never a system of record."*

**Verdict: Stage is settled. The model is coherent.** The residue is dead copy in a dead component, kept alive by tests that read source as a string rather than rendering it.

**Correction to my own P4:** it is not contested. It was **decided at S4**, and the fossil should not have been read as a live belief. My causal claim in Deliverable #2 — that the missing write-validation was a *consequence* of believing stages derived — is **withdrawn**. The product believes stages are authored; the missing guarantee is a **gap**, not a conceptual consequence. (`HYPOTHESIS`: the fossil survives *because* the S4 model change did not carry its guarantee with it — plausible, unproven, and not needed for the model.)

---

## 3. What each concept means

### Business Process
- **Operational question:** *"How does work move through my organization?"* (`VERIFIED` — the builder's own words)
- **Owner:** Administrator · **Author:** Administrator · **Consumer:** everything below
- **Authored**, persisted · **Operator-visible** (as the named funnel)
- **Depends on:** nothing. **Nothing above it should depend on runtime.**

### Stage
- **Operational question:** *"Where is this record, operationally?"*
- **What it IS:** a **persisted operational position**, authoritative, **written only by outcome execution + intake** (`HIGH CONFIDENCE`, S4)
- **What it is NOT:** a projection; a rollup; a status; a queue
- **Authored** (by outcome, not by hand), persisted · **Operator-visible**
- **Depends on:** Business Process. **Must never depend on:** queue, Work View, or presentation.

### Work View
- **Operational question:** *"Which slice of this work am I looking at?"*
- **What it IS:** a **saved operational lens** — authored predicates (Work View Conditions V3) an operator switches between. Product copy: *"Operational lenses staff switch between in the work unit — each maps to a synced queue lane."* (`HIGH CONFIDENCE`)
- **Author:** Administrator · **Consumer:** Operator (as tabs) and the Projection (as predicate input)
- **Authored**, persisted · **Visible to both**
- **What should never belong to it:** truth. A Work View **selects**; it must never **compute** counts or membership of its own — that is the Projection's job, and the doctrine says so by construction (`count === rows.length`, one evaluator).

### Operational Projection
- **Operational question:** *"What is actually in play right now?"*
- **What it IS:** **L3 — derived, non-authoritative, recomputable.** Self-described as *"the single source of runtime work truth"* (`HIGH CONFIDENCE`)
- **Truth it OWNS:** base scope (`total`), per-view `count`, `rows`, and membership — *"every operational surface (workspace process card, Work View nav/sidebar count, Work View header/pill count, Work Unit queue rows, Focus Panel membership) must agree because they all derive from ONE projection."*
- **Truth it does NOT own:** stage assignment (outcome execution owns it); what work to do (the operating plan owns it); and **analytics** — *"Analytics metrics … are NOT this projection and must not masquerade as operational queue truth."*
- **Computed**, never persisted as record · **Implementation-only** — the operator should never hear the word
- **Should it generate queue rows, counts, pill counts, Work View membership, Focus Panel membership?** The product answers **yes** to all five by name — but **Focus Panel membership is aspirational only** (zero production callers, `VERIFIED`). Shipped: counts, pill counts, rows, Work View membership.
- **Should it generate the default subject?** **No — and correctly not.** `OperationalProjection = { total, views[], byViewId }` emits none (`VERIFIED`).
  > **CORRECTED.** The first revision called this *"a genuine, honest gap in an otherwise complete statement."* **Wrong.** It is not a gap — **default subject is a separately owned concept** with its own canonical doctrine (`operational-mode-default-state-doctrine.md`) and its own resolver strategies. The projection is silent because selection is **not its job**. The model is more complete than I credited; what is missing is the *implementation* of the configured strategy, not the concept.

### Queue
> **CORRECTED.** An earlier revision of this document claimed *"Queue is not a product concept"* and *"not a layer."* **Wrong.** `operational-context-boundary.md` names Queue as a canonical level with a strictly bounded role.

- **Operational question:** *"Which of these do I want to work?"*
- **What it IS (canonical):** *"**Preview/selection surface. Rows are previews, never operational truth.**"* It **owns selection intent** and loads *"queue rows only."*
- **What it must never be:** truth. Restated canonically: *"Queue remains preview/selection only — authoritative detail from entity GET / Focus Panel."*
- **If Queue disappeared tomorrow?** Its **truth** role is nil — nothing is lost. Its **selection** role is real and canonical, so something must still own selection intent. The honest answer is narrower than my first: *the word* could go; *the role* could not.
- **Computed** · operator-visible as rows, but the *word* need not be

### Default Operational Subject
> **ADDED — a layer the first revision omitted entirely.**

- **Operational question:** *"Which one opens first?"*
- **What it IS:** a **Work Unit–owned resolution strategy**. Canonical: *"The runtime **no longer opens the 'first row.'** It resolves the **Default Operational Subject** using a **Work Unit–owned resolution strategy**"*; and *"**First row** — **Not** the default selection rule unless strategy explicitly resolves to it."*
- Strategies shipped: `highest_priority | earliest_due | assigned_to_me | highest_sort_order | first_row`
- **Doctrine is ahead of code** (`HIGH CONFIDENCE`): the configured-strategy slot is marked **`NOT YET IMPLEMENTED`**, and first row is today's effective default. The doctrine's own ban — *"Do not fall back silently to 'first row' without documenting the fallback as explicit platform behavior"* — is satisfied in letter (the fallback is documented) while its intent is not yet met.

### Operational Context
> **ADDED — the most consequential omission in the first revision.**

- **Operational question:** *"What is true about this subject, right now?"*
- **What it IS (canonical):** *"The fully-composed situation the operator is working within: **subject** + **business process** + **composed subject truth** + **capabilities/permissions** + **status**. Loaded **once** per subject."*
- **Owns:** *"The single source of observed truth for all cards."* It is *"**the only routine load level**."*
- **Computed**, loaded once per subject · **Implementation-only** (the operator never hears the term)

### Focus Panel
- **What drives it?** Per frozen D3: *"Consumers (**Work Units, Focus Panels**, Surface Builder) request resolved values and place actions; **they never compute**."*
- **What it IS (canonical):** *"The cognitive presentation of one Operational Context. Three modes (Summary / Work / Activity) select which cards compose; mode is not a tab and not a route."* It **owns** composition, mode, and the reveal gate — and **does not load**: *"reads the already-loaded context."*
- **One Focus Panel**, composed differently for different operational subjects.
- **Grain law G-5 (canonical):** *"**The Focus Panel is always case-grain.** … `context.subject.id` is always an `opportunity_id`. All Focus Panel cards answer questions at case grain, even when they display child-level data as subordinate content."*
- **Consumer**, never author · **Operator-visible** — it *is* the operator experience
- **Grammar (canonical):** **Summary** answers *"What is happening?"* · **Focus** answers *"Help me do it."*

### Cards
- **Canonical:** *"Operational answers. Each observes the Operational Context and answers exactly one question."* They load **never independently**: *"Cards observe; they never fetch."*
- *"Perspective and mode never load."* · *"Only a new subject loads."*

### Operator
- **What she owns:** *reality*. She answers **"WHAT HAPPENED?"** (`VERIFIED`)
- **What she must never be shown:** projections, grains, lanes, keys, or the derivation that produced her screen.

---

## 4. The canonical chain

> **CORRECTED.** The first revision drew Projection → Focus Panel directly and asserted *"Queue is not a layer between Projection and Focus Panel."* **That was wrong on both counts**, and it collapsed three distinct concerns that the doctrine keeps separate.

**The model's real insight: three concerns, three owners.** Conflating them is what produces drift.

| Concern | Question | Owner |
|---|---|---|
| **Membership / scale** | *"What is in play?"* | Operational Projection |
| **Selection** | *"Which one am I working?"* | Queue (intent) → Default Operational Subject (resolution) |
| **Truth** | *"What is true about it?"* | Operational Context |

```
Business Process   (authored)
      ↓
    Stage          (persisted position — written ONLY by outcome)
      ↓
  Work View        (authored lens — predicates)
      ↓
OPERATIONAL PROJECTION      (derived · counts + rows · "single source of runtime work truth")
      ↓
    Queue                   (preview/selection ONLY — "rows are previews, never operational truth")
      ↓
Default Operational Subject (strategy resolves WHICH subject opens)
      ↓
Operational Context         (composed truth · loaded ONCE · "the only routine load level")
      ↓
  Focus Panel               (cognitive presentation · composition/mode/reveal · never loads)
      ↓
    Cards                   (observe; answer one question; never fetch)
      ↓
  Operator                  (reports reality)
```

**The projection's Focus-Panel-membership claim is aspirational, not shipped.** `operationalProjection.ts:5` asserts *"Focus Panel membership"* derives from the one projection; its own body hedges to *"the runtime **can** use this"*. **VERIFIED:** `recordMatchesWorkView` and `resolveFocusPanelScope` have **zero production callers**. The projection governs **counts and queue rows**; the Focus Panel's subject arrives via the selection chain. This is a **doctrine-ahead-of-code** gap, not an incoherence — nothing contradicts it; it is simply unrealized.

---

## 5. Subject grain — can one Work View span multiple grains?

**The product already says yes.** Shipped copy: *"All includes every eligible row in this process. **Rows may come from different stages or grains.**"* (`HIGH CONFIDENCE`)

And the enrollment model already requires it: the family case and each child's enrollment track are **concurrent operational positions** — a family at `decision` while children sit at `waitlist` and `enrolling`. The split at Decision is the product's expression of exactly this.

**The rule is more precise than my first pass allowed** (`HIGH CONFIDENCE`), and it is coherent:

- A **stage-scoped** Work View **may not** mix grains — *"A flat Work View cannot mix grains — each row type produces a different queue entry shape."* The operator-facing block is real: *"Mixed row types — resolve before saving."*
- A **predicate-scoped or catch-all** view **may** span grains — *"Mixed-grain is only enforced when the operator explicitly scopes the view to stages with different row types"*; *"A Work View is a filter predicate, not a container of stages."*
- The projection **computes dual-grain counts** (`primaryGrainKind` + `supportingGrainKind` simultaneously), so a view carries a grain **pair**, not a scalar.

**Concurrency is the schema's normal case, not an exception.** `process_instances` is unique per `(org, process, subject, context)` — *"One running instance per (process, subject, context)"* — so three children under one opportunity are three rows with independent `stage_key`s, while family position lives separately on `opportunities.stage_key`. Doctrine: *"a Process Instance is the running operational journey of a SUBJECT through a PROCESS, within a CONTEXT."* Divergent siblings are designed behavior — the split rule's field is literally `per_subject_outcomes`, and one option is *"No action — keep with family."*

**So the model already expresses concurrent tracks. No redesign is needed.** What it lacks is not capability but **one authority**: the family/child distinction is configured **twice**, under two names — `ROW TYPE (GRAIN)` in Stage Context and `Journey` in Operational Experience (`VERIFIED`) — and they are free to disagree.

**`UNCERTAIN`:** no operator surface renders a *unified cross-track view* of one family (family at `tour`, child A at `waitlist`, child B at `enrolling`) in a single frame. Tracks are expressed per queue lane and per child block. Whether that absence is a gap or a deliberate choice is unresolved, and Rule **G-5** (*"the Focus Panel is always case-grain"*) may already answer it.

---

## 6. Opening a Work Unit — the product experience

Stated only as product experience, per the canonical grammar already in the product:

- **She should perceive:** the work, first. *"What is happening?"* answered before anything else.
- **She should understand:** why this record is in front of her, what one thing to do next, and what is genuinely stopping her.
- **What should happen automatically:** the projection resolves; a subject is selected; membership, counts, and rows agree because they came from one computation. She should never wait to learn whether the screen is trustworthy.
- **What should never be exposed:** the word *projection*; the word *grain*; the word *lane*; a stage key; a raw slug; a count that disagrees with the rows beneath it; or an action an administrator switched off.

---

## 7. Concept placement

| Should remain **operator-facing** | Should remain **administrator-facing** | Should become **implementation-only** |
|---|---|---|
| Business Process (the funnel) | Business Process authoring | Operational Projection |
| Stage (where a record is) | Stage authoring | **Operational Context** |
| Work View (the lens she switches) | Work View predicates | **Queue / queue lane** (the *word*; the selection role stays) |
| Work / Current Work | Operating plan, outcomes, requirements | Grain (as a *word*) |
| Outcome ("what happened") | Actions catalog & placement | Predicate evaluator |
| Focus Panel | **Default Operational Subject strategy** | `stage_key`, `outcome_key`, `transition_ref` |
| Cards (as *answers*, not as "cards") | Configuration Health | Projection materialization · `process_instances` |

---

## 8. Effect on the Product Principles

Per instruction, no principles invented. This review **refines two**, **withdraws one classification**, and **discovers four already-frozen principles** the earlier pass had not reached.

**Withdrawn:** P4 "CONTESTED — what a stage is." **The product decided at S4.** Stage is a persisted, authoritative operational position written only by outcome. (§2)

**Refined — P5 (terminal state: stage or status?).** Downgraded from CONTESTED to **`HYPOTHESIS` — configuration variance**. The live tenant closes by status; the template carries Closed stages. That is two *configurations*, not two beliefs. Whether the model prefers one is unproven.

**Refined — P9 (requirements guide readiness).** My Deliverable #2 claim that "progress measures form completeness" is **too strong**. The canonical doc shows a richer model already exists: progress = *"published work templates + field rules + readiness gaps"*, with **requirement timing** (`stage_progress` vs `stage_exit`), and *"`stage_exit` rules … do not make the record invalid"*, and *"blocked only when readiness gap is blocking."* The **model** already distinguishes guiding from gating. The **live tenant's expression** is field-dominated — *"legacy rules without timing continue to appear as stage-progress readiness."* This is a configuration/expression finding, **not a model defect**. The principle stands and is stronger than I credited.

**Discovered (frozen/ratified, evidence-backed — not invented):**

- **P12 — Consumers never compute.** *"Consumers (Work Units, Focus Panels, Surface Builder) request resolved values and place actions; they never compute."* — D3, **FROZEN/ACCEPTED**. This is the layering law the whole model rests on.
- **P13 — Projections are derived and never a system of record.** Law 2, **ratified**. Materialized snapshots are permitted only as non-authoritative recomputable cache.
- **P14 — A condition becomes Current Work only when all five hold** — decision-bearing, materially intervention-worthy, governed by a configured rule, actionable in context, assignable to an accountable owner. *"Variance ≠ Current Work."* Failing any one, it renders as an **informational read model, not work**. — D7, **FROZEN**, explicitly *"guards against over-production of work."*
- **P15 — No childcare-specific platform abstractions.** The frozen RFC's governing principle.

**P15 is already violated in the Process Builder.** `StageEditorV2` — the generic stage editor — imports `enrollmentStageMembership` and renders the Stage Membership panel only when that enrollment-specific lookup matches (`if (!membership) return null`) — `HIGH CONFIDENCE`. For Summer Camp or Hiring, the section silently disappears. A frozen principle, broken in the surface that is supposed to prove universality.

**P16 — Honest gaps, never invention.** *"honest gap copy — **never invent lists**"* and *"blocked operator copy — **never silent no-op**"* — canonical. The product already believes that an absent configuration must be *said*, not papered over.

---

## 9. Certification of the model

**The canonical product model is coherent and is CERTIFIED as a model.**

This reverses the trajectory of Deliverables #1 and #2 on one specific point, and the reversal is the most important sentence here: **the model is not undecided.** Stage is settled (S4). Projection ownership is stated and complete but for default-subject. Consumer layering is frozen (D3). The Current Work threshold is frozen (D7). Truth-flow is ratified (Law 2).

What is broken is **not the model** but **fidelity to it**:

- **VERIFIED** — the workspace KPI tiles ("4 Needs attention", "5 Overdue work") reconcile with no queue and 404 on click. Under the projection doctrine these are **analytics masquerading as operational queue truth** — the one thing the doctrine explicitly forbids. They are also, per **P14**, informational read models being presented as work.
- **VERIFIED** — `Send Form` is `OFF/Disabled` in the builder while Current Work offers it: a consumer not honoring resolved configuration (**P6/P12**).
- **HIGH CONFIDENCE** — the Process Builder's enrollment hardcoding violates **P15**.

The model does not need to be decided. **It needs to be assembled in one place and obeyed.** Every source quoted in §1 is already frozen, ratified, or canonical.
