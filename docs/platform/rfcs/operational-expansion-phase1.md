---
owner: platform
status: canonical
last_reviewed: 2026-07-13
supersedes: []
---

# RFC — Operational Expansion Phase 1 Architecture Reconciliation

**Status:** FROZEN / APPROVED (2026-07). Architecture is frozen and governs the operational expansion (Implementation Wave 1 onward). **Not** implementation. Governs Scheduling, Attendance, Capacity, Staffing, Billing, Forecasting, Recommendations, and Actions.
**Base:** `origin/staging` @ `a3fdc946f` (2026-07-10).
**Predecessor evidence:** [`../../audits/active/operational-expansion-architecture-audit-2026-07.md`](../../audits/active/operational-expansion-architecture-audit-2026-07.md) (Phase A). Phase A recommendations are treated here as **proposals, not decisions** — several are challenged and refined below.
**Governing principle:** Prove Alloy by composing existing capabilities. No parallel modules, no duplicate runtimes, no consumer-owned business logic, no childcare-specific platform abstractions.

> **Approval gate — CLEARED (2026-07).** The operator approved the architecture and authorized the freeze. The four load-bearing decisions (D3, D7, D8, D12) are **accepted**; the §7.4 doctrine reconciliations are **applied**; the Exit-Criteria checklist (§7.5) is satisfied. Standing implementation constraint carried forward to Implementation Wave 1: **D12a must land before any D12b wiring touches drafts.**

> **Reconciliation note (2026-07-13, Operational Expectations two-ledger freeze).** The frozen Operational Expectations ontology ([`../core/operational-expectations-system-design.md`](../core/operational-expectations-system-design.md)) reserves the word **"Expectation" for the authored Operational Expectations ledger** (intended truth, "what SHOULD / WILL be") and makes **"Projection" the umbrella term for derived operational state.** Accordingly, the derived category this RFC calls **"Expectation (L3)"** — expected attendance/occupancy/staffing-demand, a function of L1+L2, "the target Facts are compared against" — is renamed **"Projection (expected-state, L3)"**; its behavior and ownership are unchanged. The separate **"Projection"** row in the §3 taxonomy (the Operational-Calculations descriptor primitive) is unaffected. **Law 2** now reads *"Projections are derived / Expectations are authored"* (see [`../core/operational-truth-flow-doctrine.md`](../core/operational-truth-flow-doctrine.md)). Legacy code identifiers (`scheduleExpectationCore.ts`, etc.) retain their names — implementation is out of scope for this documentation pass.

---

## 0. Reading order

1. §1 Architecture Baseline — what exists, classified.
2. §2 Decision Register — the twelve primary decisions.
3. §3 Canonical Operational Model — the thirteen concepts, each with one owner.
4. §4 Responsibility Matrix — which system owns which business logic.
5. §5 Dependency Graphs — five graphs.
6. §6 Approved Expansion Sequence — Implementation Waves, by dependency + proof value.
7. §7 Adversarial Review, Accepted/Rejected recommendations, Exit Criteria.

---

## 1. Architecture Baseline

Classification legend: **Ratified doctrine** · **Implemented runtime** · **Implemented-but-unwired** · **Partial** · **Missing** · **Doc-drift**.

| Capability | Classification | Evidence |
|---|---|---|
| Two-axis operating model (five planes × L1–L5 truth-flow) | **Ratified doctrine** | `operational-ux-doctrine.md`, `operational-truth-flow-doctrine.md` |
| L1 Configuration rules (ratio/capacity/schedule/operating-window) + most-specific-wins resolver | **Implemented runtime** | `childcareOperational/config/{resolveConfigRule,ratioRules,capacityRules,scheduleRules}.ts`; `…config_rules_phase1.sql` |
| L2 Intent (agreement/placement/schedule-assignment, effective-dated, supersede, provenance FK) | **Implemented runtime** | `childPlacementService.ts`, `scheduleAssignmentService.ts`, `…enrollment_slice1.sql` (self-FK provenance) |
| L3 Projections (expected attendance/occupancy/**staffing demand**, pure, non-persisted) | **Implemented runtime** | `expectations/scheduleExpectationCore.ts` |
| L4 Attendance Facts (immutable append-only, event-emitting, corrects-by-reference) | **Implemented runtime** | `attendance/attendanceService.ts`, `child_attendance_events` (DB trigger) |
| Expected-vs-actual + actual occupancy/staffing/compliance read models | **Implemented runtime** | `attendance/{expectedVsActual,actualCompliance}.ts` |
| L4→L5 Operational Consumption (Fact→Consumption Event→Resolved Obligation→draft Charge; Slices 1–4) | **Implemented-but-unwired** | `operationalConsumption/*`; only caller is `…/consumption/simulate` route (no fact-write invokes it) |
| Commercial resolver (subject-neutral `evaluate()`, not `job_id`) + rate plans/rules | **Implemented runtime** | `commercial/execution/evaluate/evaluate.ts`; `childcare_rate_plans/rules` |
| Consequence reactors (events → billing/compliance/forecasting) | **Missing** | no subscriber on `workflow_events` for these consequences |
| Commercial substrate convergence | **Partial** | neutral `evaluate()` vs older `resolveEnrollmentTuitionRate.ts` coexist |
| Posting (authoritative money write), invoices/AR/payments/GL-posting/subsidy | **Missing (deferred by design)** | `billing-financials-platform.md` "Explicitly deferred" |
| Staffing **supply** (shift commitment + staff-present facts) | **Missing** | only *required* staff derived (`requiredStaffForChildren`); "staffed capacity … future" |
| Scheduling **process** definition | **Missing** | `process/definitions/` holds only `enrollment` (child schedule *assignments* + occupancy projection exist) |
| Forecasting (Planning-plane projections) | **Missing** | no forecast code; OIP metrics/snapshots/trends substrate exists |
| Process Engine (agnostic participation core + additive domain registry) | **Implemented runtime** | `process/engine/*` grep-proven agnostic; `mutations/domainRegistry.ts` |
| Operational Command Runtime + Command Surface | **Implemented runtime** (status-domain commands landing) | `actions-and-workflows.md`; `describeCommandState`, `CommandSurfaceShell` |
| Current Work (config-driven stage-plan projection) | **Implemented runtime** | `current-work-surface.md`, PR #95 |
| Operational Intelligence (metrics/KPIs/snapshots/trends) + Operational Calculations governance | **Implemented runtime** (Insights/Dashboards/Reports planned) | `metrics/*`, `analytics/calculations/registry.ts` |
| Focus Panel edit substrate (inline operational edit) | **Partial** | read-only for most operational data until edit stack lands (Household→Children) |
| V3 runtime adoption (recursion/stacking/`visibleWhen`), Default Operational Subject Strategy | **Partial / doctrine-only** | authored+persisted, not rendered live |
| `product-roadmap.md` / `release-history.md` framing of Attendance/Billing as "Future" | **Doc-drift** | contradicted by shipped module backend (§7.4 reconciliation) |
| `placement-system.md` "future" vs "committed" `child_placements` | **Doc-drift** | table exists; "future" framing stale |

---

## 2. Decision Register

Each decision: **Decision · Status · Evidence · Alternatives · Rationale · Consequences · Doctrine affected · Implementation implications.**

### D1 — L1–L5 is sufficient as Alloy's canonical operational model. No sixth layer.
- **Status:** ACCEPTED.
- **Evidence:** Every expansion concept located cleanly on L1–L5 in Phase A. Forecasting = Planning plane consuming L3+L4 (surface axis), not a truth-flow layer. Consumption is the named L4→L5 bridge, already doctrine.
- **Alternatives:** (a) add "L6 Forecasting/Reporting"; (b) collapse Consumption into L5.
- **Rationale:** Forecasting authors no truth — it projects existing layers; adding a layer would misplace a derived surface as a truth tier. Consumption is a *contract at* the L4→L5 boundary, worth naming but not a new layer.
- **Consequences:** Forecasting must live in the Planning plane over calculations, never as a store. Consumption stays the canonical L4→L5 runtime contract.
- **Doctrine affected:** `operational-truth-flow-doctrine.md` (affirm, add explicit "no sixth layer; Planning is surface-axis").
- **Implementation:** none new; governs where Forecasting is allowed to live.

### D2 — Adopt a shared **Operational Fact contract** (invariants + interface + conformance test). Not a base class, not premature.
- **Status:** ACCEPTED.
- **Evidence:** Attendance is the reference fact stream (immutable, append-only DB trigger, effective-dated, event-emitting, corrects-by-reference, provenance FK). These invariants recur for every future fact.
- **Alternatives:** (a) no contract — each domain reinvents; (b) a shared runtime base class/table (see D3).
- **Rationale:** A *contract* (a documented invariant set + a `OperationalFactStream` TS interface + a shared conformance test suite) captures what is genuinely universal (integrity/lifecycle rules) without forcing shared storage or a lowest-common-denominator schema. This is the discipline, not the coupling.
- **Consequences:** New fact streams (staff presence) must pass the conformance test; reviewers reject in-place mutation. Vocabulary shifts from "copy attendance" to "conform to the fact contract."
- **Adversarial correction (accepted):** a contract asserting only *storage* invariants (append-only, provenance FK, effective-dated) is **too weak** — it would have green-lit today's attendance event payload, which omits the fields the consumption consumer needs and has no correction identity (the exact gap that refutes the naive D12). The conformance test **must also assert the consumer-facing half**: (a) the emitted event/DTO carries correction identity (`entryType` + supersede reference) and the fields downstream interpreters require; (b) correction/reversal-guard semantics (e.g. "cannot reverse a reversal") are present, not re-implemented ad hoc; (c) a stable `schema_version`. This is why D2 stays a *contract + test* and not merely prose — but the test is the enforcement and is **non-optional at freeze**.
- **Doctrine affected:** `operational-truth-flow-doctrine.md` (L4 section — promote the attendance rules to a named, domain-neutral contract covering emission + correction, not just storage).
- **Implementation:** author the interface + the strengthened conformance test (storage **and** consumer-facing invariants); retrofit attendance as the reference implementation — this will surface the payload/correction gaps D12a must close (the two decisions are deliberately coupled).

### D3 — A shared fact contract does **NOT** imply shared storage, and **events are not facts**. Per-domain **authoritative fact stores**; `workflow_events` is the universal **event** log, never an authoritative fact store.
- **Status:** ACCEPTED — frozen 2026-07 (load-bearing).
- **Frozen principle:** *Canonical operational facts remain in domain-owned authoritative stores conforming to the Operational Fact contract. Canonical platform events communicate fact creation, correction, reversal, supersession, and consequence production. Events support orchestration, audit, and read-model projection; they do not replace authoritative domain facts.*
- **Evidence:** No `operational_facts` table exists (verified). Attendance's table carries domain-specific columns (event_kind, room refs, actor/source), a consistency trigger, and RLS tied to its FKs. A universal table would be sparse EAV (violates "code owns invariants," loses FK integrity) or force a degenerate common schema.
- **Alternatives:** (a) universal `operational_facts` table with jsonb payload; (b) hybrid (universal header + per-domain detail); (c) treat `workflow_events` as the fact store (**rejected — it is an event log, not authoritative fact truth**).
- **Rationale:** Integrity and lifecycle are *not* actually shared at the storage layer — each fact stream has distinct referential integrity, triggers, and correction semantics (attendance's `validate_child_attendance_events_consistency` trigger + FK-scoped RLS could not be enforced by a sparse universal EAV table). The genuinely shared artifact is the immutable **event** (`workflow_events`) — the universal *event* log that *communicates* fact lifecycle, not an authoritative fact store. Constraint explicitly forbids a universal facts table without proven shared integrity/lifecycle; that proof does not exist.
- **Adversarial correction (accepted):** `workflow_events` **cannot serve a per-subject cross-domain timeline as built** — its `entity_id` is the domain fact-row id (not the business subject/child), the subject lives in unindexed `jsonb`, and the only indexes are `(entity_type, entity_id)` and `(event_type)`. So the "one table would be easier for the timeline" ergonomic argument is answered **not** by `workflow_events` alone but by a **dedicated subject-indexed cross-domain read model**, which becomes a **required Implementation Wave 1/2 deliverable** (it was previously mis-stated as "already captured").
- **Consequences:** Each domain owns its **authoritative** fact store conforming to D2. Cross-domain "what happened to this subject" is served by a **subject-indexed operational timeline read model** — a projection over the event envelope + per-domain authoritative facts. The event log may gain a `(org_id, subject_type, subject_id, occurred_at)` index to *drive* that projection, but the timeline reads authoritative detail from the domain fact stores; **the event log never becomes the fact store.** No universal facts table; no EAV.
- **Doctrine affected:** `operational-truth-flow-doctrine.md`, `entity-model.md`, `platform-event-catalog.md` (event-communicates-fact-lifecycle + subject-indexing note).
- **Implementation:** staff-presence and future facts get their own conforming authoritative tables; deliver the subject-indexed timeline read model; reject any universal-facts-table proposal and any use of the event log as fact truth.

### D4 — Deterministic projections require **formalization of existing calculation infrastructure**, not a new platform capability.
- **Status:** ACCEPTED.
- **Evidence:** Expected occupancy/staffing are pure functions today; Operational Calculations already govern OIP resolvers ("one fact, one definition, many consumers"); Optimization Centers already wrap `childcareOperational/*` read models.
- **Alternatives:** (a) a new Projection Engine/service; (b) a projection store.
- **Rationale:** The compute exists and is deterministic; what is missing is *governance* (a registered descriptor per projection) so no consumer re-derives. A new engine or store would duplicate and invite drift (Law 2).
- **Consequences:** Every projection (expected/actual occupancy, staffing demand, variance, forecast) is registered as an Operational Calculation; consumers bind by key+grain.
- **Doctrine affected:** `operational-calculations.md` (extend registry to operational/capacity/staffing packs).
- **Implementation:** register projections as calculations; add capacity/attendance/staffing/billing KPI packs (already declared-but-empty).

### D5 — Classify every projection explicitly. Fact authority follows the domain fact contract; Consequence authority follows a **domain-defined commitment boundary** (not universally "posted").
- **Status:** ACCEPTED (revised — the "only posted Consequences are authoritative" doctrine is replaced with domain-declared commitment boundaries).
- **Frozen principle:** *L4 Facts are authoritative according to their domain fact contract. L5 Consequences become authoritative only when they cross their domain-defined commitment boundary.*
- **Consequence authority vocabulary (standard; not every consequence uses every state):** `draft → proposed → reviewed → approved → committed → posted → voided → reversed`. **Each domain declares its commitment boundary** — the state at/after which the consequence is authoritative. Financial charges become authoritative at **`posted`**; other operational consequences may become authoritative at **`approved`** or **`committed`**. States left of the boundary are recomputable/non-authoritative; at/right of it the consequence follows immutability + reverse-by-reference.

| Projection | Category | Persisted? | Authoritative? |
|---|---|---|---|
| Expected attendance / occupancy / staffing demand | **Projection (expected-state, L3)** | No (derived) | No |
| Actual occupancy / staffing / compliance | **Read model** over L4 | No | No (reflects facts) |
| Expected-vs-actual variance | **Read model** (observational) | No | No |
| Consumption Event | **Fact-interpretation contract** (L4→L5) | Yes (recorded) | Contract, not money |
| Resolved Obligation / draft Charge | **Consequence (L5), pre-boundary** | Yes (recomputable) | No (left of commitment boundary) |
| Consequence at/past its domain commitment boundary (e.g. **posted** Charge / ledger / GL; an **approved**/**committed** non-financial consequence) | **Consequence (L5), authoritative** | Yes | **Yes** |
| Metric snapshot | **Snapshot** (non-authoritative cache) | Yes | No |
| Forecast (fill/revenue/labor) | **Snapshot/projection** (Planning) | Optional cache | No |
| Focus Panel card / queue row data | **Consumer view model** | No | No |

- **Rationale:** Prevents any consumer or forecast from treating a derived number as truth; enforces Law 2 (projections derived / expectations authored) and Law 3 (financials from facts, authoritative only past each domain's commitment boundary — Posting for financial charges).
- **Doctrine affected:** `operational-truth-flow-doctrine.md` (record the commitment-boundary authority model + vocabulary), `operational-calculations.md`.

### D6 — Business logic ownership is fixed by the Responsibility Matrix (§4). No business logic in consumers.
- **Status:** ACCEPTED. See §4. Status transitions → Execution Runtime domain handlers; pricing → Commercial resolver; projections → calculation layer; consequence interpretation → Consumption runtime. Consumers (Work Units, Focus Panels, Surface Builder) request resolved values and place actions; they never compute.

### D7 — An operational condition becomes **Current Work** only when it is decision-bearing, **materially intervention-worthy**, governed by a configured rule/operating plan, actionable in context, **and assignable to an accountable owner**. Variance ≠ Current Work.
- **Status:** ACCEPTED — frozen 2026-07 (guards against over-production of work).
- **Frozen threshold:** *A condition becomes Current Work only when it is decision-bearing, materially intervention-worthy, governed by a configured rule or operating plan, actionable in context, and assignable to an accountable owner.* All five must hold; failing any one, the condition renders as an informational read model, not work.
- **The three completions over the prior draft:** (a) **materiality** — a condition below its configured materiality threshold (trivial variance, sub-threshold amount) never becomes work; (b) **accountable operational ownership** — work with no resolvable owner (role/queue/assignee per the governing rule) is not created (an orphan task is not work); (c) **reconciliation identity** — see rules below.
- **Evidence:** Current Work is a projection of published `stage_operating_plan_v1`; Needs Attention is a separate resolver overlay with reason codes; variance is an observational read model.
- **Alternatives:** (a) surface every variance as Current Work; (b) surface every attention-bucket hit as Current Work; (c) create work without an owner or materiality gate.
- **Rationale:** Current Work must represent *work an accountable operator must materially do*, not *every number that moved*. A late-pickup variance is informational until policy makes it material and actionable and assigns it an owner. The bridge from condition → work is a **configured rule** (stage plan expected work, or an attention rule with an action, materiality, and owner), not the mere existence of a variance.
- **Reconciliation identity + rules.** Each Current Work item carries a stable **reconciliation identity** = `(governing_rule, subject, condition_key)` so repeated evaluation converges on one item rather than spawning duplicates:
  - *Same active condition* → **reconcile** the existing work item (no duplicate).
  - *Material condition change* → **update or supersede** the work item (effective-dated; prior lineage retained).
  - *Condition clears* → **resolve or withdraw** per the governing rule (resolve if an outcome was recorded; withdraw if the condition merely lapsed).
  - *Condition recurs after resolution* → **create a new instance with lineage** to the resolved one (not a reopen).
  - *Initiating event replays* (idempotent redelivery) → **no duplicate work** (same reconciliation identity, no state change).
- **Consequences:** Read-model variances render on surfaces without generating work. Only conditions passing all five threshold tests — with a governing rule, materiality, an owner, and a reconciliation identity — create Current Work.
- **Doctrine affected:** `current-work-surface.md`, `operational-ux-doctrine.md` (tabs-vs-actions), `status-and-state-system.md` (Needs Attention ≠ status).
- **Implementation:** attendance/billing conditions surface as read models + attention buckets; only those with a configured action/outcome become Current Work.

### D8 — Promote an operational sequence to a **Business Process** only when all four hold: durable per-subject stage/state, human-confirmed outcomes as the mutation path, queue/work membership, and readiness gates. Otherwise use Actions + status domains.
- **Status:** ACCEPTED — frozen 2026-07 (guards against process proliferation). Applied per candidate:

| Candidate | Verdict | Form |
|---|---|---|
| **Enrollment** | Business Process | reference implementation (exists) |
| **Attendance** | **Not** a process | fact authoring on a roster; actions + L4 facts; a daily-roster *queue*, not a lifecycle |
| **Scheduling** | **Actions on the enrollment subject by default**; a lightweight process **only if** schedule changes need staged governance/readiness | `set_schedule`/`adjust_days` commands + `schedule_assignments`; promote only on evidence of staged work |
| **Billing — obligation review** | **Consequence lifecycle, not a BPS process** | the obligation `review_status` (pending→reviewed→…) + Posting as governed actions; surfaced as obligation *queues* |
| **Billing — AR / collections / dunning** | **Process candidate** (adversarial correction) | a dunning ladder (reminder→late notice→suspension→collections) is durable *per account*, has readiness gates (grace elapsed, plan state) and confirmed outcomes (waive/escalate/write-off) — it satisfies all four criteria; decide when Implementation Wave 5 AR lands |
| **Staffing** | **Process candidate** — shift lifecycle may qualify (durable state + outcomes + readiness) | decide when built; default to status-domain + facts first |
| **Capacity / Forecasting** | **Not** processes | projections/read models in Planning |
| **Recommendations** | **Not** a process | BOS proposals |

- **Rationale:** Business Processes carry governance cost (stages, membership, outcomes, readiness). Fact authoring (attendance) and consequence lifecycles (billing) are better served by their native runtimes (facts; obligation review + posting) surfaced as queues. Promotion is justified by *staged human governance*, not by the existence of a sequence.
- **Consequences:** Fewer processes; Billing and Attendance reuse existing runtimes (consumption/facts) surfaced through queues + Current Work, avoiding the `web/lib/lifecycle/*` genericization cost for those two.
- **Doctrine affected:** `business-process-system.md`, `business-process-execution-platform.md`.

### D9 — Every expansion mutation is a registered **Operational Command**: it authors a fact/state change and emits an event; it never owns workflow or computes consequences inline.
- **Status:** ACCEPTED.
- **Evidence:** Operational Command Runtime (one capability, many placements, single execute route), event spine (`emitEvent→workflow_events→workflowRun`), projection-subscribe model (mutation runtime emits; projections subscribe).
- **Alternatives:** per-surface buttons with inline logic; commands that write consequences directly.
- **Rationale:** Separation of *authoring truth* (command) from *deriving consequence* (consumption/workflow subscribers) is what keeps facts immutable and consequences recomputable.
- **Consequences:** `record_attendance`, `set_schedule`, `create_shift`, `add_charge`, `post_charges` register once; consequences flow via subscribers (first seam, D12).
- **Adversarial correction (accepted):** the existing obligation-review transitions (`mark_reviewed`/`flag`/`suppress`/`restore`) currently write `review_status` columns directly and do **not** emit events. Under D8 (Billing is a governed *lifecycle*) and D9, these are operator mutations and **must become event-emitting registered commands** so that review/suppression is auditable and subscribable (Posting and analytics need to react to a suppression). Retrofit them onto the command path when the obligation review surface is hardened.
- **Doctrine affected:** `actions-and-workflows.md` (affirm), `operational-consumption-platform.md` (review actions become event-emitting commands).
- **Implementation:** register capabilities; forbid inline consequence computation in command handlers; make obligation-review transitions emit events.

### D10 — Work Units, Focus Panels, and Surface Builder **consume** operational state via calculations / read models / Operational Context; they author and compute nothing.
- **Status:** ACCEPTED.
- **Evidence:** Presentation-never-computes doctrine; consumers read one canonical source; Operational Calculations is the sole fact-definition layer; Presentation Runtime V2 fetches nothing itself.
- **Rationale:** Prevents business logic drifting into UI (explicit constraint). One definition, many consumers.
- **Consequences:** New surfaces bind by key+grain; no client-side math; no queue-JSON business logic.
- **Doctrine affected:** `operational-calculations.md`, `presentation-runtime-v2.md`, `queue-system.md`.

### D11 — AI/BOS explains and proposes over resolved facts/calculations and proposes **registered** commands; it never establishes canonical truth and takes no autonomous side effects.
- **Status:** ACCEPTED.
- **Evidence:** BOS is a placement on the command runtime (`bos_proposal`), reads `MetricEngine.resolve()`, uses the obligation/variance explanation engines; autonomous agents paused.
- **Rationale:** Authority boundary: AI grounds on truth, proposes, human commits. Constraint: AI must not establish truth.
- **Consequences:** Recommendations = proposals routed through the same execute path; explanations reuse `buildObligationExplanation` / variance read models.
- **Doctrine affected:** `ai-platform.md` (affirm).

### D12 — **First seam: the fact→consumption trigger edge — but it is NOT "small/safe" until the correction-carrying contract is closed. Split into a blocking prerequisite (D12a) and a preview-first wiring (D12b).**
- **Status:** ACCEPTED — frozen 2026-07 (revised after independent adversarial review — the original "smallest, safest, no new code" framing was **refuted**; see §7.2-A). Split into D12a (Wave 1) + D12b (later).
- **Evidence:** L1–L4 built; consumption pipeline built-but-unwired (only caller is the simulate route). **Adversarial finding (accepted):** `OperationalFactDto` (`consumptionTypes.ts`) carries **no `entryType`/`correctsEventId`**; `interpretAttendance` has **no correction/reversal branch**; `draftConsumption` only iterates the current pass and never supersedes/voids a prior obligation. A recorded attendance **reversal** or downward **correction** therefore either re-derives the same fee (over-bill) or leaves an **orphaned draft charge**. The emitted event payload also omits `checkOutTime`/`lateThreshold`/`hours`/`vacationEligible`, and DB `event_kind` (6 values) does not map 1:1 to consumption `AttendanceFactType` (15 values). So the edge needs a real translation + supersede layer, not "an idempotent subscriber."
- **Alternatives:** (a) build a Scheduling process first; (b) build Staffing facts first; (c) build Posting first; (d) wire drafts immediately (**rejected — unsafe on corrections**).
- **Rationale:** The strategic logic still holds — this is the highest architectural proof (it proves the whole L4→L5 flow composes) and delivers Billing value without a Billing module, and it must precede Posting (never write authoritative money before the derived pipeline is proven). But "safe to wire as-is" is false. The fix is to make the **correction/reversal path first-class in the fact→consumption contract**, then wire in **preview mode** before ever touching drafts.
- **D12a (blocking prerequisite — the real Implementation Wave 1 work):** extend the fact contract and pipeline so corrections are first-class: add `entryType` + `correctsEventId` (or a normalized supersede reference) to `OperationalFactDto`; add a correction/reversal branch to `interpretAttendance`/`interpretSchedule`; make `draftConsumption` **supersede/void the prior obligation** when a later pass drops or reduces a directive; enrich the attendance event payload (or have the reactor re-fetch the domain row) with `checkOutTime`/`lateThreshold`/`hours`/`vacationEligible`; and define the `event_kind → AttendanceFactType` translation explicitly. This is the **Operational Fact contract's consumer-facing half** (ties to D2) — not deploy-lag.
- **D12b (wiring, gated on D12a):** an idempotent reactor on the relevant `workflow_events` that runs **`previewConsumption` first (no draft writes)** to prove correction deltas resolve correctly against real facts, then is promoted to `draftConsumption`. No new tables; no Posting.
- **Consequences:** Billing becomes visible (draft obligations from real facts) at the end of Implementation Wave 1 — after D12a, not before. The reactor + correction-aware supersede is the reusable pattern every future consequence subscriber inherits (and it is the pattern Staffing/Posting depend on).
- **Prerequisite:** freeze the Consumption runtime contract **and** land D12a before D12b.
- **Doctrine affected:** `operational-consumption-platform.md` (record the trigger edge **and** the correction-carrying contract as named, pending seams), `platform-event-catalog.md`.
- **Implementation:** D12a (contract + supersede + payload/vocabulary) → D12b (preview-first reactor → drafts).

---

## 3. Canonical Operational Model

Each concept: **owner (platform/application) · persisted/derived · mutability · provenance · temporal semantics · versioning · relationship to process/work/action.**

| Concept | Owner | Persisted/Derived | Mutability | Provenance | Temporal | Versioning | Process/Work/Action |
|---|---|---|---|---|---|---|---|
| **Configuration** | Platform (config runtime) | Persisted | Mutable via supersede | authored | effective-dated | version = contract | rules processes/actions execute against; never rewrites history |
| **Intent** | Application (per-domain) | Persisted | via commitment | source FK | as-of intent | n/a | pre-commitment; becomes Commitment |
| **Agreement** | Application (`child_enrollment_agreements`) | Persisted | lifecycle (end/cancel), not patch | opportunity/OCM FK | start/end dates | status lifecycle | scope+subject of commitments; not a charge |
| **Commitment** (placement/schedule/shift) | Application (per-domain tables) | Persisted | **supersede only** | self-FK `supersedes_*` | effective-dated | new row per version | authored by Actions; consumed by projections |
| **Projection (expected-state, L3)** | Platform-governed calc, application inputs | **Derived** | recomputable | function of L1+L2 | as-of window | calc version | target Facts are compared against |
| **Fact** | Application (per-domain, conforming to D2) | Persisted | **immutable, append-only; correct-by-reference** | correction FK + source | event/service-date | `schema_version` on the emitted event envelope today (`workflow_events`); a per-fact-table `schema_version` column is recommended by the D2 conformance test | authored by Actions only; emits event |
| **Consequence** | Application (charges/ledger + future domains) | Persisted | pre-boundary recomputable; **committed/posted immutable, reverse-by-reference** | billable-source + resolution_key | occurs/billable-on | source_charge_id lineage + authority-state | derived from Facts via Consumption; authoritative **past the domain-defined commitment boundary** (Posting for charges; `approved`/`committed` for others) |
| **Exception** | Platform (read model) | **Derived** | n/a (observational) | over L3×L4 | as-of | calc version | not an entity; operator response is a new Fact |
| **Resolution** | Application (`consumption_events`/`resolved_obligations`) | Persisted (recomputable) | recompute-in-preview; supersede | consumption_event FK + resolution_key | occurs/effective-on | review_status + status | the L4→L5 interpretation contract |
| **Projection** | Platform (Operational Calculations) | **Derived** (optional cache) | recomputable | descriptor + inputs | grain/window | descriptor version | governs, never authors; no store |
| **Snapshot** | Platform (`metric_snapshots`) | Persisted (non-authoritative) | append-only | computed_at + scope | point-in-time | n/a | cache for trends/forecast; never SoT |
| **Consumer** | Platform (Work Unit/Focus Panel/Surface) | Derived view model | n/a | binds by key+grain | request-time | n/a | reads; authors/computes nothing |
| **Proposal** | Platform (BOS) | Ephemeral (+ decision record) | n/a | grounded on facts/calcs | request-time | n/a | proposes registered commands; human commits |

**Cross-cutting invariants:** (1) **Facts** are authoritative per their domain fact contract, and **Consequences** are authoritative only **past their domain-defined commitment boundary** (Posting for financial charges; `approved`/`committed` for others — D5); events (`workflow_events`) communicate lifecycle and are **never** authoritative fact/consequence truth (D3); (2) every persisted operational object is either immutable-append-only past its authority point (Fact; committed/posted Consequence) or effective-dated-supersede (Config/Commitment/Agreement/Resolution); (3) the derived categories — expected-state Projection, Exception, Projection, Snapshot, Consumer — are derived and never a system of record; (4) nothing in this model is childcare-specific — childcare supplies *instances* (agreement=`child_enrollment_agreements`), the platform owns the *categories*.

---

## 4. Responsibility Matrix

Which system owns which business logic. **No category is owned by a UI consumer.**

| System | Owns | Must NOT own |
|---|---|---|
| **Entity & Record System** | canonical identity, record resolution (RRS), authoritative entity GET | status transitions, projections, pricing |
| **Business Processes** | stages, membership, expected work, outcomes (the durable-state mutation path), readiness gates | facts, pricing, projections, non-staged sequences (D8) |
| **Status & State** | per-grain status domains, transition graphs, stage_key (produced by outcomes) | queue behavior, work, dashboards (it is produced, not driver) |
| **Domain runtimes** (enrollment ops, attendance, consumption, commercial, staffing-future) | authoring Commitments & Facts, domain invariants, effective-dating/immutability, event emission, pricing (`evaluate()`) | presentation, cross-domain truth, forecasting |
| **Deterministic calculations** (OIP + Operational Calculations) | all derived numbers — projections, occupancy, staffing demand, variance, KPIs, forecast inputs | authoring facts, mutating state, posting money |
| **Current Work** | projecting stage-plan expected work + action-bearing attention into operator work; outcome completion | inventing work from raw variance (D7); computing metrics |
| **Actions** (Command Runtime) | executing registered commands, context resolution, preview, atomic write+event, audit | workflow ownership, consequence computation, projections |
| **Work Units** | queue hosting, slug routing, operational bootstrap | business/financial math, record truth |
| **Focus Panels** | composing per-subject cards/tabs, placing actions, rendering read models | authoring data, computing values |
| **Surface Builder** | configuring which components/fields/actions appear where | executable behavior, business truth, hardcoding field sets |
| **Communications** | threads/messages, templates, scheduled sends | duplicating message bodies; being a truth source |
| **Processing** | intake/import channels feeding facts (e.g. subsidy import path) | authoritative money; bypassing the fact contract |
| **Configuration** | config entities, scope/inheritance/ownership, effective-dated authoring | business truth in JSON where code owns invariants |
| **AI / BOS** | explanation over resolved facts/calcs, proposing registered commands, required-info resolution | establishing truth, autonomous side effects, inventing actions |

---

## 5. Dependency Graphs

### 5.1 Operational truth-flow graph
```
L1 Config ──┬─▶ L3 Projections ──(compared against)──▶ L4 Facts ──▶ L4→L5 Consumption ──▶ L5 Consequences ──(Posting)──▶ authoritative
            └─▶ L2 Intent/Agreement ──▶ Commitment (placement/schedule/shift) ──▶ L3
```

### 5.2 Event-production graph
```
Command executes ─▶ authors Fact/Commitment/Consequence in the DOMAIN AUTHORITATIVE STORE (atomic)
                 ─▶ emitEvent ─▶ workflow_events  [an event that COMMUNICATES the fact lifecycle,
                                                    not a copy of authoritative truth — D3]
   workflow_events ─▶ workflowRun (effects)
                   ─▶ [Wave 1] consumption reactor ─▶ draftConsumption ─▶ resolved_obligations
                   ─▶ subject-indexed timeline projection (reads authoritative detail from domain stores)
                   ─▶ projection/read-model refresh (subscribe)
                   ─▶ BOS post-commit follow-up (propose)
```

### 5.3 Deterministic-calculation graph
```
Inputs (L1 rules, L2 commitments, L4 facts, snapshots)
   ─▶ pure projection fns (expected occupancy/staffing, actual compliance, variance)
   ─▶ governed by Operational Calculation descriptors (key+grain)
   ─▶ resolved values (point/trend/breakdown) ─▶ consumers  [no store, no client math]
```

### 5.4 Consumer dependency graph
```
Operational Calculations / Read models / Operational Context
   ├─▶ Work Unit metrics & queues (bind by key+grain)
   ├─▶ Focus Panel cards/tabs (record-grain via Operational Context)
   ├─▶ Surface Builder placements
   └─▶ BOS grounding
Consumers author nothing; on membership/mutation events they re-request.
```

### 5.5 Operator-intervention graph
```
Read-model condition (variance/attention)
   ─▶ configured rule? ──no──▶ informational only (render, no work)
                       └─yes─▶ Current Work item / attention bucket
   ─▶ operator opens Command Surface ─▶ preview ─▶ commit ─▶ authors Fact/state
   ─▶ Current Work resolves on recorded outcome (not on recompute)
```

---

## 6. Approved Expansion Sequence — Implementation Waves (architectural, not implementation)

> **Naming.** This RFC *is* the **Architecture Reconciliation** phase. To remove the collision between the architecture phase and the delivery sequence, the post-freeze delivery sequence is labeled **Implementation Wave 1..6** (never "Phase"). **D12a/D12b belong to Implementation Wave 1, after freeze.** Ordered by dependency + platform-proof value. No files/code specified; approval precedes specification.

- **Implementation Wave 1 — Reconcile, harden the fact contract, then wire (proves the architecture, builds no module).**
  Reconcile doc-drift (§7.4); freeze the contracts (§7.5 list). **D12a (the real work): close the correction-carrying fact→consumption contract** — correction/reversal identity on the DTO, correction branches in the interpreters, obligation supersede/void in `draftConsumption`, event-payload/vocabulary enrichment, and the strengthened D2 conformance test. Then **D12b: wire the reactor in preview mode first**, promote to drafts once correction deltas are proven. Register expected/actual occupancy + staffing-demand + variance as Operational Calculations; deliver the subject-indexed timeline read model (D3). *Exit: real attendance/schedule facts — including corrections and reversals — produce correct Draft Obligations end-to-end with zero new module and zero mis-bill.*
- **Implementation Wave 2 — Prove a non-enrollment consumer surface.**
  Attendance daily-roster **queue** + Focus Panel Attendance tab (Startable→Active on first fact); Capacity/occupancy read-model surfaces. Read-only cards (no edit-substrate dependency). *Exit: a second domain surfaces through existing Work Unit/Focus Panel primitives, no new spine.*
- **Implementation Wave 3 — Edit substrate + Scheduling actions/process.**
  Land Focus Panel edit substrate (Household→Children) that unblocks write-capable cards; ship Scheduling as registered commands on the enrollment subject; promote to a process only if D8's four criteria are met.
- **Implementation Wave 4 — Staffing supply (new facts, existing patterns).**
  Add shift Commitment (L2) + staff-presence Fact stream (L4, conforming to D2/D3); complete actual-staffing compliance; coverage-gap BOS proposals.
- **Implementation Wave 5 — Posting (the financial commitment boundary).**
  Draft obligations → **posted** charges (the charge domain's commitment boundary, D5) → invoices/AR/payments/GL; reverse-by-reference only. Converge commercial substrates.
- **Implementation Wave 6 — Forecasting & Recommendations.**
  Planning-plane forecast calculations over L3+L4+snapshots; BOS delinquency/fill/labor recommendations (OIP Phase-4 aggregate queries).

**Ordering note:** Billing *value* lands in Implementation Wave 1 (wiring), not last — its engine is already built; authoritative Posting lands late (Implementation Wave 5).

---

## 7. Adversarial Review, Recommendation Ledger, Exit Criteria

### 7.1 Adversarial review of this RFC's load-bearing decisions

- **D3 (per-domain storage) vs a universal facts table.** Steelman for universal: cross-domain "what happened to this child" timeline is easier from one table; a shared reactor is simpler. Rebuttal: a universal table would sacrifice FK integrity and per-domain triggers (the very invariants D2 protects); the shared artifact is the immutable **event** (`workflow_events`), which *communicates* fact lifecycle but is **not** an authoritative fact store, so the timeline is served by a subject-indexed projection over the event envelope + per-domain authoritative facts (§7.2-B corrected the earlier, wrong "already served by `workflow_events`" claim). **Survives** — the timeline read model is a required deliverable, capturing the ergonomic win without storage coupling and without treating events as facts. *Residual risk: if a future fact stream needs cross-domain transactional integrity (a fact simultaneously two domains'), revisit.*
- **D12 (wire consumption first).** This self-review's first pass rated D12 "survives" with a residual-risk footnote on correction idempotency. The **independent adversarial pass (§7.2) refuted that** — the correction/reversal gap is not a residual risk, it is a design hole that would mis-bill on the common operator path. D12 is **revised** into D12a (close the correction-carrying contract) + D12b (preview-first wiring). The strategic ordering (consumption edge first, before Posting) survives; the "small/safe/no-new-code" framing did not. *Lesson: the first pass under-weighted its own footnote; the independent pass made it load-bearing.*
- **D8 (Billing is a consequence lifecycle, not a process).** Steelman for process: operators may want staged AR queues with outcomes/readiness. Rebuttal: the obligation `review_status` + Posting-as-action already model the lifecycle; surfacing it as queues gives staged work without BPS overhead. **Survives conditionally** — if product evidence shows operators need readiness-gated AR stages, D8 permits promotion. (Accepted/frozen 2026-07; the AR/collections promotion path remains open per the D8 table.)
- **D7 (variance ≠ Current Work).** Steelman: operators might miss important variances if they don't become work. Rebuttal: attention rules (configurable) are the intended bridge; the default must be informational to avoid work-spam. **Survives** — attention rules are the escape hatch.
- **D2 as contract, not base class.** Risk: a contract without enforcement drifts. Mitigation: the conformance test suite is the enforcement; without it, D2 is aspirational. *Action: the test is part of the freeze, not optional.*

### 7.2 Independent adversarial review (second pass) — findings incorporated

An independent agent was tasked to **refute** the four then-open (PROPOSED-at-review) load-bearing decisions (default-skeptical). Verdicts and how each was folded in:

- **Finding A — D12 REFUTED (accepted; RFC revised).** The consumption pipeline is unsafe to auto-invoke on fact writes: `OperationalFactDto` has no `entryType`/`correctsEventId`, `interpretAttendance` has no correction/reversal branch, and `draftConsumption` never supersedes an obligation dropped from a later pass. An attendance **reversal/correction** therefore over-bills (same idempotency key re-derives the fee) or **orphans the draft charge**. The "smallest change / no new code" claim is also false (event payload omits `checkOutTime`/`lateThreshold`/`hours`; `event_kind`×`AttendanceFactType` is 6×15, no 1:1 map). **→ D12 split into D12a (close the correction contract) + D12b (preview-first wiring).** Conceded fail-safes: config-missing yields `no_charge` (not a wrong charge); identical-duplicate facts are idempotent.
- **Finding B — D3 SURVIVES, sub-claim corrected.** No fact must be transactionally two-domain; attendance integrity is genuinely domain-specific. **But** "timeline already served by `workflow_events`" is false as built (subject id is in unindexed jsonb; entity index is on the fact-row id). **→ D3 now requires a subject-indexed cross-domain timeline read model as a deliverable; the "already captured" claim removed.**
- **Finding C — D8 SURVIVES, table row rescoped.** Attendance-not-a-process and obligation-review-not-a-process hold. **But** AR/collections/dunning satisfies all four promotion criteria (durable per-account, readiness gates, confirmed outcomes) — the flat "Billing is not a process" was a false-negative. **→ D8 table split into "Billing — obligation review" (not a process) vs "Billing — AR/collections" (process candidate).**
- **Finding D — D2 SURVIVES only if the conformance test is strengthened.** A storage-only contract would have green-lit the exact attendance payload gap behind Finding A. **→ D2 test now must assert consumer-facing payload completeness + correction/reversal-guard semantics + `schema_version`; §3 "schema_version on payload" corrected to the event envelope.**
- **Cross-decision fixes:** D9 vs obligation-review actions (they write columns without emitting events) → D9 now requires review transitions to become event-emitting commands. §3/reference-impl `schema_version` drift corrected.

**Net effect:** one decision (D12) was materially wrong in its safety framing and is revised; three survive with dependencies that the RFC previously treated as solved and now names as explicit deliverables. The strategic architecture (compose, don't rebuild; consumption edge before Posting) is unchanged.

### 7.3 Recommendation ledger (Phase A + second-pass dispositions)

| Phase A recommendation | Disposition | Note |
|---|---|---|
| Wire fact→consumption trigger edge first | **Accepted (revised)** | D12 — but split into D12a (harden correction contract) + D12b (preview-first wiring) after §7.2 refuted the "safe as-is" framing |
| Add Staffing as new L2 commitment + L4 facts | **Accepted (refined)** | D8: facts yes; *process* only if staged-governance criteria met |
| Add Scheduling process definition | **Refined** | D8: default to Actions on subject; process only on evidence |
| Register forecasting/occupancy/staffing calculations | **Accepted** | D4/D5 |
| Add Posting layer, gated last | **Accepted** | Implementation Wave 5 |
| Converge two commercial substrates | **Accepted** | Implementation Wave 5 |
| "Generalize Agreement → Operational Commitment" | **Refined** | D3: a doctrinal *category* + conformance contract, **not** a shared table/base entity |
| "Every future module copies the attendance template" | **Refined** | D2/D3: conform to a *contract*, per-domain storage — not copy-by-cloning |
| Projections governed as calculations, never entities | **Accepted (ratified)** | D4/D5 |
| Reconcile stale foundation docs | **Accepted** | §7.4 |
| A universal operational-facts table (implied temptation) | **Rejected** | D3 |
| Forecasting as a truth-flow layer (implied temptation) | **Rejected** | D1 |

### 7.4 Required doctrine reconciliations (blocking freeze)
1. `product-roadmap.md` + `release-history.md` — move Attendance/Billing backend from "Future" to their true built state.
2. `placement-system.md` — remove "future" framing of `child_placements` (it exists).
3. `operational-truth-flow-doctrine.md` — add: no sixth layer (D1); Operational Fact **contract** (D2); **fact/event separation (D3)** — per-domain **authoritative fact stores**, a **common event envelope** that *communicates* fact creation/correction/reversal/supersession/consequence-production, a **subject-indexed timeline projection** over events + facts, and the rule that **events do not replace domain facts**; **consequence authority by domain commitment boundary (D5)** with the standard authority vocabulary (`draft…posted…reversed`), not universally "posted"; projections-are-calculations-not-entities (D4/D5).
4. `operational-consumption-platform.md` — record the fact→consumption trigger edge as a named, pending seam (D12).
5. `current-work-surface.md` — codify the Current Work **threshold** (decision-bearing + material + governed + actionable + accountable owner) and the **reconciliation-identity** rules (same/changed/cleared/recurring/replayed condition) (D7).
6. `business-process-system.md` — codify the process-promotion criteria (D8).

### 7.5 Exit-Criteria checklist & Freeze list

| Exit criterion | State |
|---|---|
| Every durable concept has one owner | **Met** (§3, §4) |
| Persisted truth separated from derived state | **Met** (D5, §3 — Facts authoritative per fact contract; Consequences authoritative only past their domain commitment boundary; events are not truth) |
| Deterministic logic separated from consumer presentation | **Met** (D4, D6, D10, §4) |
| Current Work creation & reconciliation rules explicit | **Met** (D7) |
| Business Process participation explicit | **Met** (D8) |
| AI authority limits explicit | **Met** (D11) |
| No platform abstraction exists solely for childcare | **Met** (§3 cross-cutting; D3 rejects universal childcare table) |
| First implementation wave specifiable without Cursor making architectural decisions | **Met** (D12a→D12b + Implementation Wave 1 fully bounded; the correction-contract work is now explicit, not a hidden decision) |
| Claude completed an adversarial review | **Met** — self-review §7.1 **and** independent second pass §7.2 (which refuted the naive D12 and forced revisions) |
| Accepted/rejected Claude recommendations recorded | **Met** (§7.3 Phase-A ledger; §7.2 second-pass dispositions) |
| Architecture frozen as an approved RFC | **MET — FROZEN 2026-07.** Operator approved D3/D7/D8/D12; §7.4 reconciliations applied; standing constraint: **D12a lands before any D12b wiring touches drafts** |

**Freeze list (contracts to lock before Implementation Wave 1 code):** Process Engine contract + domain-registry recipe; the four truth-flow laws + D1–D3 additions; the **fact/event separation principle (D3)** — domain-owned authoritative fact stores vs. the communicating event envelope; the **consequence-authority vocabulary + domain commitment-boundary rule (D5)**; the **Current Work threshold + reconciliation identity (D7)**; effective-dated supersede pattern; the **Operational Fact contract + conformance test** (D2, storage **and** consumer-facing invariants); the Consumption runtime contract (D12 prerequisite); the neutral Commercial `evaluate()` subject model; the Operational Command Runtime + Command Surface; the Universal Surface Composition seams; the five-planes tabs-vs-actions rule; Operational Calculations as the sole fact-definition layer.
