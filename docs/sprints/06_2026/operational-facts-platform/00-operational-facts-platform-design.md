# Operational Facts — Platform Design & Convergence Analysis

**Status:** Design sprint (June 2026). **No implementation authorized.** Discovery + doctrine.
**Question this answers:** *Does Alloy need a new "Operational Facts" platform, or does it already exist under other names?*

---

## BLUF — the verdict

**Operational Facts already exists.** It is not missing infrastructure; it is **missing governance**.

Alloy already has:

- a canonical, append-only fact spine — **`workflow_events`** written through **`emitEvent()`**;
- a (partially) governed vocabulary — **`docs/platform/foundation/platform-event-catalog.md`**;
- multiple purpose-built, hardened fact streams — **`child_attendance_events`** (literally named `…childcare_attendance_facts_p2.sql`), `communication_delivery_events`, `conversation_assignment_events`, `sla_events`, `communication_preference_events`, `form_submission_signatures`, `ledger_transactions`, `gl_journal_lines`, the `agent_*_apply_audit` tables;
- a legacy parallel audit spine — **`activity_log`**;
- a working consumer/projection — the **Activity Timeline** (`resolveLayoutRuntimeActivityTimeline.ts`), which already turns facts into operator-facing categories;
- downstream consumers — **OIP / Operational Calculations** (metrics), **Workflows** (event-triggered), and **BOS** (planned).

**Recommendation: converge, do not build.** Operational Facts should become a **governance + descriptor + registry layer** over the existing spine — the exact mirror of how Operational Calculations governs OIP. It should be promoted to a canonical **foundation** doctrine that **absorbs and supersedes** `platform-event-catalog.md`. It must **not** become a new event bus, a new store, or an event-sourcing engine.

> Answering the sprint's explicit question — *governance layer, descriptor layer, registry, projection, or something else?* — Operational Facts is **a governance + descriptor + registry layer over an existing event spine, with one already-built projection (the Activity Timeline).** It is not "something else entirely."

What is genuinely missing is small and high-leverage: a **typed Fact registry**, **first-class governance fields** (actor, confidence, visibility, version), a **convergence of the two audit spines**, and a **consistency rule** for which mutable state machines must also emit facts. None of that is a new subsystem.

---

## 1. Operational Facts doctrine

### 1.1 Definition

A **Fact** is a durable, immutable statement that something operationally meaningful occurred.

A Fact is **not** a metric, a report, a dashboard, a workflow, or a calculation. Those consume Facts.

```
Platform Events (emission)
  → Operational Facts (durable, governed record of what occurred)
      → Operational Calculations (trusted measurement, per operational-calculations.md)
          → Analytics (presentation)
          → Optimization (constraint diagnosis)
      → Workflows (event-triggered automation)
      → Activity Timeline (operator narrative)
  → BOS (consumes facts + calculations)
```

### 1.2 First principles (and the one that governs everything)

1. **Facts are immutable.** A correction is a *new* fact that references the prior one — never an in-place edit. (`child_attendance_events.entry_type ∈ {original, correction, reversal}` + `corrects_event_id` is the reference implementation.)
2. **Facts are append-only and server-authored.** `emitEvent()` is service-role only; no client writes.
3. **Facts carry provenance.** Who (actor), what (event_type), when (occurred_at), about-what (entity/subject), from-where (source), with-what (attributes).
4. **THE HYBRID RULE — Facts do not replace authoritative entity state.** Alloy is deliberately **not** event-sourced. Current state lives in entity tables (`tour_bookings.status_key`, `opportunities.status_key`); Facts record *that a transition happened*. Calculations read **whichever is authoritative for the question** — entity-state truth where it exists (e.g. tour conversion reads `tour_bookings` to avoid double-counting reschedules), the fact stream where history/timing is the question. **A naïve "every calculation replays the fact ledger" design would regress correctness.** This rule is the core of the doctrine.
5. **One vocabulary, many emitters.** Every durable `event_type` is governed in one registry. No private event taxonomies.
6. **Facts are consumed, never owned downstream.** Calculations, Analytics, Workflows, BOS, and AI consume facts; none redefine them.

### 1.3 Why this is governance, not engineering

The spine, the streams, the projection, and the consumers already exist and work. What does not exist is the *contract discipline*: a typed registry, declared consumers, first-class provenance, and a single audit spine. That is identical in shape to the Operational Calculations problem — and the same solution applies.

---

## 2. Platform audit (what already exists)

Grounded in a full code + migration audit (June 2026). Three classes emerged.

### 2.1 The fact spine

| Mechanism | Shape | Immutable? | Provenance | Path |
|---|---|---|---|---|
| **`workflow_events`** | `org_id, event_type, entity_type, entity_id, action_type, payload (jsonb), occurred_at, created_at` | Append-only (no update/delete paths) | actor in `payload.actor_user_id`; occurred_at column | `web/lib/emitEvent.ts`; `supabase/migrations/…remote_schema.sql` |
| **`platform-event-catalog.md`** | Governed vocabulary (incremental) | — | — | `docs/platform/foundation/platform-event-catalog.md` |
| Emit helpers | `emitStatusChangedEvent`, `withActionExecutedEmit`, tour/forms/enrollment emitters | — | — | `web/lib/admin/emitStatusChangedEvent.ts`, `web/lib/admin/actions/executeAdminAction.ts`, … |

### 2.2 Purpose-built fact streams (already append-only, already provenanced)

| Stream | Provenance quality | Append-only enforcement | Path |
|---|---|---|---|
| **`child_attendance_events`** | **Best-in-class** — `actor_type/user_id/person_id/label`, `source_type`, `event_at`, correction/reversal lineage | **DB trigger blocks UPDATE/DELETE** | `…_childcare_attendance_facts_p2.sql` |
| `communication_delivery_events` | event_type, occurred_at, message_id | App + RLS (service-role) | `…comms_v2_delivery_events_receipts.sql` |
| `conversation_assignment_events` | actor_user_id, occurred_at, thread_id | App-enforced | `…comms_v2_conversation_core.sql` |
| `sla_events`, `communication_preference_events` | occurred_at (+ actor on preferences) | App-enforced | `…comms_v2_*.sql` |
| `form_submission_signatures` | signer_acknowledged_at, ip_hash | Immutable | `…forms_engine_v1_foundation.sql` |
| `ledger_transactions`, `gl_journal_lines` | transaction_date, source_entity, created_by | Append-only (accounting) | remote schema + P3.1 |
| `agent_v0/v1/v2_apply_audit` | user_id, created_at, terminal_status | Insert-only | `…agent_v*_audit.sql` |

### 2.3 Mutable state machines (facts implicit in status, not always emitted)

| Entity | "Fact" today | Emits a durable fact? |
|---|---|---|
| `tour_bookings` | `status_key = completed/no_show/...` | Catalog defines `tour_completed` etc.; **emission partial** |
| `operational_tasks` | `status = completed` (no `completion_at`) | `operational_task_completed` **planned** |
| `payments`, `charges`, `payment_allocations` | status transitions in place | Ledger facts append-only; status changes mutate |
| `form_submissions`, `form_packet_sessions` | status transitions (payload frozen post-submit) | `form_submitted` etc. emitted |
| `opportunities.status_key`, `opportunity_customer_members.outcome_status_key` | current value only | History via `workflow_events` (`*_status_changed`) |

### 2.4 Consumers / projections (already wired)

| Consumer | Reads | Path |
|---|---|---|
| **Activity Timeline** (operator narrative) | `workflow_events` → categorized rows | `web/lib/layout/runtime/resolveLayoutRuntimeActivityTimeline.ts` |
| **OIP / Operational Calculations** | `workflow_events` **+ entity tables** (hybrid) | `web/lib/metrics/resolvers/*` |
| **Workflows** | `workflow_events` → `workflow_runs` | `workflow_run_events` view |
| **BOS** | facts + calculations (planned) | `docs/product/bos-foundation.md` |

### 2.5 The two real defects

1. **Fragmented vocabulary.** Durable `event_type` strings live in at least: `web/lib/events.ts` (legacy field-service: `job_completed`, `payment_succeeded`), `web/lib/workflowVocab.ts`, `web/lib/tours/constants.ts`, `web/lib/communications/v2/deliveryEvents.ts`, `web/lib/forms/workflow/intakeCaseLifecycleEvents.ts`, `web/lib/childcareOperational/operationalEnrollmentEvents.ts` — plus a catalog that admits it is incomplete. **No single typed registry; the `workflow_events.event_type` column is untyped text.**
2. **Two audit spines.** `workflow_events` (modern) and `activity_log` (legacy: `action, actor_type, actor_id, diff`). Convergence needed.

Plus one genuine **data** gap (not governance): **staff/labor facts do not exist** (`staff_data_unavailable`); "Staff Clocked In" has no table.

---

## 3. Canonical Fact model

The model **is** the `workflow_events` row, elevated with governance fields. The reference stream `child_attendance_events` already proves every field below is implementable.

| Fact field | Today | Source / gap |
|---|---|---|
| **Fact Key** | `event_type` (untyped text) | → typed registry key |
| **Business Process** | implied by pack/domain | → declared in registry |
| **Entity** | `entity_type` | present |
| **Subject** | `entity_id` | present |
| **Occurred At** | `occurred_at` | present |
| **Actor** | `payload.actor_user_id` | **gap** → first-class (attendance already first-class) |
| **Source** | `action_type` / `payload.source` | partial → standardize `source_type` |
| **Attributes** | `payload` (jsonb) | present; → code-validated per key |
| **Confidence** | `payload.intake_confidence` (forms only) | **gap** → first-class optional (AI/derived facts) |
| **Version** | `payload.schema_version` | partial → governed per key |
| **Visibility** | none | **gap** → first-class (operator / portal / internal) |
| **Consumers** | undocumented | **gap** → declared in registry |

**Confidence and Visibility are not new columns to add blindly** — they belong in the *descriptor* and, where needed, in `payload` with a validated schema. The spine table need not change for v1; the registry governs interpretation. (Forms intake already carries `intake_confidence`; this generalizes it.)

---

## 4. Lifecycle

| Phase | Rule | Existing mechanism |
|---|---|---|
| **Creation** | Server-authored via `emitEvent()` / domain emitter; never client | `emitEvent.ts` |
| **Storage** | Append-only; immutable | `workflow_events`, hardened streams |
| **Correction** | New fact referencing prior (`corrects_event_id`); original untouched | `child_attendance_events` pattern → generalize |
| **Consumption** | By key, at a grain; hybrid rule applies | OIP resolvers, timeline |
| **Versioning** | `schema_version` per key; semantic change bumps it | catalog note (`schema_version: 1`) |
| **Replay** | For derived projections (timeline, snapshots), **not** to override authoritative entity state | timeline computes at query time |
| **Auditing** | The fact stream *is* the audit log | `workflow_events` = "audit + workflow trigger spine" |
| **Retention / archival** | Governed per business process; facts are durable by default | (policy gap — define per pack) |
| **Deletion** | Effectively never; legal-hold/PII redaction is a payload concern, not row deletion | — |

---

## 5. Registry design

Mirror the Operational Calculation Registry exactly. A `FactDefinition` is a **declarative descriptor** that wraps an `event_type` with governance metadata — it does **not** emit or store.

```
web/lib/facts/
  types.ts        ← FactDefinition descriptor type
  registry.ts     ← FACT_DEFINITIONS: Record<FactKey, FactDefinition>
```

Design shape (illustrative — **not** for implementation this sprint):

```typescript
type FactDefinition = {
  key: string;                 // canonical event_type (typed)
  businessProcess: string;     // enrollment | attendance | billing | communications | …
  entity: string;              // entity_type
  questionItAnswers: string;   // "A scheduled tour took place"
  occurredAtSemantics: string; // event_at vs recorded_at
  actorModel: "user" | "system" | "external" | "mixed";
  source: string[];            // emitters / source_type values
  attributesSchemaVersion: number;
  confidence: "always_certain" | "scored";   // AI/derived → scored
  visibility: "internal" | "operator" | "portal";
  immutability: "hardened" | "append_only" | "status_machine_mirror";
  stream: "workflow_events" | string;          // dedicated table if not the spine
  consumers: Array<"calculations" | "analytics" | "workflows" | "timeline" | "bos" | "ai">;
  version: number;
  status: "active" | "planned" | "deprecated";
};
```

The registry's first job is **reconciliation**: ingest every `event_type` string scattered across `events.ts`, `workflowVocab.ts`, the per-domain constants, and the catalog, and produce one typed source of truth. `workflow_events.event_type` then validates against it.

---

## 6. Relationships (ownership map)

```
                 ┌─────────────────────────────────────────────┐
   EMISSION      │ Domain code: tours, forms, enrollment,       │
                 │ comms, attendance, actions, status changes   │
                 └───────────────────────┬─────────────────────┘
                                         │ emitEvent() / dedicated stream
                                         ▼
   FACTS         ┌─────────────────────────────────────────────┐
   (governed)    │ workflow_events  +  hardened streams         │  ◀── Fact Registry (NEW: governance)
                 │ (attendance, delivery, sla, ledger, …)       │      absorbs platform-event-catalog.md
                 └───┬───────────────┬──────────────────┬───────┘
                     │               │                  │
        ┌────────────▼───┐   ┌───────▼────────┐   ┌─────▼─────────┐
   CONSUME │ Operational │   │ Workflows      │   │ Activity      │
        │ Calculations  │   │ (event-trigger)│   │ Timeline      │
        │ (+ entity     │   └────────────────┘   │ (projection)  │
        │  state, hybrid)│                        └───────────────┘
        └───────┬────────┘
                ▼
           Analytics ──► Optimization
                │
                ▼
               BOS  ◀──────────────── (also reads Facts directly)
```

**Ownership (no duplication):**

| Concept | Owner | Not owned by |
|---|---|---|
| Emission semantics | Domain code | Facts layer |
| Durable record + vocabulary | **Operational Facts** (registry over `workflow_events` + streams) | Calculations, Analytics |
| Measurement | Operational Calculations (OIP) | Facts, Analytics |
| Presentation | Analytics | Calculations |
| Automation | Workflows | Facts |
| Reasoning/recommendation | BOS / AI | Facts, Calculations |

Platform Events vs Operational Facts: **same thing, two names today.** "Platform Events" is the emission verb (`emitEvent`); "Operational Facts" is the governed noun (the durable record). The doctrine unifies them — Operational Facts *is* the governance of Platform Events.

---

## 7. Worked examples (Record → Fact → Calculation → Analytics → Action → Outcome)

**Enrollment**
`opportunities` row → status change emits `opportunity_status_changed` fact (`emitStatusChangedEvent`) → `enrollment.lead_count` / funnel calculation → Analytics funnel → drill to stage queue (DrillResolver) → operator acts → new status fact. *Authoritative state = `opportunities.status_key`; facts give timing/history.*

**Attendance**
Operator/parent check-in → **`child_attendance_events`** fact (hardened, with actor + correction lineage) → ratio/occupancy calculation (`actualCompliance.ts`, `attendanceFold.ts`) → Optimization Center "rooms in breach" → reassign-staff workflow → re-measured compliance. *Reference implementation of the whole doctrine.*

**Billing**
Backend posts charge → `charges`/`ledger_transactions` (append-only GL facts) → AR/revenue calculation (future financial adapter) → Financial Report surface → collections workflow → payment fact. *GL is already immutable facts; the `charges` status machine should mirror posting as a fact.*

**Scheduling (tours)**
Tour request → `tour_bookings` row + `tour_requested/confirmed/completed` facts → `tour_conversion_rate` calculation (reads `tour_bookings` state, **not** replayed facts — hybrid rule) → Diagnostic surface → follow-up workflow. *Shows why hybrid matters: replaying reschedule facts would double-count.*

**Communications**
Send → `communication_messages` + `communication_delivery_events` (append-only) → `comms.delivery_rate` / `reply_rate` → Analytics → (no dead-end: exploratory) . *Delivery events are already a model fact stream.*

**Processing (POS)**
Form/intake submitted → `intake_case_*` facts (in `workflow_events`) → **`processing_cases`** envelope consumes/projects state (it is a **consumer**, not an emitter) → operator resolves → outcome stored in `processing_cases.metadata`. *Confirms Processing is a projection over facts, not a parallel event system.*

---

## 8. Runtime convergence analysis

| Capability | Status | Evidence |
|---|---|---|
| Append-only fact spine | **Exists** | `workflow_events` + `emitEvent` |
| Hardened fact stream pattern | **Exists (best-in-class)** | `child_attendance_events` |
| Domain fact streams | **Exists** | delivery/sla/assignment/preference/signature/ledger/agent-audit |
| Governed vocabulary | **Partial** | `platform-event-catalog.md` (incremental) |
| Typed Fact registry | **Missing** | scattered constants; untyped `event_type` |
| First-class actor/confidence/visibility | **Partial** | attendance has actor; spine puts actor in payload |
| Fact projection (operator) | **Exists** | Activity Timeline |
| Calculation consumption | **Exists** | OIP resolvers (hybrid) |
| Workflow consumption | **Exists** | `workflow_runs` / `workflow_run_events` |
| Audit-spine unification | **Missing** | `workflow_events` vs legacy `activity_log` |
| Status-machine → fact consistency | **Partial** | several catalog entries "planned" |
| Staff/labor facts | **Missing (data gap)** | `staff_data_unavailable` |

**How much already exists: ~80–85%.** The remaining work is governance + a handful of consistency emissions + one genuine data gap (labor). **No new engine, bus, or store is required.**

**Reuse, never duplicate:** `emitEvent`, `workflow_events`, the hardened-stream pattern, the catalog, the Activity Timeline projection, OIP resolvers. **Never build:** a second event bus, an event-sourcing rehydration engine, a parallel store, or per-domain private vocabularies.

---

## 9. Recommended roadmap (governance, not implementation — sequenced for a later sprint)

- **F0 — Promote the doctrine.** Adopt this document; promote a canonical `docs/platform/foundation/operational-facts.md` that **absorbs and supersedes** `platform-event-catalog.md`. Decide that "Operational Facts" is the governing noun for "Platform Events."
- **F1 — Typed Fact Registry.** Reconcile every `event_type` string into `web/lib/facts/registry.ts` (descriptor-only, wraps existing keys, declares consumers). Validate `workflow_events.event_type` against it. Mirror of the Operational Calculation Registry.
- **F2 — Provenance hardening.** Promote `actor`/`source` toward first-class on the spine (or enforce in a validated payload contract); generalize `confidence` and add `visibility` to the descriptor.
- **F3 — Consistency emissions.** Ensure mutable state machines that the catalog already names (`tour_completed`, `operational_task_completed`, payment posting) reliably emit their fact. No new tables — emit on transition.
- **F4 — Audit-spine convergence.** Migrate/retire legacy `activity_log` onto the `workflow_events` spine (or formally scope it).
- **F5 — Labor facts (data gap).** Design a `staff_attendance_events` stream modeled on `child_attendance_events` to close `staff_data_unavailable`. *This is the only net-new table, and only because the data genuinely does not exist.*

Each step is independently shippable and reversible. None introduces a parallel subsystem.

---

## 10. Risks

| Risk | Mitigation |
|---|---|
| **Event-sourcing temptation** — treating Facts as the single ledger every calculation replays | Doctrine §1.2 rule 4: hybrid; calculations read authoritative entity state where it exists. Tour conversion is the canonical cautionary case. |
| **Building a new bus/store** | Constraint: reuse `workflow_events` + `emitEvent`; the registry is descriptor-only. |
| **Registry drift from OIP-style governance** | Reuse the exact Operational Calculation Registry pattern; integrity tests assert every fact key is real and consumers are declared. |
| **Provenance migration churn** | Keep the spine table stable; govern via descriptor + validated payload first; promote columns only if needed. |
| **Two audit spines linger** | F4 explicitly scopes/retires `activity_log`. |
| **Scope creep into PII/retention law** | Treat redaction as a payload concern; never delete fact rows; define retention per business process. |
| **Over-documentation** — a doctrine nobody enforces | Tie the registry to a lint/test (like calculations), so an ungoverned `event_type` fails CI. |

---

## Appendix — Should this be a core platform document?

**Yes — as a foundation/governance doctrine, by convergence.** It earns a place alongside Entity Model, Business Processes, Processing, Actions & Workflows, Communications, AI Platform, and Operational Calculations — **not** as a new system, but as the doctrine that names and governs the fact spine those systems already emit into and consume from. The honest framing on its first line must be: *"This formalizes and governs an existing spine (`workflow_events` + `emitEvent` + the hardened streams). It is not a new subsystem."* — the same opening as `operational-calculations.md`.

If, in review, the conclusion is that governing the catalog in place is enough, the correct outcome is to **expand `platform-event-catalog.md` into the governance doctrine** rather than create a second document. Either way: **converge, don't add a layer.**
