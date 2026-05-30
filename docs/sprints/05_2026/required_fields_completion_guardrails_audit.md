# Required Fields + Completion Guardrails — Audit (Phase 1)

**Path:** `docs/sprints/05_2026/required_fields_completion_guardrails_audit.md`  
**Status:** Sprint B — Phase 1 complete  
**Date:** 2026-05-30

## Purpose

Inventory existing requiredness and validation before contextual completion guardrails. Sprint B runs parallel to Sprint A (person drawer layout runtime migration) — this audit avoids binding requiredness to hardcoded React sections.

---

## Executive summary

| Layer | Maturity | Gap |
|-------|----------|-----|
| **Config model** | Strong (`field_definitions.requirement_policy`, `field_placements_v1`, `status_transition_rules`) | Advanced policy modes parsed but rarely enforced |
| **Opportunity drawer** | Server PATCH + layout placement resolution | Status transition rules parallel to field policies |
| **Person drawer** | UI-only summary fields; `_field_definitions` attached | No server PATCH enforcement until Sprint B slice |
| **Forms / intake** | Full server validation (`validateFormPayload`) | Separate model from drawer/record guardrails |
| **Work units** | Scoped via opportunity + `status_transition_rules` | No dedicated WU transition API |

**Reusable foundation:** Layout + field behavior semantics v1 (`docs/sprints/05_2026/layout_field_behavior_semantics_v1.md`) — opportunity `field_placements_v1` + `enforceDrawerFieldPoliciesOnPatch`.

---

## 1. Schema & storage

### `field_definitions`

| Column | Role |
|--------|------|
| `is_required` | Legacy boolean; backfilled from `requirement_policy` |
| `requirement_policy` | JSON v1 — modes: `required`, `optional`, `required_on_save`, `conditionally_required`, `required_before_status_change`, `required_before_action` |
| `interaction_policy` | Editability (separate from requiredness) |

**DB enforcement:** None — no CHECK/trigger on non-null values.

**Canonical evaluator:** `web/lib/fields/fieldRequirementPolicy.ts`

### `field_section_definitions`

Grouping + `section_config` only. No requirement semantics at section level today.

### `field_values`

Typed custom field storage. Written via `upsertFieldValuesFromBody` **without** requiredness checks for person/inquiry_child.

### `record_drawer_layouts`

- `config_json.field_placements_v1[]` — per-field requirement/editability overlay (opportunity workflow v1 only)
- Person layout rows exist for Settings preview; **not runtime** (Sprint A in progress)

### `status_transition_rules`

Org-scoped transition guardrails: `required_metadata_fields`, `required_payload_fields`, `blocked`, scoped by department/work_unit/action/from/to status.

Seeded example: enrollment WU → `tour_scheduled` requires `tour_date`, `tour_time` in payload.

---

## 2. What requiredness exists today?

### By surface

| Surface | Config | UI hint | Server save | Transition | Notes |
|---------|--------|---------|-------------|------------|-------|
| Opportunity drawer | Yes (placements + defs) | `*` chrome via `_field_policy_resolved` | Yes — `enforceDrawerFieldPoliciesOnPatch` | Partial — `status_transition_rules` only | Modes: `required`, `required_on_save` enforced on PATCH |
| Job drawer | Definition only | Partial | Yes (defs) | Via admin actions | No layout placement plane |
| Person drawer (child/parent) | Partial seeds on `field_definitions` | Hardcoded summary JSX | **No** (pre–Sprint B) | No | Sprint A migrating layout; Sprint B uses entity/field-key evaluator |
| Inquiry child (OCM) | Yes | Placement disable rules | Placement scope only (`validateInquiryChildPlacementPatch`) | Lifecycle status helper | No field requiredness on PATCH |
| Forms (admin/public) | Form schema `required` | Yes | Yes — `validateFormPayload` | N/A | Parallel validation model |
| Book-v2 | Visibility seeds | HTML/required | Route-specific hardcoded | N/A | Not policy-driven |

### By enforcement type

| Type | Examples | Server? |
|------|----------|---------|
| **UI-only** | Person summary save (pre-B), HTML `required` on modals | No |
| **Server PATCH** | Opportunity/job field policies | Yes |
| **Form-only** | Public intake submit | Yes (forms path) |
| **Transition-specific** | `status_transition_rules`, tour booking mirror | Yes |
| **Action hardcoded** | `add_related_person` first/last name in `executeAdminAction` | Yes (not config) |
| **Integrity (read-only)** | `layoutIntegrityValidator` — required-but-hidden | Diagnostic only |

---

## 3. What is missing entirely?

1. **Contextual completion model** unified across person, opportunity, household (Sprint B delivers code-based slice + structured output).
2. **Advanced field policy modes** enforced on save/transition (`required_before_status_change`, `conditionally_required`, role/profile gates).
3. **Dual transition systems** — `status_transition_rules` (metadata/payload keys) vs `field_definitions` status modes — not merged until Sprint B bridge.
4. **Person PATCH validation** — native summary fields bypass registry.
5. **Completion / readiness state** — no record-level completion percentage; integrity report is Settings-only.
6. **BOS consumption** — no structured missing-requirement payload (Sprint B adds `RequirementValidationResult` + `bosIntegration.ts`).
7. **Settings UI for org-authored completion policies** — deferred (see policy doc §Deferred).

---

## 4. Reusable config (Sprint B building blocks)

| Asset | Path | Sprint B use |
|-------|------|--------------|
| Policy JSON + evaluator | `web/lib/fields/fieldRequirementPolicy.ts` | Extend phases; map to structured violations |
| Effective behavior resolver | `web/lib/fields/resolveEffectiveFieldBehavior.ts` | Future: person layout placements |
| PATCH enforcer pattern | `web/lib/fields/enforceDrawerFieldPoliciesOnPatch.ts` | Template for person/opportunity completion |
| Field→write adapter | `web/lib/fields/drawerFieldPolicyAdapter.ts` | Needs person/inquiry_child maps |
| Placement JSON | `web/lib/fields/fieldPlacementV1.ts` | Opportunity-only; Sprint A extends to person |
| Transition rules | `web/lib/admin/statusTransitionRules.ts` | Bridged via `validateStatusTransitionStructured` |
| Layout integrity | `web/lib/config/layoutIntegrityValidator.ts` | Read-only completion signal |
| Forms validation | `web/lib/forms/validateSubmission.ts` | Align via system field registry (future) |

---

## 5. Coordination with Sprint A

| Rule | Implication |
|------|-------------|
| Do not bind requiredness to hardcoded person drawer JSX | Sprint B evaluator uses `entity_type` + `field_key` + profile signals from record joins |
| Prefer layout-driven placement as future control plane | Code rules are bootstrap; config migration follows person `field_placements_v1` |
| Sprint A not ready → server validator first | **Done:** person PATCH + opportunity status transition + UI preview panel |

---

## 6. Phase 1 deliverable checklist

- [x] Audit doc (this file)
- [x] Policy proposal — `required_fields_completion_guardrails_policy.md`
- [x] Supabase decision — no new table (Phase 3)
- [x] Minimal vertical slice — `web/lib/completion/*`
- [x] Server validation paths — person PATCH, opportunity status transition
- [x] UI missing-requirements summary — `MissingRequirementsSummary` + person BOS panels
- [x] BOS-ready structured result — `RequirementValidationResult`, `bosIntegration.ts`
- [x] Tests — `web/tests/completion/completionRequirements.test.ts`

---

## Related docs

- `docs/sprints/05_2026/layout_field_behavior_semantics_v1.md` — opportunity placement model
- `docs/sprints/05_2026/completed/person_drawer_hardening_performance_closeout.md` — person drawer baseline
- `docs/system/configuration-system.md` — four-plane control plane
- `docs/system/record-system.md` — drawer truth vs previews
- `docs/product/bos-foundation.md` — BOS consumption doctrine
