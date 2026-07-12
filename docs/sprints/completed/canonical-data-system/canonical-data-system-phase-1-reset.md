# Canonical Data System — Phase 1 Reset

**Date:** 2026-06-25  
**Status:** Implemented (Phase 1)  
**Prerequisite:** `docs/canonical-data-system-audit.md`

Phase 1 moves from audit-only to a **safe canonical reset slice**. Demo data is not preserved — correctness for newly created records is the priority.

---

## What shipped

### 1. Child grain mapping fix

`web/lib/fields/fieldRegistryReferenceMatrix.ts`

- Layout `child.*` profile refKeys → `customer_member` (gender, allergies, first_name, dob, …)
- Layout `inquiry_child.*` → enrollment grain unchanged
- Lifecycle `child:first_name|last_name|date_of_birth` → `customer_member`
- Forms `child_first_name|child_last_name|child_date_of_birth` → `customer_member`
- Removed blanket `child → inquiry_child` namespace mapping

Tests: `web/tests/fields/canonicalChildGrainMapping.test.ts`

### 2. customer_member PATCH (config field_values)

`web/app/api/admin/customer-members/[id]/route.ts`

- Native column PATCH (first_name, last_name, dob, …)
- Config fields via `upsertFieldValuesFromBody` (`gender`, `allergies`, …)
- GET merges config field values from `field_values`
- Rejects unsupported / non-registry config keys
- Rejects legacy `status` text writes

Tests: `web/tests/fields/canonicalFieldOwnership.test.ts`, updated `customerMemberFieldRegistry.test.ts`

### 3. Canonical field ownership guards

`web/lib/fields/canonicalFieldOwnership.ts`

- Entity ownership map
- `validateFieldDefinitionOwnership` — blocks wrong entity registration
- `findCustomerMemberProfileKeysInPatch` — blocks profile writes on OCM route

Enforced in:

- `POST /api/admin/field-definitions`
- `PATCH /api/admin/opportunity-customer-members/[id]`

### 4. Legacy status text write freeze

`web/lib/fields/canonicalLegacyStatusWrite.ts`

Rejected on PATCH:

- `opportunities` (removed `status` from allowlist)
- `persons`
- `customers` (removed `status` from allowlist)
- `customer_members`

Stripped on opportunity write normalization:

- `normalizeOpportunityWritePayload` deletes `status` from payloads

Removed from create path:

- `create_lead` no longer writes `status: "open"` (uses `status_key` only)

### 5. Demo operational reset path

| Path | Use |
|------|-----|
| `supabase/sql/maintenance/reset_demo_operational_data.sql` | Manual local/staging SQL template (ROLLBACK by default) |
| `web/scripts/resetStagingDemoData.ts` | Programmatic dry-run / execute with env gates |

**Never auto-run destructive reset.**

---

## Legacy status write paths

| Path | Phase 1 action |
|------|----------------|
| `PATCH /api/admin/opportunities/[id]` | **Blocked** — `status` rejected |
| `PATCH /api/admin/persons/[id]` | **Blocked** — `status` rejected |
| `PATCH /api/admin/customers/[id]` | **Blocked** — `status` rejected |
| `executeAdminAction:create_lead` | **Fixed** — no `status` insert |
| `normalizeOpportunityWritePayload` | **Strips** `status` |
| `lib/supabase.createOpportunity` (legacy helper) | **Still accepts** `status` in type — stripped at normalize if used via insertOpportunityWithPersonFirst |
| Read paths selecting `status` column | **Remaining** — e.g. related list routes; reads prefer `status_key` at runtime surfaces |

**Drop candidates (Phase 2+):** `opportunities.status`, `persons.status`, `customers.status` columns after zero-write confirmation.

---

## Phase 2 backlog

1. Lifecycle bindings `value_source: inquiry_child` for `first_name` — align runtime evaluators to read `customer_members`
2. Full Action → Status → Field matrix doc + static compliance tests
3. Forms schema `field_definition_id` persistence (F3)
4. BP stage requirements keyed by `field_key` (F2)
5. `drawerFieldPolicyAdapter` storage metadata → `field_definitions.config`
6. Contacts write freeze + messaging migration to `person_id`
7. Schema column deprecation migrations (status text)
8. Automated registry coverage test (every native column has field_definitions seed)
9. Analytics metric adapter → canonical column path declarations

---

## Verification

```bash
cd web && npx tsc --noEmit
cd web && npm run test -- \
  tests/fields/canonicalChildGrainMapping.test.ts \
  tests/fields/canonicalFieldOwnership.test.ts \
  tests/fields/fieldRegistryReferenceMatrix.test.ts \
  tests/admin/fields/customerMemberFieldRegistry.test.ts
```

---

## Related

- Audit: `docs/canonical-data-system-audit.md`
- Field convergence: `docs/system/field-model-convergence-doctrine.md`
