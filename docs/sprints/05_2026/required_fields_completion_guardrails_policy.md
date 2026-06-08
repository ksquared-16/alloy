# Completion Guardrails Foundation — Policy Model (Sprint B)

**Path:** `docs/sprints/05_2026/required_fields_completion_guardrails_policy.md`  
**Sprint name:** **Completion Guardrails Foundation** (not final required-field configuration)  
**Status:** Foundation shipped — bootstrap rules only  
**Date:** 2026-05-30

## Goal

Establish **contextual, structured, enforceable, BOS-readable** completion guardrails as **platform infrastructure**. Sprint B proves the architecture with bootstrap code rules; it does **not** deliver operator-configured required-field policy or a final business rule catalog.

### What Sprint B is

- Evaluation framework and types
- Structured validation output for server, UI preview, and future BOS
- Narrow bootstrap rules to exercise save + status-transition paths
- Explicit UI copy that rules are **not fully configured**

### What Sprint B is not

- Final required-field configuration in Settings
- Complete conditional business logic
- Approval to hard-block operators broadly without product review

> **Warning — engineering + product:** **Do not add broad hard-blocking rules without product review.** New `hard_block` rules in code or config require explicit product sign-off. Until rules are defined and admin-configurable, prefer `soft_warning` and `recommendation` for uncertain or vertical-specific cases.

---

## Requirement types (v1 vocabulary)

Designed for future admin configuration; bootstrap slice uses a subset.

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

**Mapping to existing `fieldRequirementPolicy` modes (opportunity Layout Assist — separate from Sprint B bootstrap):**

| Existing mode | Sprint B type |
|---------------|---------------|
| `required` | `always_required` |
| `required_on_save` | `required_on_save` |
| `required_before_status_change` | `required_before_status_transition` |
| `required_before_action` | `required_before_action` |
| `optional` | — |
| `conditionally_required` | Predicate + requirement (future) |

---

## Blocking levels

| Level | Behavior |
|-------|----------|
| `hard_block` | Reject PATCH save or status/action transition |
| `soft_warning` | Allow save; surface in summary panel |
| `recommendation` | Non-blocking guidance for operators and BOS |

Structured output shape (canonical): `web/lib/completion/requirementValidationTypes.ts`

---

## Scope dimensions

Rules may be scoped by (designed for; not all wired in bootstrap slice):

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

## Supabase design decision

**No new migration for Sprint B foundation.**

Reuse `field_definitions.requirement_policy`, `field_placements_v1`, and `status_transition_rules`. Bootstrap rules live in code until product-defined rules and Settings UI exist.

---

## Bootstrap rules (code-only — not admin-configured)

These rules **prove the framework**. They are **not** the final product matrix. Operators cannot edit them in Settings.

### Parent / guardian (bootstrap)

| Rule | Type | Blocking |
|------|------|----------|
| First name | always_required | hard_block |
| Last name | always_required | hard_block |
| Email or phone | required_on_save | soft_warning on save |
| Household primary contact | always_required (customer scope) | hard_block when guardians exist |

### Child (bootstrap)

| Rule | Type | Blocking |
|------|------|----------|
| First / last name | always_required | hard_block |
| DOB | recommended / required_before_status_transition | recommendation; hard_block before active/future_start |
| Start date | required_before_status_transition | hard_block before active/future_start |

### Opportunity (bootstrap)

| Rule | Type | Blocking |
|------|------|----------|
| Primary contact | always_required | hard_block |
| At least one child | always_required | hard_block |
| Location/site | required_before_status_transition | hard_block before tour/waitlist/enrollment |
| Program/category | required_before_status_transition | hard_block before waitlist/enrollment |
| Tour date/time | required_before_status_transition | hard_block before `tour_scheduled` |
| Child desired start date | required_before_status_transition | hard_block before enrolled |

Plus legacy **`status_transition_rules`** via `validateStatusTransitionStructured` (configured in DB for some orgs — not the same as Sprint B Settings UI).

---

## Server, UI, BOS (foundation)

| Layer | Module |
|-------|--------|
| Evaluator | `evaluateCompletionRequirements` |
| Person PATCH | `enforcePersonCompletionOnPatch` |
| Opportunity transition | `enforceOpportunityCompletionOnStatusTransition` |
| BOS integration | `web/lib/completion/bosIntegration.ts` |
| UI preview copy | `web/lib/completion/completionGuardrailsCopy.ts`, `MissingRequirementsSummary` |

Draft-save doctrine: **hard_block** violations reject save; **soft_warning** and **recommendation** pass through.

UI must **not** imply required fields are fully configured — Assist column shows “bootstrap preview” disclaimer.

---

## Deferred — Settings UI

1. Org-authored completion rule editor (visual policy builder).
2. Sync from `field_placements_v1` requirement presets to completion evaluator (post Sprint A).
3. Unified Settings view merging Fields + Layouts + Transition rules requiredness.
4. Bulk integrity fix wizard for required-but-hidden fields.
5. Completion percentage / progress ring on drawer header.
6. Config-driven cross-entity rules without code deploy.

---

## Requirement Rules Definition Needed

Product and vertical owners must define conditional rules before engineering adds new **hard_block** enforcement. Examples below are **candidates for definition**, not approved bootstrap behavior (unless already explicitly shipped and reviewed).

| Candidate rule | Condition | Required when true |
|----------------|-----------|-------------------|
| Employee ID | `person.is_employee = true` | `employee_id` (and related placement fields) |
| Child enrollment dates | Child status/lifecycle = enrolled or active | Enrollment date and/or start date |
| Tour scheduling | Opportunity status → Tour Scheduled | Tour date (and time, if product requires) |
| Primary contact reachability | Parent/guardian is household primary contact | At least one communication method (email or phone) |
| Household structure | Household has one or more guardians | Exactly one primary contact designated |
| Subsidy / payment (future module) | Subsidy or agency billing applies | Agency/customer identifiers, authorization refs |

Additional definition work:

- Which rules are **hard_block** vs **soft_warning** vs **recommendation** per lifecycle stage
- Vertical-specific exceptions (childcare vs future industries)
- Whether rules are org-overridable or platform-invariant
- Alignment with forms intake requiredness vs drawer requiredness

**Do not implement new broad hard blocks from this list without product review.**

---

## Success criteria mapping (foundation)

| Criterion | Status |
|-----------|--------|
| Requiredness **model** is contextual | Types + evaluator shipped |
| Validation structured and reusable | `RequirementValidationResult` |
| High-value transition path protected (bootstrap) | tour_scheduled, enrolled, person identity |
| UI shows completion preview cleanly | `MissingRequirementsSummary` + foundation copy |
| Draft-save preserved where appropriate | soft_warning does not block |
| BOS can consume results | `bosIntegration.ts` |
| Not trapped in hardcoded React | Evaluator by entity/field key |
| **Admin-configured required fields** | **Not met — deferred** |
| **Product-final rule catalog** | **Not met — deferred** |
