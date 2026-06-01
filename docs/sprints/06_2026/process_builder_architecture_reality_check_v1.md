# Process Builder — Architecture Reality Check v1

**Path:** `docs/sprints/06_2026/process_builder_architecture_reality_check_v1.md`  
**Status:** Step 1 deliverable (Enrollment Process hub sprint)  
**Doctrine:** Lifecycle = reusable process type · Enrollment Process = first lifecycle instance · Stages = lanes within the process

---

## 1. Recommendation summary

**Ship the Enrollment Process hub as a Settings composition layer** over existing storage. **Do not** add `lifecycles` / `lifecycle_stages` tables in this sprint.

| Need | MVP approach |
|------|----------------|
| Process / lifecycle definition | **Code catalog** `lifecycleProcessTypes.ts` + enrollment key constant; future table optional |
| Stages | **Code catalog** `LIFECYCLE_STAGE_ORDER` (existing); per-dept overrides in metadata |
| Status ↔ stage | **`status_definitions.metadata.enrollment_operator_stage`** (shipped); canonical fallback in `enrollmentProcessStageBindings.ts` |
| Stage ↔ work unit / queue | **Today:** single `enrollment_pipeline` WU + `queue_definition` queues filtered by stage map; **not** one WU per stage yet |
| Requirements per stage | `departments.metadata.lifecycle_progression_requirements_v1` ✅ |
| Action placement by stage | `action_placements` + inventory API; stage association via action `key` ↔ typical-actions map |
| Forms satisfying requirements | **Display only** — static form↔requirement map + link to Forms; no new join table |
| Attention per stage | `departments.metadata.opportunity_attention_rules` ✅ |

---

## 2. Tables to reuse (no new engine)

| Table / store | Role in process model |
|---------------|----------------------|
| `departments` | Scope root; `metadata.lifecycle_progression_requirements_v1`, `metadata.opportunity_attention_rules` |
| `work_units` | Operational container; `key=enrollment_pipeline` holds all enrollment lanes in `queue_definition` |
| `status_definitions` | CRM status keys + labels; bind to stage via metadata (future) or canonical map (now) |
| `action_definitions` | Platform buttons (handlers in code) |
| `action_placements` | Where buttons appear |
| `field_definitions` / `field_placements_v1` | Entity capture (Fields / Layouts — outside process spine) |
| `forms` / `form_links` | Capture mechanisms (link-out from hub) |
| `status_transition_rules` | Advanced automation (read-only UI today) |

**No new tables required** for Enrollment Process hub shell (H1–H6).

---

## 3. Metadata fields (temporary binding layer)

| Key | Location | Purpose |
|-----|----------|---------|
| `lifecycle_progression_requirements_v1` | `departments.metadata` | Per-stage required/recommended **object** labels |
| `opportunity_attention_rules` | `departments.metadata` | NA buckets, thresholds |
| `enrollment_operator_stage` | `status_definitions.metadata` (**proposed**) | `lead` \| `qualification` \| … \| `enrolled` |
| `queue_definition` | `work_units` | Lane filters (status keys); v2 enrollment pipeline |
| `lifecycle_stage` | `status_definitions.metadata` | **CRM enum** (intake/execution/…) — do not use for operator UI |

---

## 4. Schema gaps (future platform, not blocking MVP)

| Gap | Why it matters later | MVP workaround |
|-----|----------------------|----------------|
| No `lifecycle_processes` row | Cannot add Billing/Incident from UI without code | Process type constant + catalog |
| No `lifecycle_stages` row | Cannot reorder/rename stages per org | Fixed six stages in TS |
| No `stage_id` on `work_units` | One pipeline WU, not stage-owned WUs | Queue keys mapped to stages in code |
| No `form_requirement_coverage` | Cannot prove form satisfies requirement in DB | Static display + Forms link |
| No editable `condition_config` | Stage-gated visibility is migration-seeded | Read-only in hub |

---

## 5. Stage → work unit (today vs target)

**Today:** One work unit (`enrollment_pipeline`) with **multiple queues** inside `queue_definition`. Stages map to **queue labels**, not separate work unit rows.

**Target (later):** Optional “Create lane for this stage” generates/updates a queue entry inside the pipeline definition — **not** a new work unit per stage unless product chooses that model.

**Create Work Unit per stage:** **Not safe** in MVP — POST requires valid `queue_definition`; auto-seeding lane JSON is a follow-on (H7 in hub spec).

---

## 6. Runtime (unchanged)

- Preflight: `evaluateLifecycleActionRequirements` + dept metadata merge  
- Queues: `QueueService` reads `work_units.queue_definition`  
- No new evaluator; hub is **configuration UX only**

---

## 7. Extensibility (billing, incident, hiring, subsidy)

| Layer | Extensible how |
|-------|----------------|
| Process type | Add entry to `LIFECYCLE_PROCESS_TYPES` with its own stage order + bindings file |
| Enrollment | `process_key: enrollment` hard-coded in routes first; pattern repeats |
| Storage | Same metadata keys namespaced: `lifecycle_progression_requirements_v1` could become `process_configs.enrollment` later |

**Do not** generalize routes in this sprint — only **structure code** so enrollment is one instance.

---

## 8. BOS future hook (documentation only)

Placement: Enrollment Process **Overview** footer or empty state:

> *Future: Ask BOS to suggest stages, actions, and requirements for a new process (e.g. billing or collections).*

BOS would propose patches to metadata + queue_definition via existing Config Assist / proposal paths — not a new rules engine.

---

## 9. Next implementation order (after hub shell)

1. ~~H3 — `enrollment_operator_stage` on statuses~~ (shipped — Enrollment Process hub + `/api/admin/enrollment-process/status-stages`)  
2. H5 — Lane proposal wizard + queue filter sync hints  
3. H7 — Lane proposal wizard (confirm before write)  
4. H8 — Suggested action placements  
5. Generalize process type registry when second vertical needs Settings  
