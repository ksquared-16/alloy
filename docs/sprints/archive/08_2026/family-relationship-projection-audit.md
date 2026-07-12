# Family Relationship Projection and Contextual Field Audit

**Status:** Architecture audit — **no implementation**  
**Date:** July 2026  
**Blocks:** Focus Panel Parents/Guardians canonical collection migration (**paused**)

---

## Executive summary

Alloy’s identity model is directionally correct: **Person = human**, **Customer = household shell**, **Customer Member = child membership**, **relationship edges = scoped links**. Parent, Guardian, Emergency Contact, Billing Contact, and Authorized Pickup are **operational role assignments** on relationship instances — **not Person entity types**.

**Key question:**

> Can an operator define “Relationship to Child” in `/settings/fields`, expose it only inside relationship-aware sections, use the same options in Forms and reporting, and avoid making it a global Person field?

**Answer: Not today.** Relationship attributes require **relationship-instance field ownership**. The Field Platform owns record grains only (`person`, `customer`, `customer_member`, `inquiry_child`, `opportunity`) — not join rows (`customer_persons`, `customer_member_contacts`, `person_relationships`).

**Do not** work around this by placing contextual attributes on Person.

---

## 1. Current relationship architecture

```text
Person (persons) — identity + contact facts
Customer (customers) — household / account shell
Customer Member (customer_members) — child membership profile

Relationship edges (not field-definition owners):
  customer_persons         Person ↔ Household (role_type, is_primary)
  opportunity_persons      Person ↔ Opportunity (role_type)
  customer_member_contacts Contact ↔ Child member (role_key) [legacy bridge]
  person_relationships     Person ↔ Person (relationship_type) [kinship; underused]

Designations:
  opportunities.primary_person_id
  customer_persons.is_primary + role_type=primary_contact
  customers.primary_contact_id (legacy)
```

Evidence: `docs/platform/core/entity-model.md`, `docs/canonical-relationship-model.md`, `web/lib/fields/relationship/primaryContactAuthority.ts`.

---

## 2. Schema source table

| Model | Source | Target | Scope | Cardinality | Role fields | Attributes | Writers | Readers |
|-------|--------|--------|-------|-------------|-------------|------------|---------|---------|
| `persons` | org | — | org | identity root | status_key | names, email, phone | persons API, booking, create-lead | drawers, comms |
| `customers` | org | contacts (legacy) | org | 1:N | customer_type | shell facts | booking | opportunity record |
| `customer_persons` | customer | person | household | M:N (unique role_type) | **role_type**, **is_primary** | dates, metadata | create-lead, setHouseholdPrimaryContact | canonicalRelationshipResolver |
| `customer_members` | customer | person? | household | 1:N | **relationship** | dob, names | customer-members API | children collections |
| `customer_member_contacts` | customer_member | contact | **child** | M:N (unique role_key) | **role_key** | is_active | createLeadChildScopedContactPersistence | emergency resolver |
| `opportunity_persons` | opportunity | person | **case** | M:N | **role_type** | metadata | create-lead, intake | family contacts |
| `person_relationships` | person | person | edge | M:N (unique type) | **relationship_type** | is_primary | demo seed (minimal prod) | person drawer, scoped widgets |

Config vocabulary (not `/settings/fields`): `customer_person_role_types`, `customer_member_contact_roles`, `customer_member_relationship_types`, `person_relationship_type_settings`.

---

## 3. Relationship taxonomy

| Concept | Classification | Scope | Owner |
|---------|----------------|-------|-------|
| Person identity | Person identity | global | `persons` |
| Household membership | Household membership | household | `customer_persons` |
| Parent / Guardian | Household or child-scoped **role** | household/child | `role_type` / `role_key` |
| Primary Contact | **Designation** | case/household | `primary_person_id`, primary row |
| Emergency Contact | Child-scoped **role** (fallback household) | child | `customer_member_contacts` |
| Billing Contact | Household-scoped role | household | `customer_persons` billing roles |
| Authorized Pickup | Child-scoped role | child | `customer_member_contacts` |
| Relationship to Child (kinship) | **Relationship attribute** | child edge | **Gap** — not Person field |
| Contact Priority | Relationship attribute | edge | **Gap** |

---

## 4. Person-field vs relationship-field rule

**Test:** Would the value remain true if this Person were viewed outside this Household or Child context?

- **Yes** → Person-owned (`persons`, `field_values` entity_type=person)
- **No** → Relationship-owned (edge record)
- **Selection of who** → Designation

Examples: Email = Person. Relationship to Child = relationship. Primary Contact = designation.

---

## 5. Relationship attribute platform status

| Question | Answer |
|----------|--------|
| `/settings/fields` on relationship entities? | **No** |
| Owner `customer_person` / `customer_member_contact`? | **Not in** `FIELD_DEFINITION_ENTITY_TYPES` |
| Custom relationship value storage? | **Unsupported** — `field_values` keyed by record entity only |
| Reporting? | **No** first-class `field_values` in metric builder |
| Context availability by relationship instance? | **Partial** — consumer filter lacks relationship-instance grain |
| Forms/Processing relationship attrs? | **Not implemented** for configurable edge fields |

Evidence: `web/lib/fields/canonicalFieldOwnership.ts`, `web/lib/fields/inquiryChildFieldRegistry.ts`, `web/components/adminV2/settings/fields/FieldsConfigurationPage.tsx`.

---

## 6. Relationship instance identity

```text
relationship_record_id + org_id + child_member_id (when child-scoped)
+ person_id + operational role(s) + kinship attributes
```

Jane may be Aunt + Emergency Contact for Child A and Authorized Pickup for Child B — **one Person, multiple relationship instances**, not one Person-wide scalar.

---

## 7. Role vs relationship type

| Layer | Example | Storage today |
|-------|---------|---------------|
| Operational role | Emergency Contact | `role_key`, `role_type` |
| Kinship type | Aunt, Stepparent | **Gap** (`person_relationships.relationship_type` underused) |
| Designation | Primary Contact | pointers |

Target: relationship instance + role assignments[] + kinship attribute + scope.

---

## 8. Parent/Guardian projection — decision

`person.contact_role.parents` today (`canonicalCollectionResolver.ts`):

- Resolves via `customer_persons` + `opportunity_persons`
- **Output grain: one row per Person** (deduped)
- Aggregates `relationship_role_refs`; **does not preserve per-child scope or kinship attributes**
- Excludes primary person at resolver level

**Decision: Do not migrate into Focus Panel** until collection grain (Person vs relationship instance) and relationship-attribute ownership are explicit.

---

## 9. Emergency Contact — decision

Resolver priority: child-scoped `customer_member_contacts` → household fallback (`relationshipRoleCandidateAdapters.ts`).

**Target grain: relationship instance collection**, not flat Person list.

---

## 10. Primary Contact — decision

**Designation**, not Person type. `resolvePrimaryContactAuthority` is correct for Focus Panel. Parent collections must not canonically exclude Primary; presentation may dedupe visually.

---

## 11. Focus Panel section grain

| Section | Correct grain | Current |
|---------|---------------|---------|
| Primary Contact | Designation → Person | OK |
| Other Parent/Guardian | Relationship instances | Person collection (drawer rows) |
| Emergency / Pickup / Billing | Relationship instances | Person collection |
| Children | Customer Member | OK (Phase 1 policy) |

---

## 12. Field picker model

Section context + provider ownership + consumer capability → available fields. No manual copied lists. No Focus Panel-specific allow-lists.

---

## 13. Context matrix (summary)

| Provider | Owner | FP | Forms | Reporting |
|----------|-------|-----|-------|-----------|
| `person.email` | Person | yes | yes | manual |
| `relationship_to_child` (proposed) | Edge | **gap** | **gap** | **gap** |

---

## 14. Choice options

Kinship dropdown must use tenant-configurable Choice Options via field definitions — not hardcoded in components. Today `customer_member_contact_roles` configures **operational** roles only.

---

## 15. Reporting grain

**Relationship instance** for relationship attributes. Do not store on Person for convenience. Metric builder needs relationship projection source.

---

## 16. Forms/Processing

Collection item = relationship instance. Proposals must preserve Person + edge + child target + roles. No Person-only flattening. Writes out of scope for this audit.

---

## 17. Canonical provider target

```text
customer_member_contact.relationship_type
customer_member_contact.priority
```

Metadata: owner entity, source/target, required context, choice options, reporting grain.

---

## 18. Finding classification

| Finding | Class |
|---------|-------|
| Identity model | Entity model ✅ |
| No edge field_definitions | Field Platform ❌ |
| Person-grain parents collection | Consumer adoption ⚠️ blocked |
| Focus Panel role buckets | Consumer adoption ⚠️ |
| Parents migration | **PAUSED** |

---

## 19. Future modules (not implementing now)

`FIELD_DEFINITION_ENTITY_TYPES`, `canonicalFieldOwnership.ts`, `canonicalCollectionResolver.ts`, `providerContextRequirements.ts`, `buildHouseholdCardEvidence.ts`, Forms collection binding, reporting projection.

---

## 20. Tests required before implementation

Identity (multi-child attrs), roles (Parent+Emergency), context availability, choice options from Settings, Focus Panel presentation-only primary dedupe, reporting grain, compatibility load.

---

## 21. Recommended phases

A. Relationship-edge field spec + storage  
B. Kinship vs operational role separation  
C. Relationship-instance providers  
D. Settings hub + Choice Options  
E. Reporting projection  
F. Forms/Processing binding  
G. Focus Panel adapters  
H. Parents provider migration (last)

---

## 22. Risks

Person-field workaround; Person-grain collections; legacy contact bridge; dual family stacks; drawer/FP filter divergence; premature `person.contact_role.parents` adoption.

