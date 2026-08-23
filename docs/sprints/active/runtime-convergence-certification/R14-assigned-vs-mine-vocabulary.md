# R14 — Assigned vs Mine Product Vocabulary

**Status: DECISION REQUIRED.** The ambiguity is real and operator-facing: `Assigned` and `Mine`
render together, on desktop and mobile, with nothing indicating that one is broader. But the two
metrics differ on **three** axes, not the one R14 names — and the wording R14 prefers for the broader
metric is explicitly disallowed by R14's own rule once the third axis is known. Choosing among the
remaining accurate terms is a product preference, so no production code was changed.

Measured on a production build of staging `f0029b804`.

---

## 1. Proven semantics (from the canonical query owner, not the labels)

`lib/admin/operationalTasksService.ts::listOperationalTasksForWorkspace` is the single query owner:

```ts
.from("operational_tasks").eq("org_id", orgId)
if (filter !== "all" && filter !== "completed") q = q.eq("status", "open");
if (filter === "assigned_to_me")  q = q.eq("assigned_to_user_id", userId);
else if (filter === "unassigned") q = q.is("assigned_to_user_id", null);
```

| | KPI `Assigned` | View `Mine` |
|---|---|---|
| Owner | `WorkItemsKpiStrip` → `deriveQueueAssignmentCounts` | `FoldersViewsSourcesRail` → `countTasksForView` |
| Server filter | `open` (no user clause) | `assigned_to_me` |
| Assignee scope | **any** operator (`assigned_to_user_id` non-empty) | **current** operator only |
| Unassigned | excluded (counted as KPI `Waiting`) | excluded |
| Includes current operator | **yes** — `Mine` is a subset on this axis | — |
| Source scope | **`operational_tasks` only** | **three sources**: operational tasks + Processing + Communications (`mergedTasks`) |
| Site scope | **org-wide, always** | **site-scoped** when a site is selected (`siteScopedTasks`) |
| Rendered as | count in the header metrics band | rail entry + count, and a filter |

Team/group assignment and delegation **do not exist**: `assigned_to_user_id` is a single column, so
`Mine` is direct assignment and nothing else. Both are counts *and* filters; neither is a tooltip.

## 2. Ambiguity is operator-facing — measured

`MyTasksModal` (the primary UX) renders `WorkItemsShell` — which supplies the KPI band — wrapping
`MyTasksPanel`, which supplies the view rail. On the **Queue** section both are on screen at once.
(On **Overview** the band is deliberately hidden, so the ambiguity does not arise there.)

Captured live at 1440 px and 390 px, identical at both:

| Surface | Rendered |
|---|---|
| KPI band | `Assigned 1` · `Waiting 0` · `Due Soon 0` · `Overdue 1` |
| View rail | `Mine 0` · `Unassigned 10` · `Waiting 0` · `Due Today 1` · `Due Soon 0` · `Overdue 1` · `Completed 0` |
| Both labels visible together | **YES** (desktop and mobile) |
| Truncation | none at either width today |

Answers to the Phase 2 questions:

- **Do the labels appear together?** Yes — desktop and mobile, on the Queue section.
- **Can "Assigned" be read as "assigned to me"?** Yes. Nothing on the band says otherwise, and it sits
  directly above a rail whose first entry is the operator's own work.
- **Can "Mine" be read as ownership rather than assignment?** Partly mitigated — it sits next to
  `Unassigned`, which implies an assignment axis — but the word itself does not say "assigned".
- **Does clicking reveal the difference?** No. `Mine` filters; the KPI count is not a control, so the
  operator cannot interrogate it.
- **Desktop, mobile, or both?** Both, identically.
- **Real operator issue, or only inconsistent source naming?** Real: `Assigned 1` and `Mine 0` are
  simultaneously visible and invite a comparison the data does not support.

## 3. Why this is a decision and not a determination

R14 frames one axis ("Assigned = broader assignment metric, Mine = current operator"). Measurement
found **three**. The consequence is specific:

- R14's preferred term for "assigned to any operator" is **`All assigned`**, and R14 also says *"Do
  not use `All assigned` if the metric excludes a meaningful assigned category."* The KPI excludes
  Processing (8 items) and Communications (2 items). **So the preferred term is disallowed here.**
- The obvious substitute, `Assigned to anyone`, is accurate on the assignee axis but makes the two
  labels look precisely comparable — implying `Mine ⊆ Assigned` drawn from one population. They are
  not: different source sets and different site scoping. Today's vague labels give the operator no
  reason to compare the two numbers; precise-sounding labels would invite exactly that.

The live numbers show how easily this misleads. `Assigned 1` + rail `Unassigned 10` = the rail's
`All Work 11`, which reads as a coherent split — but the KPI's own pair (`Assigned 1` + `Waiting 0`)
proves its population is **1**, not 11. Sharpening only the assignee wording would make that false
coherence more convincing, not less.

Fixing the source/site axes is out of scope: R14 forbids changing metric definitions, queries, counts,
filtering and assignment semantics.

## 4. Options

| | Change | Accurate? | Risk |
|---|---|---|---|
| **A** | KPI `Assigned` → **`Tasks assigned`**; rail `Mine` → **`Assigned to me`** | Yes on both. The KPI names its own population, so it no longer implies coverage of Processing/Communications. | Smallest wording that is true on all three axes. "Tasks" must read as the operational-task source, not as all work. |
| **B** | KPI `Assigned` → **`Assigned to anyone`**; rail `Mine` → **`Assigned to me`** | Assignee axis only. | Implies the two counts share a population. Directly resolves R14's named ambiguity but can mislead more than the status quo. |
| **C** | Rail `Mine` → **`Assigned to me`**; KPI label unchanged | Yes. The band's eyebrow already reads `Queue`, scoping it implicitly. | Smallest possible change; removes the ownership reading and the "Assigned = mine?" reading without over-promising comparability. Leaves `Assigned` vague. |

**Recommended: C, or A if both labels should be explicit.** Both are true on every axis. B is the
only option that would state something the data does not support.

Mobile fit: the rail label is `<span className="truncate">` at 11 px; `Assigned to me` is longer than
`Mine` and would need a truncation check at 390 px before shipping. The KPI band label sits in
`WorkspaceOperationalHealth`; `Tasks assigned` is one character shorter than `Assigned to anyone`.
Accessible names come from the visible text in both components — no separate aria label to update.

Affected surfaces if a change is authorized: `WORK_ITEM_VIEW_DEFS` (`lib/workItems/workItemQueueScope.ts`),
`WorkItemsKpiStrip.tsx`, and the fallback string `?? "Mine"` in `MyTasksPanel.tsx:712`. Internal keys
(`mine`, `assigned`, `data-work-items-view`) would stay unchanged. Tests referencing the visible copy
would need updating; none assert count equality today.

## 5. Adjacent findings — recorded, not acted on

- **`Waiting` means two different things.** The KPI band's `Waiting` is the *unassigned* operational
  tasks bucket (`deriveQueueAssignmentCounts` increments it when there is no assignee), while the rail
  has a separate `Waiting` view *and* a separate `Unassigned` view. Both read 0 in this tenant, so the
  collision is currently invisible.
- **`Mine` is also used as an assignee-picker option** (`OperationalWorkAssigneeSelect.tsx:75`,
  `Mine (name)`), where it means "assign to me" — an action target rather than a metric scope. Left
  alone; it is not one of the two metrics.

## 6. Evidence

`web/scripts/r14Vocabulary.mjs` — opens the Tasks modal, switches to the Queue section, and captures
the KPI band and view rail at desktop and mobile widths. Read-only, PE3 conventions, refuses a
non-local base or a stale `.next-prodcert`, disposes the browser through `try/finally`, console output
only (no durable file, no subject identifiers). No certification data was mutated; no pin, task or
assignment was created or changed.
