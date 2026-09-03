# 8. Current Work Integration — Work Items V3 (Frozen)

**Status:** FROZEN  
**Authority:** `docs/platform/operator/current-work-surface.md`

---

## 8.1 Relationship (frozen)

| Surface | Scope | Question |
|---------|-------|----------|
| **Work Items** | Cross-record | What must get done across processes? |
| **Current Work** | Record-scoped | What is this record's active stage work? |

Both consume **`operational_tasks` rows** for BP-generated work. Neither replaces the other.

---

## 8.2 Division of responsibility (frozen)

| Concern | Owner |
|---------|-------|
| Queue sort/filter/assign | Work Items |
| Checklist item definitions | Stage operating plan (config) |
| Checklist live state + handoffs | Current Work |
| Outcome picker + completion effects | Current Work |
| Cross-record "what's overdue for me" | Work Items |
| Record progression UX | Current Work |

---

## 8.3 Same row, two projections

BP spawn creates one `operational_tasks` row:

```
operational_tasks row
    ├── Work Items: queue row (title, due, assignee, breadcrumb)
    └── Current Work: template projection (checklist, outcomes, progress)
```

**Implementation:** Work Items MUST NOT re-implement `projectStageWorkRuntime` checklist logic.

---

## 8.4 Navigation contract (frozen)

Every Work Item with record anchor MUST offer **Open Record** → Focus Panel.

Default path for BP work with outcomes:

```
Work Items detail → Open Record → Current Work card → complete with outcome
```

| Alternative | Rejected |
|-------------|----------|
| Full outcome picker in Work Items detail v1 | Duplicates Current Work |
| Work Items completes without record open | Loses checklist context |

**Thin adapter (optional Phase 3):** Complete simple open tasks from inbox when no outcome/checklist — calls same PATCH/complete API.

---

## 8.5 Checklist in Work Item detail (frozen)

**Checklist tab:** Read-only projection from stage runtime OR honest empty state with link:

> "Checklist lives in Current Work. [Open record →]"

Optional: embed compact stepper (read-only) using shared `buildQueueCurrentWorkSummary` vocabulary.

**Forbidden:** Editable checklist items in Work Items that write to a parallel store.

---

## 8.6 Queue row vocabulary alignment (frozen)

Work Items rows for BP work SHOULD use same language as record queue rows where applicable:

```
Contact Family · 1 of 3 complete
```

Reuse `buildQueueCurrentWorkSummary` / `operationalTaskUrgencyBadge` helpers.

---

## 8.7 Completion semantics (frozen)

| Work Item kind | Complete path |
|----------------|---------------|
| Manual / BOS | `patchOperationalTaskStatus(completed)` |
| BP simple task | Same or stage API if effects configured |
| BP outcome-driven | `completeStageWorkWithOutcome` via record |

Work Items UI MUST detect outcome requirement from row metadata (`lifecycle_provenance`, runtime flags) and route operator accordingly.

---

## 8.8 Why not merge Current Work into Work Items?

| Alternative | Rejected because |
|-------------|------------------|
| Single inbox for everything | Record-scoped checklist UX wrong in cross-record modal |
| Eliminate Current Work | Breaks Focus Panel grammar, stage plan projection |
| Duplicate Current Work in detail | Two sources of checklist truth |

**Implementation implication:** Link, don't duplicate.

---

## 8.9 Key integration files (reference)

| File | Role |
|------|------|
| `CurrentWorkCard.tsx` | Record-scoped UI |
| `projectStageWorkRuntime` | Runtime projection |
| `completeStageWorkWithOutcome` | Outcome completion |
| `buildQueueCurrentWorkSummary.ts` | Shared row language |
| `MyTasksTaskCard.tsx` | WI detail (extend with tabs + link) |

---

## 8.10 Test contract

- BP-generated row appears in both WI queue and Current Work when record open
- Completing via Current Work removes/updates WI queue row
- WI detail never shows fabricated outcome lists
