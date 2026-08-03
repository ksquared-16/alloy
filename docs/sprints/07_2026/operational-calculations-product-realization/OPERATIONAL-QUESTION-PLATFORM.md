# Operational Question Platform

**Status:** Platform design (no implementation · no commits)  
**Date:** 2026-07-28  
**Foundation (accepted):** [`UNIFIED-OPERATIONAL-INTELLIGENCE-PLATFORM.md`](./UNIFIED-OPERATIONAL-INTELLIGENCE-PLATFORM.md)  
**Also accepted:** Organization Calculations · Measurement architecture · Measurements-first product realization  

**Non-goals:** UI builds · BOS builds · Planning builds · invalidating exact-version binding or Future Room Capacity proving work.

---

## 0. The fundamental question

When a director interacts with Alloy, **what is actually durable?**

| Candidate | Durable? | As what? |
|-----------|----------|----------|
| **Question** | Yes — as *intent identity* | Catalogued operational intent the org can ask forever (“Future room capacity?”) |
| **Answer Strategy** | Yes — as *routing* | Which subsystem is allowed to produce the answer (Measure / Plan / Workspace / Recommend) |
| **Measurement** | Yes — as *accountability instance* | Named org watch: goal, health, history, source lock — **only when strategy = Measure** |
| **Calculation** | Yes — as *governed math* | Reusable exact-version source behind some measurements — never the operator’s primary noun |
| **Observation / Answer** | Ephemeral-to-retained | Points in time; history keeps them, but they are not the product center |
| **Recommendation** | Ephemeral (+ decision record) | Proposal grounded on an answer — not a parallel truth store |

### Verdict in one line

**Questions are the durable operator-facing abstraction.  
Answer Strategies are the durable dispatch layer.  
Measurements remain the durable *instance* object for the Measure strategy — they do not generalize to every operational capability.**

So Alloy should become **Question-centric at the product and platform index**, without demoting Measurements where they already earn their keep.

```text
Question                    ← durable intent (catalog + org adoption)
    ↓
Answer Strategy             ← Measure | Plan | Workspace | Recommend | …
    ↓
Answer                      ← strategy-specific payload (observation, cohort, schedule, proposal…)
    ↓
Action                      ← registered command / owned work surface
```

This is **stronger as the top abstraction** than:

```text
Measurement → Calculation → Observation
```

…because that stack only correctly describes **one family** of answers (accountable, goal-bearing, repeatedly observed quantities). Age-outs, transitions, waitlist offers, and “who should I move?” are real operational questions whose honest strategies are **not** Measurements.

The Measurement pipeline stays correct and accepted — as the **Measure** strategy’s internals:

```text
Question (Measure strategy)
  → Measurement instance
    → Calculation / metric source
      → Observation
        → Health / History
          → Action
```

---

## 1. Canonical ontology

### Core nouns

| Noun | Definition |
|------|------------|
| **Operational Question** | A named, catalogued intent: what the operator is trying to understand. Stable identity across UI, BOS, Workspace, Planning. |
| **Answer Strategy** | The platform-declared *kind* of work that produces a trustworthy answer for that question. Exactly one primary strategy per question. |
| **Answer** | The strategy’s output contract (value, list, schedule, proposal, …) plus mandatory grounding fields. |
| **Action** | Registered command or handoff into an owning surface after an answer. |
| **Measurement** | Org-scoped instance used **only** when Answer Strategy = **Measure**: name, source binding, goal, health, history. |
| **Organization Calculation** | Optional governed math behind Measure-strategy measurements. |
| **Consumer** | Surface that displays or acts on an Answer (OI, BOS, Workspace, Planning, Dashboard). |

### Object hierarchy

```text
Operational Question Platform
├── Question Catalog (product/config)
│     └── Operational Question
│           ├── answer_strategy (Measure | Plan | Workspace | Recommend | …)
│           ├── default_actions[]
│           └── strategy_binding (how to invoke the strategy)
├── Org adoption (optional)
│     └── QuestionSubscription / enabled question
│           └── when Measure → Measurement instance(s)
├── Answer runtime
│     └── Answer (typed by strategy)
└── Action runtime (existing)
      └── registered commands / surface handoffs
```

### What is *not* a Question

- A raw calculation template  
- A BOS prompt string  
- A dashboard widget  
- A queue filter  

Those may *express* or *consume* questions; they are not the identity.

---

## 2. Why Question → Strategy → Answer → Action wins as the top model

| Criterion | Measurement-first stack alone | Question → Strategy → Answer |
|-----------|-------------------------------|------------------------------|
| Covers Future Room Capacity | Excellent | Excellent (strategy = Measure) |
| Covers “Who should I move?” | Forces fake KPI or wrong home | Strategy = Recommend |
| Covers upcoming transitions | Awkward | Strategy = Workspace |
| Covers age-outs / staffing | Forces OI to own Planning | Strategy = Plan |
| Same answer in UI and BOS | Requires shared Measurement IDs for all cases | Shared **Question IDs**; strategy resolves the rest |
| Preserves accepted calc/measurement work | N/A | Measure strategy embeds it unchanged |
| Matches director language | Partial (“what we measure”) | Strong (“what I’m asking”) |

**Conclusion:** The platform abstraction *above* Measurements is **Operational Question + Answer Strategy**. Measurements stay primary **inside** the Measure strategy — defending the Unified OI charter’s Measurement emphasis for accountability questions, without forcing every capability into that mold.

---

## 3. Capability matrix (all identified questions)

For each: question · answer strategy · what creates the answer · who consumes · action that follows.

### 3.1 Future Room Capacity

| Field | Value |
|-------|-------|
| **Question** | How many seats will this room have on a future date? |
| **Answer Strategy** | **Measure** |
| **Creates answer** | Measurement observe → Organization Calculation (exact version) over platform capacity facts |
| **Consumes** | OI, BOS, Room Workspace, later Dashboard |
| **Action** | Adjust offers/holds/moves; fix missing facts; (advanced) change recipe/version |

### 3.2 Room Utilization

| Field | Value |
|-------|-------|
| **Question** | How full is this room versus what it can hold? |
| **Answer Strategy** | **Measure** |
| **Creates answer** | Measurement combining occupancy facts vs capacity (may reuse capacity measurement/calc) |
| **Consumes** | OI, Room Workspace, Dashboard |
| **Action** | Fill seats, pause enrollment, rebalance rooms |

### 3.3 Program Utilization

| Field | Value |
|-------|-------|
| **Question** | How is this program filling across rooms/sites? |
| **Answer Strategy** | **Measure** |
| **Creates answer** | Program-scoped measurement / rollup |
| **Consumes** | OI, Program Workspace, Dashboard |
| **Action** | Adjust offering, outreach, staffing by program |

### 3.4 Future Age-outs

| Field | Value |
|-------|-------|
| **Question** | Which children will age out of their current room/program in a window? |
| **Answer Strategy** | **Plan** (cohort forecast) |
| **Creates answer** | Planning cohort engine (not a single KPI chip) |
| **Consumes** | Planning primary; BOS/OI may deep-link; Workspace for execution |
| **Action** | Plan transitions, notify families, reserve next seats |

### 3.5 Upcoming Transitions

| Field | Value |
|-------|-------|
| **Question** | What moves are already planned or due? |
| **Answer Strategy** | **Workspace** (operational schedule truth) |
| **Creates answer** | Assignment/transition records as schedule projection |
| **Consumes** | Workspace primary; BOS for overdue attention |
| **Action** | Confirm, reschedule, complete transition |

### 3.6 Eligible Movement

| Field | Value |
|-------|-------|
| **Question** | Who *could* move now given rules and capacity? |
| **Answer Strategy** | **Recommend** (eligibility + constraints) |
| **Creates answer** | Assignment/eligibility resolver grounded on facts + capacity answers |
| **Consumes** | BOS / Assignment primary; Room Workspace |
| **Action** | Select children → initiate move via registered commands |

### 3.7 Ratio Risk

| Field | Value |
|-------|-------|
| **Question** | Where are we at risk of being out of ratio? |
| **Answer Strategy** | **Measure** |
| **Creates answer** | Measurement vs policy thresholds |
| **Consumes** | OI, BOS (when off goal), staffing Workspace |
| **Action** | Reassign staff, freeze enrollment, move children |

### 3.8 Staffing

| Field | Value |
|-------|-------|
| **Question** | How many teachers do we need for the plan we intend to run? |
| **Answer Strategy** | **Plan** (scenario / forecast) |
| **Creates answer** | Planning staffing scenario with visible assumptions |
| **Consumes** | Planning primary; Dashboard trends; BOS explanations |
| **Action** | Hire, schedule, change hours/capacity assumptions |

### 3.9 Enrollment Bottlenecks

| Field | Value |
|-------|-------|
| **Question** | Where are families getting stuck in enrollment? |
| **Answer Strategy** | **Measure** (+ Workspace drill-down) |
| **Creates answer** | Stage dwell/conversion measurements |
| **Consumes** | OI; pipeline Workspace for record-level work |
| **Action** | Fix process, staffing, packet friction in Workspace |

### 3.10 Waitlist Opportunities

| Field | Value |
|-------|-------|
| **Question** | Who should we offer a seat to next? |
| **Answer Strategy** | **Plan** (placement ranking) — *not* Measure |
| **Creates answer** | Placement priority / waitlist ranking |
| **Consumes** | Placement/Planning surfaces; BOS offer windows |
| **Action** | Prepare/make offers through Placement/BOS commands |

### 3.11 Transition Recommendations

| Field | Value |
|-------|-------|
| **Question** | Who should we move, and what should we do about it? |
| **Answer Strategy** | **Recommend** |
| **Creates answer** | Recommendation engine grounded on capacity answers, eligibility, age-outs, schedule |
| **Consumes** | BOS primary; Workspace for evidence |
| **Action** | Accept → registered assignment path; dismiss with reason |

### Strategy tally

| Strategy | Questions |
|----------|-----------|
| **Measure** | Future Room Capacity, Room Utilization, Program Utilization, Ratio Risk, Enrollment Bottlenecks |
| **Plan** | Future Age-outs, Staffing, Waitlist Opportunities |
| **Workspace** | Upcoming Transitions |
| **Recommend** | Eligible Movement, Transition Recommendations |

Measurements are the right durable instance for **5/11**. Questions are the right durable identity for **11/11**.

---

## 4. Answer strategies (platform contract)

Each strategy declares:

| Field | Purpose |
|-------|---------|
| `strategy_id` | `measure` \| `plan` \| `workspace` \| `recommend` \| (future: `compliance_scan`, …) |
| `answer_shape` | scalar · list · schedule · proposal · scenario |
| `truth_owner` | Which runtime may mint the answer |
| `grounds_on` | Facts / measurements / plans it may read (never invent) |
| `measurement_required` | boolean — true only for `measure` |
| `bos_allowed` | Always true for read; write/configure per Unified charter |

### Measure

- Creates/uses **Measurement** instances.  
- Internals = accepted Measurement → Calculation → Observation pipeline.  
- Goals/health/history live here.

### Plan

- Creates **Planning outputs** (cohorts, rankings, scenarios).  
- May *read* Measure answers (e.g. capacity) as inputs.  
- Does **not** create Measurements for the plan itself.

### Workspace

- Answers from **operational record truth** (what is already scheduled/assigned).  
- Not a forecast; not a KPI.

### Recommend

- Produces **proposals** with evidence citations (measurement ids, plan ids, record ids).  
- Executes only via registered actions after human confirm (BOS doctrine).

---

## 5. Question lifecycle

```text
Catalogued          product ships Operational Question + default strategy
    ↓
Discovered          director sees it in OI Question Browser or BOS ask
    ↓
Adopted             org enables / creates strategy binding
                      · Measure → create Measurement (+ source)
                      · Plan → open/create plan scenario
                      · Workspace → pin view / subscription
                      · Recommend → enable recommender policy
    ↓
Asked               UI observe / BOS clarify / Workspace open / Plan run
    ↓
Answered            Answer contract returned (same for all entry points)
    ↓
Acted               Action routing by catalog
    ↓
(Learned)           optional: history, dismissals, goal changes — strategy-specific
```

**Retired questions** remain in catalog as deprecated; org Measurements for Measure-strategy questions archive without deleting catalog identity.

---

## 6. Consumers

| Consumer | Relationship to Questions |
|----------|---------------------------|
| **Operational Intelligence** | **Question Browser** + Measure-strategy workshop (measurements, goals, history) |
| **BOS** | **Question interface** — resolve utterance → Question → Strategy → Answer → propose Action |
| **Workspace** | Consumes Answers (and sometimes asks Workspace-strategy questions in context) |
| **Planning** | **Owns Plan-strategy runtimes**; does not own the Question identity |
| **Dashboards** | Consume Measure (and sometimes Plan summary) Answers only |
| **Calculation library** | Invisible to Question Browser primary path; source behind Measure |

### Operational Intelligence: Question Browser vs Measurement Browser

**OI becomes a Question Browser first.**

- Home: “What do you want to know?” → catalog domains (already accepted product language).  
- Collection: adopted Questions, with Measure-strategy rows showing measurement health.  
- Detail: strategy-appropriate panel (for Measure: today’s measurement detail).

**Measurement Browser** remains as the **detail mode for Measure-strategy questions**, not the global IA noun.  
That preserves measurements-first *for capacity-like work* without lying that age-outs are “measurements.”

### Workspace: questions vs measurements

Workspace should consume **Answers** (and Question ids for deep links), not “subscribe to Measurements” as a universal pattern.

- Room capacity chip → Question `future_room_capacity` → Measure strategy → same observe API.  
- Upcoming transitions panel → Question `upcoming_transitions` → Workspace strategy → schedule truth.  

Workspace must not reimplement capacity math.

### Planning: strategies vs questions

**Planning owns Answer Strategies of kind Plan** (engines, scenarios, rankings).  
**The Question Platform owns the Question identity** (“Future age-outs”, “Waitlist opportunities”).

OI/BOS may deep-link into Planning when strategy = Plan; Planning does not invent a second catalog of director questions.

---

## 7. BOS as a Question interface

**Never** frame BOS as a measurement interface.

```text
User: "Who should I move?"
  → Resolve Operational Question (transition_recommendations / eligible_movement)
  → Answer Strategy = Recommend
  → Produce Answer (proposals + evidence)
  → Offer Execute via registered commands
```

```text
User: "How many seats in Sunflower next month?"
  → Question future_room_capacity
  → Strategy Measure
  → Clarify room/date if needed
  → Same Measurement observe as OI UI
  → Same Answer
```

Rules:

1. BOS resolves to a **Question id**, not a free-form LLM metric.  
2. No BOS-only intelligence objects.  
3. Recommendations cite grounding ids (measurement / plan / records).  
4. Configure Measure-strategy goals via the same Measurement APIs as UI (Unified charter).

---

## 8. Action routing (by strategy)

| After Answer… | Default owner |
|---------------|---------------|
| Measure off goal | OI Attention + BOS present Recommendation → Workspace/Placement/staffing actions |
| Plan cohort/list | Planning work → Workspace execution |
| Workspace schedule | Workspace complete/reschedule |
| Recommend proposal | BOS confirm → Assignment/Placement registered command |

Question catalog entries still declare `default_actions[]` (Unified §6); strategy constrains which owners are legal.

---

## 9. Relationship to Measurements (evolution, not replacement)

| Keep (accepted) | Change (conceptual) |
|-----------------|---------------------|
| Measurement persistence, observe, goal, health, history | Indexed under Question id |
| Exact-version calculation binding | Still Measure-strategy only |
| Measurements-first *wizard* for Future Room Capacity | Framed as adopting a Question with Measure strategy |
| Unified OI single platform for UI+BOS answers | Answers keyed by Question (+ strategy), not only Measurement |
| “No UI-only / BOS-only measurements” | Broaden to “No UI-only / BOS-only **questions**” |

**Defense of Measurements as primary *for Measure strategy*:**  
Directors still need a durable named watch with goals and history. Calling that object a Measurement remains correct. Calling *every* operational capability a Measurement was the overfit.

---

## 10. Relationship to accepted Unified OI charter

The Unified charter said Measurement is the primary *durable operational object*.  

This document **refines** that:

- Primary *cross-capability* durable object: **Operational Question**.  
- Primary *Measure-strategy* durable object: **Measurement** (unchanged).  
- Primary *interaction* for BOS: **Question**, not Measurement.  
- Primary *OI home*: **Question Browser** that happens to open Measurement detail for Measure strategies.

No contradiction with “UI and BOS share one platform” — the shared index becomes Questions; shared Measure answers still share Measurement ids.

---

## 11. Migration path from today’s architecture

### Phase A — Catalog only (docs/config)

1. Publish Question Catalog with `answer_strategy` for the eleven capabilities.  
2. Map existing Future Room Capacity measurement ↔ `question_id = future_room_capacity`.  
3. Map platform KPIs ↔ question ids (`source_kind: platform_metric`, strategy Measure).

### Phase B — Entry point framing (product language)

1. OI home already asks “What do you want to know?” — bind CTAs to Question ids.  
2. BOS intents resolve to Question ids before any tool call.  
3. Do not rename Measurement APIs yet.

### Phase C — Strategy routers

1. Introduce a thin **Question resolve** API: `{ question_id, params } → Answer` that dispatches to Measure observe / Plan / Workspace / Recommend.  
2. OI UI Measure flows keep calling Measurement APIs internally.  
3. BOS and Workspace call Question resolve only.

### Phase D — Non-measure adoption UX

1. Selecting Age-outs / Waitlist in OI Question Browser **hands off** to Planning (no fake measurement).  
2. Selecting Upcoming Transitions hands off to Workspace.  
3. Selecting Transition Recommendations opens BOS/recommend flow with shared Question id.

### Non-negotiable during migration

- Exact-version binding stays.  
- No second capacity number in BOS.  
- No autonomous side effects.  
- Accepted Future Room Capacity proving slice remains valid Measure-strategy proof.

---

## 12. Answer contract (strategy-agnostic envelope)

Every Answer (any strategy) returns:

| Field | Required |
|-------|----------|
| `question_id` | Yes |
| `answer_strategy` | Yes |
| `subject` / scope | Yes |
| `effective_at` / window | Yes (as applicable) |
| `payload` (typed) | Yes |
| `availability` / status | Yes |
| `explanation[]` | Yes (≥1 plain line) |
| `grounding_refs[]` | Yes (measurement_id, plan_run_id, record ids, …) |
| `recommended_actions[]` | When attention-worthy |
| `confidence` | Optional now; required for Plan forecasts later |

Measure-strategy payloads additionally carry observation value, health, goal, version label — as today.

---

## 13. Final conclusions

### Is Alloy a Question-centric platform?

**Yes — at the index and interaction layer.**  
Questions are what directors mean; they are what BOS should resolve; they are what OI should browse; they are what Workspace/Planning should cite.

### Do Measurements remain correct as primary objects?

**Yes — as the durable instance for Answer Strategy = Measure.**  
Defended: goals, health, history, exact-version sources, and Future Room Capacity proving work all require Measurement. That does not make Measurement the universal parent of age-outs or “who should I move?”

### Is Question → Answer Strategy → Answer → Action stronger than Measurement → Calculation → Observation?

**Yes as the top platform spine.**  
The Measurement → Calculation → Observation chain remains the **correct internals** of the Measure strategy and must not be redesigned.

### How existing architecture evolves without invalidation

Add Question identity + strategy dispatch **above** the accepted stack.  
Measure-strategy questions bind 1:1 (or 1:N) to Measurements.  
Plan / Workspace / Recommend strategies never fake Measurements.  
UI and BOS stay one platform because they share Question ids and Answer envelopes — and still share Measurement ids whenever the strategy is Measure.

---

## 14. Deliverable checklist

| Deliverable | Section |
|-------------|---------|
| Canonical ontology | §1 |
| Object hierarchy | §1 |
| Question lifecycle | §5 |
| Answer strategies | §4, §3 |
| Consumers | §6 |
| Action routing | §8 |
| Relationship to Measurements | §9 |
| Relationship to BOS | §7 |
| Relationship to Planning | §6, §4 |
| Migration path | §11 |
| Defense / evolution | §2, §13 |

---

## Success criterion

A director can ask the same operational question in Operational Intelligence or BOS and receive an Answer that shares the same `question_id`, strategy, and grounding — whether that answer is a Measurement observation, a Planning cohort, a Workspace schedule, or a Recommendation proposal.

If the product forces every question into a Measurement, the architecture is wrong.  
If BOS invents answers without a Question and strategy, the architecture is wrong.

**Stop. No implementation. No commits.**
