# Canonical Action / Status / Field Matrix

**Status:** Phase 5 formal contract (June 2026)

Cross-reference for which actions may mutate which canonical fields and statuses.

---

## Status mutations

| Action / path | Target entity | Column | Allowed | Forbidden |
|---------------|---------------|--------|---------|-----------|
| `update_enrollment_status` | OCM | `outcome_status_key` | Yes | Legacy text status |
| Change case status (BP / action) | opportunity | `status_key` | Yes | `opportunities.status` text |
| Enrollment intake / Create Lead | opportunity + OCM | `status_key`, `outcome_status_key` | Yes | Ad-hoc text status |
| Generic entity PATCH | opportunity, person, customer | `status_key` | Yes (policy-bounded) | `status` text column |
| Workflow effects | per effect config | `status_key` | Yes | Parallel status copies |
| Any PATCH | any CRM entity | `status` (text) | **No** | Blocked Phase 1 |

---

## Field mutations — child grain

| Field group | Write route | Entity | Blocked on |
|-------------|-------------|--------|------------|
| Profile (name, dob, health) | PATCH customer-members | customer_member | OCM PATCH |
| Enrollment (start date, program, room) | PATCH opportunity-customer-members | inquiry_child / OCM | customer_member for enrollment keys |
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
| `update_enrollment_status` | OCM, status_definitions, transition rules | `outcome_status_key` | Child enrollment outcome |
| `move_to_waitlist` | Case + OCM context | OCM outcome, may touch case status | Per BP config |
| `schedule_tour` | Opportunity, persons, children | metadata / tour booking | Case status via BP |
| `add_inquiry_child` | customer_members | Creates OCM row | Sets initial outcome_status_key |
| `approve_enrollment` | Completion preflight | OCM + case fields | Enrollment outcome |
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
