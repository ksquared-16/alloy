# Operational Grain Doctrine

> **Status:** Architecture Lock — 2026-06-30
> **Sprint:** Alloy OS — Operational Grain Doctrine (Sprint 3)
> **Supersedes:** Nothing (first canonical statement)
> **Informs:** All subsequent Focus Panel, Queue Row, Card Library, and Billing work

This document permanently eliminates grain ambiguity from Alloy's operator surfaces. Every
future card, queue surface, mutation, and status display must conform to the rules stated here.

---

## Table of Contents

1. [Operational Grain Doctrine](#1-operational-grain-doctrine)
2. [Queue Doctrine](#2-queue-doctrine)
3. [Status Doctrine](#3-status-doctrine)
4. [Placement Doctrine](#4-placement-doctrine)
5. [Card Ownership Matrix](#5-card-ownership-matrix)
6. [Editable Card Classification](#6-editable-card-classification)
7. [Billing Evolution Doctrine](#7-billing-evolution-doctrine)
8. [Recommended Changes Before Implementation Resumes](#8-recommended-changes-before-implementation-resumes)

---

## 1. Operational Grain Doctrine

### 1.1 The Three Operational Grains

Alloy's operational objects exist at exactly one of three grains. Grain is not a
presentation concern — it is a property of the underlying database row that the
runtime observes.

| Grain | Name | Representative Object | Table |
|-------|------|----------------------|-------|
| **Case** | Household / Family | Opportunity | `opportunities` |
| **Child** | Per-child enrollment within a case | Opportunity Customer Member (OCM) | `opportunity_customer_members` |
| **Candidate** | Per-child waitlist entry | Placement Candidate | `placement_candidates` |

A fourth grain — **Individual** (Person/Contact) — exists for identity but is
not an operational grain in the queue/card sense. It appears as a referenced
entity inside case-grain and child-grain surfaces, not as an independent
operational subject.

### 1.2 Grain Ownership Rules

**Rule G-1: Every operational surface has a declared grain.**
A surface cannot be grain-ambiguous. A queue is case-grain OR child-grain OR
candidate-grain. A Focus Panel is always case-grain. A card always answers
a question at the grain of its containing surface.

**Rule G-2: Grain is set at the subject, not the data.**
The grain of a surface is determined by the entity whose ID is the primary
subject (`subject.id`), not by the data fields the surface happens to display.
A case-grain card can display child-level facts (e.g., "2 children enrolled")
without becoming child-grain. The card is still answering a question about the
case.

**Rule G-3: Cross-grain reference is one-way downward.**
A case-grain surface may reference child-grain or candidate-grain facts in
aggregate or as list items. A child-grain or candidate-grain surface may
reference its parent case for navigation. Neither direction creates grain
ambiguity — the surface's own grain is fixed at its subject entity.

**Rule G-4: Mutations respect grain.**
A mutation invoked from a case-grain surface may only write to objects owned
at case grain or higher (Opportunity, Tour Booking, Scheduled Send). Writing
to child-grain objects (OCM status, placement candidate status) from a
case-grain surface is allowed only when the surface explicitly declares a
`targetChildId` or `targetCandidateId` context, and that context is visible
to the operator.

**Rule G-5: The Focus Panel is always case-grain.**
The Focus Panel opens on an Opportunity. `context.subject.id` is always an
`opportunity_id`. All Focus Panel cards answer questions at case grain, even
when they display child-level data as subordinate content.

### 1.3 Why Grain Matters Now

The previous sprints built Cards 1–8 entirely at case grain without ambiguity
because the Focus Panel only opens on Opportunities. The upcoming work on
child-grain queue rows (Enrollment Offers queue) and candidate-grain queue rows
(Waitlist queue) will introduce surfaces where the primary subject is a child
or candidate, not a case. Without a declared grain doctrine, card and mutation
implementations written for the case-grain Focus Panel would silently behave
incorrectly if reused in child-grain contexts.

---

## 2. Queue Doctrine

### 2.1 Queue Grain Declaration

Every queue has a single declared grain. The grain determines:
- What entity ID the queue row uses as its primary subject
- Which `OperationalContext` or `QueueRowOperationalContext` shape is used
- Which signals are available on queue rows in that queue
- What the Focus Panel shows when opened from that queue row

| Queue Domain | Queue Key (example) | Row Grain | Subject Entity | Focus Panel Opens On |
|---|---|---|---|---|
| Enrollment | `enrollment_new_leads` | `case` | `opportunity_id` | Opportunity |
| Enrollment | `needs_attention` | `case` | `opportunity_id` | Opportunity |
| Enrollment | `enrollment_offers` | `child` | `ocm_id` | Opportunity (child-scoped) |
| Waitlist | `enrollment_waitlist` | `candidate` | `placement_candidate_id` | Opportunity (candidate-scoped) |
| Service | `service_jobs` | `job` | `job_id` | Job (future) |

### 2.2 Queue Row Operational Context by Grain

**Case-grain rows** (`QueueRowOperationalContext` today):
- `subject.type = "opportunity"`, `subject.id = opportunity_id`
- Signals available: `attention`, `tour`, `placement`, `primaryWork`
- Communications signal: **not yet on queue row** (see §8)

**Child-grain rows** (not yet built — blocked until child-grain queue platform is defined):
- `subject.type = "opportunity_customer_member"`, `subject.id = ocm_id`
- Must also carry `caseRef.opportunityId` for cross-grain navigation
- Signals needed: `childStatus` (outcome_status_key), `childLifecycle`

**Candidate-grain rows** (not yet built — blocked until candidate queue platform is defined):
- `subject.type = "placement_candidate"`, `subject.id = candidate_id`
- Must also carry `caseRef.opportunityId` and `childRef.customerMemberId`
- Signals needed: `candidateStatus`, `placementPriority`, `siblingContext`

### 2.3 Queue Row Builder Constraint

The Queue Row Builder (Surface Library) may only configure rows for queues
whose grain is declared. A builder configuration that does not declare a grain
is invalid and must fail validation. The grain declaration is set at the queue
definition level, not at the row widget level.

### 2.4 Focus Panel Opening from Queue Rows

Regardless of queue row grain, the Focus Panel always opens on an **Opportunity**.
- From case-grain rows: `opportunityId = subject.id`
- From child-grain rows: `opportunityId = row.caseRef.opportunityId`
- From candidate-grain rows: `opportunityId = row.caseRef.opportunityId`

Child-grain and candidate-grain contexts are passed as a secondary scope hint
to the Focus Panel (e.g., `initialChildScope`, `initialCandidateScope`) so it
can pre-focus the relevant child card on open. This scope hint is a UI
affordance — it does not change the Focus Panel's grain. The panel is still
case-grain.

---

## 3. Status Doctrine

### 3.1 Status Belongs to Its Object

Every status field belongs to the object that owns it. There is no "canonical
family status" that aggregates across objects. The operator surfaces display
status fields by projection — selecting the most contextually relevant status
for the current surface, not merging them.

### 3.2 Status Field Registry

| Object | Table | Status Field | Values (key examples) | Grain | Surface Display |
|---|---|---|---|---|---|
| Opportunity | `opportunities` | `status_key` | `waitlisted`, `ready_to_enroll`, `enrolled` | Case | Focus Panel header chip; queue row status badge |
| OCM | `opportunity_customer_members` | `outcome_status_key` | (stage-specific) | Child | Child card; child-grain queue row |
| Placement Candidate | `placement_candidates` | `status` | `active`, `paused`, `withdrawn`, `placed` | Candidate | Waitlist queue row; placement card |
| Tour Booking | `tour_bookings` | `status_key` | `requested`, `pending_approval`, `confirmed`, `rescheduled`, `canceled`, `completed`, `no_show` | Case | Tour card status chip |
| Work Intent | `work_intents` | `state` | `planned`, `open`, `completed` | Case | Current Work card |
| Child Enrollment Agr. | `child_enrollment_agreements` | `status` | `offer`, `enrolled`, `active`, `discharged` | Child | (future child detail surface) |
| Customer Member | `customer_members` | `is_active` (boolean) | `true`, `false` | Individual | Household card |

### 3.3 Status Ownership Rules

**Rule S-1: Status reads are always single-object.**
No operator surface may synthesize a new status by combining two status fields.
If the UI needs a derived status (e.g., "ready to tour" = opportunity.status_key
== "waitlisted" AND no confirmed tour), that derivation lives in a named
OperationalSignal function, not inline in a component.

**Rule S-2: Status writes are always single-object.**
A mutation may only transition the status of one object per call. Multi-object
status transitions (e.g., "enroll child AND update opportunity status") are
lifecycle events — they go through the workflow engine, not direct card mutations.

**Rule S-3: Status chips on cards reflect object-specific signals.**
Each card's status chip comes from `buildXxxCardEvidence()` which reads the
relevant operational signal. No card reads a status field directly from
`context.truth` to render its chip — it always goes through the evidence
projection layer.

**Rule S-4: No synthetic status strings.**
Status values displayed to operators must trace directly to a persisted field
value or a named, tested OperationalSignal derivation. Inline string
concatenation of status hints in components is forbidden.

---

## 4. Placement Doctrine

### 4.1 Placement Grain

Placement operates at **child grain**. A `placement_candidate` row represents one
child's entry in a waitlist. A family with two waitlisted children has two
`placement_candidates`.

The placement system produces:
- A `PlacementPrioritySnapshot` per candidate (computed by the placement evaluator)
- Override records in `placement_overrides` per candidate (operator writes)
- A `QueueRowPlacementSignal` that surfaces aggregate placement context on case-grain rows

### 4.2 Placement in the Focus Panel (Case-Grain Surface)

The Focus Panel opens on an Opportunity (case grain). Placement data surfaces in
two ways:

**Aggregate placement signal** — shown on the Readiness KPI card and the queue
row placement signal. Answers: "Is this family in any placement pipeline, and
what is their aggregate priority?" Derived by taking the highest-priority
`PlacementPrioritySnapshot` across all active candidates for the opportunity.

**Per-child placement detail** — not currently in the Focus Panel card library.
This will be a child-grain card in the child-focused tier (Phase D2), or a
drilldown expansion within the Children card.

### 4.3 Placement Override Scope

Placement overrides (`placement_overrides`) are written at candidate grain.
An override to "pin" position affects one child's waitlist rank, not the
family's. The `QueueRowPlacementManualOrderControls` component already implements
this correctly — it targets a specific `placement_candidate_id`.

**The Focus Panel must not expose placement override controls at case grain.**
If an operator wants to override a child's waitlist position, they must navigate
to the candidate-grain queue (Waitlist queue) or the child-focused section of
the Focus Panel. There is no case-grain placement override.

### 4.4 Placement Signals on Queue Rows

Case-grain queue rows carry a `QueueRowPlacementSignal` that summarizes whether
any active placement exists for the family. This is a read-only projection — it
does not represent the full state of all candidates, only whether the operator
needs to know placement is relevant.

Candidate-grain queue rows carry full placement detail: rank, bucket label,
override status, sibling context. This is the canonical surface for placement
operations.

---

## 5. Card Ownership Matrix

### 5.1 Focus Panel Cards by Grain and Ownership

All Focus Panel cards are **case-grain**. The table below documents the data
grain of the facts each card displays and where mutations target.

| Card Key | Title | Data Grain | Mutation Target | Mutation Grain |
|---|---|---|---|---|
| `household` | Household | Case (contact fields) | `contacts` / `customer_members` | Case / Individual |
| `children` | Children | Child (OCM list) | None (read-only) | — |
| `current_work` | Current Work | Case (work intent) | None (read-only) | — |
| `readiness_kpi` | Readiness | Case (computed signals) | None (read-only) | — |
| `tour_summary` | Tour | Case (tour_bookings) | `tour_bookings` | Case |
| `communications` | Communications | Case (scheduled sends) | `communication_scheduled_sends` | Case |
| `billing_preview` | Billing Preview | Case (quote fields) | None (read-only, see §7) | — |
| `timeline` | Timeline | Case (event log) | None (append-only) | — |

### 5.2 Future Cards and Grain Declaration Requirement

Any new card added to the Focus Panel card library **must** declare:
1. The grain of its primary subject (`subject.id` basis)
2. The data grain of facts it displays
3. The grain of any mutation it may invoke
4. Whether the card will appear in child-grain or candidate-grain queue row
   contexts (and if so, how the subject scoping changes)

Cards that cannot answer these three questions are not ready for implementation.

### 5.3 Child-Grain Card Territory

The following are child-grain data concerns that do NOT belong on current
Focus Panel cards and must NOT be added inline:

- Individual OCM outcome status transitions (each child's enrollment decision)
- Individual placement candidate override controls
- Individual child enrollment agreement status
- Individual child attendance records

These belong on future child-grain cards, child-focused drill surfaces, or the
existing tab-pane compat layer (Phase D1 migration targets).

---

## 6. Editable Card Classification

This section formalizes the Sprint 2 audit findings as canonical platform
classification. This classification is the permanent record — it is not a
snapshot of "what's built now" but a binding declaration of what is
architecturally correct.

### 6.1 Classification Definitions

| Class | Meaning | Inline Form? | Save Path Required? |
|---|---|---|---|
| **Fully editable** | Card shows data and allows field-level edits with draft/save/error lifecycle | Yes | Yes — real persisted mutation |
| **Partially editable** | Some fields editable, others read-only | Partial | Yes — for editable fields |
| **Action-only** | No inline form; one or more discrete actions (confirm, cancel, etc.) | No | Yes — real API call per action |
| **Read-only** | No mutations; display only | No | None needed |
| **Deferred** | Mutation path does not exist yet; card is read-only until the path is built | No | None today; path identified |

### 6.2 Current Card Classifications

| Card Key | Classification | Rationale | Mutation Seam |
|---|---|---|---|
| `household` | **Fully editable** | `contacts` write path exists (`PATCH /api/admin/contacts/[id]`); draft/save/error lifecycle implemented | `mutation.savePersonContact` |
| `children` | **Read-only** | No child enrollment mutation exists at card grain (OCM status transitions are workflow steps) | None |
| `current_work` | **Read-only** | Work intent progression is lifecycle-driven (workflow engine), not operator-initiated from a card | None |
| `readiness_kpi` | **Read-only** | Computed signal; no field backing a "readiness" write path exists | None |
| `tour_summary` | **Action-only** | `tour_bookings` CRUD exists; cancel/confirm = direct API; schedule/reschedule = modal dispatch; no inline form | `mutation.tour` |
| `communications` | **Action-only** | `communication_scheduled_sends` PATCH exists; only action is cancel; no inline message composer | `mutation.communications` |
| `billing_preview` | **Deferred** | Quote fields read from `opportunities`; no billing assignment write path at opportunity level; see §7 | None until billing assignment built |
| `timeline` | **Read-only** | Append-only event log; new events created by system or workflow, not operator card actions | None |

### 6.3 Classification Upgrade Path

A card's classification may be upgraded (read-only → action-only → editable)
only when:
1. The server-side mutation route exists and is tested
2. The `FocusPanelMutation` seam is extended with the new mutation type
3. The card uses the canonical lifecycle (busy/error/justActed for action-only;
   `useEditableCardRuntime` for editable)
4. The classification table above is updated in this document

Cards may not "optimistically" implement forms or actions ahead of the mutation
route existing. No fake saves. No swallowed errors.

---

## 7. Billing Evolution Doctrine

### 7.1 Why Billing Preview Is Read-Only Today

The `billing_preview` card displays:
- Quoted total (`quote_total`)
- Quoted subtotal (`quote_subtotal`)
- Override flag (`quote_is_overridden`)
- Price breakdown (structured field on `opportunities`)

These are **read from** the opportunity record. No server-side route currently
exists to write billing configuration assignment at the opportunity level from
an operator card. The closest write path is through the enrollment workflow
(quote generation / financial configuration steps), which is a multi-step
process not reducible to a card action.

### 7.2 The Correct Evolution Path

Billing in Alloy follows a two-layer model:
- **Configuration layer** — tuition grids, schedule rates, fee structures;
  defined at the program/location level in the commercial configuration
- **Assignment layer** — binding a specific offering to an opportunity; this
  creates the quote and locks the financial terms for the family

The `billing_preview` card may become an **action-only** card once:
1. The billing assignment write path is built (`POST /api/admin/opportunities/[id]/billing-assignment`)
2. A billing configuration modal exists (analogous to the tour-schedule modal for Tour)
3. The `FocusPanelMutation` seam gains a `billing` sub-object with
   `openBillingAssignmentModal` and optionally `clearBillingAssignment`

### 7.3 What Must Not Happen

**The billing preview card must not become a mini-pricing editor.** Inline editing
of tuition rates, fee structures, or discount amounts is not a card-level concern.
That belongs in the financial configuration workspace. The card's future action
is: "Configure billing" → opens modal → operator selects offering → modal saves →
card refreshes.

**Quote override (`quote_is_overridden`) must not become an inline toggle.** Quote
overrides are a financial record with audit implications. Even once the billing
assignment path is built, override authority requires a separate write path with
explicit operator intent.

### 7.4 Billing Signal Expansion

The current `OperationalContext` has no dedicated billing signal. When the
assignment path is built, a new `OperationalBillingSignal` should be added to
`operationalContext/types.ts`:

```typescript
export type OperationalBillingSignal = {
    hasAssignment: boolean;
    offeringLabel: string | null;
    quoteTotal: number | null;
    quoteCurrency: string | null;
    isOverridden: boolean;
};
```

The `billing_preview` card evidence builder should project from this signal,
not from raw `context.truth` fields.

---

## 8. Recommended Changes Before Implementation Resumes

These are the minimum platform changes required before Cards 9+, child-grain
queue rows, or billing assignment work begins. They are not cosmetic. Each one
prevents a specific category of silent error.

### 8.1 Declare Grain on OperationalContext [Priority: High]

**Problem:** `OperationalContext` has no grain field. When the platform later
supports child-grain or candidate-grain contexts (e.g., for child-focused focus
panels opened from child-grain queue rows), code that assumes
`context.subject.id` is an `opportunity_id` will silently behave incorrectly.

**Recommendation:** Add a `grain` field to `OperationalContext`:

```typescript
export type OperationalContext = {
    grain: "case" | "child" | "candidate";
    subject: OperationalSubjectRef;
    truth: Record<string, unknown>;
    signals: OperationalSignals;
    status: "loading" | "ready" | "error";
};
```

All existing code sets `grain: "case"`. Child-grain contexts (future) set
`grain: "child"` and `subject.type = "opportunity_customer_member"`.

The Focus Panel type contract then becomes:
```typescript
// FocusPanelCardRenderer — all cards must receive case-grain context
assert(context.grain === "case");
```

### 8.2 Declare Grain on QueueRowSubjectRef [Priority: High]

**Problem:** `QueueRowSubjectRef` has `type: "opportunity" | "placement_candidate"`
but no explicit grain field. The type already implies grain, but the surface
runtime has no way to assert grain without inspecting the type string.

**Recommendation:** Add `grain` to `QueueRowSubjectRef`:

```typescript
export type QueueRowSubjectRef = {
    type: "opportunity" | "opportunity_customer_member" | "placement_candidate";
    grain: "case" | "child" | "candidate";
    id: string;
    label: string;
    caseRef?: { opportunityId: string };   // required when grain !== "case"
    childRef?: { customerMemberId: string }; // required when grain === "candidate"
};
```

### 8.3 Add Communications Signal to QueueRowSignals [Priority: Medium]

**Problem:** `QueueRowSignals` has `attention`, `tour`, and `placement` signals
but no `communications` signal. Queue rows cannot display scheduled-send counts
or next follow-up dates without it. This creates an asymmetry between the Focus
Panel (which has `context.signals.communications`) and queue rows (which don't).

**Recommendation:** Add `communications: OperationalCommunicationsSignal | null`
to `QueueRowSignals`, and extend `buildQueueRowOperationalContext` to project it
from the composed record (same pattern as `buildTourSignal`).

The communications signal projection reads from `_scheduled_sends_summary` or
the equivalent composed field on the queue row record.

### 8.4 Add Evidence Builder for Billing Signal [Priority: Medium — before billing work]

**Problem:** The `billing_preview` card currently reads billing facts directly
from `context.truth` fields in its evidence builder. This bypasses the
OperationalSignal layer that all other cards use.

**Recommendation:** Before any billing mutation work begins:
1. Add `OperationalBillingSignal` to `operationalContext/types.ts` (see §7.4)
2. Add `billing: OperationalBillingSignal` to `OperationalSignals`
3. Add `buildBillingSignal()` to `buildOperationalContext.ts`
4. Update `buildBillingPreviewCardEvidence()` to read from
   `context.signals.billing` instead of `context.truth`

This does not require any new mutation routes — it is a read-path cleanup that
makes the billing card consistent with all other cards.

### 8.5 Annotate FocusPanelCardKey with Grain [Priority: Low — before Cards 9+]

**Problem:** The `FocusPanelCardKey` union is a flat list of 21 strings. When
child-grain or candidate-grain cards are added in the future, nothing in the
type system prevents them from being rendered in a case-grain Focus Panel.

**Recommendation:** Add a JSDoc annotation (not a runtime type) to each card
key declaring its required grain. This is a documentation-level guardrail:

```typescript
/** @grain case — requires OperationalContext with grain === "case" */
"household" |
/** @grain case */
"tour_summary" |
// ... etc
/** @grain child — requires OperationalContext with grain === "child" */
"child_enrollment_detail" |  // (future)
```

When the platform builds child-grain cards, the grain assertion in the renderer
enforces the rule at runtime.

### 8.6 Define Child-Grain Queue Row Platform Before Building Enrollment Offers Queue [Priority: High — before child-grain queues]

**Problem:** The `enrollment_offers` queue is intended to be child-grain (one
row per OCM). The current `QueueRowOperationalContext` architecture was built
for case-grain rows and does not declare child-grain subject semantics.

**Recommendation:** Before building any child-grain queue surface:
1. Complete §8.1 (grain on OperationalContext)
2. Complete §8.2 (grain on QueueRowSubjectRef)
3. Define `buildChildGrainQueueRowOperationalContext()` as a parallel to
   `buildQueueRowOperationalContext()` but with:
   - `subject.grain = "child"`
   - `subject.type = "opportunity_customer_member"`
   - `subject.caseRef.opportunityId` populated
   - Signals limited to child-relevant signals (no tour signal, no
     communications signal — those belong on the case)
4. Define the child-grain version of `QueueRowSignals` (a subset)

This work is blocked until §8.1 and §8.2 are done — attempting child-grain
queue rows without grain declarations will produce ambiguous code.

---

## Grain Decision Tree

When building any new operational surface, answer these questions in order:

```
1. What is the primary subject? (opportunity / ocm / placement_candidate / person)
   └─ This determines the grain.

2. Is this surface in the Focus Panel?
   └─ Yes → grain MUST be "case"; subject MUST be opportunity_id
   └─ No  → declare grain explicitly in the queue definition

3. Does the surface need to mutate data?
   └─ No  → read-only card; no mutation seam needed
   └─ Yes → identify the exact table, route, and grain of the mutation
            → does the route exist today?
               └─ No  → card is "deferred"; do not implement mutation
               └─ Yes → extend FocusPanelMutation with the new sub-type

4. Does the mutation cross grain boundaries?
   └─ No  → proceed
   └─ Yes → requires explicit targetChildId / targetCandidateId in the
             mutation call; this must be visible to the operator in the UI
```

---

*This document is the authoritative grain reference for all Alloy OS operator
surface work. Conflicts between this document and ad-hoc implementation
decisions are resolved in favor of this document. Implementation that conflicts
with these rules should be surfaced in PR review, not merged.*
