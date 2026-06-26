# Operational Action Doctrine

**Status:** Active (doctrine — execution shell partially implemented)  
**Scope:** Alloy OS operator surfaces — Focus Panel header, Manage menu, command rail, lifecycle/status protection  
**Related:** [drawer-system.md](./drawer-system.md), [focus-panel-edit-information-doctrine.md](./focus-panel-edit-information-doctrine.md), [actions-and-workflows.md](../modules/actions-and-workflows.md)

---

## Law

**Status is a consequence of work, not a raw field edit.**

Operators do not casually mutate lifecycle status from the header. They invoke **Operational Actions** that collect inputs, validate configured invariants, propose repairs, require approval when needed, execute side effects, and only then commit status as an outcome.

---

## Manage and command rail — one catalog, two presentations

The Focus Panel **Manage** menu and the **right rail Actions** inventory must not be separate sources of truth.

| Surface | Role |
|---------|------|
| **Right rail** | Always-available command inventory — broader grouping, telemetry, workflows |
| **Manage menu** | Subject-local command menu — same action metadata, filtered and grouped for the active record |

**Current implementation (alignment, not rebuild):**

- Drawer VM composes registry-backed actions into `displayVm.actions.header_menu` (header/rail CTAs) and related manage metadata via `buildRecordManageMenuForEntity` / action resolution in `composeOpportunityDrawerViewModel`.
- Focus Panel header passes `manageMenuItems` from the same VM/runtime path as the legacy drawer Manage control.
- Focus Panel header **does not** render `header_menu[0]` as a stage-movement CTA — operational actions belong in Manage or the command rail, not as an always-present header button.

**Target:** Configuration owns operational action definitions; platform surfaces read one resolved catalog per subject context.

---

## Focus Panel header model

```
Title:     123 Main Street Family
Context:   New Lead · Enrollment          ← read-only status chip + process
Mission:   MISSION  Review inbound lead and reach the family.
Right:     BOS | Manage
```

**Not in header:**

- Unrestricted status dropdown
- Stage-movement primary CTA (e.g. “Move to qualification”)
- Repeated entity/status labels
- Debug mission copy

Status appears **once** as a human label in a read-only chip. Lifecycle changes flow through Manage → **Update Status** or a specific operational action (Schedule Tour, Withdraw Child, Enroll, etc.).

---

## Operational Action pipeline

Every status-changing operation follows this pipeline:

1. **Invoke** — operator selects action (Manage, rail, or card CTA)
2. **Collect inputs** — required fields (dates, reasons, targets)
3. **Validate invariants** — configured operational rules for the action
4. **Identify conflicts** — structured findings with domain context
5. **Propose repairs** — suggested fixes operator can approve
6. **Approve** — operator confirms repairs and execution plan
7. **Execute** — platform applies mutations through existing APIs/events
8. **Status consequence** — outcome status is set as part of execution, not before
9. **Automations** — tasks, workflows, audit events run from configured hooks

This pipeline is **not hardcoded UI logic**. Invariant checks, repair suggestions, and execution hooks are **configured operational policy**.

---

## Example: Withdraw Child

**Operational Action:** Withdraw child  
**Target:** Child enrollment  
**Outcome status:** Withdrawn

### Required inputs

- `withdrawal_date`
- `reason` (when configured)

### Invariants (configured)

| Invariant key | Meaning |
|---------------|---------|
| `active_schedule_must_end_on_or_before_withdrawal_date` | No active schedule after withdrawal date |
| `recurring_billing_must_end_on_or_before_withdrawal_date` | No recurring billing after withdrawal date |
| `future_attendance_must_be_cancelled_after_withdrawal_date` | No future attendance after withdrawal date |

### Conflict detection

**Finds conflict when:** `schedule.end_date > withdrawal_date`

### Suggested repair

“Update schedule end date to {withdrawal_date}.”  
Repair key: `update_schedule_end_date` → sets `schedule.end_date = withdrawal_date`

Additional repairs when applicable:

- `update_billing_end_date`
- `cancel_future_attendance`

### Execution (platform shell)

1. Apply approved repairs
2. Update child enrollment status → Withdrawn
3. End schedule (if not repaired inline)
4. Stop billing if configured
5. Cancel future attendance if configured
6. Write audit / workflow event

**Users do not set “Withdrawn” from a dropdown.** They perform **Withdraw Child**; the action pipeline validates, repairs, then commits.

---

## Configuration direction (future)

Configuration will own **Operational Action Rule Sets**, not just status definitions:

- Operational actions (catalog, labels, permissions)
- Required inputs and allowed outcomes / target statuses
- Invariant checks and conflict messages
- Repair suggestions and auto-repair policies
- Related record updates and automation hooks
- Audit event keys

**Platform owns:**

- Action execution shell (preflight, approval UI, progress)
- Validation lifecycle orchestration
- Status protection rule (no casual header/status-field mutation)
- Audit and telemetry plumbing

---

## Intentionally not built in this phase

- Full Operational Action Rule Set configuration UI
- Invariant engine for withdraw/schedule/billing/attendance
- Repair approval workflow beyond existing action preflight patterns
- Unifying work-unit rail and drawer VM into a single resolver module (documented alignment only)

---

## Implementation references

- Focus Panel header: `web/components/admin/focusPanel/OpportunityFocusPanelHeader.tsx`
- Header constants: `web/lib/adminV2/runtime/focusPanel/focusPanelHeaderActions.ts`
- Drawer VM action composition: `web/lib/adminV2/viewModel/drawer/opportunity/composeOpportunityDrawerViewModel.ts`
- Manage menu builder: `web/lib/admin/recordManage/buildRecordManageMenu.ts`
