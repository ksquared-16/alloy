---
owner: platform
status: canonical
last_reviewed: 2026-07-12
supersedes: []
---

# Canonical Action / Status / Field Matrix

**Status:** Enrollment Alignment contract (July 2026) — supersedes the Phase 5 contract

Cross-reference for which actions may mutate which canonical fields and statuses.

---

## Status mutations

Durable enrollment state changes **only** through outcome execution (and the typed status
domains it invokes). Operator surfaces expose domain verbs, never a generic status write.

| Action / path | Target entity | Column | Allowed | Forbidden |
|---------------|---------------|--------|---------|-----------|
| Stage outcome rule targets (family) | opportunity | `status_key`, `close_reason_key`, `stage_key` | Yes (canonical path) | Bypassing outcome execution |
| Stage outcome rule targets (child) | `process_instances` | `state`, `stage_key`, `close_reason_key` | Yes (canonical path) | Writing `OCM.outcome_status_key` (removed) |
| Domain actions (`waitlist_child`, `enroll_child`, `close_lead`, …) | opportunity / `process_instances` | via typed domain → outcome | Yes | Generic `update_status` |
| Enrollment intake / Create Lead | opportunity + `process_instances` (one per child) | `status_key=open`, `stage_key=lead`; child participation on `process_instances.metadata` | Yes | Ad-hoc text status; OCM write (removed) |
| Workflow effects | per effect config | typed domain | Yes | Parallel status copies |
| Any PATCH | any CRM entity | `status_key` / `outcome_status_key` / `stage_key` | **No** | Direct status PATCH removed |
| Any PATCH | any CRM entity | `status` (text) | **No** | Blocked Phase 1 |

---

## Field mutations — child grain

| Field group | Write route | Entity | Blocked on |
|-------------|-------------|--------|------------|
| Profile (name, dob, health) | PATCH customer-members | customer_member | OCM PATCH |
| Enrollment (`start_date`, `program_category_id`, `schedule_type`, room) | PATCH opportunity-customer-members | enrollment_participation / OCM | customer_member for enrollment keys |
| Case facts | PATCH opportunity | opportunity | OCM |

Guard: `assertNoChildProfileKeysOnOcmPatch`, `validateFieldDefinitionOwnership`.

---

## Field mutations — person / household

| Field group | Write route | Entity |
|-------------|-------------|--------|
| Identity / contact | PATCH persons | person |
| Household shell | PATCH customers | customer |
| Custom config fields | PATCH + field_values upsert | per entity_type |

---

## Action catalog (enrollment-critical)

| Action key | Reads | Writes | Status impact |
|------------|-------|--------|---------------|
| `schedule_tour` | Opportunity, persons, children | tour booking; stage → `tour` via outcome | Stage move (case) |
| `waitlist_child` | Case + OCM context | OCM outcome `waitlisted`, child `stage_key=waitlist` | Child enrollment outcome |
| `enroll_child` | Case + OCM context | OCM outcome `enrolling`, child `stage_key=enrolling` | Child enrollment outcome |
| `mark_enrolled` | Completion preflight | OCM outcome `enrolled`; agreement handoff | Enrollment outcome |
| `withdraw_child` | OCM context | OCM outcome `withdrawn`/`not_enrolling` + `close_reason_key` | Terminal child outcome |
| `close_lead` | Case context | `status_key=closed` + `close_reason_key` | Terminal case status |
| `add_enrollment_participation` | customer_members | Creates OCM row | `outcome_status_key=null` at intake |
| Relationship actions | persons, customer_persons | Join rows | None on status_key directly |

Full catalog: `action_definitions` seeds + `docs/platform/core/status-and-state-system.md`.

---

## Configuration vs runtime writes

| Surface | May write native columns | May write field_values | May write status_key |
|---------|-------------------------|------------------------|---------------------|
| Runtime drawer PATCH | Yes (policy) | Yes | Yes (bounded) |
| Settings field editor | Metadata only | No | No |
| Business Process builder | Stage rules metadata | No | Indirect via actions |
| Forms intake | Via server intake routes | Yes | Yes (binding) |
| Workflows | Via registered effects | Rare | Yes (effect) |

---

## Forbidden writes (enforced)

| Pattern | Enforcement |
|---------|-------------|
| Legacy text `status` in PATCH | `rejectLegacyTextStatusPatch` |
| Direct `status_key`/`outcome_status_key`/`stage_key` PATCH | Outcome execution is the only writer |
| Profile fields on OCM | `findCustomerMemberProfileKeysInPatch` |
| Wrong entity_type in field_definitions POST | `validateFieldDefinitionOwnership` |
| Non-canonical status values | `assertAllowedStatusKey` (API) |
| Duplicate field_definition keys | `findDuplicateFieldDefinitionKeys` |

---

## Remaining gaps

| Gap | Phase |
|-----|-------|
| DB trigger on legacy status columns | Phase 6 |
| Action writes audit for all vertical actions | Ongoing |
| Forms system id overrides still map some stale grains | Phase 6 cleanup |
| Analytics metric fields pointing at legacy columns | Phase 6 convergence |

---

## Test coverage

| Invariant | Test |
|-----------|------|
| No legacy status PATCH | `canonicalFieldOwnership.test.ts`, strict mode |
| Profile not on OCM | `canonicalReadAlignment.test.ts` |
| Ownership validation | `canonicalFieldOwnership.test.ts` |
| Action enrollment scope | `enrollmentStatusPreflightFieldScope.test.ts` |
