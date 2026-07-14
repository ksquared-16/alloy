---
owner: platform
status: canonical
last_reviewed: 2026-07-13
supersedes: []
---

# Operational Truth-Flow doctrine

**Status:** Canonical platform doctrine (June 2026; **terminology converged onto the frozen Operational Expectations two-ledger ontology, 2026-07-13**). Defines the **truth-flow axis** of Alloy's operating model — what is operationally true, and how downstream truth derives from upstream truth — across Enrollment, Scheduling, Attendance, Capacity, Ratios, Billing, Subsidy, Payments, Financials, Forecasting, and Staffing.

> **This doctrine is complementary, not a replacement.** It introduces a second axis over the existing operating model; it does **not** modify the frozen five-plane surface model in [`./operational-ux-doctrine.md`](./operational-ux-doctrine.md). The two axes compose. See "Two orthogonal axes" below.

> **Reconciliation note (2026-07-13, Operational Expectations two-ledger freeze).** The frozen Operational Expectations architecture ([`./operational-expectations-system-design.md`](./operational-expectations-system-design.md)) establishes **two authored ledgers** — **Operational Facts** (observed truth, "what IS") and **Operational Expectations** (authored/intended truth, "what SHOULD / WILL be") — neither derivable from the other; **everything else is derived**. To keep one ontology, the word **"Expectation" is reserved for that authored ledger.** The derived truth-flow layer this doctrine formerly called **"L3 Operational Expectations"** is therefore renamed **"L3 Operational Projections"** (a derived read model, unchanged in behavior). **Law 2 is rewritten accordingly** (see "The four ratified laws"). Where legacy code symbols still carry `Expectation` names (e.g. `scheduleExpectationCore.ts`, `fetchScheduleExpectations`), those are implementation identifiers and out of scope for this documentation pass; they denote L3 **Projections**.

> **Reconciliation note (2026-07, Operational Expansion Wave 1 freeze).** The frozen [`../rfcs/operational-expansion-phase1.md`](../rfcs/operational-expansion-phase1.md) ratifies the following additions to this doctrine; treat them as canonical alongside the five layers and four laws below:
> - **No sixth layer (RFC D1).** L1–L5 is sufficient; Forecasting lives in the Planning **plane** consuming L3+L4, not as a truth-flow layer.
> - **Operational Fact contract (RFC D2).** L4 fact streams conform to a domain-neutral contract (immutable/append-only, corrected-by-reference, event-emitting, provenance FK, versioned emitted event) — a contract + conformance test, not a base class or shared table.
> - **Facts vs events / per-domain storage (RFC D3).** Canonical operational facts live in **domain-owned authoritative stores**; `workflow_events` is the universal **event** log that *communicates* fact lifecycle and is **never** an authoritative fact store. No universal `operational_facts` table. Cross-domain timelines are a subject-indexed read-model projection.
> - **Consequence authority by commitment boundary (RFC D5).** L4 Facts are authoritative per their domain fact contract; L5 Consequences are authoritative only **past a domain-defined commitment boundary** (Posting for financial charges; `approved`/`committed` for others), not universally "posted." Standard vocabulary: `draft→proposed→reviewed→approved→committed→posted→voided→reversed`.
> - **Projections are governed calculations, never entities (RFC D4/D5).** Expected occupancy/staffing/variance/forecast are deterministic, registered Operational Calculations — never authoritative stored rows.
> - **Fact→Consumption trigger edge is a named, pending seam (RFC D12).** The consumption pipeline exists as a library; wiring real facts to it (correction-aware) is Implementation Wave 1 (D12a) then D12b.

---

## Why this doctrine exists

As Alloy expands from Enrollment into Scheduling, Attendance, Billing, and beyond, every new capability introduces data. The risk is that each capability invents its own notion of "truth" — its own tables, its own derivations, its own financial coupling — producing overlap, duplicate models, and drift.

This doctrine fixes the **direction truth flows** so that new capabilities emerge as coherent layers of one platform rather than competing modules. Alloy is an **Operational Execution Platform**, not CRUD-over-records: it manages operations, and operations have a lifecycle from rules, to commitments, to projections, to facts, to financial consequences.

---

## Two orthogonal axes

Alloy's operating model has **two** canonical axes. Neither replaces the other; every operational object is located on both.

| Axis | Question it answers | Canonical doc |
|------|---------------------|---------------|
| **Surface axis (planes)** | *Where does the operator stand when they act?* | [`./operational-ux-doctrine.md`](./operational-ux-doctrine.md) — Configuration / Planning / Operations / Records / Intelligence-BOS |
| **Truth-flow axis (layers)** | *What is true, and what does it derive from?* | **This doc** — Configuration → Intent → Projections → Facts → Consequences |

```mermaid
flowchart TB
  subgraph flow [Truth-flow axis - layers]
    direction TB
    L1[L1 Configuration]
    L2[L2 Operational Intent]
    L3[L3 Operational Projections - derived]
    L4[L4 Operational Facts - immutable]
    L5[L5 Operational Consequences - financial]
    L1 --> L2
    L1 --> L3
    L2 --> L3
    L2 --> L4
    L3 -.compared against.-> L4
    L4 --> L5
  end
```

**How the axes relate:** A layer is *what a thing is*; a plane is *where an operator works on it*. Example: an attendance record is **L4 (Facts)** on the truth-flow axis; an operator records it from the **Operations plane** (daily roster work unit) and reviews it from the **Records plane** (child drawer Attendance tab). The Planning plane reads L3 and L4; it never authors L4.

---

## The five layers

### L1 — Configuration

**Defines how the organization operates.** The rules operations execute against: organization, location, programs, rooms, **rate rules**, **ratio rules**, **schedule rules**, **policies**, brand, and workspace configuration.

- Authored in the Configuration plane (`/admin/settings/*`, business process builder, Experience Builder).
- **Configuration is separate from execution.** Changing config changes the rules of the game; it never rewrites operational history already recorded.
- **Compliance-bearing rules are code-owned, not JSON-owned.** Ratio rules, rate rules, and schedule rules carry legal/financial invariants. They must be **first-class configuration entities** with code enforcing their invariants — not EAV `field_values` rows or free-form JSON. (See "Config-as-first-class" below.)

Canonical homes today: `locations` (`site` / `unit`), `location_program_categories`, `option_sets`, `field_definitions`, settings four-plane.

### L2 — Operational Intent

**Records commitments.** What the organization has agreed to do: Lead, Enrollment proposal, Agreement, Placement, Schedule Assignment.

- Intent is **committed truth** — a system of record — distinct from a proposal/forecast.
- Intent already has its canonical, complete implementation for enrollment: `child_enrollment_agreements` → `child_placements` → `schedule_assignments`, created via the `approve_enrollment` handoff from the OCM enrollment proposal. See [`./placement-system.md`](./placement-system.md).
- **Proposal (intent-to-be) and committed Intent stay separate.** The OCM enrollment proposal is pre-commitment; the agreement/placement/schedule rows are the commitment. Do not collapse them.
- Every future commitment domain copies this template (own participation entity, effective-dated, provenance FKs back to its source).

### L3 — Operational Projections

**Derived projections of Intent (and Configuration).** What *should* happen if commitments hold: Expected Attendance, Expected Occupancy, Expected Staffing, Expected Ratios, Expected Tuition, Expected Subsidy, Expected Revenue. *(These "Expected X" quantities are the projected values L3 produces; the layer noun is **Projection**. Do not confuse them with the authored **Operational Expectations** ledger — see the reconciliation note above.)*

- **Projections are derived, not stored as a system of record.** They are deterministic functions of L1 + L2. They MUST NOT become authoritative tables that can silently disagree with Intent or Facts.
- **Materialization is allowed only as a non-authoritative cache** for forecasting/performance, computed from L1+L2 (and, for forecasting, L4), clearly marked non-authoritative, and always reproducible by recomputation. A materialized snapshot is never the source of truth and is never edited in place to change a projection.
- Projections consume **Intent** (you can project expected occupancy before a single attendance fact exists). Forecasting additionally consumes **Facts** to project further forward. This refines the Planning plane's "consumes operational facts" framing: Projections project commitments; forecasting projects commitments plus history.
- Projections are the **target that Facts are compared against** (e.g. expected vs actual attendance, expected vs actual ratio).

### L4 — Operational Facts

**Immutable records of what actually happened.** Attendance events, room transfers, presence events, schedule overrides, capacity changes, communication events, payment events, operational history.

- **Facts are immutable.** Never overwrite operational history. Corrections are **new effective-dated facts**, not edits-in-place. Effective-dated supersede is the universal mutation pattern (see [`../../web/lib/childcareOperational/effectiveDating.ts`](../../../web/lib/childcareOperational/effectiveDating.ts)).
- Every meaningful fact emits an event on `workflow_events` (`emitEvent` → `workflow_events` → `workflowRun`).
- Facts are recorded from the Operations plane and reviewed from the Records plane; they are authored by **Actions**, never by queue rows or projections.
- Attendance is the **keystone fact stream**: billing, ratio compliance, and forecasting all derive from it. See [`../modules/attendance-system.md`](../modules/attendance-system.md).

### L5 — Operational Consequences

**Financial and reporting outcomes derived from Facts.** Charges, Invoices, Payments, Ledger, GL, Compliance, Forecasting, Reporting.

- **Financials derive from operational facts, not from enrollment/intent directly, and not from the jobs vertical.** A child being enrolled does not create a charge; a recorded operational fact (attendance against an agreement, a scheduled service delivered) does.
- Billing must be **generalized before childcare billing is built** — charges/ledger/GL reference a billable source (enrollment agreement + attendance facts), not `job_id`. See [`../modules/billing-financials-platform.md`](../modules/billing-financials-platform.md).
- Consequences are append-oriented and auditable; corrections follow the same immutability discipline as Facts.
- **The L4 → L5 bridge is its own layer: Operational Consumption.** Facts do not become Consequences by magic. The interpretation step — *given this fact, what commercial meaning should exist?* — is named and recorded as a first-class runtime object: a **Consumption Event** resolving to zero-or-more **Resolved Obligations**, which (only when drafted) link to a draft Charge. Consumption **consumes** the Commercial Model resolver; it posts nothing and never mutates authoritative money. The trigger fact stays in `workflow_events`; the Consumption Event is the canonical runtime *contract* on which Resolution builds. See [`../modules/operational-consumption-platform.md`](../modules/operational-consumption-platform.md).

---

## The four ratified laws

1. **Complementary axes.** The truth-flow layers are orthogonal to the five planes and do not replace them. Locate every operational object on both axes.
2. **Projections are derived / non-authoritative — Expectations are authored.** L3 **Projections** are computed from L1+L2 (and L4 for forecasting); materialized snapshots are permitted only as a clearly non-authoritative, recomputable cache — never a system of record. The word **"Expectation" is reserved for the authored Operational Expectations ledger** (intended truth, "what SHOULD / WILL be"), which — like the Operational Facts ledger — **is authoritative and is not derived from any other layer** (see [`./operational-expectations-system-design.md`](./operational-expectations-system-design.md)). Never treat an L3 Projection as an Expectation, and never treat the Expectations ledger as a derived projection.
3. **Financials derive from Facts.** L5 derives from L4, never directly from enrollment/intent. Billing is generalized off the jobs vertical before any childcare billing is built.
4. **Facts are immutable + effective-dated.** L4 (and L5) never overwrite history; corrections are new effective-dated rows via the supersede pattern.

---

## Config-as-first-class (L1 decision)

**Decision (June 2026):** Rate rules, ratio rules, schedule rules, and policies are promoted from EAV (`field_values`, e.g. `license_capacity`) to **first-class configuration entities**.

Rationale: these rules carry compliance and financial invariants. Per platform guardrails, **code owns invariants**; business-critical truth must not live only in JSON config. EAV fields are acceptable for descriptive/display configuration, not for rules that gate ratio compliance, tuition computation, or schedule validity.

Scope note: this records the canonical direction. The schema/runtime implementation is sequenced in the phased plan and is **not** part of this doctrine pass.

---

## Childcare boundary rules

- **Childcare builds only on the committed enrollment foundation:** `child_enrollment_agreements`, `child_placements`, `schedule_assignments`, and the OCM enrollment proposal. New childcare operational work references these, not ad-hoc fields.
- **Job-vertical financial and schedule tables are off-limits to new childcare work:** `schedules`, `assignments`, `recurrence_plans`, `customer_subscriptions`, `placement_candidates` (waitlist grain), and job-anchored `charges` / `gl_*` are the cleaning/services vertical. Do not reuse them for childcare scheduling, attendance, or billing, and do not wrap an enrolled child in a `job`.
- **Each future module follows the namespace decision** in [`../../archive/2026-06-runtime-convergence/child_namespace_decision.md`](../../archive/2026-06-runtime-convergence/child_namespace_decision.md) §6: durable child = `child.*` / `customer_member`; module data on the module's **own** participation entity via a `{module}-child context`; never extend `inquiry_child` beyond enrollment.

---

## How a new capability maps to the layers

Every new operational capability supplies artifacts at each layer rather than a parallel application:

| Capability | L1 Config | L2 Intent | L3 Projections (derived) | L4 Facts (immutable) | L5 Consequences |
|------------|-----------|-----------|---------------------------|----------------------|-----------------|
| **Scheduling** | schedule rules | `schedule_assignments` | expected occupancy / ratio | schedule overrides | (feeds billing) |
| **Attendance** | attendance policy | (uses schedule intent) | expected attendance | attendance / presence / transfer facts | billable attendance |
| **Capacity / Ratios** | ratio + capacity rules | placement | expected ratio / fill | capacity-change facts | compliance status |
| **Billing** | rate rules | agreement terms | expected tuition / revenue | (consumes attendance facts) | charges / ledger / GL |
| **Subsidy** | subsidy rules | subsidy commitment | expected subsidy | subsidy claim facts | subsidy revenue |
| **Staffing** | staffing rules | shift assignment | expected staffing demand | shift / coverage facts | labor cost |

---

## What not to do

- Do not introduce the five layers as a *replacement* for the five planes, or refactor the plane doctrine.
- Do not give L3 Projections a system-of-record table, or edit a materialized projection snapshot to change a projection. (The authored **Operational Expectations** ledger is a separate, authoritative capability — do not conflate it with an L3 Projection.)
- Do not derive financial consequences directly from enrollment/intent, or anchor childcare billing on `job_id`.
- Do not overwrite operational facts in place; always supersede with a new effective-dated row.
- Do not reuse job-vertical schedule/financial tables for childcare, or extend `inquiry_child` to non-enrollment modules.
- Do not encode ratio/rate/schedule-rule invariants only in JSON config.

---

## Cross-references

| Concern | Doctrine |
|---------|----------|
| Surface axis (five planes, Operations/Records, tabs vs actions) | [`./operational-ux-doctrine.md`](./operational-ux-doctrine.md) |
| Committed enrollment foundation (Intent) | [`./placement-system.md`](./placement-system.md) |
| Child namespace per module (Facts/Consequences modules) | [`../../archive/2026-06-runtime-convergence/child_namespace_decision.md`](../../archive/2026-06-runtime-convergence/child_namespace_decision.md) |
| Attendance facts (keystone L4) | [`../modules/attendance-system.md`](../modules/attendance-system.md) |
| Billing generalization (L5) | [`../modules/billing-financials-platform.md`](../modules/billing-financials-platform.md) |
| Billing maturity (supplemental, current state) | [`../modules/billing-financials-platform.md`](../modules/billing-financials-platform.md) |
| Actions / event spine (how facts are authored) | [`../modules/actions-and-workflows.md`](../modules/actions-and-workflows.md) |
| Planning / analytics measurement layer | [`../modules/operational-intelligence-platform.md`](../modules/operational-intelligence-platform.md) |
| Effective-dated supersede pattern (code) | `web/lib/childcareOperational/effectiveDating.ts` |

---

## When this doc must be updated

- A new operational layer is introduced or the truth-flow ordering changes.
- The relationship between the truth-flow axis and the surface axis changes.
- The four ratified laws change (compose, projections-derived / expectations-authored, financials-from-facts, facts-immutable).
- The config-as-first-class decision is extended or revised.
