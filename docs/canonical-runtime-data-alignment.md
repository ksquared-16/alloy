# Canonical Runtime Data Alignment

**Status:** Phase 5 formal contract (June 2026)

What Runtime consumes, how it reads, and what it may write.

---

## Runtime consumers

| Consumer | Canonical source | Notes |
|----------|------------------|-------|
| Work unit queues | Queue row preview + entity GET on selection | Preview ≠ truth |
| Entity drawers | Composed drawer payload / entity record loaders | Authoritative detail |
| Focus panel | Same as drawer VM | Read-only display |
| Command surfaces | Action availability from record + BP config | Mutations via actions |
| Completion preflight | Lifecycle field_rules + related snapshots | Readiness only |
| Status display | `status_key` + status_definitions | No legacy text fallback |
| Child profile in drawer | `customer_members` attached to inquiry children | Phase 2 attach path |
| Layout runtime | RefKey → canonical entity via reference matrix | Profile → customer_member |

---

## Fields consumed (by grain)

| Grain | Read path | Key modules |
|-------|-----------|-------------|
| Person | persons GET, composed person payload | `personEntityRecord`, drawer VM |
| Customer | `CUSTOMER_CANONICAL_ADMIN_SELECT` | entity GET route |
| Child profile | customer_members + field_values | `loadCustomerMemberProfileFields`, attach helper |
| Inquiry child | OCM columns + field_values | inquiry children hydration |
| Opportunity | `OPPORTUNITY_CANONICAL_ADMIN_SELECT` | `opportunityEntityRecord` |
| Custom fields | field_values by entity_type/id | `attachFieldDefinitionsAndValues` |

---

## Status consumed

| Display | Read column | Helper |
|---------|-------------|--------|
| Case status label | `opportunities.status_key` | `resolveOpportunityStatusDisplay` |
| Child outcome label | `OCM.outcome_status_key` | status_definitions batch resolve |
| Person status | `persons.status_key` | status_definitions |
| Household status | `customers.status_key` | status_definitions |

**Forbidden:** Reading `opportunities.status`, `persons.status`, `customers.status` in admin/runtime loaders.

---

## Writes allowed

| Operation | Route / action | Guard |
|-----------|----------------|-------|
| Profile field edit | PATCH customer-members | Ownership |
| Enrollment field edit | PATCH opportunity-customer-members | No profile keys |
| Person edit | PATCH persons | Standard admin auth |
| Case edit | PATCH opportunity | Field policy |
| Status change | Actions + bounded PATCH | transition rules |
| Layout display only | — | No write |

---

## Writes forbidden

| Operation | Reason |
|-----------|--------|
| PATCH `status` text column | Legacy deprecated |
| PATCH profile on OCM | Wrong grain |
| Queue row local state as truth | Queues are preview |
| Invent field ids in UI | Must use field_definitions |

---

## Explicit SELECT contract

| Constant | Used by |
|----------|---------|
| `OPPORTUNITY_CANONICAL_ADMIN_SELECT` | opportunityEntityRecord, entity GET |
| `CUSTOMER_CANONICAL_ADMIN_SELECT` | entity GET customers |
| `CUSTOMER_CANONICAL_LIST_SELECT` | customers list API |
| `PERSON_CANONICAL_IDENTITY_SELECT` | Identity fetches (target state) |
| `OPPORTUNITY_CANONICAL_LEGACY_ADMIN_LIST_SELECT` | legacy-admin list only |

---

## Source of truth

Runtime **never** owns business facts. Authoritative resolution order:

1. Entity GET / composed drawer payload
2. Underlying table row via server loader
3. field_values for config fields
4. status_definitions for labels

---

## Remaining gaps

| Location | Issue | Classification |
|----------|-------|----------------|
| `workflowRun.ts` | `opportunities.select("*")` | Needs audit |
| `book-v2/**` | May read legacy status | Isolate |
| `opportunityIdentity.ts` | `persons.select("*")` | Deprecate → explicit select |
| `operationalTasksWorkspaceEnrichment.ts` | Legacy status fallback | Converge |
| `resolveQueueRowContextPresentation.ts` | `legacyStatusLabel` helper | Converge |

Tests: `canonicalLegacyStatusIsolation.test.ts`, `canonicalNativeColumnParity.test.ts`.

---

## Protected infrastructure

Runtime reveal gates, queue empty semantics, and composed payload readiness are **protected** per `docs/system/adminv2-runtime-performance-doctrine.md`. Canonical alignment work must not weaken those contracts.
