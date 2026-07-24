# Director Judgment V1 — Discovery & Design

**Status:** DISCOVERY / DESIGN — no implementation. Nothing pushed/merged/promoted.
**Sprint:** Director Judgment V1 Discovery (Vacilando OS)
**Builds on:** Director Intelligence V1 (preparation pipeline + Gap Analysis behind a `ReasoningProvider` seam), Experience V1 (workspace), Conversations V1 (the dialogue).

> The next evolution is not intelligence. It is **judgment**. This sprint defines how Director should *think* before we teach it how to *speak*.

---

## The thesis (from the observational audit)

Director already computes the raw material of judgment — it just never *interprets* it. Every conversation carries a gap report with a **confidence score, unknowns, suggested criteria, conflicts, and missing files**, and every capability carries an **attempt history**. Today Director narrates status over the top of all of it and stays silent on what it means.

Evidence from the seven live conversations (read-only audit):

| Conversation | Verdict | Confidence | Decisions | Prior attempts | What Director said | What it left unsaid |
|---|---|---|---|---|---|---|
| Access & Roles | Ready | **1.0** | 2 | **9 missions** | "1 past mission… ready for review" | 9 attempts exist (1 done, others interrupted/failed); 4 suggested criteria + 1 unknown |
| Onboarding | Ready | 0.4 | 1 | 1 | "Everything I need is in place." | Reached Ready on one decision; thin coverage |
| Reporting | Ready | 0.4 | 1 | 1 | "Everything I need is in place." | same |
| Communications | Ready | 0.4 | 1 | 1 | "Everything I need is in place." | **1 open unknown** never surfaced |
| Financials | Ready | 0.4 | 1 | 1 | "Everything I need is in place." | thin coverage on a money-touching capability |
| Scheduling | Ready | **0.2** | 1 | 1 | "Everything I need is in place." | lowest confidence in the set, spoken identically to 1.0 |
| Retention | Needs Product Decisions | 0.2 | 0 | 1 | "Record the decisions…" | *correct* — the one place Director already advises |

**The core defect:** *Ready is a status. A director gives a confidence-qualified recommendation.* Director says "Everything I need is in place" at 0.2 confidence and at 1.0 confidence in identical words. Judgment is the layer that makes those two sentences different.

---

## 1. Behavioral taxonomy

Every kind of statement a real engineering director makes, grouped. Each family notes its **trigger** (the durable signal that would fire it), whether it is a **fact or an opinion**, and whether it must carry **confidence** and **evidence**.

| Family | What it is | Trigger (signal) | Fact/Opinion | Confidence | Evidence |
|---|---|---|---|---|---|
| **Observation** | States a fact about the work | attempt count, mission/acceptance history, references present | Fact | n/a | inherent |
| **Assessment** | Judges the *state* ("this is thin") | coverage score, decisions/refs/roadmap counts | Opinion | required | required |
| **Recommendation** | Advises an action ("continue V2") | attempts + status + scope | Opinion | required | required + alternatives |
| **Warning / Risk** | Flags downstream impact ("this touches tuition") | relationships, known_issues, domain keywords | Opinion→flag | required | required |
| **Question** | Names what's needed to proceed | blocking gap findings | Fact (about the gap) | n/a | the finding |
| **Tradeoff** | Frames a cost/benefit ("faster if we postpone reporting") | roadmap breadth, dependencies | Opinion | moderate | the items traded |
| **Pattern** | Notes similarity ("looks like Scheduling") | relationships, capability similarity | Opinion | required | the compared capability |
| **Alternative** | Offers ≥2 viable paths | multiple viable options detected | Opinion | required | each option's basis |
| **Confidence** | Meta-statement of certainty | coverage score + evidence completeness | Meta | is the value | the coverage inputs |
| **Unknown** | Admits ignorance ("I don't know enough yet") | unknowns findings, insufficient coverage | Fact (about ignorance) | n/a | the unknown |
| **Escalation** | Elevates scope ("deserves its own capability") | intent↔capability fit, scope size | Opinion | required | the misfit signal |

Two hard rules fall out of this table and thread through everything below:
- **Facts and opinions are never blended.** An observation states; an assessment judges. Director says "There are 9 prior attempts" (fact) *and separately* "I'd continue one rather than start fresh" (opinion) — never one sentence that smuggles the opinion in as fact.
- **Every opinion carries confidence and evidence.** No naked "I recommend X."

---

## 2. Judgment model

A **judgment** is the atomic unit of this sprint — a claim Director makes, with its basis, evidence, and certainty made explicit.

```jsonc
{
  "judgment_id": "jdg_…",
  "conversation_id": "msn_…",
  "kind": "assessment | recommendation | warning | observation | question | tradeoff | pattern | alternative | unknown | escalation",
  "claim": "This package is thin — one decision, no prior art, no references.",
  "basis": "fact | opinion",                 // facts come straight from state; opinions are derived
  "evidence": [                               // every opinion cites durable sources
    { "source": "gap_report", "ref": "gap_…", "detail": "confidence 0.2" },
    { "source": "capability", "ref": "cap_…", "detail": "0 references, 0 roadmap items" }
  ],
  "confidence": { "level": "high | moderate | low | insufficient", "score": 0.2, "why": "coverage ratio: decisions present but no references/roadmap/prior art" },
  "would_raise_confidence": ["add references", "record a second decision", "link prior art"],
  "tier": "deterministic | reasoning | provider",   // provenance of the judgment (see §8)
  "generated_at": "…"
}
```

Principles baked into the shape:
- **Basis is explicit.** `basis:"fact"` judgments have no confidence (they are read directly from state). `basis:"opinion"` judgments *must* have confidence + evidence.
- **Confidence is derived, not asserted.** It reuses Gap Analysis's coverage ratio (a real number, not a self-estimate) plus evidence completeness. `insufficient` is a first-class level — Director is allowed to say "I don't know enough yet."
- **`would_raise_confidence`** turns every low-confidence judgment into an actionable path, not a dead end.
- **Tier is provenance.** The operator always knows whether a judgment is a deterministic rule, heuristic reasoning, or a provider opinion.

**Architectural line (preserves Director Intelligence V1):** *Gap Analysis is diagnostic — it finds what's missing (facts). Judgment is advisory — it interprets those facts into opinions about what to do.* They are separate runtimes. Gap Analysis never advises; Judgment never re-derives gaps. Director (the deterministic conductor) attaches judgments to the conversation; the conversation assembler speaks them.

---

## 3. Recommendation model

A recommendation is a judgment of `kind:"recommendation"` with a stricter contract. **Director must never say "I recommend X" without options, a reason, evidence, and confidence.**

```jsonc
{
  "kind": "recommendation",
  "question": "There are 9 prior attempts on Access & Roles — start a 10th, or continue one?",
  "options": [
    { "id": "continue", "label": "Continue the completed V2 attempt", "rationale": "One attempt already reached acceptance; its package + decisions are reusable.",
      "pros": ["no duplicated work", "inherits prior decisions"], "cons": ["may carry stale assumptions"],
      "evidence": [{ "source": "mission_history", "ref": "msn_…", "detail": "outcome: completed" }] },
    { "id": "restart", "label": "Start fresh", "rationale": "…", "pros": ["clean slate"], "cons": ["risks redoing solved work"], "evidence": [] }
  ],
  "recommended_option_id": "continue",
  "confidence": { "level": "moderate", "score": 0.6, "why": "one clearly-completed attempt exists; the others are interrupted/failed" },
  "explanation": "9 attempts exist: 1 completed, the rest interrupted or failed. Continuing the completed one avoids re-solving what's already accepted.",
  "operator_override": { "state": "open", "chosen_option_id": null, "chosen_by": null, "chosen_at": null }
}
```

Mandatory fields (Phase 4): **inputs** (the signals considered), **evidence** (durable refs), **confidence**, **explanation** (the *why*), **alternative options** (≥1, each with its own rationale), **operator override**. A recommendation **never auto-applies** — the operator accepts / rejects / modifies, and their choice is recorded as a product decision with `provenance:"operator"` (reusing the existing decision store), which feeds the next recompile. Director recommends; the operator decides; the decision becomes durable memory.

---

## 4. Decision-support model

The catalogue of decisions Director should weigh in on, each mapped to the signal that triggers it and the recommendation it produces. All triggers are computable from data that already exists.

| Decision | Trigger signal (exists today) | Recommendation Director offers |
|---|---|---|
| **Continue vs. restart** | >1 mission for the capability, esp. `interrupted`/`failed` outcomes | Continue the completed/furthest attempt vs. start fresh (Access & Roles: 9 attempts) |
| **Split into multiple missions** | roadmap items ≥ N (e.g. Access & Roles has 3 V2 items) | "This is three deliverables — I'd split it so each ships independently." |
| **Reuse another capability** | `relationships` / high name-or-domain similarity | "Scheduling shares data with Locations — reuse its access model rather than rebuild." |
| **Delay implementation** | low confidence + missing decisions/references | "I *can* prepare this, but I'd gather X first — sending it now risks rework." |
| **Resolve a blocker first** | blocking gap findings (severity `block`) | "One decision is blocking everything else — let's settle it before I go further." |
| **Re-sequence** | dependencies between roadmap items or capabilities | "Do the audit-trail item last — it depends on the permission model landing first." |
| **Escalate to a new capability** | intent ↔ resolved-capability fit is weak | "This doesn't really fit Reporting — it may deserve its own capability." |

Each entry, when built, produces a §3 recommendation object. The decision-support model is therefore a **mapping from signals → recommendation templates**, not a new data source.

---

## 5. Product principles (how Director thinks)

1. **Director never guesses.** If the signal isn't there, it says so (`insufficient` confidence) rather than inventing certainty.
2. **Director always explains.** Every opinion carries its *why*. No naked verdicts.
3. **Director distinguishes facts from opinions.** Observations state; assessments judge; the two never merge in one sentence.
4. **Director explains uncertainty.** Confidence is spoken, sourced ("I'm working from one decision and no prior art"), and tied to what would raise it.
5. **Director recommends but never silently decides.** Every recommendation is an operator override point; the operator's choice becomes durable memory.
6. **Director always cites evidence.** Every opinion points at a durable source (gap finding, attempt history, capability data).
7. **Director admits low confidence.** "Ready" at 0.2 is spoken differently from "Ready" at 1.0 — honesty over reassurance.
8. **Director surfaces what it noticed, even unprompted.** Buried unknowns, suggested criteria, and prior attempts are raised, not hidden behind a green badge.
9. **Director stays in its lane.** It advises on *the work*, never on values it can't ground; it defers domain judgment it lacks evidence for to the operator.
10. **Director's confidence is derived, never performed.** The number comes from coverage, not from tone.

---

## 6. Conversation critique — where narration should become judgment

Walking the live conversations, every place Director *narrates status* that a director would turn into *judgment*:

- **"Everything I need is in place. Ready for your review."** — said identically at 0.2, 0.4, and 1.0 confidence. → Should become a **confidence-qualified assessment**: at 1.0 "I'm highly confident — strong prior art and decisions"; at 0.2 "It compiles, but I'm working from a single decision and no references — low confidence; I'd add X before sending."
- **"I looked over previous work on this — 1 past mission."** (Access & Roles) — a fact that undercounts (9 attempts exist) and offers no judgment. → **Observation + recommendation**: "There are 9 prior attempts — 1 completed, the rest interrupted or failed. I'd continue the completed one rather than open a tenth."
- **"I updated the package — needs product decisions → ready."** — narrates a state change. → **Assessment of sufficiency**: "That one decision was enough to make it compilable, but not enough to make it *good* — here's what's still thin."
- **Communications' open unknown** — never spoken. → **Unknown**: "One thing I'm unsure of: [the unknown]. It won't block you, but you may want to answer it before we ship."
- **Access & Roles' 4 suggested criteria** — buried in the gap report. → **Recommendation**: "I'd fold in four acceptance criteria from the roadmap and the open known-issue — want me to?"
- **Single-decision-to-Ready across Scheduling/Financials/Reporting** — no cross-cutting notice. → **Pattern**: "These three all reached Ready on one decision each — they're thin in the same way."

The rule: **wherever the conversation currently renders a status or a state transition, ask "what would a director conclude from this?" — and speak the conclusion, with its confidence and evidence.**

---

## 7. Before / after

**Scheduling (confidence 0.2)**
- *Before:* "Everything I need is in place. The package for Scheduling is ready for your review."
- *After:* "I've got enough to prepare a package for Scheduling — but I want to be honest: it's built from a single decision, with no prior art and no references, so my confidence is **low**. It's ready to look at, and I'd suggest we add a reference or two and one more decision before sending it to a worker. Want me to hold, or is thin acceptable here?"

**Access & Roles (9 attempts)**
- *Before:* "I looked over previous work on this — 1 past mission."
- *After:* "Heads up before we go further: there are **9 prior attempts** on Access & Roles — one reached acceptance, the rest were interrupted or failed. Rather than open a tenth, **I'd recommend continuing the completed V2** (its decisions and package are reusable) — the alternative is a clean restart, which risks redoing solved work. I'm moderately confident; the deciding factor is that exactly one attempt clearly finished."

**Communications (Ready, but 1 unknown)**
- *Before:* "Everything I need is in place. The package for Communications is ready for your review."
- *After:* "Communications is ready — I'm reasonably confident. One open question I couldn't resolve on my own: [the unknown]. It won't block execution, but it's worth your call before we ship."

**Onboarding (Ready, 0.4, thin)**
- *Before:* "Everything I need is in place."
- *After:* "Onboarding is ready to review. It rests on a single decision, so it's serviceable rather than thorough — if this matters, one more decision on [X] would firm it up. Your call."

Each "after" is derived entirely from signals that exist today (confidence score, attempt history, unknowns, coverage) — **no new intelligence, only interpretation.**

---

## 8. Implementation roadmap (Phase 7)

Maintain the Director Intelligence V1 separation: **Gap Analysis diagnoses; a new Judgment runtime advises; Director conducts; the conversation speaks.** A `judgment.mjs` runtime *consumes* the gap report + capability/mission history and *produces* judgment objects; Director attaches them to the conversation; the conversation assembler renders them as spoken lines with confidence + evidence. Judgment never re-derives gaps; Gap Analysis never advises.

**Tier 1 — Deterministic judgment (build first).** Rules over signals that already exist. Highest value, lowest risk, no provider.
- Confidence-qualified readiness (turn every "Ready" into a graded assessment).
- Attempt-history observation + continue-vs-restart recommendation (reads the *full* mission store, not just accepted history).
- Surface buried unknowns and suggested criteria as spoken judgments.
- Sufficiency assessment (thin vs. thorough) + `would_raise_confidence`.
- Blocking-gap questions (already partly present — formalize as judgments).
*This tier alone fixes the core defect the audit found.*

**Tier 2 — Reasoning-backed judgment.** Multi-signal heuristic reasoning, still deterministic, behind the existing `ReasoningProvider` seam from Director Intelligence V1.
- Cross-capability patterns ("looks like Scheduling") from `relationships` + similarity.
- Split / reuse / re-sequence / escalate recommendations from roadmap breadth + dependencies + intent-fit.
- Tradeoffs from roadmap scope.

**Tier 3 — Provider-backed judgment (future, gated).** Plugs into the same seam; only when provider-in-preparation is explicitly authorized.
- Domain-aware warnings ("I think we're underestimating billing").
- Nuanced rationales and natural phrasing.
- Novel-situation recommendations no rule anticipates.

**Sequencing & provenance.** Ship Tier 1 → Tier 2 → Tier 3. Every judgment carries its `tier`, so the operator always knows whether they're hearing a fact, a deterministic opinion, or a model's opinion. The `ReasoningProvider` seam means Tiers 2 and 3 deepen judgment **without changing the pipeline, the judgment schema, or the conversation surface**.

---

## Boundaries

Discovery only — **no implementation this sprint.** Nothing pushed, merged, or promoted. This document defines how Director should *think*; a later sprint teaches it to *speak* the judgments, Tier 1 first, on Kelly's approval.
