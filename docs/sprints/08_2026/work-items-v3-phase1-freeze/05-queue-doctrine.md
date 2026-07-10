# 5. Queue Doctrine — Work Items V3 (Frozen)

**Status:** FROZEN — shared across Processing, Communications, Work Items, future modules

---

## 5.1 Purpose

The queue is a **preview/selection surface**, not operational truth. Operators select items; authoritative detail and mutations flow through detail pane, Focus Panel, or registered commands.

**Work Items Queue question:** *What should I act on next across all operational commitments?*

---

## 5.2 Layout contract (three zones)

```
┌──────────────┬────────────────────┬─────────────────────────────┐
│ LEFT RAIL    │ QUEUE LIST         │ DETAIL                       │
│ ~22%         │ ~28%               │ flex                         │
│ Folders      │ Search + filters   │ Header + tabs                │
│ Views        │ Sort               │ Body + side context          │
│ Generators   │ Canonical rows     │ Footer conversation          │
└──────────────┴────────────────────┴─────────────────────────────┘
```

**Health strip:** Nav-band only on **Queue** view — `WorkspaceOperationalHealth` with Assigned · Waiting · Due Soon · Overdue.

**Overview:** No health strip. No body metric tiles.

---

## 5.3 Folders (frozen)

**Role:** Organizational **scope** — which subset of work items are in play.

| Type | Examples | Membership |
|------|----------|------------|
| System | Inbox, All work | Rule-based |
| Org-configured | Enrollment, Compliance, Projects | Rule + explicit `folder_key` |

**Scope formula:**

```
visible = folder(scope) ∩ view(lens) ∩ site_filter ∩ search
```

**Alternative rejected:** Folders as permission boundaries — use RBAC separately.

---

## 5.4 Views (frozen)

**Role:** Saved **lenses** — filters + sort, not containers.

| System view | Maps to |
|-------------|---------|
| Mine | `assigned_to_me` |
| Waiting on others | assignee=me + `waiting_on` set |
| Due today | existing filter |
| Overdue | existing filter |
| Completed | status completed |

**Alternative rejected:** Views as folders — conflates scope with lens.

---

## 5.5 Sources / Generators (frozen)

**Role:** Show **where work originates** — navigation to configuration, NOT queue filtering.

| Generator | Display | Action |
|-----------|---------|--------|
| Recurring schedules | N active | Recurring management UI |
| Business processes | N active | BP builder / process list |
| Checklist templates | N templates | Stage template library |

**Alternative rejected:** Generator as queue filter — operators confuse "source config" with "work list."

---

## 5.6 Canonical row grammar (frozen)

Shared slot contract — each module maps domain row → slots:

| Slot | Work Items | Processing | Communications |
|------|------------|------------|----------------|
| `leadingIcon` | Category icon | Source type | Channel/avatar |
| `title` | Work Item title | Item title | Subject |
| `badge` | OVERDUE/DUE SOON/WAITING | Needs review | Unread |
| `breadcrumb` | Process·Category·Record | Source·Campus | Inbox·Campaign |
| `snippet` | Description excerpt | Preview text | Last message |
| `dueOrTime` | Due datetime | Received/SLA | Last activity |
| `assignee` | Avatar | Owner | — |
| `trailingMeta` | Comment count | Priority | Unread count |

**Component strategy (frozen):**

1. **Phase 1:** Extract `WorkspaceQueueRow` primitive with slot props
2. **Phase 2:** Module mappers (`mapWorkItemToQueueRow`, etc.)
3. **Phase 3:** Visual regression contract tests across modules

**Alternative rejected:** Per-module row components indefinitely — drift guaranteed.

---

## 5.7 Selection behavior (frozen)

| Action | Behavior |
|--------|----------|
| Row click | Set `selectedWorkItemId`; detail loads same row |
| Keyboard | Up/down moves selection; Enter confirms |
| Empty selection | Detail shows calm empty state + Create CTA |
| Row + Open Record | Secondary action; opens Focus Panel drawer |

**Runtime rule:** Do not show queue **empty** during cold load or refetch hold — hold prior rows or skeleton (AdminV2 doctrine).

---

## 5.8 Detail behavior (frozen)

| Element | Contract |
|---------|----------|
| Header | Title, badge, breadcrumb, Actions menu |
| Tabs | Details · Record context · Activity · Comments · Checklist · Files |
| BOS Summary | Read-only insight box on Details tab |
| Fields | Editable where permissions allow; patch via API |
| Side context | Record card, BP stage, relationships |
| Footer | "Ask BOS or add a note…" — seeds draft or posts note |

**Complete from inbox:** Allowed for simple tasks; BP outcome work links to Current Work by default.

---

## 5.9 Footer conversation (frozen)

Detail footer composer serves dual purpose:

1. **Note** — append to activity/comments
2. **BOS seed** — starts/extends `WorkItemDraftV1` for follow-on work (compact proposal in rail OR expand to Create)

Same creation runtime — not a separate chat backend.

---

## 5.10 Cross-product consistency

| Module | Queue | Detail |
|--------|-------|--------|
| Processing | Folder + lanes | Case review workspace |
| Communications | Inbox list | Thread workspace |
| Work Items | Folders + views | Tabbed Work Item detail |
| Future Billing review | Obligation queue | Obligation detail (domain-owned) |

Shared: shell chrome, health strip placement rules, row slot grammar, selection→detail pattern.

---

## 5.11 Phase 1 waypoint (staging → target)

Staging has process rail + filter tabs + two-pane queue/detail. Phase 1 implementation may **add Views section** before full Folders. Process rail remains until Folders map from `department_id` rules.

**Do not remove** process grouping until folder rules equivalent exists.
