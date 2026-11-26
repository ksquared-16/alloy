---
owner: operator
status: canonical
last_reviewed: 2026-07-12
supersedes: []
---

# Actions ↔ Current Work Alignment

**Status:** Canonical (July 2026)  
**Scope:** Classify existing action surfaces relative to Current Work — no system deletions.  
**Related:** [action-system.md](./action-system.md), [current-work-surface.md](./current-work-surface.md), [operational-action-doctrine.md](./operational-action-doctrine.md), [ai-platform.md](../modules/ai-platform.md)

---

## Doctrine

| Surface | Role |
|---------|------|
| **Current Work** | Owns operational progression — complete work, checklist handoffs, outcome completion |
| **Manage** | Administrative — duplicate, merge, archive, export, delete |
| **Right rail Actions** | Secondary assistive inventory — must not compete with Current Work primary |
| **BOS** | Assists Current Work — invokes configured actions/comms; never bypasses outcome completion |

---

## Derivation report (config vs fallback)

| Surface field | Config-derived source | Fallback / empty |
|---------------|----------------------|------------------|
| **Current Work title** | Open stage-work item `label` from operating-plan template (`stageWorkRuntime`) | `"No current work configured"` when runtime has no templates |
| **Purpose** | `stageWorkRuntime.purpose` (stage operating plan) | null |
| **Checklist items** | `runtime.primary` + `runtime.additional` labels/descriptions | empty list |
| **Checklist handoff targets** | `inferWorkItemOwner()` + `handoffKind` | blocked copy — never silent close |
| **Completion CTA** | `"Record what happened"` when `requires_outcome_picker` and configured outcomes exist | Summary: `"Open work →"`; Focus: disabled with `outcomeCompletionBlockReason` |
| **Outcomes** | `item.outcomes` from `projectStageWorkRuntime` via `completionOutcomesForPicker` | Honest gap copy — **never invent lists** |
| **Outcome effects** | `outcome_automation_preview` from plan `outcome_rules`, normalized (no `Reopen:`) | `"Continue {work label} work"` or `"Keep open · record attempt"` |
| **Supporting actions** | `recordHeaderActions` → `deriveCurrentWorkSupportingActions` | empty |
| **Queue row line** | `projectCurrentWorkFromStageRuntime` (label + progress) | task-preview / work-intent fallbacks |
| **Manage menu** | Action registry `header_menu` / `overflow` via `buildSubjectManageMenuFromResolvedActions` | legacy entity stubs |
| **Right rail Actions** | Registry `work_unit`/`right_rail`; demoted when Current Work owns completion | empty → rail default |
| **BOS suggestions** | `composeOpportunityDrawerViewModel` → `bos` summary | assist chips — no fabricated actions |

Projection entry: `projectCurrentWork(context)`.

**Not config-derived (intentional UI chrome):** micro-label `"Current Work"`, progress verdict strings, empty-state copy, `"Open work"` Focus pill, `"← Back"` navigation labels.

---

## Action entry points (audit)

### 1. Current Work primary action

| Location | Behavior | V1 status |
|----------|----------|-----------|
| Summary footer | `Open work →` or `Record what happened →` opens Focus | **V1 — keep** |
| Focus footer | `Record what happened →` → outcome picker (`What happened?`) | **V1 — keep** |
| Outcome picker | Select configured outcome → confirm → `completeStageWorkWithOutcome` | **V1 — keep** |

**Rule:** This is the only primary operational completion path for stage work with outcomes.

### 2. Current Work checklist / action rows

| Location | Behavior | V1 status |
|----------|----------|-----------|
| Outreach rows (`handoffKind: outreach`) | Communications Focus → Activity → header composer | **V1 — keep** |
| Verification rows | Household Focus | **V1 — keep** |
| Navigation rows | Children / Documents Focus | **V1 — keep** |

**Rule:** Checklist rows are operational handoffs, not duplicate completion CTAs.

### 3. Manage menu

| Location | Source | V1 status |
|----------|--------|-----------|
| Opportunity Focus Panel header | `header_menu` registry actions | **V1 — administrative only** |
| Legacy person/child drawers | `buildRecordManageMenuForEntity` stubs | unchanged |

**Stays in Manage:** duplicate, merge, transfer, export, archive, delete, admin mutations.  
**Does not belong in Manage:** stage-work completion, outreach compose, outcome selection.

### 4. Right rail Actions (N)

| Location | Source | V1 status |
|----------|--------|-----------|
| Workspace command rail | `WorkspaceRightRailActions` → registry `surface=workspace` | **V1 — secondary assist** |
| Work unit context | Same pattern on work-unit surfaces | **V1 — secondary assist** |

**Stays in rail:** Create Lead, org-level configured actions, navigation shortcuts.  
**P2 migrate to Current Work supporting:** operational actions that duplicate checklist handoffs (e.g. “Send message” when Contact Family is primary).  
**Must not compete:** rail must not show a second green “Complete work” CTA when Current Work is visible.

### 5. BOS suggestions

| Location | Source | V1 status |
|----------|--------|-----------|
| Drawer BOS band | `buildOpportunityDrawerBosSummary` | **V1 — assist only** |
| Focus Panel BOS hooks | contextual assist when stage-work context exposed | **P2** |

**Rule:** BOS chips should invoke configured registry actions or open Communications — not call `completeStageWorkWithOutcome` directly or write `stage_key`.

### 6. Create Lead (workspace pattern)

| Location | Behavior | V1 status |
|----------|----------|-----------|
| Workspace rail action | `applyRegistryResolvedActionClient` → `adminv2:open-create-lead` | **V1 — keep in rail** |
| `CreateLeadEventHost` | Modal at stable surface level; opens new record in Focus Panel | **V1 — keep** |

**Rule:** Create Lead is workspace-level intake — not Current Work. New records land in Current Work after creation via stage-entry spawn.

---

## Practical alignment plan

### V1 (now)

| Keep where it is | Why |
|------------------|-----|
| Current Work primary + checklist | Operational progression owner |
| Manage = admin registry filter | Administrative mutations separated |
| Rail = outline secondaries | Assistive inventory, lower emphasis |
| BOS = suggest → configured action | Assists without bypassing completion |
| Create Lead in workspace rail | Intake, not in-record progression |

### V1-complete (July 2026)

| Capability | Status |
|------------|--------|
| Supporting actions in Focus | **V1** — registry-backed, `invokeHeaderAction` |
| Right rail demotion when Current Work owns completion | **V1** — `filterRightRailActionsForCurrentWork` |
| Contact outcome communication trace | **V1** — `stage_work_outcome_recorded` + metadata |
| Playwright journey spec | **V1** — `PLAYWRIGHT_CURRENT_WORK=1` |

### P2 (true remainders)

| Move / wire | Target |
|-------------|--------|
| BOS contextual chips in Focus | Assist tied to open work template |
| Operating-plan publish reconciliation | Production path on plan save/publish |
| Pre-complete communications composer for every contact outcome | Draft/send before outcome (beyond trace) |

---

## Outcome copy (July 2026 polish)

- **No `Reopen:`** in operator UI — normalized to `Continue {template label} work`
- **Retry / no-movement outcomes:** `Continue {current work label} work` or `Keep open · record attempt`
- **Successful outcomes:** `Complete this work item` / `Close current work item` from preview + `successful` flag
- **Completion Back:** `← Back` returns to previous step — never “Cancel task”

---

## Outcome detection fix (July 2026)

**Root cause:** `completionOutcomesForPicker` previously filtered outcomes to those with automation preview or `successful: true`. Contact-family outcomes with `no_movement`-only rules were hidden.

**Fix:** `completionOutcomesForPicker` returns `item.outcomes` directly — same array `projectStageWorkRuntime` attaches from config.

When Review Lead is removed from the stage template list, Current Work title/checklist/CTA derive from the remaining runtime items only — **no synthesized Review Lead fallback**.

---

## P2 — Operating-plan publish reconciliation

When an org publishes a plan that removes templates (e.g. `review_lead`) and sets a new primary (`contact_family`), in-stage records are not auto-reconciled today.

**QA dev path:**

```bash
cd web
OPPORTUNITY_IDS=<uuid> npm run dev:qa:reconcile-orphaned-stage-work
OPPORTUNITY_IDS=<uuid> QA_RECONCILE_APPLY=1 DRY_RUN=0 npm run dev:qa:reconcile-orphaned-stage-work
```

Implementation: `web/lib/lifecycle/reconcileOrphanedStageWorkForOpportunity.ts`.

**Production target:** run same logic on plan publish for in-stage records.

---

## Out of scope

- Deleting Manage, rail Actions, or BOS  
- New mission runtime  
- Enrollment-only UI branches in shared modules
