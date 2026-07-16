---
owner: product
status: draft
last_reviewed: 2026-07-16
supersedes: []
---

# Alloy Product Principles

**Status:** Draft — Product Office review artifact, pending Kelly's approval. Not doctrine until ratified.

**Purpose:** Record what Alloy **already believes**, as evidenced by statements the product makes about itself in shipped copy, canonical docs, and runtime behavior.

**Method.** Every principle below is sourced to a place where the product *says it*. This is not a proposal for what Alloy should become — the platform, runtime, Business Process, and configuration architectures are frozen. It is a record of convictions already present in the product, so they can serve as the standard against which future product decisions are evaluated.

**Evidence levels.** `VERIFIED` = observed in the running product. `HIGH CONFIDENCE` = sourced in code/docs, not executed.

**How to read a violation.** A principle the product states and breaks is not hypocrisy — it is an unfinished commitment, and it identifies where correction belongs. A principle the product holds in *two contradictory forms* is a **contested principle**, and those are the ones that generate defects.

---

## P1 — Operators report reality; the system derives meaning

**The product already believes this.** The runtime asks the operator one question at the moment of completion:

> **"WHAT HAPPENED?"** — `VERIFIED`, Current Work outcome picker

It does not ask her to advance a record, set a status, or choose a stage. It asks her to narrate what occurred. The system then decides what that means.

**Where it holds.** The completion flow is built entirely around observation rather than state manipulation.

**Where it strains.** The consequence list rendered beneath each outcome exposes seven kinds of internal state change (`Successful`, `Move to stage: qualification`, `Complete stage work`, `Stay in stage`, `Reopen work`, `Create attention`, `Close lead`) — `VERIFIED`. Handing the operator the derived meaning while still asking her to observe gives her both jobs.

---

## P2 — An outcome is an observation that produces a durable state change

**The product already believes this**, and states it precisely:

> *"What can happen when operators act from this stage. Each outcome produces a durable state change — a status transition, a stage movement, or follow-up work."*
> — `VERIFIED`, `StageEditorV2.tsx:957`, rendered live

Three consequence kinds. Named. Bounded.

**Where it strains.** The live Lead stage renders seven kinds, not three — and one outcome ("Awaiting Response") renders `Stay in stage` twice — `VERIFIED`. The definition is cleaner than its expression.

---

## P3 — Movement is earned by outcome, never asserted by destination

**The product already believes this**, and says so as a rule:

> *"Outgoing transitions are owned by this stage and appear on Current Work when configured. Outcome automation moves records through those transitions — **never by destination text alone**."*
> — `HIGH CONFIDENCE`, `LifecycleStageWorkTemplateActionsEditor.tsx:347`

This is a strong, well-formed conviction: a record moves because something *happened*, not because someone typed a destination.

**Where it breaks.** The live Lead stage shows `Outgoing Transitions — "No outgoing transitions configured"` while its outcome carries `Move to stage: qualification` and the runtime offers `Move to Qualification` — `VERIFIED`. The record moves by destination text alone, through no transition. The product violates its own stated rule.

---

## P4 — Stage is a persisted operational position, written only by outcome

> **CORRECTED 2026-07-16.** This entry previously read *"CONTESTED: what a stage is."* **That classification was wrong and is withdrawn.** See [canonical-product-model.md](./canonical-product-model.md) §2. The product **decided** at commit `08f2a99a6` — *"Enrollment Alignment S4: collapse durable status + persist stage."* `operationalProjection.ts` marks the old model `@deprecated`: *"Stage is no longer derived from status (S4 collapse)."*
>
> The "rollups" sentence below has **zero live consumers** (`VERIFIED` by grep) — only three text-matching tests and the dead `LifecycleStageWorkspace` component. It is never rendered to a human. It is a **pre-S4 fossil**, not a competing belief.
>
> The two statements also address **different layers**: what rolls up is **Work View membership** (L3, derived); what persists is **Stage** (authoritative position). Law 2 permits exactly the materialization the projection performs.
>
> **Also withdrawn:** the causal claim that missing write-validation was a *consequence* of believing stages derived. The product believes stages are authored. The missing guarantee is a **gap**, not a conceptual consequence.

**The product already believes this**, and says so where a human can read it:

> *"Records land here when an outcome moves them to this stage. **Membership is the persisted stage — not a status filter**."*
> — `VERIFIED`, `StageEditorV2.tsx:847`, rendered live

**The fossil, retained here only as a record of what was superseded:**

> *"Records land here when an outcome moves them to this stage. **Membership is the persisted stage — not a status filter**."*
> — `VERIFIED`, `StageEditorV2.tsx:847`, rendered live
>
> *"**Stages are rollups.** Records appear in this stage when their status matches the rules below."*
> — `HIGH CONFIDENCE`, `businessProcessUiLabels.ts:55`

**Stage-as-authored:** a record is *placed*. A stage can therefore be wrong, and something must guarantee the write is valid.
**Stage-as-derived:** a record *falls* there. A stage can never be wrong; it self-heals; no validation is needed.

**Why this is the most consequential entry in this document.** The runtime implements *authored*; the vocabulary teaches *derived*; and so **no validation was ever built** — correctly, for the other concept. This single indecision is the upstream cause of:

- `Move to stage: qualification` pointing at a stage absent from the process — `VERIFIED`
- Configuration Health having no transition-target check while reporting **HEALTHY** — health verdict `VERIFIED`, absence of check `HIGH CONFIDENCE`
- the live Stage Membership panel declaring "not a status filter" while rendering `Lead status: Open` as a membership input — `VERIFIED`

Resolving P4 collapses several apparently unrelated defects into one decision with one owner.

---

## P5 — CONTESTED: whether a terminal state is a stage or a status

**The product answers differently in three places.**

- The **live tenant** has no Closed stage; `Closed Lost → "Close lead" · "Complete stage work"` — closing is a **status** operation — `VERIFIED`
- The **process template** carries `closed` and `closed_withdrawn` as **stages** — `HIGH CONFIDENCE`
- The **mission brief** lists Closed as the final **stage** of the journey

The live tenant's answer (closing is a status) is arguably the most coherent of the three. The product has simply never chosen.

---

## P6 — Configuration steers behavior; runtime owns execution

**The product already believes this.** Current Work's content, actions, outcomes, and transitions resolve from the org's published operating plan rather than hardcoded branches — `HIGH CONFIDENCE`. The builder states the division plainly: *"Process Actions supply the action catalog."* — `VERIFIED`.

**Where it breaks.** `Send Form` is `OFF / Disabled` in Process Actions while Current Work still offers "Send form" to the operator — both `VERIFIED`. When an administrator's switch does not steer the runtime, this principle is not being kept.

---

## P7 — The platform owns what the operator should not have to

**The product already believes this**, and it is the best-expressed conviction in the application:

> *"What this process tracks and how children move. **The platform manages this for you.** … A new child shows the family's stage until a decision starts their own track. … **The platform keeps each child's enrollment journey in sync — nothing to configure.**"* — `VERIFIED`, Process Participation panel

This is a real belief with teeth: the product actively *removes* configuration surface rather than exposing it.

**Where it carries risk.** It makes this promise over the family→child split — the least settled part of the model. The same distinction is configured twice under two names (`ROW TYPE (GRAIN)` in Stage Context; `Journey` in Operational Experience) — `VERIFIED` — and they are free to disagree. A promise of "nothing to configure" over something configured twice is a debt, not a feature.

---

## P8 — Current Work is where work is completed

**The product already believes this**, canonically:

> *"Operators open a record to **complete work**. Current Work answers: **Summary:** What is happening? … **Focus:** Help me do it"*
> — `VERIFIED`, `docs/platform/operator/current-work-surface.md:21,23-24` (status: canonical)

"Summary answers *what is happening*; Focus answers *help me do it*" is an unusually clear division of labor, and it is the right one.

**Where it breaks.** Current Work currently functions as a launcher: exactly one action renders a real inline form, and the rest bounce to the record header, hand off to another card, or state *"This action is not available inline from Current Work yet."* — `HIGH CONFIDENCE`. The gap between P8 and behavior is the single largest gap in the product.

---

## P9 — Requirements guide readiness; they should not hard-lock the process

**The product already believes this**, and says so in the requirements editor itself:

> *"Required fields block specific actions when missing. Entry and exit expectations **guide operators without hard-locking the process**."*
> — `VERIFIED`, `StageEditorV2.tsx:929`

The product's own stated intent is *guidance*, not gating.

**Where it breaks — and inverts.** Requirements are configured as a field matrix (`Off / Rec / Req` per field, per entity) — `VERIFIED`. The operator then sees a **"Blocked"** chip and **"Progress 80% — 8 of 10 requirements complete"**, where the blockers are `Program` and `Date of Birth` — `VERIFIED`. The product measures **form completeness** and presents it as **operational progress**, and it hard-locks with a "Blocked" chip while its own principle says it should guide. A family that has toured and verbally committed reads as *blocked*; a family never contacted reads as *80% done*.

---

## P10 — The unit of work must be explicit

**The product already believes this.** It refuses to let a stage be ambiguous about what one row represents:

> *"Stage grain is the authoritative row type for this stage. Work Views and surfaces use this grain — **one queue row per family**."* — `VERIFIED`
> *"One row per child enrollment — a family with 2 children produces 2 rows."* — `HIGH CONFIDENCE`, `GrainImpactCallout`

Forcing this choice explicitly, and explaining its consequence in the director's own terms, is a genuine strength.

**Where it strains.** The concept is named for the schema (`grain`), not the operator, and is configured in two places (see P7).

---

## P11 — A Business Process describes how work moves

**The product already believes this**, in its opening sentence to the administrator:

> *"Processes — **Design how work moves through your organization**."* — `VERIFIED`

This is the frame a director already has. It requires no translation.

---

## Summary — the standard

| # | Principle | State |
|---|---|---|
| P1 | Operators report reality; the system derives meaning | Held, straining |
| P2 | An outcome produces a durable state change | Held, expression leaks |
| P3 | Movement is earned by outcome, never asserted by destination | **Stated, violated** |
| P4 | Stage is a persisted operational position, written only by outcome | **Settled at S4** (was wrongly "contested") |
| P5 | Whether a terminal state is a stage or a status | `HYPOTHESIS` — config variance, not a contested belief |
| P12 | Consumers never compute | **Frozen (D3)** |
| P13 | Projections are derived; never a system of record | **Ratified (Law 2)** |
| P14 | Current Work threshold — all five must hold; variance ≠ work | **Frozen (D7)** |
| P15 | No childcare-specific platform abstractions | **Frozen — violated in Process Builder** |
| P16 | Honest gaps, never invention | Canonical |
| P6 | Configuration steers behavior; runtime owns execution | **Stated, violated** |
| P7 | The platform owns what the operator should not have to | Held, over-promised |
| P8 | Current Work is where work is completed | **Stated, largest gap** |
| P9 | Requirements guide readiness without hard-locking | **Stated, inverted** |
| P10 | The unit of work must be explicit | Held |
| P11 | A Business Process describes how work moves | Held |

**The finding this table exists to carry:** Alloy's principles are sound. Not one of P1–P11 is a bad belief, and none needs replacing. Nine are stated somewhere in the product's own voice. The failures are **P3, P6, P8, P9 — commitments stated and not yet kept** — and **P4, P5 — questions the product answers two ways at once.**

That is why the correction direction is *toward what the product already says about itself*, not toward a redesign. `"Each outcome produces a durable state change."` `"Membership is the persisted stage."` `"Never by destination text alone."` `"Guide operators without hard-locking."` These sentences are already written down. The product does not yet obey them.
