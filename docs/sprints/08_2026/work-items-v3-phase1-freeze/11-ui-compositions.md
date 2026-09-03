# 11. UI Compositions — Work Items V3 (Frozen Reference)

**Status:** FROZEN — implementation visual contract  
**Tokens:** `alloy-juniper`, `alloy-stone`, `WorkspaceOperationalHealth`, `WorkspaceShell` stack

Reference mockups: sprint assets (Queue + Create Work Item compositions from V3 platform sprint).

---

## 11.1 Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Work Items                                                               │
│ Where operational work gets completed.                                   │
│ [Overview*] [Queue]                                      [Close]         │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌────────────────┐ │
│  │ ✨ Create Work Item  │  │ Continue overdue (1)│  │ Waiting on (1) │ │
│  │ Describe what needs │  │ [Open queue →]      │  │ [Open queue →] │ │
│  │ [Create & Ask BOS]  │  └─────────────────────┘  └────────────────┘ │
│  └─────────────────────┘                                                │
│  CONTINUE WORK                          RECENT                          │
│  [compact queue rows]                   [activity lines]                │
│  Quick links: All work · Mine · Overdue · Recurring schedules           │
└─────────────────────────────────────────────────────────────────────────┘
```

**Rules:** No metric tiles. Primary CTA = juniper + sparkle.

---

## 11.2 Queue (full)

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ Work Items · Queue                                                                │
│ Overview | Queue*     2 Assigned  0 Waiting  1 Due Soon  1 Overdue               │
│                                    [✨ Create & Ask BOS]  [Close]                 │
├───────────────┬──────────────────────────┬───────────────────────────────────────┤
│ FOLDERS       │ 🔍 Search…  [filters]    │ [Title]              OVERDUE    [⋮]  │
│ Inbox (3)     │ Sort: Due date ▾         │ Breadcrumb line                       │
│ All work (2)* │                          │ ─────────────────────────────────────│
│ Enrollment(4) │ ┌ row (selected) ──────┐ │ Details | Record | Activity | …       │
│ …             │ └ row ─────────────────┘ │ ┌ BOS SUMMARY ─────────────────────┐ │
│ VIEWS         │                          │ │ Suggested next step…              │ │
│ Mine (2)      │                          │ └───────────────────────────────────┘ │
│ …             │                          │ Fields… · Record · BP panels          │
│ GENERATORS    │                          │ 💬 Ask BOS or add a note…       [Send]│
└───────────────┴──────────────────────────┴───────────────────────────────────────┘
```

**Health strip:** Flat underline semantics — NOT boxed KPI cards.

---

## 11.3 Queue row

```
┌────────────────────────────────────────────────────────────┐
│ [📞] Contact Kurzman Family                    [OVERDUE]    │
│      Enrollment · Follow-up · Kurzman Family               │
│      Follow up on tour questions…                          │
│      Due Thu, Jul 9, 11:18 AM              [KK]  💬 1     │
└────────────────────────────────────────────────────────────┘
```

Selected: juniper ring or left accent. OVERDUE: subtle red border acceptable.

---

## 11.4 Detail

- Header: title, badge, breadcrumb, Actions
- BOS Summary: `bg-alloy-juniper/[0.06]` panel
- Two-column fields on wide layouts
- Record / BP / Relationships side cards
- BOS Insight: smaller secondary card
- Footer composer fixed at bottom of detail pane

---

## 11.5 Conversation Runtime (Create modal)

```
┌ Create work item ────────────────────────────────────────────────┐
│ Describe what needs to happen. BOS will help build it.           │
│              [Preview work item]  [Create ✓]  [×]                │
├─────────────────────────┬────────────────────────────────────────┤
│ BOS conversation (40%)  │ Work Item Preview (60%)                │
│ User utterance          │ Title · badges · description           │
│ BOS structured summary  │ If-not-completed panel               │
│ Action chips            │ Record · Tags · BP · Checklist         │
│ Composer                │ Suggested actions · BOS Insight        │
└─────────────────────────┴────────────────────────────────────────┘
```

Live preview binds to `WorkItemDraftV1`. Create disabled until valid.

---

## 11.6 Compact BOS proposal

```
┌─ Proposed work item ─────────────────────────────┐
│ Call Kurzman Family · Due today after lunch        │
│ Enrollment · Follow-up                           │
│ [Edit in Create]  [Create ✓]  [Dismiss]          │
└──────────────────────────────────────────────────┘
```

Frame: `OperationalProposalCardFrame`.

---

## 11.7 Recurring Work management

Template list with recurrence label, next occurrence, pause/edit actions. Linked from Generators — not in queue body.

---

## 11.8 Folder management

Admin table: folder name, rule summary, count, reorder handles.

---

## 11.9 Projects

Projects folder shows parent cards. Drilling in scopes queue to children with project breadcrumb.

---

## 11.10 Component map

| Composition | Target component |
|-------------|------------------|
| Shell | `WorkItemsShell` |
| Health | `WorkspaceOperationalHealth` |
| Row | `WorkspaceQueueRow` (new) |
| Detail | `WorkItemDetailTabs` (new) |
| Create | `WorkItemCreateModal` (new) |
| Compact | BOS thread + envelope adapter |

---

## 11.11 Visual regression set

Capture on implementation:

1. Overview (no metrics)
2. Queue three-column + health strip
3. OVERDUE row selected + detail
4. Create modal conversation + preview
5. Compact BOS proposal in rail
