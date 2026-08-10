---
owner: operator
status: canonical
last_reviewed: 2026-07-12
supersedes: []
---

# Current Work Surface

**Status:** Canonical (July 2026) — merged to staging via PR #95  
**Related:** [actions-current-work-alignment.md](./actions-current-work-alignment.md)

> **Reconciliation note (2026-07, Operational Expansion Wave 1 freeze — RFC D7).** The frozen [`../rfcs/operational-expansion-phase1.md`](../rfcs/operational-expansion-phase1.md) codifies the **Current Work threshold** and **reconciliation identity**: a condition becomes Current Work only when it is decision-bearing, **materially intervention-worthy**, governed by a configured rule/operating plan, actionable in context, **and assignable to an accountable owner** — all five. A raw variance/read-model signal is **not** Current Work. Each item carries a stable reconciliation identity `(governing_rule, subject, condition_key)`: the same active condition **reconciles** the existing item (no duplicate); a material change **updates/supersedes** it; a cleared condition **resolves or withdraws** per the governing rule; a recurrence after resolution creates a **new instance with lineage**; an idempotent event replay creates **no duplicate**.

---

## What Current Work is

**Current Work** is a configurable Focus Panel surface (`current_work`) that projects stage operating-plan work to operators using the same **Summary → Focus** grammar as Household.

Operators open a record to **complete work**. Current Work answers:

- **Summary:** What is happening? (title, purpose, progress, blockers)
- **Focus:** Help me do it (checklist, handoff, completion, BOS assist hooks)

---

## What Current Work is not

- Not a separate page, modal, drawer, or mission system
- Not a workflow runtime or parallel action system
- Not a CRM status chip or pipeline control
- Not hardcoded to row 1 — placement is configurable via `/settings/surfaces`
- Not enrollment-specific — labels and outcomes come from the org’s published stage operating plan

---

## Derivation report (config vs fallback)

| Surface field | Config-derived source | Code fallback only |
|---------------|----------------------|-------------------|
| **Title** | Active work template `label` from published `stage_operating_plan_v1` (via `resolveCurrentWorkTemplateFromPublishedPlan`) | Open stage-work runtime item label |
| **Purpose** | Work template description or stage plan `purpose` | `stageWorkRuntime.purpose` |
| **Progress** | Checklist completion from published work templates + field rules + readiness gaps | Stage-runtime template states only when no published overlay |
| **Checklist completion** | Published field rules via `evaluateFieldRulesForStage` + readiness gaps; work templates via stage-work runtime | Stage-runtime template states when no published overlay |

**Checklist truth:** `resolveCurrentWorkChecklistTruthFromPublishedRules` maps published field-rule keys to record/readiness evaluation. Labels and order remain config-owned; `complete | missing | blocked` status comes from truth (blocked only when readiness gap is blocking).

Requirement timing affects checklist truth as follows:

- Legacy rules without timing continue to appear as stage-progress readiness.
- `stage_progress` rules appear while the record is being worked.
- `stage_exit` rules may appear as progression gaps, with copy such as “Needed before the configured next step,” but they do not make the record invalid.
- Transition blocking happens in the stage/status preflight path only when explicit `stage_exit` metadata applies to the selected transition.
| **Checklist handoff** | `inferWorkItemOwner()` + scope from field-rule entity | blocked operator copy — never silent no-op |
| **Primary CTA (Summary)** | Work-primary card (`expand_work`) from template title; optional `primary_action` when configured | `"No current work configured"` |
| **Record outcome CTA** | `"Record outcome"` when `showOutcomeCompletion` | disabled + `outcomeCompletionBlockReason` |
| **Outcomes list** | Active work template `outcome_refs` filter canonical stage outcomes; legacy uses `item.outcomes` from runtime | honest gap copy — **never invent lists** |
| **Helpful actions** | Active work template `helpful_actions` (explicit order) | stage `action_catalog_v1` fallback → `record_header` registry |
| **Alternate paths** | Active work template `alternate_paths` (transition or action refs) | catalog `context_dependent` fallback → registry |
| **Communication actions** | Published catalog + registry communication category | registry classification |
| **Blockers** | `signals.attention` primary reason | empty |
| **Queue row line** | `projectCurrentWorkFromStageRuntime` → `buildQueueCurrentWorkSummary` | task-preview / work-intent fallbacks |

**Production path:** `departments.metadata.lifecycle_builder_v1` → `resolvePublishedStageInputsForCurrentWork` → `resolveCurrentWorkTemplateFromPublishedPlan` → `buildCurrentWorkSurfaceVM`. Attached on drawer compose as `workspace.published_stage_inputs` and bridged through `OperationalContext.publishedStageInputs`.

**Projection entry:** `buildCurrentWorkSurfaceVM({ context })` → `projectCurrentWork(context).surface` for UI.

**Action tiers on surface VM:** primary · supporting · communication · alternate paths · administrative (Manage) · BOS recommendations.

### Work Template action resolution hierarchy

`/processes` owns operational behavior. Each work template in `stage_operating_plan_v1` may configure:

- `primary_action` — optional execution affordance (distinct from work-card expand and Record Outcome)
- `helpful_actions` — ordered supporting actions on the summary card
- `alternate_paths` — transition refs (`move_to_stage:{stage_key}`) or action refs
- `outcome_refs` — ordered references to canonical stage outcomes (definitions remain stage-owned)

Resolution order at runtime:

1. Explicit active Work Template configuration
2. Stage `action_catalog_v1` compatibility fallback
3. `record_header` registry classification fallback
4. Nothing

Explicit empty arrays disable fallback for that bucket (`undefined` = legacy fallback allowed; `[]` = explicitly none).

Generic umbrella status actions (`update_enrollment_status`, `update_lead_status`, etc.) are never surfaced. Runtime-internal mutation commands are not operator-selectable.

**Summary card:** checklist + progress + primary + helpful actions visible without opening Details. Expanded view is inline — no navigation detour.

The UI **never writes `stage_key` directly**. Outcome execution uses `useWorkIntentOutcomeCompletion` → `completeStageWorkWithOutcome` only.

---

## Surface behavior

### Summary (compact) — What's Next Card V2

Reusable presentation grammar over the same Current Work surface VM (no new runtime):

- Micro-label: **What's Next** · status chip (**Open** / **Blocked** / …) · optional due chip
- **Title** from configured work template
- **Summary line** — deterministic description/purpose today; same field is the future BOS contextual-summary seam (`summarySource`)
- **Progress** — compact sequence from configured/runtime work:
  - Mode A sequential milestones (distinct templates)
  - Mode B repeated attempts (attempt policy / same-template instances)
  - Selection prefers recently completed · current · next; collapses older history
- **Context facts** — optional compact facts from existing Focus Panel signals/truth (tour booking, billing balance, contact, due)
- **Still needed** — readiness gaps only; omit when empty
- **Recent activity** — 1–2 operator-facing rows + View activity
- **Primary action** (Bend Pine) from action recommendation — not a peer toolbar button
- **Helpful actions** — configured supporting commands; **Record outcome** as an action (never inline outcome menu)

Tour richness (date/time, invitation/status, schedule/reschedule/cancel) flows through the same context-fact + action model when those facts/actions already exist — never a Tour-specific What's Next card.

### Focus (expanded inline)

- Same progress + stepper
- Work primary card + **Record outcome** button (when outcomes configured)
- Helpful actions (left column)
- **Other paths** + **Recommended** (right column — alternate paths + BOS)
- **Hide details** to collapse

### Outcome complete (inline)

- Completed badge, outcome label, change summary, What's next, **Continue Work** / View Activity

### Completion flow

Inside Focus shell only:

```
Working → What happened? → Confirm effects → Finishing → Refresh → Next Current Work
```

- **Back** (not Cancel) returns to the previous step — never implies canceling the open task
- Outcome rows: label left, effect right, consistent height
- Uses `StageWorkOutcomePicker` + `StageWorkOutcomeConfirm` + `useWorkIntentOutcomeCompletion`

After completion: drawer VM reload + queue refresh → Summary updates with next projected work.

---

## Checklist handoff

Checklist items route to the **best work surface** (not only entity truth):

| Intent | Owner |
|--------|-------|
| Message / email / call / contact / reach / follow-up | Communications Focus (or Activity / header composer fallback) |
| Verify / find / update contact info, phone, email | Household (`primary_contact`) |
| Program / enrollment / child / fit | Children |
| Documents / upload | Documents |

Uses `resolveWorkItemHandoff` + `coordination.requestFocus()` — identical grammar to Household handoff.

---

## Queue row relationship

Queue rows consume the **same projection vocabulary** via `buildQueueCurrentWorkSummary`:

```
Digan Family
Contact Family · 1 of 3 complete
```

Fields: `label`, `progress_hint`, `blocker_hint`, `due_label`.

Queue remains preview/selection only — authoritative detail from entity GET / Focus Panel.

---

## Action relationship (doctrine)

- **Current Work owns operational progression** — primary completion + checklist handoffs
- **Manage is administrative** — duplicate, merge, archive, export (registry `header_menu` filtered for record)
- **Right rail Actions** — secondary assistive inventory; outline tiles; must not compete with Current Work primary
- **BOS assists Current Work** — routes through configured actions/comms; does not bypass outcome completion

See [actions-current-work-alignment.md](./actions-current-work-alignment.md) for the full entry-point audit and V1/P2 plan.

---

## Configuration / placement

Default enrollment Summary layout (code fallback when no org publish):

```
Row 1: current_work (full width)
Row 2: household · children
Row 3: readiness_kpi · tour_summary
Row 4: communications · documents
```

Operators may rearrange via **Configuration → Surfaces → Focus Panels**. Card placement is never hardcoded in the component.

---

## Key files

| File | Role |
|------|------|
| `web/lib/adminV2/runtime/focusPanel/currentWork/projectCurrentWork.ts` | ViewModel projection |
| `web/lib/adminV2/runtime/focusPanel/currentWork/buildCurrentWorkCardEvidence.ts` | Summary evidence |
| `web/components/admin/focusPanel/cards/CurrentWorkCard.tsx` | Summary + Focus UI |
| `web/lib/workIntent/stageWorkOutcomeEffectLines.ts` | Outcome effect copy normalization |
| `web/lib/workUnits/buildQueueCurrentWorkSummary.ts` | Queue row language |
| `web/lib/adminV2/runtime/focusPanel/focusPanelCardLifecycle.ts` | Capability matrix |

---

## Design references

- `docs/sprints/archive/07_2026/alloy-operator-workspace/`
- `docs/sprints/archive/07_2026/objective-focus-integration/`
