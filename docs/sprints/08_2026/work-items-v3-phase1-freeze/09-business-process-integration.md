# 9. Business Process Integration — Work Items V3 (Frozen)

**Status:** FROZEN  
**Authority:** `docs/platform/core/business-process-system.md`, `operational-workspace-shell.md`

---

## 9.1 Canonical chain (frozen — do not modify)

```
Business Process → Stage → Operating Plan → Generated Work → Current Work → Operator
```

Work Items sits **after Generated Work** in the operator experience — it does not insert stages, replace operating plans, or evaluate transitions.

---

## 9.2 What Business Process owns (frozen)

| Concern | Owner |
|---------|-------|
| Stage definitions | `lifecycle_builder_v1` |
| Work templates | Stage operating plan |
| Spawn on stage entry | `instantiateStageWorkFromTemplate` |
| Outcome rules | `stageOutcomeRuleTargetExecutor` |
| Readiness gates | Stage runtime (partial) |
| Process promotion criteria | D8 (Operational Expansion RFC) |

**Work Items does NOT own any of the above.**

---

## 9.3 What Work Items owns (frozen)

| Concern | Owner |
|---------|-------|
| Listing generated + manual tasks | Work Items queue |
| Cross-process organization | Folders, views, process rail |
| Assignment / reschedule | Work Items actions |
| Operator discovery | Search, sort, health metrics |
| Creation of **non-BP** work | Creation runtime |
| Surfacing BP context on rows | Breadcrumb from metadata |

---

## 9.4 Metadata contract (frozen)

BP-generated rows carry (existing):

```json
{
  "department_id": "<business_process_id>",
  "lifecycle_stage_key": "<stage>",
  "work_definition_key": "<template_key>",
  "lifecycle_provenance": "lifecycle_template",
  "provenance": { ... }
}
```

Work Items grouping (`deriveWorkItemsProcessGroups`) uses **only explicit metadata** — never fabricates process from `entity_type` alone.

---

## 9.5 Navigation tiers (frozen)

| Tier | Status | Role |
|------|--------|------|
| Business Process | **Root** | Rail/folder anchor |
| Work View | **Target** | Operator lens (record queues) |
| Stage | **Interim** | Subgroup until Work Views render in WI |
| Work Item | **Artifact** | Selectable row |

**Phase 2+:** Render configured Work Views inside Work Items; Stage subgroups deprecate.

---

## 9.6 Two streams convergence (frozen plan)

| Stream | Today | Target |
|--------|-------|--------|
| Record-queue work | Work Unit → queue → drawer | Same row grammar in WI (preview → open record) |
| Discrete tasks | Work Items modal | Primary home (already) |

**Hybrid model approved:** Work Items becomes process-first entry for **both**, phased.

| Alternative | Rejected |
|-------------|----------|
| Merge tables | Record queues ≠ operational_tasks |
| Separate task product per process | Parallel execution systems |
| WI replaces workspace queues | Work Views still authoritative for record selection |

---

## 9.7 BP work creation paths (frozen)

Work Items **never spawns** BP work. Generation paths:

1. Stage entry template instantiation
2. Outcome rule `create_next_work`
3. (Future) Recurring template linked to BP definition

Manual/BOS create may **attach** BP context (`department_id`, `stage_key`) but does not trigger stage transitions.

---

## 9.8 General / Cross-process bucket (frozen)

Tasks without `department_id`:

- Manual creates
- BOS creates (unless operator links process)
- Task Assist
- Workflow tasks missing department resolution

**Honest labeling:** "General / Cross-process" — never fake a BP name.

---

## 9.9 Label gap (known, Phase 2)

Client lacks BP name and Stage label API — uses fallback labels. Implementation MUST expose `processLabels` / `stageLabels` to `deriveWorkItemsProcessGroups` when available.

---

## 9.10 D8 alignment (frozen)

Do not promote arbitrary sequences to Business Process to get them into Work Items. Use:

- `operational_tasks` for operator commitments
- Domain queues for fact/consequence lifecycles (attendance, billing review)

Enrollment remains reference BP implementation.

---

## 9.11 Implementation implications

- Process rail → Folder rules migration preserves `department_id` matching
- Open record should eventually pass Work View / layout context (Phase 2 gap)
- BP builder "Generators" count = active processes with operating plans
