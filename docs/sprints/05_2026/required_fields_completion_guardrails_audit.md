# Completion Guardrails Foundation — Audit (Sprint B)

**Path:** `docs/sprints/05_2026/required_fields_completion_guardrails_audit.md`  
**Sprint name:** **Completion Guardrails Foundation** (not final required-field configuration)  
**Status:** Sprint B — foundation shipped  
**Date:** 2026-05-30

## Sprint B scope (read first)

Sprint B delivers **infrastructure**, not operator-configured required-field policy.

| Shipped (foundation) | Not shipped (deferred) |
|----------------------|-------------------------|
| Contextual evaluation framework (`web/lib/completion/`) | Admin Settings UI to author requirement rules |
| Structured validation output (`RequirementValidationResult`) | Full conditional business rule catalog |
| Server paths for person PATCH + opportunity status transition | Org-specific rule editing without deploy |
| UI **preview** in person drawer Assist column | Implication that all required fields are configured |
| Bootstrap code rules to prove vertical slice | Product-final blocking matrix |

**Current reality:** framework exists, structured validation exists, some bootstrap rules exist, rules are **not yet admin-configured**, and conditional business rules still need product definition.

> **Warning:** Do not add broad hard-blocking rules without product review. Prefer `soft_warning` / `recommendation` until rules are defined and approved.

See **Requirement Rules Definition Needed** in `required_fields_completion_guardrails_policy.md`.

---

## Purpose

Inventory existing requiredness and validation before building completion guardrails. Sprint B runs parallel to Sprint A (person drawer layout runtime migration) — evaluation is by entity/field key, not hardcoded drawer JSX.

---

## Executive summary

| Layer | Maturity | Gap |
|-------|----------|-----|
| **Completion framework (Sprint B)** | Shipped — evaluator, structured output, bootstrap rules | Not admin-configured; conditional rules TBD |
| **Config model (pre-existing)** | Strong (`field_definitions.requirement_policy`, `field_placements_v1`, `status_transition_rules`) | Advanced policy modes parsed but rarely enforced outside opportunity drawer |
| **Opportunity drawer** | Server PATCH + layout placement resolution | Status transition rules parallel to field policies |
| **Person drawer** | Bootstrap server PATCH + Assist preview | Not Settings-driven requiredness |
| **Forms / intake** | Full server validation (`validateFormPayload`) | Separate model from drawer/record guardrails |
| **Work units** | Scoped via opportunity + `status_transition_rules` | No dedicated WU transition API |

**Reusable foundation:** Layout + field behavior semantics v1 (`docs/sprints/05_2026/layout_field_behavior_semantics_v1.md`) — opportunity `field_placements_v1` + `enforceDrawerFieldPoliciesOnPatch`. Sprint B adds the **completion guardrails layer** on top; it does not replace Settings field/layout configuration.

---

## 1. Schema & storage

### `field_definitions`

| Column | Role |
|--------|------|
| `is_required` | Legacy boolean; backfilled from `requirement_policy` |
| `requirement_policy` | JSON v1 — modes: `required`, `optional`, `required_on_save`, `conditionally_required`, `required_before_status_change`, `required_before_action` |
| `interaction_policy` | Editability (separate from requiredness) |

**DB enforcement:** None — no CHECK/trigger on non-null values.

**Canonical evaluator:** `web/lib/fields/fieldRequirementPolicy.ts` (opportunity/job drawer PATCH). Sprint B completion evaluator is separate: `web/lib/completion/`.

### `field_section_definitions`

Grouping + `section_config` only. No requirement semantics at section level today.

### `field_values`

Typed custom field storage. Written via `upsertFieldValuesFromBody` **without** requiredness checks for person/inquiry_child (except Sprint B bootstrap on person PATCH).

### `record_drawer_layouts`

- `config_json.field_placements_v1[]` — per-field requirement/editability overlay (opportunity workflow v1 only)
- Person layout rows exist for Settings preview; runtime migration is Sprint A

### `status_transition_rules`

Org-scoped transition guardrails: `required_metadata_fields`, `required_payload_fields`, `blocked`, scoped by department/work_unit/action/from/to status.

Seeded example: enrollment WU → `tour_scheduled` requires `tour_date`, `tour_time` in payload. Sprint B bridges these into structured completion output; it does not replace Settings authoring of transition rules.

---

## 2. What requiredness exists today?

### By surface

| Surface | Config | UI hint | Server save | Transition | Notes |
|---------|--------|---------|-------------|------------|-------|
| Opportunity drawer | Yes (placements + defs) | `*` chrome via `_field_policy_resolved` | Yes — `enforceDrawerFieldPoliciesOnPatch` | Partial — `status_transition_rules` + Sprint B bootstrap | Layout Assist is closest to “configured” requiredness |
| Job drawer | Definition only | Partial | Yes (defs) | Via admin actions | No layout placement plane |
| Person drawer | Partial seeds on `field_definitions` | Assist **preview** (bootstrap) | Sprint B bootstrap on PATCH | Bootstrap on person status change | **Not** Settings-configured |
| Inquiry child (OCM) | Yes | Placement disable rules | Placement scope only | Lifecycle status helper | No field requiredness on PATCH |
| Forms (admin/public) | Form schema `required` | Yes | Yes — `validateFormPayload` | N/A | Parallel validation model |
| Book-v2 | Visibility seeds | HTML/required | Route-specific hardcoded | N/A | Not policy-driven |

### By enforcement type

| Type | Examples | Server? |
|------|----------|---------|
| **UI-only** | HTML `required` on modals | No |
| **Server PATCH (configured)** | Opportunity/job field policies | Yes |
| **Server PATCH (bootstrap)** | Sprint B person identity rules | Yes — limited code rules |
| **Form-only** | Public intake submit | Yes (forms path) |
| **Transition-specific** | `status_transition_rules`, tour booking mirror | Yes |
| **Action hardcoded** | `add_related_person` first/last name | Yes (not config) |
| **Integrity (read-only)** | `layoutIntegrityValidator` | Diagnostic only |

---

## 3. What is missing entirely?

1. **Admin-configured completion rules** — operators cannot author contextual requirements in Settings.
2. **Product-approved conditional rule catalog** — see policy doc §Requirement Rules Definition Needed.
3. **Advanced field policy modes** enforced everywhere (`required_before_status_change`, `conditionally_required`, role/profile gates).
4. **Unified transition + field policy model** — parallel systems today.
5. **Completion / readiness state** — no record-level completion percentage.
6. **Settings UI for org-authored completion policies** — deferred.

---

## 4. Reusable config (building blocks)

| Asset | Path | Role |
|-------|------|------|
| Completion evaluator (Sprint B) | `web/lib/completion/` | Foundation — bootstrap rules + structured output |
| Policy JSON + evaluator | `web/lib/fields/fieldRequirementPolicy.ts` | Opportunity/job drawer (configured path) |
| Effective behavior resolver | `web/lib/fields/resolveEffectiveFieldBehavior.ts` | Future: person layout placements |
| PATCH enforcer pattern | `web/lib/fields/enforceDrawerFieldPoliciesOnPatch.ts` | Template for configured enforcement |
| Transition rules | `web/lib/admin/statusTransitionRules.ts` | Bridged via `validateStatusTransitionStructured` |

---

## 5. Coordination with Sprint A

| Rule | Implication |
|------|-------------|
| Do not bind requiredness to hardcoded person drawer JSX | Sprint B evaluator uses `entity_type` + `field_key` + profile signals |
| Prefer layout-driven placement as future control plane | Bootstrap code rules are temporary proof; Settings config follows Sprint A |
| Assist column is preview | Copy states bootstrap rules — not full configuration |

---

## 6. Deliverable checklist (foundation)

- [x] Audit doc (this file)
- [x] Policy proposal — `required_fields_completion_guardrails_policy.md`
- [x] Supabase decision — no new table (Phase 3)
- [x] Completion framework — `web/lib/completion/*`
- [x] Bootstrap server validation — person PATCH, opportunity status transition
- [x] UI completion **preview** — `MissingRequirementsSummary` + person BOS panels (with foundation copy)
- [x] BOS-ready structured result — `RequirementValidationResult`, `bosIntegration.ts`
- [x] Tests — `web/tests/completion/`
- [ ] Admin-configured requirement rules — **deferred**
- [ ] Product-defined conditional rule catalog — **deferred**

---

## Related docs

- `docs/sprints/05_2026/required_fields_completion_guardrails_policy.md` — policy model + deferred rules
- `docs/sprints/05_2026/person_layout_completion_reconciliation.md` — Sprint A + B wiring
- `docs/sprints/05_2026/layout_field_behavior_semantics_v1.md` — opportunity placement model
- `docs/system/configuration-system.md` — four-plane control plane
- `docs/system/record-system.md` — drawer truth vs previews
