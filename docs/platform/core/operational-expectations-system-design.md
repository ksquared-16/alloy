---
owner: platform
status: frozen
last_reviewed: 2026-07-13
supersedes: []
---

# Operational Expectations — System Design (Realization Blueprint)

**Status:** Canonical system design (Realization Phase), 2026-07-13. Architecture is **frozen**; this
document translates the frozen architecture into an implementable system — it does **not** reopen
ontology, re-argue semantics, or redesign the capability. It is the engineering blueprint: Cursor
should implement each package **without making an architectural decision**. Where the freeze left an
implementation question open, this document resolves it at the **system-design** level (§A) — the
only place new decisions are made.

> **Companion docs.** Twin ledger: [`core/operational-truth-flow-doctrine.md`](./operational-truth-flow-doctrine.md)
> (ratified five-layer axis + four laws — see **§0.5, this doc supersedes its "Expectations are
> derived" reading**). Observed ledger: `operational-facts-platform` design.
> Consumer #1 (parity proof): [`modules/operational-consumption-platform.md`](../modules/operational-consumption-platform.md).
> Structural sibling for a canonical ledger doc: [`modules/financial-platform-domain.md`](../modules/financial-platform-domain.md).
> Initiative record: [doctrine convergence certification](../milestones/operational-expectations-doctrine-convergence.md) · [architecture closeout](../milestones/operational-expectations-architecture-closeout.md) · [engineering realization plan](../milestones/operational-expectations-engineering-realization.md).

---

## 0. Frozen Inputs (restated, not reopened)

Compact, verbatim-intent restatement so the blueprint is self-contained. **Do not modify; these are
the constraints every package is measured against.**

- **Two canonical ledgers, neither derives from the other** (that non-derivability is *why both are
  capabilities*):
  - **Operational Facts** — *observed* truth, "what IS." Facts **witness** reality. **Corrected**
    (the past didn't change; our record did). Clock-facts included — *time is an observation*, so
    deadlines need no timer.
  - **Operational Expectations** — *authored* truth, "what SHOULD / WILL be." Expectations
    **assert** reality. **Revised** (the future legitimately changed). Same substrate
    (identity / lineage / replay / bitemporal), **opposite semantics**.
- **An Expectation IS the tuple** `⟨ Authority · Modality · Subject(s) · Condition · Temporal Frame · [Beneficiary] ⟩`.
- **Modality is a closed set of five:** `required · prohibited · intended · committed · predicted`.
  Permission / authorization is deliberately **excluded** (not truth-apt against reality). Schedules,
  reservations, requirements, constraints, goals, promises, forecasts, and policies are all **this
  one tuple** at different facet values. A **policy is a universal-subject-scope generator** of it.
- **Measurable is BELOW the semantic line.** An Expectation asserts a Condition on *reality*, never a
  reference to a measurable. The measurable is **evidentiary configuration** — how Facts witness the
  Condition. The Condition is identical regardless of sensing method.
- **Judgment is DERIVED and modality-relative:**
  `required → satisfied / violated` · `committed → honored / breached (+ wronged beneficiary)` ·
  `prohibited → respected / breached` · `intended → achieved / unachieved (soft)` ·
  `predicted → confirmed / disconfirmed`. Only deontic/commissive can be **violated**. Plus
  **at-risk** (predicted-to-miss).
- **Six Platform Laws:**
  1. **Purity** — an Expectation carries no response (else it becomes a workflow engine).
  2. **Acyclic** — state changes only by authoring a Fact; intent only by authoring an Expectation;
     a gap is only ever **read**; effectors close gaps by producing new Facts/Expectations.
  3. **Authored-vs-Derived** — assertion acts are permanent; judgments are derived and never
     authored; **there is no "mark fulfilled" verb** (you fulfill by authoring a Fact).
  4. Facts **witness** / Expectations **assert** / Judgment **compares**.
  5. **Non-derivability** of the two ledgers.
  6. **Standing is meaning** — AI/external proposals do not bind until **ratified**.
- **Revision ≠ Correction.** Revision: prior was valid-then → **re-plan** forward. Correction: prior
  was never valid → **unwind**.
- **Everything downstream is DERIVED, not a capability:** Gap · Judgment · Projection · Preview ·
  Current Work · Scheduling · Forecasting · Billing · Communications · Recommendations · Measurables.

---

## 0.5 Doctrine Reconciliation (RATIFIED 2026-07-13 — a terminology law, not an ontology question)

The currently-ratified [`core/operational-truth-flow-doctrine.md`](./operational-truth-flow-doctrine.md)
states, as bolded **Law 2**: *Expectations used to be described as derived / non-authoritative
("MUST NOT become authoritative tables that can silently disagree with Intent or Facts").* The Phase B freeze makes
Operational Expectations an **authored** ledger — the semantic inverse. Ratified resolution: **the
freeze wins; the doctrine text is brought into line.** This is a **P0-blocking sweep**, gated by
**G-Reconciliation**. **"Expectation" is not permitted to carry two meanings** — that ambiguity is
exactly what six architecture iterations eliminated.

1. **Re-point the word "Expectation."** The former L3 role — *derived projections of Intent* (Expected
   Attendance/Occupancy/Staffing/Ratios/Tuition/Revenue) — is **renamed "Projection"** (or *Derived
   Projection* where clarity helps). "Expectation" now **always** refers to the authored ledger.
2. **Rewrite Law 2** to read: *Projections are derived / non-authoritative read models (never a system
   of record); **Expectations are authored** — a second canonical ledger twinned with Facts, neither
   derivable from the other.*
3. **Sweep every occurrence.** Any doctrine/RFC/module text using "Expectation" to name derived state
   is renamed "Projection." No P1 code ships before the sweep lands, or the ledger reads as a Law-2
   violation to every reviewer.

### Canonical terminology (locked — do not re-coin)

- **Operational Facts** — authored ledger · **observed** operational truth · "what IS."
- **Operational Expectations** — authored ledger · **intended** operational truth · "what SHOULD / WILL be."
- **Judgment** — derived comparison between Facts and Expectations.
- **Gap** — derived operational difference.
- **Projection** — derived operational state / read model.
- **Current Work** — surface over unresolved gaps.
- **Scheduling** — projection over **committed** temporal expectations.
- **Forecasting** — projection over **predicted** expectations.
- **Billing** — financial **projection** plus financial **effector**.

### Canonical ontology flow

```
Operational Facts            (authored ledger — observed)
        │
Operational Expectations     (authored ledger — intended)
        │
Judgment                     (derived comparison)
        │
Gap                          (derived difference)
        │
Projection                   (derived state / read model — incl. Scheduling, Forecasting)
        │
Current Work · Communications · Business Processes · Billing · AI   (surfaces / effectors)
```

Both **ledgers are authored** (append-only, actor-attributed); the split between them is
**observed vs intended**, not authored vs derived. Everything below the second line is **derived**.

---

## A. Resolved Open Implementation Questions (system-design decisions)

The freeze deferred three questions to this layer. These resolutions choose **mechanism, not
meaning**.

### A1 — Condition / predicate expression + measurable-witnessing mechanism

- A **Condition** is a **predicate over a Subject's witnessed state at a Temporal Frame**, authored
  against an **Expectation Type** that fixes the predicate shape (a ratio-Type fixes
  `ratio(subject) ⊵ N`). The author supplies parameters, never free-form logic — this keeps
  Conditions **on reality** and authoring surfaces finite.
- The **measurable binding** lives in **Configuration**, one level below the Condition: it declares
  *which fact-type(s) evidence this Condition and how they compose into the witnessed value.* Two
  bindings for the same Condition (badge-swipe vs manual roster for "staff present") yield the
  **same judgment** — that identity is the semantic-line guarantee and a certification gate
  (G-Semantic-Line).
- **Rule:** the predicate comes from the Type's shape; the sensing method from the binding; an
  Expectation never names a sensor.

### A2 — THE single gap→response binding location (top duplication risk)

- There is **exactly one** binding mechanism from a derived gap to an effector, and it **is the
  existing Business-Process trigger model, generalized** — not a new parallel system.
- A **Binding** = `⟨ gap-shape selector (modality · type · subject-scope · verdict) → effector
  reference ⟩`, where an effector reference is a Comms template, a Business-Process trigger, or a
  Current-Work routing — all already first-class. Expectations **publishes** gaps and transitions; it
  **never** invokes an effector.
- **Rule (hard):** a second "when-gap-then-do" evaluator is an architecture violation.
  **G-Unified-Binding** proves there is one.

### A3 — Evaluation dependency / trigger model (cost of standing evaluation)

- Each Expectation declares, through `⟨Subject · Condition-binding · Temporal Frame⟩`, a **dependency
  footprint**: the fact-types, over the subject set, within the window, that can change its verdict.
  Processing maintains a **footprint index**.
- Evaluation is **incremental and event-driven**, never a standing full scan. A verdict recomputes
  only when (a) a Fact lands inside a footprint, (b) the clock (a Fact) crosses a Temporal-Frame
  boundary, or (c) the Expectation is authored/revised/corrected.
- **Rule:** standing evaluation is a **derived read materialized on demand**, priced by footprint
  deltas — not a background sweep. Replay uses the same pure function over historical projections.

---

## 1. Capability Responsibilities

### Operational Expectations OWNS

1. **The authored Expectation ledger** — the extensional, append-only, bitemporal, lineage-tracked
   set of expectation **assertions**.
2. **Authoring intake** — the five acts (`create · revise · correct · replace · cancel`) and their
   validation: tuple well-formedness, **modality closure**, the **semantic line**, Temporal-Frame
   presence, Authority→Standing resolution.
3. **The tuple grammar / typing** — that every row *is* a well-formed
   `⟨Authority·Modality·Subject·Condition·TemporalFrame·[Beneficiary]⟩`.
4. **The generalized, modality-relative evaluation engine** — the pure comparison that **derives**
   Judgment and Gap from `(Expectation, relevant Facts, clock)`. "Judgment compares" (Law 4) lives
   here; outputs are derived reads, never authored.
5. **The typed lineage of transitions** — create/revise/correct/replace/cancel, and the
   **Revision ≠ Correction** distinction consumers branch on.
6. **The semantics of Expectation-domain configuration** — what a Type/Template/Policy/Recurrence/
   Binding *means* (storage/authoring UI belong to Configuration; §2).

### Operational Expectations does NOT own

- **Reality / state** → Operational Facts. No expectation ever changes state.
- **Responses / effectors** → Purity. It emits gaps; it never selects, invokes, or executes a
  response.
- **Clock, recurrence expansion, evaluation scheduling, replay, propagation mechanics** →
  Processing. Expectations declares *what/whether*; Processing decides *when/how-often/how-much*.
- **Money / charges** → Billing / Consumption.
- **Worklists / queues / assignment** → Current Work.
- **Messages** → Communications.
- **Measurables as truth** → the sensor is not the Condition; the Fact witnesses; the measurable is
  evidentiary Config below the line.
- **Storage/versioning of config objects and generic surfaces** → Configuration and Surface Builder.

---

## 2. Capability Boundaries (ownership-transfer points)

| Seam | Interface object | Direction / rule |
|---|---|---|
| **Facts → Expectations** | Operational Fact Contract, correction-carrying (`entryType`, `correctsFactId`) | Expectations **reads** facts to derive judgment; **never writes** a fact. Fulfillment happens because a Fact *appears*, not because Expectations acts. |
| **Expectations → Current Work** | Derived **Gap** (read-only) | Expectations produces gaps; Current Work **selects** the subset meeting its threshold (decision-bearing + material + governed-by-rule + actionable + accountable owner). |
| **Expectations ↔ Business Processes** | Gap (read), Authoring intake (write), Binding (process-as-effector) | A process is a **consumer**, an **author**, and **may be bound** as a gap-response. A standing invariant is **not** a process (no program counter). |
| **Actions → Expectations** | Authoring verbs | Actions author **intent** (create/revise/correct/replace/cancel). **Fulfillment is not an action** — you fulfill by authoring a Fact. |
| **Expectations → Communications** | Gap stream + typed **transition** stream | Comms is an **effector**; on revision/correction/cancel it **un-says** stale messages via lineage. Expectations does not know Comms exists (Purity). |
| **Expectations → Billing** | Judgment on committed/required financial-subject expectations (**D12a**) | Billing/Consumption is the **financial-modality consumer**: judgment → consumption event → obligation → draft charge. Correction-aware. The **parity proof**. |
| **Expectations ↔ Processing** | Dependency footprint (declared) ↔ evaluation/replay/propagation (executed) | Expectations declares the footprint; Processing schedules and runs. Processing **never chooses a response**. |
| **Configuration → Expectations** | Types/Templates/Policies/Recurrence/Bindings (**intensional**) | Config supplies intensional generators and constraints; the ledger is **extensional**. |
| **Records ↔ both ledgers** | Composed read view | Records own **neither** ledger. An entity record is a **view** over facts + expectations + derived gap/judgment. |

---

## 3. Runtime Architecture (conceptual)

A **comparison engine over two append-only ledgers, with a purely derived layer on top.**

1. **Authoring Intake** — admits authoring acts; assigns identity, lineage, bitemporal stamps
   (valid-time = the frame asserted; transaction-time = when authored); enforces grammar, modality
   closure, semantic line, Authority→Standing; emits **immutable assertion acts**.
2. **Expectation Store (extensional)** — the authored ledger; revise/correct/replace/cancel
   **supersede** prior rows, never mutate them.
3. **Generators (intensional → extensional)** — Policies (universal-subject-scope) and Recurrence
   (temporal). **Virtual by default** (below).
4. **Evaluation Engine** — a **pure function** `(Expectation, relevant Facts, clock) → Judgment + Gap`;
   modality-relative, side-effect-free.
5. **Derived Read Layer** — Gap · Judgment · Projection · Preview, exposed query-time or
   materialized-on-demand; never authoritative; always reproducible by replay.
6. **Effector Boundary (outside the capability)** — gaps and transitions are **published**; bound
   effectors act through the **single Binding** (A2). The capability invokes nothing.

**Runtime stance:** read-derivable end-to-end. The only authoritative writes it performs are
**authoring acts on its own ledger**; every gap, verdict, projection, preview is a pure function of
the two ledgers + clock and can be discarded and rebuilt.

**Virtual vs materialized (system-design call).** Policy/Recurrence instances are **virtual**,
evaluated on demand from `(definition · subject population · clock)`. An instance **condenses** into
an extensional row only when (i) an authored transition **diverges** from the generated instance (a
specific occurrence is revised/cancelled — the exception needs a real row for its lineage), or (ii) a
consumer needs a **durable identity** (a committed expectation a Fact must fulfill by reference).
Keeps the ledger bounded while honoring exceptions; faithful to "config intensional, ledger
extensional."

---

## 4. Evaluation Architecture (judgment · replay · revision · correction)

### 4.1 Judgment flow
- **Trigger** (A3): a Fact in a footprint, a clock-fact crossing a Temporal Frame (no timer), or an
  authoring act.
- **Compute:** the pure engine yields a **modality-relative verdict** plus **at-risk** for
  predicted-to-miss.
- **Gap:** a negative/at-risk verdict **derives** a Gap — the reified difference between asserted and
  witnessed. **Read-only** (Acyclic): effectors close it by producing new Facts/Expectations.

### 4.2 Replay
Both ledgers append-only + bitemporal and evaluation pure ⇒ **judgment at any point is reproducible**.
Two axes: **as-of-now over past valid-time** ("what we *now* believe was true then" — absorbs
corrections) and **as-known-at-T** ("what we believed *at the time*" — audit). Corrections move the
first axis; the historical record never changes.

### 4.3 Revision propagation (future legitimately changed → re-plan)
Revision supersedes a prior expectation; the prior stays valid **until** the revision's valid-from;
judgment recomputes **forward**. Consumers receive a lineage-linked supersession typed `revision`:
Comms un-says/re-says; Current Work re-selects; Billing supersedes obligations whose resolution key
no longer derives and **voids DRAFT (never posted) charges** — the mechanics already proven in
Consumption V1 (D12a).

### 4.4 Correction propagation (prior never valid → unwind)
Correction marks the prior **never-valid** and replays corrected history; dependent derived state is
**reconciled/unwound** (obligations superseded, DRAFT charges voided, messages retracted, work
withdrawn). The typing is **load-bearing** — it selects re-plan vs unwind. (The adversarially-verified
over-bill/orphan risk from the D12 review; gate G-Correction.)

### 4.5 The propagation contract
Expectations **publishes typed transition events on lineage** (`revision | correction | cancellation |
replacement`); it does **not** tell consumers what to do (Purity). Each consumer applies its own
**reconciliation identity** — Consumption's is `(governing_rule, subject, condition_key)`; Current
Work's is the gap identity; Comms' is the message→expectation link.

---

## 5. Expectation Authoring

**Five author classes, one intake grammar.** They differ only in the **Authority** facet and the
**Standing** it resolves to. Verbs are `create · revise · correct · replace · cancel` — never
fulfill/complete/mark-done.

| Author | What it asserts | Standing |
|---|---|---|
| **Human** | An operator's intent via an Action ("Room 2 must be 1:3 tomorrow"). | Binding if the operator holds the Authority; self-ratifying within authority. |
| **Policy** | An intensional generator across a population (universal-subject-scope). | Ratified at policy-authoring time; instances inherit. |
| **Business Process** | A process step asserting an expectation (enrollment authors a **committed** expectation to a family). | Ratified by the process definition's configured authority. |
| **AI** | **Only proposed** expectations. Recommendations = proposed `required`/`intended`; forecasts = `predicted`. | **Proposed** — binds only when **ratified** (Law 6). *Exception:* a `predicted` expectation imposes no obligation, so it may stand at **model standing** unratified; promotion to a deontic/commissive modality requires ratification. |
| **External System** | Intent from an external authority (licensing ratio = `required`; a parent booking = `committed`/`intended`). | Standing = the source's mapped trust level; low-trust lands **proposed** pending ratification. |

**Ratification** is itself an authoring act by an authority, lineage-linked; **AI never
self-ratifies** (§12). **Preview** (§7) shows derived consequences *before* ratification.

---

## 6. Expectation Consumption

All consumers **read**; none write the ledger except through authoring intake; none mutates a gap. A
consumer either **authors new expectations** (closing the loop through the ledger) or **acts as an
effector** (through the single Binding).

| Consumer | Reads | Acts by |
|---|---|---|
| **Current Work** | Gaps + judgment | Selecting gaps past its threshold; reconcile/supersede/resolve/recurs/replay identity. |
| **Billing** (D12a) | Judgment on committed/required financial-subject expectations | A **financial Projection plus financial effector**: consumption events → obligations → draft charges; correction-aware. **Parity proof.** |
| **Communications** | Gaps + typed transitions | Effecting messages; **un-saying** stale ones on transition. |
| **Forecasting** | `predicted` expectations + facts | A **Projection over predicted expectations**; forecast accuracy is derived when facts confirm/disconfirm. Predicted expectations are **authored** via the AI/model path (§5) — the projection does not author. |
| **Scheduling** | `committed` temporal expectations | A **Projection over committed temporal expectations** (the board/read model). The scheduling *act* authors committed expectations via intake (§5); the schedule *surface* is derived, not a separate truth. |
| **Capacity** | Occupancy facts vs prohibited/required caps | A **Projection** deriving at-risk/breach. A cap is `prohibited(exceed N)` / `required(≤ N)`. |
| **Staffing** | Required-ratio expectations vs staff-presence facts | A **Projection** deriving understaffing gaps → feed Current Work / Comms / Scheduling. |
| **Recommendations** | Judgment + gaps + history | **Authoring** proposed `required`/`intended` expectations (§5), gated to ratification. |

---

## 7. Surface Architecture

Five surfaces, **all read models**, composed via the existing **Surface Builder**.

- **Timeline** — subject-indexed interleave of facts + expectations + transitions for one subject:
  "what we expected, what happened, what we now expect." *(Requires the subject-indexed read model;
  `workflow_events` jsonb subject is not indexable.)*
- **Grid** — matrix `subjects × temporal frames × modality`, verdict/gap at a glance (rooms ×
  time-slots × ratio-status). The scheduling/capacity board.
- **Gap View** — the derived worklist of open gaps; the **raw feed Current Work selects from**.
  Read-only.
- **History** — bitemporal browser: an expectation's lineage and as-of / as-known-at replay; shows
  **Revision vs Correction** distinctly.
- **Preview** — the "if authored, then" projection of a **proposed** act **before** ratification. Pure
  evaluation over a hypothetical ledger; **no writes**. Essential for AI proposals and human what-ifs.

---

## 8. Configuration Architecture (the intensional layer)

Config stores/versions the **intensional** definitions (effective-dated, **supersede-not-patch**); the
ledger holds the **extensional** assertions. Replay reads config **version-at-authoring**.

- **Types** — named tuple-shapes constraining facets (*Staffing Ratio Requirement* fixes
  `modality=required`, `subject=room`, `condition-shape=ratio ≥ N`, `frame=operating-hours`). Enforce
  the semantic line; give authoring a finite vocabulary.
- **Templates** — pre-filled Types with defaults, for fast human/process authoring.
- **Policies** — universal-subject-scope generators: `Type + subject-selection predicate + params`.
- **Recurrence definitions** — temporal generators: `Type + recurrence rule` → a framed stream.
- **Bindings** — two kinds: **measurable bindings** (A1: `Condition → evidencing fact-type(s) +
  composition`) and **gap→effector bindings** (A2: `gap-shape selector → effector reference`,
  **unified with the Business-Process trigger model** — exactly one such mechanism).

---

## 9. Processing Architecture

Processing owns **mechanics, never responses.**

- **Clock** — advances time; emits **clock-facts** (time is an observation). A deadline crossing is a
  clock-fact crossing a Temporal Frame → re-evaluation. **No separate timer subsystem.**
- **Recurrence** — expands definitions into the **virtual** stream over the horizon; **condenses** to
  rows on exception/consumer-need (§3).
- **Evaluation** — schedules/runs the pure engine when a **footprint** is touched (A3); owns the index
  and the **incremental** cost model — never a standing full sweep.
- **Replay** — re-runs evaluation over historical projections; **deterministic** because evaluation is
  pure.
- **Propagation** — on authored transitions, walks lineage and emits **typed** transition events;
  owns the fan-out, **not** the consumer's reaction.

Processing is *when/how-often/how-much*; Expectations is *what/whether*; consumers are *so-what*.

---

## 10. Operational Truth Lifecycle (end-to-end)

One canonical thread exercising **every seam and all six laws**:

1. **Config.** Policy — *"every infant room requires 1:4 staff:child during operating hours"* —
   authored (intensional, ratified).
2. **Generation.** Recurrence generates a **virtual** `required` expectation per infant room per
   operating-day. Not materialized.
3. **Authored exception.** A director **revises** tomorrow's Room 2 expectation to 1:3 → the instance
   **condenses** into a ledger row with lineage to the Policy.
4. **Facts arrive.** Attendance facts + **staff-presence facts** (the known staffing-fact gap — these
   must exist).
5. **Evaluation.** Engine compares `required(ratio)` vs witnessed ratio each clock tick →
   `satisfied`/`violated`; trending to a miss → `at-risk`.
6. **Gap.** Room 2 at 09:05 is 1:5 → `required` **violated** → a Gap is **derived** (read-only).
7. **Effector boundary.** The single Binding routes the gap-shape to (a) Current Work (staffing gap,
   owned by the room lead), (b) Comms (alert), (c) optionally a Scheduling process that **authors a
   committed expectation** (call in a floater). Each acts through its own boundary; **Expectations
   invokes none of them.**
8. **Response as new truth.** A floater arrives → new **staff-presence Fact** → re-evaluation → 1:4 →
   `satisfied` → the gap **closes because a Fact appeared** (Acyclic — nothing was "marked").
9. **Consumption.** A `committed` licensing report → reporting/Comms consumes; overtime → Billing
   consumes judgment (financial modality).
10. **Correction vs Revision.** If the 09:05 staff-presence fact was mis-recorded, a **Fact
    correction** replays → the gap **never validly existed** → the alert/work item **unwinds**
    (un-say). Contrast the step-3 ratio change — a **revision** — which re-plans forward without
    unwinding the valid past.

---

## 11. Observability (platform health, not domain data)

Surfaced through Grid/GapView plus a capability-health board:

- **Evaluation lag / judgment freshness** — keeping up with fact arrival (staleness SLO; the A3 cost
  metric).
- **Gap aging / backlog** — open gaps by age × modality × owner. The core health number.
- **Authoring integrity** — malformed/rejected acts; **ratification backlog** (proposed-but-unratified
  AI/external expectations aging).
- **Propagation completeness** — did every transition reach every consumer? **Orphaned draft charges /
  stale messages = propagation failure.**
- **Replay determinism** — does replay reproduce recorded judgment? Divergence = a **purity
  violation**.
- **Coverage / blind spots** — Conditions with **no** measurable binding (unjudgeable); Facts with
  **no** governing expectation (unwitnessed intent).
- **At-risk radar** — forward-looking board of predicted-to-miss.

---

## 12. Security — Standing · Authority · Ratification

- **Authority is a tuple facet.** Authoring is gated: an author may assert only expectations whose
  Authority they hold (a room lead cannot author a licensing requirement).
- **Standing is meaning (Law 6).** Binding force derives from the author's standing — `proposed`
  (AI, low-trust external) vs `binding` (authorized human/policy/process). Standing is **semantic**,
  not a workflow status.
- **Ratification** is an authoring act by an authority, lineage-linked, promoting proposed → binding.
  **AI never self-ratifies.** Deontic/commissive proposals **require** ratification; `predicted`
  (non-binding) may stand at model standing.
- **Revision/correction authority ≥ original author's authority.**
- **The ledger is the audit log** — every act attributable (actor · authority · standing ·
  transaction-time).
- **Effector authority** — a Binding that authors expectations runs at the **binding's** configured
  authority, not the triggering fact's.

---

## 13. Extension Model (how future verticals compose)

A modality-agnostic tuple + modality-relative judgment ⇒ a new vertical adds **no new capability**,
only: (1) **Expectation Types**, (2) **measurable bindings**, (3) **a consumer** (its interpretation
of judgment — as **D12a/Billing** is for finance), (4) **gap→effector bindings** (through the one
unified binding). **Zero engine change** — the same shape as the proven process-engine-agnostic
pattern (new process = sibling definition folder, zero engine edits). **The closed modality set is the
guarantee:** an apparent need for a sixth modality is an **architecture escalation**, not an
extension.

---

## 14. Implementation Packages (system initiatives, not tasks)

| Pkg | Name | Scope | Proof / gate |
|---|---|---|---|
| **P0** | **Doctrine Reconciliation & Substrate Alignment** | Land the §0.5 reconciliation sweep (rename derived-L3 → Projection; amend Law 2). Confirm/extend the bitemporal/lineage/replay substrate to carry the Expectation ledger (twin of Facts); Fact Contract as the read seam. | **G-Reconciliation**; substrate hosts both ledgers; correction-carrying contract present. |
| **P1** | **Expectation Ledger & Authoring Intake** | Extensional store + five verbs + tuple grammar + modality closure + semantic-line enforcement + lineage with **Revision≠Correction**. **Security/Standing lands here.** | Grammar rejects malformed/6th-modality; corrections unwind vs revisions re-plan. |
| **P2** | **Configuration (intensional layer)** | Types/Templates/Policies/Recurrence + **both** Bindings, versioned; the **unified gap→effector binding** (resolves A2). | One binding mechanism; measurable-binding independence. |
| **P3** | **Generalized Evaluation Engine + Billing Parity Retrofit** *(keystone)* | Pure modality-relative comparison → Judgment/Gap; retrofit **D12a Billing as consumer #1**. | **G-Parity** — reproduces shipped Consumption outcomes exactly. |
| **P4** | **Processing** | Clock/recurrence/evaluation-scheduling/replay/propagation + **footprint index** and incremental cost model (resolves A3) + typed transition fan-out. | Incremental (no full sweep); replay deterministic. |
| **P5** | **Derived Surfaces** | Timeline/Grid/GapView/History/Preview via Surface Builder + the **subject-indexed timeline read model**. | Preview writes nothing; History shows revision vs correction. |
| **P6** | **Current Work Integration** | GapView→Current Work selection (threshold + reconciliation identity); un-say/withdraw on transitions. | Withdrawn work on correction; no orphaned items. |
| **P7** | **Effector Bindings** | Gaps + transitions routed through the unified binding to **Comms** and **process-as-response**; un-say propagation. | Purity holds; propagation completeness. |
| **P8** | **AI Authoring Path** | Proposed-expectation authoring + **ratification gate** + Preview-before-ratify + Forecasting (`predicted`) + Recommendations. | AI cannot self-ratify; unratified deontic never binds. |

Cross-cutting: Security/Standing/Ratification (§12) underpins **P1** and **P8** and is not a separate
phase.

---

## 15. Implementation Dependencies (what before what)

```
                         Operational Facts (EXISTS) ───────────────┐
                                                                   │ (read seam)
   P0 Reconciliation+Substrate ─► P1 Ledger+Authoring ─► P2 Config │
                                        │        │           │     ▼
                                        │        └──────────►│  P3 Engine + Billing Parity ◄─ Consumption V1 (SHIPPED)
                                        │                    │     │  (keystone parity proof)
                                        │                    ▼     ▼
                                        └────────────► P4 Processing ◄┘
                                                            │
                                    ┌───────────────────────┼───────────────────┐
                                    ▼                        ▼                   ▼
                             P5 Surfaces             P7 Effectors        (transition fan-out)
                                    │                        │
                                    ▼                        │
                             P6 Current Work ◄───────────────┘
                                    │
                                    ▼
                             P8 AI Authoring  (needs P1 intake + P5 Preview + §12 ratification)
```

**Sequencing principles (load-bearing):**

- **Reconcile the doctrine (P0) before any P1 code** — else the ledger reads as a Law-2 violation.
- **Prove the engine on an existing consumer (Billing) before any net-new consumer.** P3 is a
  *retrofit* — the keystone that de-risks everything after it.
- **Wire the correction-aware contract (D12a) as a blocking prerequisite before wiring drafts** — a
  reversal/downward-correction must never over-bill or orphan a draft charge (adversarially-verified
  D12 finding).
- **Security/Standing lands with P1** — authoring without standing is a semantic violation, not later
  hardening.

---

## 16. Risk Areas (where implementation could violate the architecture)

| # | Risk | Symptom | Guard |
|---|---|---|---|
| **R1** | **Purity leak** | "when violated, do X" inside the ledger/engine; engine invoking an effector. | Effectors bound only in Config; engine is pure. **G-Purity.** |
| **R2** | **A "mark fulfilled" verb** | complete/resolve/close action on an expectation. | No lifecycle status beyond authored transitions; gaps close only when a Fact re-derives satisfaction. **Law 3.** |
| **R3** | **Second trigger system** | a gap→response evaluator parallel to Business-Process triggers. | One binding location (A2). **G-Unified-Binding.** |
| **R4** | **Cyclic writes** | a derived read writing the ledger; a consumer mutating expectations directly. | Derived layer read-only; all writes via authoring intake. **G-Acyclic.** |
| **R5** | **Revision/Correction conflation** | treating a correction as a revision or vice versa. | Typed transitions; consumers branch on type. **G-Correction / G-Revision.** |
| **R6** | **Materializing the intensional layer** | ledger explosion from materializing every instance — or lost exceptions from never condensing. | Virtual-by-default, condense-on-exception (§3). |
| **R7** | **Measurable above the line** | an expectation asserting a Condition on a sensor/measurable. | Condition on reality; measurable is a Config binding. **G-Semantic-Line.** |
| **R8** | **Impure evaluation** | evaluation reads now-dependent state not captured as a Fact/clock-fact → replay diverges. | Replay-determinism test in CI; the clock is a Fact. **G-Replay-Determinism.** |
| **R9** | **Standing bypass** | AI/external authoring binds without ratification. | Standing gate at intake; deontic cannot bind unratified. **G-Standing.** |
| **R10** | **Non-derivability erosion** | auto-authoring an expectation from a fact; "closing" an expectation because a fact appeared, without re-evaluation. | The two ledgers never write each other; only the pure engine compares. **Law 5.** |
| **R11** | **Name ambiguity (until P0)** | "Expectations" read as the old derived-L3 by reviewers. | §0.5 reconciliation sweep is P0-blocking. **G-Reconciliation.** |

---

## 17. Platform Certification Gates

Complete only when **all** gates are green **and** the §10 lifecycle is demonstrated on a live
vertical **and** the Billing parity retrofit is merged.

| Gate | Proves |
|---|---|
| **G-Reconciliation** | The truth-flow doctrine no longer uses the retired Law-2 wording that treated Expectations as derived; derived-L3 is renamed Projection; Law 2 amended. No naming ambiguity in the repo. |
| **G-Purity** | No path from evaluation/ledger to an effector; effectors only via Config binding. |
| **G-Acyclic** | Gaps/judgments read-only; every write is an authoring act. |
| **G-Replay-Determinism** | Replaying any historical `(valid-time, transaction-time)` reproduces recorded judgment exactly (golden replay corpus). |
| **G-Parity** *(keystone)* | The generalized engine, run as Billing's financial-modality consumer, reproduces shipped Consumption outcomes exactly — engine proven modality-agnostic. |
| **G-Correction** | A fact/expectation correction unwinds downstream (obligations superseded, DRAFT charges voided — never posted, messages un-said, work withdrawn) with **no** over-bill/orphan. |
| **G-Revision** | A legitimate revision re-plans forward without unwinding the valid past. |
| **G-Standing** | No unratified deontic/commissive expectation ever binds a consumer; AI cannot self-ratify. |
| **G-Semantic-Line** | Every Condition binds to a measurable via Config; no expectation references a raw sensor; identical judgment across sensing methods. |
| **G-Modality-Closure** | Authoring rejects any modality outside the closed five. |
| **G-Unified-Binding** | Exactly one gap→response binding mechanism; no second trigger system. |
| **G-Coverage** | Observability surfaces blind spots (unbindable Conditions, unwitnessed intent). |

---

## Cross-references

- [`core/operational-truth-flow-doctrine.md`](./operational-truth-flow-doctrine.md) — the five-layer
  axis + four laws; **must be amended per §0.5** (rename derived-L3 → Projection; Law 2).
- [`modules/operational-consumption-platform.md`](../modules/operational-consumption-platform.md) — the
  L4→L5 pipeline; Billing is consumer #1 and the parity proof (D12a).
- `operational-facts-platform` design — the observed twin ledger; the Fact Contract read seam.
- [`rfcs/operational-expansion-phase1.md`](../rfcs/operational-expansion-phase1.md) — Wave 1 (D2 Fact
  Contract + D12a correction-aware consumption) that this capability generalizes.
- [`modules/financial-platform-domain.md`](../modules/financial-platform-domain.md) — structural template
  for a canonical frozen-determinations ledger doc.

## When this doc must be updated

- The closed modality set changes (today: required/prohibited/intended/committed/predicted).
- Any of the six Platform Laws changes.
- A resolution in §A (predicate expression, single gap→effector binding, evaluation dependency model)
  is superseded.
- The package set (§14), dependency order (§15), or certification gates (§17) change.
- The §0.5 reconciliation lands (flip the status of G-Reconciliation and remove R11 once the sweep is
  merged).
