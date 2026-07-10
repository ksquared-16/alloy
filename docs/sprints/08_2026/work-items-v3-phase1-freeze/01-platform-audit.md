# 1. Platform Audit — Work Items V3 Phase 1 Freeze

**Baseline:** `origin/staging` @ `db0276591`  
**Method:** Direct code + doctrine read on staging tip. No reliance on prior chat audits.

---

## 1.1 Staging verification

| Check | Result |
|-------|--------|
| Staging SHA | `db027659143e833ed4b4e9148ffb9a73bf87baae` |
| New since prior V3 sprint | Operational Expansion Phase 1 RFC frozen (`operational-expansion-phase1-architecture-rfc.md`) |
| Work Items runtime on staging | Unchanged — Doctrine V2 shell + Operational Health V3 (Queue-only nav metrics) |

---

## 1.2 Platform context (staging)

### Operational Expansion Wave 1 (frozen separately)

The Operational Expansion RFC (D1–D12) governs Scheduling, Attendance, Billing, etc. Work Items V3 must **compose with**, not contradict:

- **D8:** Business Process promotion criteria — Work Items surfaces BP-generated work; does not create parallel processes
- **D10:** Presentation never computes — queue rows consume read models
- **D11:** BOS proposes; human commits; no autonomous side effects
- **D9:** Mutations via registered Operational Commands — Work Item **creation** is an operational API commit, not inline UI mutation

### Operational workspace shell (frozen)

`docs/platform/operator/operational-workspace-shell.md` defines:

- Work Items as cross-process operational work entry point
- Hybrid two-stream model (record queue + discrete tasks)
- BP → Work View → Operational Work → Focus Panel chain
- Shared `WorkspaceShell` primitive stack

---

## 1.3 Work Items implementation (staging)

| Surface | File(s) | Assessment |
|---------|---------|------------|
| Modal host | `MyTasksModal.tsx` → `AdminV2WorkspaceBosModalShell` | ✅ Correct shell |
| Shell | `WorkItemsShell.tsx` | ✅ `WorkspaceShell`; Overview hides nav metrics |
| Overview | `WorkItemsOverviewLanding.tsx` | ✅ Action-first; no KPI tiles |
| Queue | `MyTasksPanel.tsx` | ⚠️ Process rail only; no Folders/Views/Generators |
| KPI strip | `WorkItemsKpiStrip.tsx` → `WorkspaceOperationalHealth` | ✅ Queue-only: Assigned · Waiting · Due Soon · Overdue |
| Create | `MyTasksCreateTaskCard.tsx` | ❌ Form-first; not conversation-first |
| Detail | `MyTasksTaskCard.tsx` | ⚠️ Single card; no tabs; no BOS summary |
| Grouping | `myTasksProcessGroups.ts` | ✅ BP metadata honest grouping; Stage interim |
| API | `operationalTasksService.ts`, Task Assist API | ✅ `operational_tasks` persistence |
| BP spawn | `instantiateStageWorkFromTemplate`, outcome executors | ✅ Generates rows with metadata |
| Current Work | `CurrentWorkCard.tsx`, `projectStageWorkRuntime` | ✅ Record-scoped; separate surface |

### Gap vs V3 target

| Capability | Staging | V3 contract |
|------------|---------|-------------|
| Operator term "Work Item" | Partial ("New task" button) | Frozen: Work Item everywhere in UI |
| Conversation-first create | Missing | Frozen: one creation runtime |
| Folders / Views / Generators | Missing | Frozen: left rail IA |
| Tabbed detail + BOS summary | Missing | Frozen: detail composition |
| Shared queue row primitive | Partial (module-specific cards) | Frozen: canonical row grammar |
| BOS compact proposal → Create | Fragmented (Task Assist separate) | Frozen: shared `WorkItemDraftV1` |

---

## 1.4 Processing reference

| Pattern | Implementation |
|---------|----------------|
| Shell | `DigitalMailroomShell` → `WorkspaceShell` |
| Overview | No nav-band metrics; body action cards |
| Queue | Folder rail + lanes + health strip in nav band |
| Row grammar | Source icon, title, badge, breadcrumb, snippet |

**Takeaway:** Work Items Queue must converge on same structural grammar.

---

## 1.5 Communications reference

| Pattern | Implementation |
|---------|----------------|
| Sections | Overview · Inbox · Announcements · Scheduled |
| Queue | Conversation list → thread workspace |
| Metrics | Section-scoped operational health |

**Takeaway:** Views are lenses; queue→detail is two-pane selection model.

---

## 1.6 Business Process / Current Work chain

**Shipped on staging:**

```
departments.metadata.lifecycle_builder_v1
  → stage operating plans (work_templates[])
  → instantiateStageWorkFromTemplate / outcome rules
  → operational_tasks (BP metadata stamped)
  → projectStageWorkRuntime
  → CurrentWorkCard (Focus Panel)
```

**Work Items reads** the same `operational_tasks` rows. **Current Work projects** stage checklist/outcomes for the open record.

**Critical boundary:** Checklist truth and outcome completion stay in Current Work path unless explicitly approved as thin inbox adapter.

---

## 1.7 BOS / Task Assist today

| Component | Role |
|-----------|------|
| `GlobalAssistantContext` | Entity seed, thread state |
| `AICommandSurfaceShell` | Conversation UI |
| `routeCommandSurface` | Intent routing |
| `BosProposalEnvelopeV1` | Proposal card frame |
| Task Assist | Propose → approve → `operational_tasks` (`source: task_assist`) |

**Fragmentation:** Work Items create form is **separate** from BOS thread. V3 freeze mandates convergence.

---

## 1.8 Audit conclusion

Work Items V3 is a **platform elevation** of existing infrastructure:

1. Presentation + IA on `operational_tasks`
2. Unified creation runtime with BOS
3. Queue grammar shared across operational modules
4. Convergence with BP / Work View doctrine (phased)

**No new execution engine required.**
