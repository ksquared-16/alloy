# Required Fields + Completion Guardrails — Policy Model (Phase 2)

**Path:** `docs/sprints/05_2026/required_fields_completion_guardrails_policy.md`  
**Status:** Sprint B — design locked for v1 slice  
**Date:** 2026-05-30

## Goal

Turn field requirements into **contextual, structured, enforceable, BOS-readable** operational guardrails — not a single `is_required` boolean on base field definitions.

---

## Requirement types (v1 vocabulary)

| Type | Meaning | Typical phase |
|------|---------|---------------|
| `always_required` | Must be present whenever record is considered valid | save, preview |
| `required_on_save` | Enforced on explicit save; draft may omit if policy allows | save |
| `required_before_status_transition` | Enforced when `status_to` matches rule scope | status_change |
| `required_before_action` | Enforced when `action_key` matches | action |
| `required_by_role` | Actor must hold one of configured role keys | any |
| `required_by_profile` | Entity profile (child/parent/guardian) gate | any |
| `required_by_lifecycle_stage` | Lifecycle stage / OCM outcome gate | status_change |
| `recommended_non_blocking` | Guidance only | preview, save |

**Mapping to existing `fieldRequirementPolicy` modes:**

| Existing mode | Sprint B type |
|---------------|---------------|
| `required` | `always_required` |
| `required_on_save` | `required_on_save` |
| `required_before_status_change` | `required_before_status_transition` |
| `required_before_action` | `required_before_action` |
| `optional` | — |
| `conditionally_required` | `required_on_save` + predicate (future) |

---

## Blocking levels

| Level | Behavior |
|-------|----------|
| `hard_block` | Reject PATCH save or status/action transition |
| `soft_warning` | Allow save; surface in summary panel |
| `recommendation` | Non-blocking guidance for operators and BOS |

Structured output shape (canonical):

```typescript
type RequirementValidationResult = {
  ok: boolean
  blocking: RequirementViolation[]
  warnings: RequirementViolation[]
  recommendations: RequirementViolation[]
}

type RequirementViolation = {
  entity_type: string
  entity_id: string
  field_key?: string
  section_key?: string
  label: string
  requirement_type: string
  blocking_level: 'hard_block' | 'soft_warning' | 'recommendation'
  missing_reason: string
  context: {
    surface?: string
    action_key?: string
    status_from?: string
    status_to?: string
    lifecycle_stage?: string
    role_key?: string
    profile_key?: string
  }
}
```

**Implementation:** `web/lib/completion/requirementValidationTypes.ts`

---

## Scope dimensions

Rules may be scoped by (design for; not all wired in v1 slice):

| Dimension | Source today | Future |
|-----------|--------------|--------|
| organization | `org_id` | — |
| entity_type | person, opportunity, customer, inquiry_child | + job, schedule |
| record_type / profile | `resolvePersonDrawerProfile` | layout variant |
| layout / surface | `surface` in evaluation context | `field_placements_v1` |
| field_key | Native + custom keys | registry |
| section_key | Presentation grouping | `field_section_definitions` |
| status_from / status_to | PATCH / action context | `status_transition_rules` |
| lifecycle_stage | OCM outcome, person status | status_definitions |
| action_key | Admin actions | action_placements |
| role / profile | Actor + entity profile | RBAC + profile resolver |

---

## Phase 3 — Supabase design decision

**Decision: no new migration for Sprint B v1.**

Rationale:

1. **`field_definitions.requirement_policy`** already stores contextual modes (Layout Assist v1).
2. **`record_drawer_layouts.config_json.field_placements_v1`** provides layout-scoped overrides for opportunity drawer (G0/G1 locked — no new table).
3. **`status_transition_rules`** covers transition payload/metadata requirements.
4. Sprint B v1 ships **code-based bootstrap rules** in `web/lib/completion/` to prove architecture without fighting Sprint A layout migration.

**Future (when person layout runtime lands):**

- Option A: Extend `field_placements_v1` requirement presets on person layouts (preferred — matches opportunity pattern).
- Option B: Hybrid — `field_requirement_policies` table only if cross-surface rules exceed JSON overlay ergonomics.
- Do **not** duplicate requirement truth on base `field_definitions` as the only control plane.

**Cross-entity rules** (e.g. household primary contact, opportunity must have child):

- v1: code rules with `related` context on evaluator input.
- v2: `completion_rule_sets` JSON on org vertical config or dedicated table — deferred.

---

## Phase 4 — v1 bootstrap rules (implemented)

### Parent / guardian

| Rule | Type | Blocking |
|------|------|----------|
| First name | always_required | hard_block |
| Last name | always_required | hard_block |
| Email or phone | required_on_save | soft_warning on save |
| Household primary contact | always_required (customer scope) | hard_block when guardians exist |

### Child

| Rule | Type | Blocking |
|------|------|----------|
| First / last name | always_required | hard_block |
| DOB | recommended / required_before_status_transition | recommendation; hard_block before active/future_start |
| Start date | required_before_status_transition | hard_block before active/future_start |

### Opportunity

| Rule | Type | Blocking |
|------|------|----------|
| Primary contact | always_required | hard_block |
| At least one child | always_required | hard_block |
| Location/site | required_before_status_transition | hard_block before tour/waitlist/enrollment |
| Program/category | required_before_status_transition | hard_block before waitlist/enrollment |
| Tour date/time | required_before_status_transition | hard_block before `tour_scheduled` |
| Child desired start date | required_before_status_transition | hard_block before enrolled |

Plus legacy **`status_transition_rules`** via `validateStatusTransitionStructured`.

---

## Phase 5–7 — Server, UI, BOS

| Layer | Module |
|-------|--------|
| Evaluator | `evaluateCompletionRequirements` |
| Person PATCH | `enforcePersonCompletionOnPatch` → `/api/admin/persons/[id]` |
| Opportunity transition | `enforceOpportunityCompletionOnStatusTransition` → opportunity PATCH |
| BOS integration | `web/lib/completion/bosIntegration.ts` — `toBosCompletionRequirementPayload` |
| UI summary | `MissingRequirementsSummary` in person drawer BOS panels |

Draft-save doctrine: **hard_block** violations reject save; **soft_warning** and **recommendation** pass through.

---

## Deferred — Settings UI (not in Sprint B)

1. Org-authored completion rule editor (visual policy builder).
2. Sync from `field_placements_v1` requirement presets to completion evaluator (post Sprint A).
3. Unified Settings view merging Fields + Layouts + Transition rules requiredness.
4. Bulk integrity fix wizard for required-but-hidden fields.
5. Completion percentage / progress ring on drawer header.
6. Config-driven cross-entity rules (household, opportunity↔child) without code deploy.

---

## Success criteria mapping

| Criterion | Status |
|-----------|--------|
| Requiredness model is contextual | v1 code rules + existing policy JSON |
| Validation structured and reusable | `RequirementValidationResult` |
| High-value transition protected | `tour_scheduled`, enrolled, person identity |
| UI shows missing requirements cleanly | `MissingRequirementsSummary` |
| Draft-save preserved where appropriate | soft_warning does not block |
| BOS can consume results | `bosIntegration.ts` |
| Not trapped in hardcoded React | Evaluator by entity/field key |
