# Configuration Ownership Doctrine

**Status:** Active — Business Processes V3 (June 2026).

**Workspace layout:** See `configuration-workspace-v1-doctrine.md` for domain grouping (Organization / Data Model / Operations / Experience).

## Purpose

Alloy had multiple configuration surfaces controlling the same concepts (statuses, fields, actions, queues). This doctrine establishes **one owner per concept** so operator UI stays simple and runtime has a single source of truth.

Business Processes **consumes** platform definitions. It does not recreate them.

---

## Canonical ownership

| Surface | Owns | Does **not** own |
|---------|------|------------------|
| **Fields** (`/admin/settings/fields`) | Field definitions, types, **editable labels**, help text, option bindings, **native reference fields** (`option_source`, `field_kind: entity_reference`) | Drawer placement, stage requiredness, queue layout, human relationship vocabulary |
| **Relationships** (`/admin/settings/relationships`) | **Person/family relationship vocabulary** — customer ↔ person roles, person ↔ person types | Native FK / entity reference authoring (use **Fields**) |
| **Layouts** (`/admin/settings/layouts`) | Drawer/queue **presentation**: section order, field placement (`field_placements_v1`), queue row layout (`metadata.queue_record_layout`), **editable native reference fields when placed** (e.g. `opportunity.location_id`) | Field definitions, stage rollups, action definitions |
| **Statuses** (`/admin/settings/statuses`) | Status **vocabulary**: label, color, sort order, active/inactive | Which stage a status rolls up into |
| **Business Processes** (`/admin/settings/business-processes`) | Process/stage structure, **stage status rollups**, stage requiredness/recommendation (e.g. Lead → Location via `opportunity:location`), action availability & stage restrictions, membership subject/count, **Operating Plan per stage** | Status labels, field definitions, queue row layout, action handler semantics |
| **Actions** (`/admin/settings/actions`) | Action **definitions** and global placement rows | Per-process enablement (Business Processes) |
| **Work Units** (runtime) | Queue lane execution, filters applied at runtime | Operator configuration (derived from Business Processes + Layouts) |

---

## Status ownership

### Old model (deprecated)

| Surface | Owned |
|---------|--------|
| Statuses page | Label + **Enrollment Stage** column (`process_stage_key` via edit) |
| Business Processes | Stage rollups (checkboxes) |
| Queue membership UI | `included_keys` status checkboxes |

### New model

| Surface | Owns |
|---------|------|
| **Statuses** | Vocabulary only |
| **Business Processes → Stage Membership → Included statuses** | Stage assignment / rollups |
| **Queue membership** | Subject type, count unit, location scope only — **no status UI** |

On **Save stage**, `queueMembershipWithSyncedStatusKeys()` derives `queue_membership_v1.included_*` from selected stage statuses. Runtime queue filters follow stage rollups.

### Migration & compatibility

- Existing `status_definitions.metadata.process_stage_key` values remain readable via `effectiveEnrollmentOperatorStage()` fallback.
- **Canonical write path:** `persistEnrollmentStageStatusAssignments` when saving a Business Process stage.
- Statuses page no longer PATCHes `process_stage_key`. Re-assign stages in Business Processes if needed after migration.

---

## Stage requirements ownership

### Old model

| Storage | Purpose |
|---------|---------|
| `departments.metadata.lifecycle_builder_stage_field_rules_v1` | Stage required/recommended `rule_id`s |
| Layout `field_placements_v1` | Drawer requiredness per layout |

Parallel palettes → field lists did not match.

### Current model (interim)

- Palette merges **org `field_definitions`** (via `loadOrgFieldDefinitionsForLifecycle`) with **platform `LIFECYCLE_FIELD_REQUIREMENT_CATALOG`**.
- Persistence remains `lifecycle_builder_stage_field_rules_v1` until convergence.

### Target model

- Stage requiredness keyed by **`field_definitions` id / field_key** (same registry as Layouts).
- Layouts continue to own **placement and drawer requiredness**; Business Processes own **stage progression requiredness**.

### Migration plan (deferred)

1. Map existing `rule_id` → `field_key` + entity.
2. Dual-read: builder rules + layout placements during transition.
3. Write new `stage_field_requirements_v1` keyed by field registry.
4. Deprecate lifecycle field rule catalog entries that duplicate Fields registry.

**Risk:** Runtime evaluators (`lifecycleFieldRuleEvaluator`, forms coverage) bind to `rule_id` today — migration requires coordinated runtime cutover.

---

## Action ownership

### Old model

- Stage configuration “Actions in this stage” section
- Process Actions matrix
- Global Actions settings

### New model

| Surface | Owns |
|---------|------|
| **Actions settings** | Action definitions, global placements |
| **Business Processes → Process Actions** | Process-level enablement, placements, optional stage restrictions |
| **Stages** | Participate in restrictions only — **no stage-level Actions section** |

---

## Queue ownership

### Old model

- Queue presentation section in stage configuration
- Layouts queue row layout
- Work unit sync UI in Business Processes

### New model

| Surface | Owns |
|---------|------|
| **Layouts** | Queue row appearance |
| **Business Processes** | Stage membership + status rollups (defines **what** appears in a lane) |
| **Runtime (internal)** | `work_units` lane sync on Save stage — not operator-facing |

Queue presentation was **removed** from stage configuration UI. Lane sync still runs in `saveLifecycleStageRuntimeConfig`.

---

## Field model convergence (V4)

Status, action, and queue ownership are addressed in V3. **Field registry convergence** (Fields → Layouts → Forms → Business Processes) is documented separately:

**`docs/system/field-model-convergence-doctrine.md`**

---

## Related docs

- `docs/system/settings-v2-doctrine.md` — Settings V2 visual/IA patterns
- `docs/system/configuration-system.md` — Four-plane control plane overview
- `docs/system/field-model-convergence-doctrine.md` — canonical `field_definitions` and migration plan
