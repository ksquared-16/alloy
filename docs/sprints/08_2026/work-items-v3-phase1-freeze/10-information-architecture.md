# 10. Information Architecture — Work Items V3 (Frozen)

**Status:** FROZEN

---

## 10.1 Top-level navigation

| Element | Value |
|---------|-------|
| Left nav label | **Work** |
| Modal title | **Work Items** |
| Route | `/adminV2/tasks` (modal overlay) |
| Shell | `AdminV2WorkspaceBosModalShell` |
| Active nav | `useActiveAdminV2WorkspaceModal()` |

---

## 10.2 Section structure

```
Work Items
├── Overview (launch / orient)
└── Queue (execute)
```

**No Work/Studio switch** — Work Items has no design-time assets. Configuration lives in Settings (folders) and BP builder (generators).

---

## 10.3 Overview IA (frozen)

**Metrics:** NONE — no nav-band strip, no body KPI tiles.

**Content zones:**

1. **Primary action card** — Create & Ask BOS
2. **Continue cards** — Overdue count, Waiting count (semantic borders, not KPI boxes)
3. **Continue work list** — Compact queue row previews
4. **Recent activity** — Completed, assigned events
5. **Quick links** — All work · Mine · Overdue · Generators

**Header CTA:** Create & Ask BOS (primary juniper) — replaces "New task"

---

## 10.4 Queue IA (frozen)

**Nav-band health (Queue only):** Assigned · Waiting · Due Soon · Overdue

**Three columns:**

| Column | Content |
|--------|---------|
| Left rail | Folders · Views · Work Item Generators |
| Center | Search · quick filters · sort · rows |
| Right | Detail tabs · BOS summary · footer composer |

**Quick filters (center header):** All work · Mine · Unassigned  
**Sort default:** Due date

---

## 10.5 Detail IA (frozen)

**Tabs:** Details · Record context · Activity · Comments · Checklist · Files

**Details tab sections:**
- BOS Summary (read-only)
- Description
- Fields grid (type, priority, tags, status, due, assignee, waiting on)
- If-not-completed panel (when `follow_on[]` present)

**Side context panels:**
- Record
- Business Process (stage indicator)
- Relationships
- BOS Insight

---

## 10.6 Conversation Runtime IA (frozen)

**Full Create modal:**

| Region | Width | Content |
|--------|-------|---------|
| Conversation | ~40% | BOS thread, chips, composer |
| Preview | ~60% | Live WorkItemDraftV1 binding |
| Footer actions | Full | Preview · Create ✓ · Close |

**Entry:** Overview CTA, Queue CTA, BOS "Edit in Create"

---

## 10.7 Compact BOS proposal IA (frozen)

In-thread card below BOS structured summary:

- Title + key fields
- Actions: Edit in Create · Create ✓ · Dismiss

---

## 10.8 Recurring management IA (frozen)

Separate admin surface (linked from Generators):

- Template list with humanized recurrence
- Active/pause toggle
- Next occurrences preview
- Edit template (recurrence builder + work blueprint)

**Not embedded in queue shell.**

---

## 10.9 Folder management IA (frozen)

**Settings → Work Items → Folders**

- List org folders
- Edit name + match rules
- Reorder
- Preview count

---

## 10.10 Projects IA (frozen)

- **Projects folder** lists parent Work Items (`shape: project_container`)
- Selecting parent scopes queue to children
- Breadcrumb on child rows includes project name

---

## 10.11 Cross-product consistency (frozen)

| Pattern | Processing | Communications | Work Items |
|---------|------------|----------------|------------|
| Overview = launch | ✅ | ✅ | ✅ |
| Queue = nav metrics | ✅ | Section-scoped | ✅ |
| Overview = no nav metrics | ✅ | ✅ | ✅ |
| Two-pane selection | ✅ | ✅ | ✅ three-column |
| Shared shell primitives | ✅ | ✅ | ✅ |

---

## 10.12 URL / session state (Phase 2)

| Param | Purpose |
|-------|---------|
| `workView` | overview \| queue |
| `folder` | folder key |
| `view` | view key |
| `taskId` | selection |
| `create` | draft_id |

---

## 10.13 BOS rail coexistence (frozen)

Work Items modal open + BOS rail available. Create intents bind to shared draft — not a second form in the rail.
