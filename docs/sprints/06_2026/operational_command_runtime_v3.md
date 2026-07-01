# Operational Command Runtime V3 — Intent, Flows, and Operator Experience

**Status:** Architecture + doctrine sprint (June 2026). Design and reusable patterns only —
no feature UI, no new product commands implemented.

**Builds on:** the V2 runtime (registered capabilities, placements, context resolution,
required subjects, eligibility, preview, execution, audit, refresh).

**Followed by (V4):** Create Lead becomes the first operator-visible command flow built on
this model — see `create_lead_command_flow_audit.md`. The V4 view-model
(`createLeadCommandModel.ts`) is a read-only layer over this runtime; manual UI and BOS share
it and both execute through the one registered `create_lead` action.

**Code anchors:**
- `web/lib/adminV2/actions/operationalIntent.ts` — Operational Intent layer
- `web/lib/adminV2/actions/invocationContext.ts` — Context Resolution + Required Subject
- `web/lib/adminV2/actions/commandFlow.ts` — reusable Flow Stage model
- `web/lib/adminV2/actions/commandState.ts` — operator-facing command states
- `web/lib/adminV2/actions/actionExecutor.ts` — the one execution runtime

> **Objective:** an operator should never feel like they're executing a database operation.
> They should feel like they're completing operational work.

---

## 1. The product shift

We are no longer designing an Actions system. We are designing an **Operational Command
Runtime**. Operators think in **intent** ("move this family forward", "schedule a tour"),
not **capability** (`update_status`, `schedule_tour`). The runtime bridges intent → safe
execution and never exposes implementation detail.

---

## 2. Canonical lifecycle (one lifecycle, no exceptions)

```
Operator Intent
  ↓
Registered Capability
  ↓
Placement
  ↓
Context Resolution
  ↓
Eligibility
  ↓
Required Subjects
  ↓
Required Inputs
  ↓
Preview
  ↓
Confirmation
  ↓
Execution
  ↓
Audit
  ↓
Refresh
```

Every command — current or future — follows this. If a command needs an exception, we
improve the runtime, not add a branch.

---

## 3. Operational Intent vs Operational Capability

| | Intent (human) | Capability (technical) |
|---|---|---|
| Owns | operator vocabulary | executable handler |
| Example | "Schedule Tour" | `schedule_tour` |
| Example | "Move Forward" | `update_status` |
| Example | "Enroll Child" | `assign_room` + `create_contract` + `generate_documents` + … |

`OperationalIntent` = `intentKey`, `title`, `description`, `defaultCapability`,
`supportedCapabilities`, `supportedSubjects`, `supportedProcesses`, `maturity`.

One intent may fan out to several capabilities. The operator sees only the intent.

---

## 4. Flow stages (reusable composition)

A command is a guided flow composed from reusable stages
(`commandFlow.ts` → `buildCommandFlow`):

```
resolve_context → resolve_subject → resolve_required_inputs → resolve_constraints
  → preview → confirm → execute → success
```

Not every command uses every stage; every stage is reusable. The **runtime** decides the
current stage from the resolved snapshot — the **UI** renders what the runtime points to.

The same command from a richer entry point simply has more stages already complete:

| Entry point | resolve_subject | resolve_required_inputs | first open stage |
|---|---|---|---|
| Work Unit | open (choose family) | pending | **resolve_subject** |
| Focus Panel | complete (current record) | open | **resolve_required_inputs** |
| BOS | complete | complete (conversational) | **preview** |
| BOS (fully resolved) | complete | complete | **execute** |

The runtime is identical; only the amount of pre-resolved context differs.

---

## 5. Required Subjects vs Required Inputs

- **Subject** — *who/what does this affect?* (`RequiredSubject`: none, opportunity, person, child, case, multiple_opportunities)
- **Input** — *what information is still needed?* (`ActionRequiredInput`)

| Command | Subject | Inputs |
|---|---|---|
| Schedule Tour | opportunity | date, time, calendar, duration |
| Create Lead | none | family information |
| Generate Invoice | case (enrollment) | billing period, invoice date |
| Assign Room | child | room, effective date |

A subject is resolved by **context** (current record / selection / proposal); an input is
collected during **resolve_required_inputs**. They are distinct runtime concepts.

---

## 6. Operator experience (state model)

`commandState.ts` → `describeCommandState`. Operators see decisions, never raw runtime
concepts or stack traces.

| State | Operator copy |
|---|---|
| available | "This command is ready." |
| needs_subject | "Choose a family." |
| needs_required_input | "Missing child date of birth." |
| disabled_blocked | "This family cannot move to Enrolled because the enrollment agreement has not been signed." |
| confirmation_required | "Review changes." |
| executing | "Scheduling tour…" |
| success | "Tour scheduled." |
| failure | recovery copy (`operatorErrorCopy`) |

`buildCommandFlow` returns the operator `state` + `message` alongside the stage statuses, so
every surface renders the same experience.

---

## 7. BOS as an entry point (progressive stage removal)

BOS is **not** a separate runtime — it is a placement that arrives with more context
resolved, so fewer stages remain:

```
Manual:       resolve_subject → resolve_inputs → preview → execute
Focus Panel:                    resolve_inputs → preview → execute
BOS:                                              preview → execute
BOS (resolved):                                             execute
```

The runtime is identical at every level. BOS context resolution = `bos_proposal`; the
operator still confirms unless the command's confirmation policy is `none`.

---

## 8. UI surfaces — how each enters the runtime

Surfaces never decide behavior; they supply *known context* and the runtime determines the
remaining work via `resolveCommandContext` + `buildCommandFlow`.

| Surface | Known context | Known subject | Known inputs | Remaining work |
|---|---|---|---|---|
| Work Unit Command | work unit, process | none | none | subject → inputs → preview → confirm → execute |
| Focus Panel Manage | work unit, process, record | current record | none | inputs → preview → confirm → execute |
| Queue Row | work unit, process, row record | row record | none | inputs → preview → confirm → execute |
| BOS | conversational | proposed | proposed | preview → execute |
| Automation / Workflow | event context | event subject | event payload | eligibility → execute (no operator) |
| API | request context | request subject | request payload | eligibility → execute |

---

## 9. Validation — current commands (no special cases)

The runtime models all six current commands purely through capability + placement + context
resolution + flow; none require a branch:

| Command | Subject | Context (Work Unit / Focus Panel) | Notes |
|---|---|---|---|
| create_lead | none | open / open | capture-first; subject stage skipped |
| update_status | opportunity | user_selection / current_record | transitions via eligibility |
| schedule_tour | opportunity | user_selection / current_record | inputs: date/time/calendar |
| confirm_tour | opportunity | user_selection / current_record | registered; delegates to executor |
| send_message | opportunity/person | user_selection / current_record | input: message/channel |
| generate_document | opportunity/child/case | user_selection / current_record | input: template |

## 10. Validation — future commands (modeled, not implemented)

Each maps cleanly onto the same lifecycle. If any required an exception, the runtime would
be improved rather than branched.

| Command | Intent | Subject | Inputs | Notes |
|---|---|---|---|---|
| enroll_child | Enroll Child | child / case | room, program, start date | **fan-out** intent → assign_room + assign_program + create_contract + generate_documents + instantiate_work + send_family_packet. Modeled as one intent resolving to many capabilities; the runtime sequences them as a composite command (future). |
| assign_room | Assign Room | child | room, effective date | single capability |
| withdraw_child | Withdraw Child | child / case | effective date, reason | constraint stage checks open balances |
| generate_invoice | Generate Invoice | case | billing period, invoice date | billing process |
| record_payment | Record Payment | case | amount, method, date | billing process |

**Finding:** the current model expresses all of the above without new branches. The only
runtime extension future work implies is **composite commands** (one intent → an ordered set
of capabilities, e.g. Enroll Child). That is a natural extension of `supportedCapabilities`
on `OperationalIntent` + a sequencing executor; it does not change the per-capability
lifecycle. No special cases required for the single-capability commands.

---

## 11. Scope guardrails honored

- No runtime redesign; built on the V2 foundation.
- No final UI; reusable models + design only.
- No DB enum changes.
- No file/route renames.
- Existing Actions Runtime V2 tests still pass.
