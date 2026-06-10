# Lifecycle Builder — Architecture Reality Check v1

**Status:** Manual configuration sprint (Enrollment first; reusable model)  
**Doctrine:** Manual UI configuration first. BOS assists later — not now.

---

## 1. Summary

| Need | Build now | Storage |
|------|-----------|---------|
| Lifecycle / process record | **Metadata + code catalog** | `lifecycleProcessTypes.ts`; future `lifecycle_processes` table |
| Department association | **Today** | `departments` row + hub department selector |
| Stages (name, order, active) | **Code catalog** (enrollment) | `LIFECYCLE_STAGE_ORDER`; future `lifecycle_stages` |
| Field-level requirements | **This slice** | `departments.metadata.lifecycle_progression_requirements_v1.stages.*.field_rules` |
| Object-level requirements | **Keep** (runtime + backward compat) | Same metadata `required_labels` / `recommended_labels` (auto-derived from field rules on save) |
| Status ↔ stage | **Shipped** | `status_definitions.metadata.enrollment_operator_stage` |
| Work unit / queue | **Read + link** | `work_units.queue_definition`; lane wizard deferred |
| Actions | **Read inventory** | `action_definitions` + `action_placements` |
| Forms coverage | **Best-effort** | Forms API + published schema vs requirement labels |
| Needs attention | **Link-out** | `departments.metadata.opportunity_attention_rules` |
| Entity field lists | **Catalog in code** | `lifecycleFieldRequirementsCatalog.ts`; merge with `field_definitions` later |

**No new rules engine. No new workflow engine. No BOS setup.**

---

## 2. Tables — reuse vs gap

| Table / store | Reuse for Lifecycle Builder |
|---------------|----------------------------|
| `departments` | Scope + `metadata.lifecycle_progression_requirements_v1` |
| `status_definitions` | Status keys + `enrollment_operator_stage` |
| `field_definitions` | Future: org field labels in palette (catalog first) |
| `work_units` | Pipeline lanes; auto-create from statuses **not yet safe** |
| `action_definitions` / `action_placements` | Stage action inventory |
| `form_definitions` / versions / links | Form coverage |
| `form_public_links` | Intake type → stage relevance |

| Gap | MVP | Later |
|-----|-----|-------|
| `lifecycle_processes` | Process type constant + enrollment route | Row per process (Billing, Incident, …) |
| `lifecycle_stages` | Fixed six stages in TS | CRUD stages per process |
| `lifecycle_stage_field_rules` | Nested in dept metadata | Normalized if cross-dept rules needed |
| `form_stage_links` | Intake type inference | Explicit form ↔ stage join |

---

## 3. Field-level requirements (this slice)

**Storage shape** (inside existing metadata key):

```json
{
  "lifecycle_progression_requirements_v1": {
    "version": 1,
    "stages": {
      "qualification": {
        "field_rules": {
          "required_rule_ids": ["child:first_name", "child:program_interest"],
          "recommended_rule_ids": ["child:desired_schedule"]
        },
        "required_labels": ["Child", "Program"],
        "recommended_labels": ["Desired Schedule"]
      }
    }
  }
}
```

- **UI:** entity selector + field labels only (no `field_key`, no JSON).
- **Save:** writes `field_rules`; derives object `required_labels` / `recommended_labels` for existing evaluator.
- **Runtime:** object-level preflight **unchanged**. Field-level enforcement is **partial** — catalog marks `runtime_enforced` per rule; UI shows gap note.

---

## 4. Manual configuration flow (target)

| Step | Status |
|------|--------|
| 1 Create lifecycle | Partial — Enrollment Process hub; no generic create UI |
| 2 Create stages | Code-defined; CRUD deferred |
| 3 Required information (field-level) | **Shipped** — dynamic palette, runtime enforcement (catalog fields), forms coverage |
| 4 Statuses | Editable in hub + Statuses page |
| 5 Work unit / queue | Read + drift warnings; auto-lane deferred |
| 6 Actions | Read inventory; placement edit via Action Buttons |
| 7 Forms | Coverage display; link forms deferred |
| 8 Needs attention | Link to Attention & SLA |
| 9 BOS | Placeholder only |

---

## 5. BOS later (document only)

1. BOS reviews stage requirements and gaps.  
2. BOS proposes stages, fields, statuses, forms, actions, queue lanes.  
3. Operator reviews proposal card.  
4. Operator applies via existing PATCH paths (metadata, statuses, placements).

---

## 6. Next slices (recommended order)

1. ~~Field-level requirements UI + metadata~~ **shipped May 2026**  
2. Org `field_definitions` merged into field palette  
3. Field-level runtime enforcement for catalog rules marked `runtime_enforced`  
4. `lifecycle_processes` + stage CRUD (Billing pilot)  
5. Safe queue lane proposal from stage statuses  
6. Form ↔ stage explicit links  
7. BOS proposal apply path  
