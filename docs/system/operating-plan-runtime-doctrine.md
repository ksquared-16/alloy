# Operating Plan Runtime Doctrine

**Status:** Canonical (June 2026). Stage execution contract for Business Processes.

**Owner:** Business Processes (`/admin/settings/business-processes`) — each **stage** owns one Operating Plan.

**Reference implementation:** Enrollment Process.

**Related docs:**

- `docs/platform/core/business-process-system.md` — operator model (Business Process → Stage → Record)
- `docs/system/configuration-ownership-doctrine.md` — Stage Requirements owns field readiness; Operating Plan consumes it
- `docs/system/adminv2-runtime-performance-doctrine.md` — reveal gates when wiring runtime projections

**Internal storage:** `stage_operating_plan_v1` on builder stage metadata (`departments.metadata` JSON). API paths remain `lifecycle-*`.

---

## North star

**Operating Plan is the stage execution contract.**

When an operator configures a Business Process stage, Operating Plan tells the platform:

1. **Why** the stage exists (Purpose)
2. **What work** should happen (Expected Work → tasks)
3. **What “done” means** (Success Criteria → outcomes + readiness)
4. **When records are off track** (Attention)
5. **What BOS should help with** (projected from 1–4)
6. **What queues, drawers, and tasks should show** (projected from journey + work + membership)

Everything else — queue layout, drawer presentation, org SLA defaults — **projects** this contract. Parallel hardcoded catalogs are transitional only.

---

## Configuration ownership

| Concern | Owner | Operating Plan relationship |
|---------|-------|----------------------------|
| Who appears in stage | **Stage Membership** + status rollups | Operating Plan does not define membership |
| What fields must exist | **Stage Requirements** (`lifecycle_builder_stage_field_rules_v1`) | Success Criteria / Attention **consume** readiness evaluation |
| What work to do | **Operating Plan** (`work_templates`) | Spawns `operational_work` tasks |
| What “done” means | **Operating Plan** (`outcomes`, `outcome_rules`) + Stage Requirements gates | Outcome picker + advancement validation |
| When to escalate | **Operating Plan** (`attention_rules`) + org `opportunity_attention_rules` | Unified attention evaluator (target) |
| Row presentation | **Layouts** (`queue_record_layout`) | Presentation only |
| Action buttons | **Process Actions** | Complements Expected Work; does not replace it |

**Invariant:** `journey_segment` (family vs child) must agree with queue membership grain and outcome subject grain. Ready Check must fail when they diverge.

---

## Operating Plan sections

Operator UI labels map to metadata as follows:

| Operator section | Metadata fields |
|------------------|-----------------|
| Purpose | `purpose` |
| Journey | `journey_segment` (`family` \| `child`) |
| Expected Work | `work_templates[]` |
| Success Criteria | `outcomes[]`, `outcome_rules[]` |
| Attention | `attention_rules[]` |

Code entry points: `web/lib/lifecycle/stageOperatingPlanV1.ts`, `defaultEnrollmentStageOperatingPlans.ts`, `executeStageOperatingOutcome.ts`.

---

### Purpose

**Operator configures:** One-sentence stage intent (prose).

**Stored:** `stage_operating_plan_v1.purpose`

**Runtime usage (target):**

| Surface | Behavior |
|---------|----------|
| Drawer | Stage context banner under record header |
| Work unit | Queue lane subtitle / tooltip |
| BOS | System context: “You are helping with: {purpose}” |
| Empty states | Copy when lane has no rows or no open work |

**Does not:** Move records, create tasks, or change status.

**Today (June 2026 closeout):** Purpose projects to drawer lifecycle rail via `resolveStageOperatingPlanPurpose` → `workspace.stage_context.purpose`. Queue lane copy still partially uses `lifecycleStageWorkspaceMapping` / `enrollmentPipelineQueueDefinitionV2`.

---

### Journey

**Operator configures:** Stage grain.

| Option | Meaning |
|--------|---------|
| **Family journey** | One row per family/case (`opportunities`) |
| **Child journey** | One row per enrollment track (`opportunity_customer_members` / candidate grain) |

**Stored:** `journey_segment`

**Runtime usage (target):**

| Surface | Behavior |
|---------|----------|
| Queues | Row identity grain (case vs child/candidate) |
| Outcome picker | Subject scope (opportunity vs OCM) |
| Task spawn | `operational_work` subject + `context_snapshot.lifecycle_stage_key` |
| Drawer | Primary subject selector when child grain |
| Telemetry | `journey_segment` on stage-scoped events |

**Today:** Partial — outcome picker subject (`resolveStageWorkOutcomeContext`). Queue grain comes from Stage Membership, not journey segment directly.

---

### Expected Work

**Operator configures:** Ordered work templates — label, required, due policy, owner strategy, optional `work_definition_key`.

**Stored:** `work_templates[]`. Spawned instances in `operational_work` with `provenance.source = lifecycle_template` and `template_key`.

**Doctrine:** Expected Work becomes **tasks** (primary). Milestones, checklists, and progress % are **derived views** on tasks + requirements — not separate stored objects. Outcomes belong under Success Criteria, not Expected Work.

**Runtime usage (target):**

| Surface | Behavior |
|---------|----------|
| Stage entry | Idempotent spawn of required templates for `(subject, stage_key, template_key)` |
| Drawer | Operational strip — open stage tasks sorted by due date |
| Work unit / My Tasks | Assigned work for cohort |
| BOS | Next open required task + draft assistance for `work_definition_key` |
| Due dates | Computed from `due_policy` + stage entry timestamp |

**Today (June 2026 closeout):**

- **Stage-entry spawn** — `onStageEntrySpawnWorkIntent` on status transition spawns primary template work idempotently (`emitStatusChangedEvent` path).
- **Work Intent runtime card** — opportunity drawer body hosts `WorkIntentRuntimeCard` (Make Contact, etc.) via `projectWorkIntentRuntime`; filtered from Tasks strip (`filterResidualOperationalTasks`).
- Templates still appear from workflows, `create_next_work` outcome target, and comm auto-association when not stage-spawned.

---

### Success Criteria

**Operator configures:** Human completion choices (`outcomes`) and side-effect rules (`outcome_rules`). Optional gates on Stage Requirements readiness.

**Stored:** `outcomes[]`, `outcome_rules[]`

**Doctrine:** Success Criteria means:

- **Possible outcomes** — what the operator can declare when completing work
- **Advancement validation** — required fields + required tasks before certain outcomes or transitions
- **Readiness gates** — merged view from Operating Plan + **Stage Requirements**
- **Progress %** — derived display only: `(satisfied required fields + completed required tasks) / total`

**Runtime usage (target):**

| Surface | Behavior |
|---------|----------|
| Task complete | Outcome picker (filtered by readiness gates) |
| Side effects | Status/disposition updates, next work, attention flags, real stage movement |
| Drawer | Readiness checklist + outcome picker on complete |
| BOS | “To mark Qualified, still need: child DOB, program interest” |
| Advancement | Block or warn when required fields/tasks missing |

**Today (June 2026 closeout):**

- Drawer **Work Intent card** — outcome picker on primary stage work (`completeStageWorkWithOutcome`); retry-aware close semantics (`shouldCloseWorkAfterStageOutcome`).
- My Tasks Complete → `stage-work-outcomes` API → `executeStageOperatingOutcome` (unchanged).
- `move_to_stage` target remains a **no-op** (movement via status/disposition + membership).
- Readiness lives in **Stage Requirements** separately; outcome gates not fully merged.

---

### Attention

**Operator configures:** Off-track rules — kinds: `tasks_without_success`, `days_without_success`, `required_work_overdue`, `missing_required_fields`, plus thresholds.

**Stored:** `attention_rules[]` on stage plan; org defaults in `metadata.opportunity_attention_rules`.

**Doctrine:** Attention means:

- SLA / overdue required work
- Follow-up overdue (days without successful outcome)
- Missing required fields (from Stage Requirements readiness)
- Stalled workflow (tasks without success)

Attention **drives Needs Attention and runtime signals**. It does not auto-close cases or auto-advance stages.

**Runtime usage (target):**

| Surface | Behavior |
|---------|----------|
| Needs Attention queue | Evaluated reasons merged with org SLA/stale rules |
| Drawer | Attention chip with rule provenance |
| BOS | “Off track because: Qualification work overdue (stage rule)” |
| Queues | Optional overdue-work badge on lane rows |
| Telemetry | `attention.rule_key`, `attention.kind`, `attention.stage_key` |

**Today:** Stage `attention_rules` are stored but **not evaluated**. Production attention uses org-level `opportunityAttentionResolver` + optional readiness bridge (`readiness_attention_bridge_v1`). Outcome-triggered `create_needs_attention` **does work**.

---

## Runtime projection model (target)

```
Operating Plan (per stage)
  ├── Purpose        → copy surfaces (drawer, lane, BOS)
  ├── Journey        → row grain, outcome subject, task subject
  ├── Expected Work  → operational_work tasks
  ├── Success        → outcome picker + readiness gates
  └── Attention      → Needs Attention reasons

Stage Membership     → who is in the queue
Stage Requirements   → field readiness input
Process Actions      → available actions
Layouts              → presentation only
```

**Single evaluator paths (target):**

- `evaluateStageReadiness` — merges Stage Requirements + required task completion
- `evaluateStageAttention` — merges stage `attention_rules` + org SLA + readiness gaps
- `projectOperatingPlanContext` — purpose + open work + readiness + attention for BOS

---

## Current implementation audit (June 2026)

| Section | Stored | Runtime today | Gap |
|---------|--------|---------------|-----|
| Purpose | ✓ | **Drawer lifecycle rail** (`workspace.stage_context.purpose`) | Queue lane subtitle partial |
| Journey | ✓ | Outcome subject only | Queue grain not tied to plan |
| Expected Work | ✓ | **Stage-entry spawn + Work Intent card** | Due policy engine partial |
| Success Criteria | ✓ | **Drawer outcome picker** (retry vs close) | No readiness gates; `move_to_stage` no-op |
| Attention | ✓ | Org rules + outcome-triggered flags | Stage rules not evaluated |

**Parallel systems still drive runtime:** Stage Membership, Stage Requirements, Process Actions, org `opportunity_attention_rules`, hardcoded queue/BOS catalogs.

**Why QA feels like documentation:** Purpose and most templates do not surface at runtime; attention rules never fire; success rules are not editable; Settings Ready Check preview uses hardcoded signals.

---

## Enrollment stage examples

Operator model uses six stages: **Lead → Qualification → Tour → Waitlist → Enrolling → Enrolled**. Builder may use finer keys (`new_lead`, `contacting`, …); runtime maps to operator stages for palette and readiness.

**Fixture (Lead example):** Smith Family, parent Jordan Smith, child Emma Smith, status **New Lead** (`new_inquiry`).

---

### Lead

**Purpose:** Respond to the family’s inquiry and establish first contact.

**Journey:** Family journey (one row per case).

**Expected Work:**

| Template | Required | Due |
|----------|----------|-----|
| Review new inquiry | Yes | Same day |
| Contact family | Yes | Same day |
| Capture initial enrollment interest | No | +1 day |

**Success Criteria:**

| Outcome | Effect |
|---------|--------|
| Contact completed ✓ | Advance toward Qualification; mark work complete |
| Family qualified for next stage ✓ | Status/disposition updates; advance |
| Not interested | Close case |

**Attention:**

| Rule | Effect |
|------|--------|
| No contact attempt within same day | Needs Attention — first response overdue |
| No successful contact after 3 days | Needs Attention — no family contact |
| Missing phone/email | Needs Attention — missing required info (Stage Requirements) |
| Missing child/program interest | Needs Attention or readiness gap |

**Runtime result (target):**

- Smith Family in **New Leads** queue (Stage Membership)
- Drawer: purpose banner, 2–3 open tasks due today
- BOS: “Review inquiry for Smith Family — confirm Jordan’s phone before first call”
- Needs Attention if same-day SLA breached
- Readiness checklist: guardian contact, initial child interest

---

### Qualification

**Purpose:** Confirm fit and gather enrollment details before tour or waitlist.

**Journey:** Family.

**Expected Work:** Confirm child information (+1 day); confirm location, program, start date (+2 days).

**Success Criteria:** Qualified ✓ → Tour; Not qualified → close; Needs more info → attention.

**Attention:** Required work overdue; follow-up commitment overdue.

**Runtime result (target):** Follow Up queue; readiness gates “Qualified” on required fields + tasks; BOS collects Emma’s program and start date.

---

### Tour

**Purpose:** Schedule, confirm, and record the center visit.

**Journey:** Family (tour event); child disposition updated on completion.

**Expected Work:** Confirm tour date; send reminder; record tour outcome.

**Success Criteria:** Tour completed ✓; No show → attention + follow-up; Reschedule; Not interested → close.

**Attention:** Tour outcome overdue; post-visit follow-up commitment overdue.

**Runtime result (target):** Tours / post-visit lanes; drawer links appointment; BOS prompts outcome recording after visit.

---

### Waitlist

**Purpose:** Maintain position and offer spots when openings exist.

**Journey:** Child (one row per child — Emma waitlisted independently of siblings).

**Expected Work:** Review waitlist position; offer spot when available.

**Success Criteria:** Spot offered ✓ → Enrolling; Candidate paused; No response → attention.

**Attention:** Waiting on family (org SLA); offer pending too long.

**Runtime result (target):** Waitlist candidate grain row; OCM-focused drawer; BOS reviews position and opening.

---

### Enrolling

**Purpose:** Complete paperwork and confirm start date.

**Journey:** Child.

**Expected Work:** Send enrollment packet (+1 day); confirm start date (+3 days).

**Success Criteria:** Enrollment complete ✓ → Enrolled; Packet pending → attention; Family withdrew → close track.

**Attention:** Required enrollment work overdue; missing packet/signature fields from Stage Requirements.

**Runtime result (target):** Enrolling lane; forms status in drawer; BOS sends packet to Jordan for Emma.

---

### Enrolled

**Purpose:** Post-enrollment steady state — profile completeness, not funnel advancement.

**Journey:** Child.

**Expected Work:** None required (optional onboarding tasks configurable).

**Success Criteria:** Acknowledged ✓ — no movement.

**Attention:** None for pipeline stall; optional profile-completeness only.

**Runtime result (target):** Enrolled lane or excluded from active funnel; drawer shows ongoing ops, not advancement CTAs.

---

## Implementation order

### Tier 0 — Honest projection (1–2 sprints)

Immediate operator trust; UI-only where possible.

- Show **Purpose** in drawer stage banner, queue lane subtitle, BOS context shell
- **Ready Check** reads live `stage_operating_plan_v1` (not hardcoded `lifecycleStageWorkspaceMapping` only)
- Expose **outcome rules** in Operating Plan editor (Success Criteria editable)

**Value:** Stage config stops feeling like dead documentation.

### Tier 1 — Expected Work becomes tasks (highest ROI)

- **Stage-entry task spawning** — idempotent on `(subject, stage_key, template_key)`
- **Due policy engine** from `due_policy` + entry timestamp
- **Drawer outcome picker** — parity with My Tasks Complete
- Chain optional templates via `create_next_work` outcome target

**Value:** Records arrive with assigned work; staff complete in drawer context.

### Tier 2 — Success Criteria readiness

- **`evaluateStageReadiness`** — merge Stage Requirements + required task completion
- **Outcome gates** — block/warn on “Qualified”, “Enrollment complete”, etc.
- **Implement `move_to_stage`** — real advancement with membership preconditions
- **Progress %** as derived metric only

**Value:** “Success Criteria” matches advancement behavior.

### Tier 3 — Attention evaluator

- **Evaluate stage `attention_rules`** — `tasks_without_success`, `days_without_success`, `required_work_overdue`, `missing_required_fields`
- **Merge org `opportunity_attention_rules`** — single attention spine
- **Readiness → attention projection** — enable queue bridge carefully per `adminv2-runtime-performance-doctrine.md`
- Needs Attention queue sources from unified evaluator

**Value:** Off-track criteria in Operating Plan actually surface.

### Tier 4 — BOS integration

- BOS context bundle: purpose + open work + readiness gaps + attention reasons
- Next-best-action from templates and Process Actions
- Generalize comm auto-association beyond `contact_family`

**Value:** AI assistance matches configured playbook.

### Deferred (not Tier 0–4)

- Milestones as first-class objects
- Separate checklist store
- Cross-process operating plan reuse
- Visual workflow builder for outcome rules

---

## Risks and dependencies

| Risk | Mitigation |
|------|------------|
| AdminV2 reveal regressions | Follow `adminv2-runtime-performance-doctrine.md`; projection-only in Tier 0 |
| V1 13-stage vs 6 operator-stage mapping | Explicit map in runtime; document in Ready Check |
| Stage Requirements registry quality | E3 field visibility convergence; readiness gates depend on clean palette |
| Duplicate attention systems | Tier 3 merges stage rules + org rules; deprecate hardcoded `STAGE_NEEDS_ATTENTION` |
| `move_to_stage` vs status-driven membership | Implement movement as validated status/disposition + membership, not queue hacks |
| Performance of readiness/attention per queue row | Gate `readiness_attention_bridge_v1`; drawer attach evaluates first |

**Dependencies before Tier 2 gates:** E3 field cleanup (shipped), Stage Requirements persistence convergence (F2 — deferred).

---

## Tests and doc checks

**Doc drift (CI):** `web/tests/adminV2/operatingPlanRuntimeDoctrine.test.ts`

**Runtime-sensitive (when implementing Tier 1+):**

```bash
cd web && npm run test -- \
  tests/lifecycle/stageOperatingPlanV1.test.ts \
  tests/lifecycle/executeStageOperatingOutcome.test.ts \
  tests/admin/drawer/drawerDeterminism.test.ts
```

**Browser QA (after Tier 0+):** Configure Lead Operating Plan → verify purpose in drawer/lane; complete task with outcome picker; verify attention reason when overdue.

---

## Code references

| Module | Role |
|--------|------|
| `stageOperatingPlanV1.ts` | Schema + parser |
| `defaultEnrollmentStageOperatingPlans.ts` | Enrollment defaults |
| `executeStageOperatingOutcome.ts` | Outcome side effects (partial) |
| `resolveStageWorkOutcomeContext.ts` | Outcome picker resolution |
| `completeStageWorkWithOutcome.ts` | Task complete orchestration + retry-aware close |
| `projectWorkIntentRuntime.ts` | Work Intent VM projection for drawer card |
| `onStageEntrySpawnWorkIntent.ts` | Stage-entry primary work spawn |
| `shouldCloseWorkAfterStageOutcome.ts` | Retry vs close outcome semantics |
| `resolveStageOperatingPlanPurpose.ts` | Purpose projection for drawer rail |
| `lifecycleProgressionRequirementsConfig.ts` | Stage Requirements / readiness (separate today) |
| `opportunityAttentionResolver.ts` | Org-level attention (parallel today) |
| `businessProcessUiLabels.ts` | Operator section labels |

---

## Frozen decisions

| Decision | Status |
|----------|--------|
| Operating Plan = stage execution contract | **Canonical** |
| Expected Work → `operational_work` tasks | **Partial** — stage-entry spawn + drawer Work card shipped |
| Success Criteria → outcomes + readiness gates | **Partial** — drawer outcome picker + retry semantics |
| Attention → Needs Attention / runtime signals | **Target** — partial |
| Stage Requirements = field readiness input | **Canonical** — see configuration-ownership-doctrine |
| Business Process owns Operating Plan per stage | **Canonical** |
| Purpose does not move records | **Canonical** |
