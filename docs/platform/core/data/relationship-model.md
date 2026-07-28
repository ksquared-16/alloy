---
owner: platform
status: canonical
last_reviewed: 2026-07-12
supersedes: []
---

# Canonical Relationship Model

**Status:** Phase 5 formal contract (June 2026)  
**Platform reference:** `docs/platform/core/entity-model.md`

Relationships are **edges** between canonical entities — not duplicate copies of identity or profile facts.

---

## Ownership and projection (canonical architecture)

The Relationship Model is the canonical truth for configured relationships. Everything downstream is a
**projection** of it.

```
Entity Model
  ↓
Relationship Definitions          ← CANONICAL OWNER
  ↓
Configuration Model
  ↓
Relationship Collection Projection
  ↓
Forms · Conversation Runtime · Configuration Discovery · Processing · BOS · APIs
```

**Canonical owner.** `web/lib/fields/relationship/relationshipDefinitions.ts` —
`RELATIONSHIP_DEFINITIONS`. These rows are *authored* truth, not derived from anywhere else. They are
shaped as rows of a future `relationship_definitions` table.

**What is a projection.** A *collection* is ONE projection of a relationship definition — it is not the
definition. `relationshipCollectionProjection(def)` in
`web/lib/fields/collection/canonicalCollectionProviderRegistry.ts` produces the collection-shaped view;
`personChildRelationshipReportingProjection.ts` produces the reporting-shaped view. More projections
will follow. A projection may add presentation, never semantics.

**Consumers.** Forms (authoring, rendering, prefill, submission), Conversation Runtime / BOS,
Configuration Discovery, Processing, the relationship write path, and API routes all consume the same
definitions — directly, or through a projection derived from them.

**The ownership rule.** No consumer may become the owner. If a consumer needs a new fact about a
relationship, that fact belongs on the definition row, not in a consumer-local allowlist, role union,
alias map, or parallel registry. A consumer-local list of roles is always a defect, even when it
currently happens to agree with the definitions.

**How the DB-backed future replaces the in-code rows.** Consumers never read
`RELATIONSHIP_DEFINITIONS` as an array; they call `relationshipDefinitionForRole()`,
`relationshipDefinitionForRef()`, and `collectableRelationshipDefinitions()`. Promotion to a config
table is therefore mechanical: each in-code row becomes one DB row, the three accessors switch from an
in-memory filter to a tenant-scoped config read, and **no consumer changes**. That is the entire
purpose of the seam — keeping the accessors narrow is what preserves it.

### Native structural collections — the documented exception

`children` and `household.members` are **native** and deliberately absent from
`RELATIONSHIP_DEFINITIONS`.

They are not relationship *edges*. They enumerate the household's own structural membership, resolving
directly off `customer_members` — the composition of the household itself. They carry no operational
role, no role grouping, no apply command, and no scope choice, which are the four things a relationship
definition exists to declare. A relationship definition answers *"who is related to this child, in what
role, and what command writes it."* Household membership answers *"what is this household made of."*
Modelling membership as a role-bearing relationship would invent a fictional role
(`is_child_of_household`) and route household composition through the relationship write path, which is
not where it lives.

> **Rule.** A collection is native **only if** it enumerates structural membership of the anchor entity
> and has no operational role. Everything else is a configured relationship and must be one row in
> `RELATIONSHIP_DEFINITIONS`. This native list is closed by design; adding to it requires meeting the
> test above.

### The future-proof test

If someone introduces **Physician, Attorney, Case Worker, Transportation Contact, Therapist, Foster
Parent, or Sponsor**, they must add **ONE** definition row (later: one config row). They must **not**
write provider code, or edit Forms, Conversation Runtime, Configuration Discovery, Processing, or BOS.

This test is the acceptance criterion for the relationship layer. Conformance today is **partial** —
the ledger below is the authoritative record of where it does not yet hold.

### Conformance ledger (audited 2026-07-28)

The collection projection seam is clean: providers, read-resolution, and Configuration Discovery
*application* are fully derived — a new definition row projects to a working provider and resolves
generically with no new code. The gaps are in the layers that still keep their own role lists.

| # | Gap | Location | Effect on a new role |
|---|-----|----------|----------------------|
| 1 | Operational role vocabulary is a closed platform constant | `personChildRelationshipEntity.ts` (`PERSON_CHILD_OPERATIONAL_ROLE_KEYS`) | **Compile-time block** — `operational_role_key` is typed against it, so the row cannot be written at all |
| 2 | Forms collection providers hand-authored | `canonicalFormsRelationshipProviderDerivation.ts` | Invisible to Forms authoring. **Live defect:** `emergency_contacts` and `authorized_pickups` are already missing today |
| 3 | Two-entry authoring allowlist | `formsRelationshipOperationalSupport.ts` | Gates Forms authoring **and** Processing submission acceptance |
| 4 | Write path enumerates commands per role | `relationshipActionRegistry.ts`, `relationshipActionContract.ts`, `relationshipActionRoleResolution.ts` | `apply_command_key` resolves to nothing; no write path exists |
| 5 | Discovery *detection* is regex-per-role | `semanticModel.ts`, `conceptDiscovery.ts` | The role is never detected, so the correct generic apply path is unreachable |
| 6 | Prefill hardcodes `role: "parents"` for every person-grain collection | `formsCollectionPrefillResolver.ts` | **Silent wrong-data bug** once non-parent collections are authorable |
| 7 | Parallel role axis (`primary/parents/billing/emergency/secondary`) unrelated to `operational_role_key` | `FormsRelationshipRoleKey`, `layoutEditorContactRoles.ts`, `relationshipSemanticShape.ts`, `relationshipRoleResolutionPolicy.ts` | Root cause of #2 and #6 |
| 8 | Four separate command allowlists | `capabilityRegistry.ts`, `relationshipExecutionAdapter.ts`, `commandRuntimeExecutionGate.ts`, `canonicalActionAvailability.ts` | Each must gain the key before the API route will execute |
| 9 | **A second definition registry still live** | `focusPanel/household/householdRelationshipSectionDefinitions.ts` | Six hand-authored sections with literal `roleKeys` — no Focus Panel section for a new role |
| 10 | One BOS adapter file per role; NL intent→role is an if-else ladder | `bosCommandAdapterRegistry.ts`, `addParentGuardianAdapter.ts`, `relationshipActionBosAdapter.ts` | The role is not conversational |
| 11 | Processing keeps its own guardian/emergency taxonomy | `questionResolutionModel.ts`, `processingReviewFieldCatalog.ts`, `requirementResponsibility.ts` | Question resolution and responsibility have no non-guardian participant kind |
| 12 | Presentation long tail (~40 Admin V2 / Layout / Person-Drawer files) | §Admin V2 registries | The role does not appear in drawers, cards, or pickers |

Gap #9 is the one to watch: it is a *second canonical registry* of the exact kind this architecture
forbids. It must be collapsed into a projection of `RELATIONSHIP_DEFINITIONS`, not maintained in
parallel.

---

## Household relationships

| Attribute | Value |
|-----------|-------|
| **Owner** | `customers` (household shell) |
| **Cardinality** | 1 customer : N persons (via join) |
| **Source table** | `customer_persons` |
| **Direction** | customer → person |
| **Lifecycle** | Active while `end_date` null / status active |
| **Editable surfaces** | Person drawer household section, Add Person actions |
| **Widget** | Household members repeater |
| **Mutating actions** | `add_person_to_household`, relationship framework actions |

---

## Parent / guardian relationships

| Attribute | Value |
|-----------|-------|
| **Owner** | `customer_persons.role_type` |
| **Cardinality** | N:M customer ↔ person |
| **Source table** | `customer_persons` |
| **Direction** | person linked to customer with role |
| **Lifecycle** | Role may change; primary flag on row |
| **Editable surfaces** | Person drawer, opportunity drawer guardians |
| **Mutating actions** | `make_primary_contact`, add guardian |

---

## Child relationships

| Attribute | Value |
|-----------|-------|
| **Owner** | `customer_members` (profile) + optional `person_id` |
| **Cardinality** | 1 customer : N active children |
| **Source table** | `customer_members` |
| **Direction** | customer → child member |
| **Lifecycle** | `is_active`, relationship = child |
| **Editable surfaces** | Child drawer, household children repeater |
| **Mutating actions** | Add child, PATCH customer_member |

---

## Emergency contact

| Attribute | Value |
|-----------|-------|
| **Owner** | `person_relationships` or scoped contact links |
| **Cardinality** | N per anchor (person or child context) |
| **Source table** | `person_relationships`, layout runtime scoped contacts |
| **Direction** | anchor → contact person |
| **Editable surfaces** | Person/child drawer relationship sections |
| **Mutating actions** | Add emergency contact action |

---

## Authorized pickup

| Attribute | Value |
|-----------|-------|
| **Owner** | Relationship edge (person ↔ child/household) |
| **Source table** | `person_relationships` + role vocabulary |
| **Editable surfaces** | Child/person drawer |
| **Status** | Config-driven role types |

---

## Employee relationship

| Attribute | Value |
|-----------|-------|
| **Owner** | `persons` + employment link (future) |
| **Status** | **Planned** — not fully canonical |
| **Direction** | org → staff person |

---

## Billing contact

| Attribute | Value |
|-----------|-------|
| **Owner** | `customer_persons` with billing role or `customers.primary_contact_id` |
| **Source table** | `customer_persons`, `customers` |
| **Mutating actions** | Make primary, role assignment |

---

## Address

| Attribute | Value |
|-----------|-------|
| **Owner** | `person_locations`, customer metadata, or field_values |
| **Cardinality** | N locations per person/customer |
| **Source table** | `person_locations`, `locations` |
| **Editable surfaces** | Person/customer drawer address sections |

---

## Program relationship

| Attribute | Value |
|-----------|-------|
| **Owner** | OCM enrollment grain |
| **Storage** | `opportunity_customer_members.desired_program_category_id` |
| **Cardinality** | Per child per case |
| **Option source** | Location-scoped programs cascade |
| **Editable surfaces** | Inquiry child enrollment section |

---

## Room relationship

| Attribute | Value |
|-----------|-------|
| **Owner** | OCM enrollment grain |
| **Storage** | `program_room_cohort_key` |
| **Depends on** | location_id, desired_program_category_id |

---

## Schedule relationship

| Attribute | Value |
|-----------|-------|
| **Owner** | OCM enrollment grain |
| **Storage** | `desired_schedule_type` |
| **Vocabulary** | option_set `childcare_schedule_type` |

---

## Enrollment record relationship

| Attribute | Value |
|-----------|-------|
| **Owner** | `opportunity_customer_members` |
| **Cardinality** | N children per opportunity |
| **Direction** | opportunity → customer_member (via OCM) |
| **Link keys** | opportunity_id, customer_member_id |
| **Editable surfaces** | Opportunity drawer inquiry children repeater |
| **Mutating actions** | add_inquiry_child, remove child, update_enrollment_status |

---

## Business process subject relationship

| Attribute | Value |
|-----------|-------|
| **Owner** | `opportunities` (case subject = customer/household) |
| **Cardinality** | 1 primary case per enrollment pipeline subject |
| **Queue binding** | Work unit scopes to opportunity rows |
| **Storage** | `opportunities.customer_id`, `work_unit_id` |

---

## Contacts compatibility layer (deprecated path)

| Attribute | Value |
|-----------|-------|
| **Owner** | `contacts` (legacy) |
| **Classification** | **Isolate → deprecate** |
| **Canonical target** | `persons` + `customer_persons` |
| **Do not** | Create new features on contacts table |

---

## Command Runtime delegation (P3.S1 / P3.S2)

Relationship **semantics and mutation ownership** remain in the Relationship Action Framework
(`executeRelationshipAction`, registries, role resolution). The Command Runtime may delegate
exact operator capabilities through `POST /api/admin/actions/execute`:

| Capability | Notes |
|------------|-------|
| `add_parent_guardian` | Fixed guardian role via registry; create or link person as today |
| `link_existing_person` | Existing identity + role only; no identity creation |
| `add_emergency_contact` | Fixed emergency_contact; create or link; does not imply pickup/guardian |
| `add_authorized_pickup` | Fixed authorized_pickup; create or link; does not imply guardian/billing |
| `add_billing_contact` | Fixed billing_contact; create or link; does not imply financial-account ownership |
| `add_child` | Create or link child person; may attach household member / opportunity participation **only** via existing Relationship Framework path |
| `link_existing_child` | Existing child person id only; no createChildDraft |

`make_primary_contact` (external executor) and the Add Family Member hub remain outside facade
execution. Dedicated `/api/admin/relationship-actions/*` routes remain.

**Primary contact designation (P3.S4 / P4.S2):** Owned by `setHouseholdPrimaryContactForCustomer`
(customer API), not `executeRelationshipAction`. Displaces prior household primary (**replacement**).
P4.S2: Command Runtime facade preview + correlated commit enabled for `make_primary_contact` only.
Direct `PATCH /api/admin/customers/:id/household-primary-contact` remains available without preview
tokens (compatibility; Option A).

---

## Reusable widget potential

| Widget | Canonical source |
|--------|------------------|
| Person picker | `persons` search |
| Child picker | `customer_members` (active, relationship=child) |
| Household picker | `customers` |
| Relationship repeater | Join table + role vocabulary |
| Program cascade | location → program → room |

Implementation: `web/lib/layout/runtime/*Relationship*`, action registry.
