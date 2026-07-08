# Current Work Surface

**Status:** Canonical (July 2026) — merged to staging via PR #95  
**Related:** [actions-current-work-alignment.md](./actions-current-work-alignment.md)

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
| **Title** | Open (or actionable) primary stage-work item `label` from operating-plan template via `projectStageWorkRuntime` | `"No current work configured"` when runtime has no templates |
| **Purpose** | `stageWorkRuntime.purpose` (stage operating plan) | omitted |
| **Progress** | Checklist completion count from `runtime.primary` + `runtime.additional` states | `"Getting started"` / `"In progress"` verdict strings |
| **Checklist items** | `runtime.primary` + `runtime.additional` template labels + descriptions | empty list |
| **Checklist handoff** | `inferWorkItemOwner()` + `handoffKind` (`outreach` / `verification` / `navigation`) | blocked operator copy — never silent no-op |
| **Primary CTA (Summary)** | `"Record what happened"` when `showOutcomeCompletion` | `"Open work →"` when outcomes unavailable |
| **Primary CTA (Focus footer)** | Same configured label | disabled + `outcomeCompletionBlockReason` |
| **Outcomes list** | `item.outcomes` from `projectStageWorkRuntime` via `completionOutcomesForPicker` | honest gap copy — **never invent lists** |
| **Outcome effect copy** | `outcome_automation_preview` from plan `outcome_rules`, normalized (`Continue {work} work` — no `Reopen:`) | `"Continue {work label} work"` or `"Keep open · record attempt"` |
| **Blockers** | `signals.attention` primary reason | empty |
| **Queue row line** | `projectCurrentWorkFromStageRuntime` → `buildQueueCurrentWorkSummary` | task-preview / work-intent fallbacks |
| **Supporting actions** | `recordHeaderActions` (`record_header` primary/secondary/header) via `deriveCurrentWorkSupportingActions` | empty |
| **BOS assist** | Existing BOS hooks on drawer VM | none fabricated by Current Work |

**Projection entry:** `projectCurrentWork(context)` → `buildCurrentWorkCardEvidence(context)` for Summary evidence.

The UI **never writes `stage_key` directly**. Outcome execution uses `useWorkIntentOutcomeCompletion` → `completeStageWorkWithOutcome` only.

---

## Surface behavior

### Summary (compact)

- Micro-label: **Current Work**
- Title from primary open work item (config template label — e.g. Contact Family, not hardcoded)
- One-line purpose from stage operating plan
- Progress (`2 of 3 complete`) and blocker count
- Primary CTA — `Record what happened` when outcomes exist; otherwise `Open work →`
- Bend Pine left accent rail on Summary only

### Focus (expanded)

- Neutral elevated card shadow — **no double Bend Pine ring**
- Subtle **Open work** status pill (no border)
- Full purpose and progress
- Interactive checklist (navigation, not checkboxes)
- Blockers in operator language ("You can't finish until…")
- Completion phases inside Focus shell
- Supporting actions from action registry (wired V1 — secondary assist buttons)

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

Operators may rearrange via **Settings → Surfaces → Focus Panels**. Card placement is never hardcoded in the component.

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

- `docs/sprints/07_2026/alloy-operator-workspace/`
- `docs/sprints/07_2026/objective-focus-integration/`
