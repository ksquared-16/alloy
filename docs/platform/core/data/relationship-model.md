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

> **Configuration Discovery V1 is CERTIFIED (2026-07-30).** The chain below is proven end to end on a
> live stack; see
> [`configuration-discovery-v1-certification.md`](./configuration-discovery-v1-certification.md) for the
> record, the security matrix, and the defects certification found.

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
| 1 | ~~Closed operational role vocabulary~~ **CLOSED** | `personChildRelationshipEntity.ts` | `OperationalRoleKey` is now an open union; platform-fixed keys keep autocomplete. Full vocabulary via `operationalRoleVocabulary()` |
| 2 | ~~Forms collection providers hand-authored~~ **CLOSED** | `canonicalFormsRelationshipProviderDerivation.ts` | Now derived from `collectableRelationshipDefinitions()`. Fixed the live defect that stranded `emergency_contacts` and `authorized_pickups` |
| 3 | ~~Two-entry authoring allowlist~~ **CLOSED** | `formsRelationshipOperationalSupport.ts` | Now derived; a definition row widens Forms authoring **and** Processing submission acceptance together |
| 4 | ~~Write path enumerates commands per role~~ **CLOSED** | `relationshipActionRegistry.ts`, `relationshipActionRoleResolution.ts` | Registry entries + role resolution derive from definitions; the per-action switch is gone |
| 5 | ~~Discovery detection is regex-per-role~~ **CLOSED** | `semanticModel.ts`, `conceptDiscovery.ts` | Detection patterns, precedence, scope and group label are definition columns |
| 6 | ~~Prefill hardcodes `role: "parents"`~~ **CLOSED** | `formsCollectionPrefillResolver.ts` | Role now derives from the bound collection; unmapped collections resolve from generic person columns. The legacy bridge is contained in `formsLegacyContactRoleCompatibility.ts` and needs no entry for a new definition |
| 7 | Parallel role axis (`primary/parents/billing/emergency/secondary`) unrelated to `operational_role_key` | `FormsRelationshipRoleKey`, `layoutEditorContactRoles.ts`, `relationshipSemanticShape.ts`, `relationshipRoleResolutionPolicy.ts` | Root cause of #2 and #6 |
| 8 | ~~Command allowlists~~ **MOSTLY CLOSED** | `capabilityRegistry.ts`, `relationshipExecutionAdapter.ts`, `commandRuntimeExecutionGate.ts` | Capabilities, the facade gate and the fixed-role set all derive. `canonicalActionAvailability.ts` stage lists remain — read-path visibility only, does not gate execution |
| 9 | **A second definition registry still live** | `focusPanel/household/householdRelationshipSectionDefinitions.ts` | Six hand-authored sections with literal `roleKeys` — no Focus Panel section for a new role |
| 10 | One BOS adapter file per role; NL intent→role is an if-else ladder | `bosCommandAdapterRegistry.ts`, `addParentGuardianAdapter.ts`, `relationshipActionBosAdapter.ts` | The role is not conversational |
| 11 | Processing keeps its own guardian/emergency taxonomy | `questionResolutionModel.ts`, `processingReviewFieldCatalog.ts`, `requirementResponsibility.ts` | Question resolution and responsibility have no non-guardian participant kind |
| 12 | Presentation long tail (~40 Admin V2 / Layout / Person-Drawer files) | §Admin V2 registries | The role does not appear in drawers, cards, or pickers |
| 13 | ~~`iteration_alias` decided by a per-ref ternary in Forms~~ **CLOSED** | `formsCollectionRepeatBinding.ts` | Alias is now a definition column; natives keep their literal aliases |

Gap #9 is the one to watch: it is a *second canonical registry* of the exact kind this architecture
forbids. It must be collapsed into a projection of `RELATIONSHIP_DEFINITIONS`, not maintained in
parallel.

### The smell test now passes for the core chain

`web/tests/fields/relationshipDefinitionSmellTest.test.ts` injects a `physicians` definition and
asserts the whole chain picks it up with **no other edit**: collection provider, Forms binding +
authoring + alias, Discovery detection + precedence, action-registry entry, platform capability,
facade gate, role resolution, and the PCR write fork. It also asserts the three shipped roles are
unchanged. If anyone reintroduces a per-role allowlist in that chain, this test fails.

Two behaviours are deliberately preserved rather than "fixed", and are now explicit columns instead
of implicit code branches:

- **`add_parent_guardian` writes `customer_member_contacts`, not `person_child_relationships`.** It
  always has — `executor_kind: "guardian"` was excluded from the PCR fork. Now stated as
  `persists_to`, so flipping guardian to PCR is a one-row config change plus a data migration.
- **A section titled "Guardians" is seen as a person group but is NOT classified as the guardian
  role**, because the matcher closes with `\b` and fails on the plural. Captured as
  `detection_word_suffix`. Worth revisiting; not changed here because it would alter detection output
  for existing documents.

### Persistence destinations — an intentional compatibility boundary

The canonical invariant is:

> ONE canonical Person identity → may hold MULTIPLE operational relationship roles → each role is
> applied through the persistence destination declared by its Relationship Definition.

**Separate persistence destinations are not duplicate identity.** As shipped:

| Definition | `persists_to` | Physical destination |
|---|---|---|
| `parents_guardians` (guardian/parent) | `customer_member_contacts` | legacy member-contact links |
| `emergency_contacts` | `person_child_relationships` | PCR + `person_child_relationship_roles` |
| `authorized_pickups` | `person_child_relationships` | PCR + `person_child_relationship_roles` |

The layering that makes this safe:

- **Relationship Definition is canonical.** It declares the role, command, scope and destination.
- **`persists_to` chooses the compatibility writer** — it is a storage decision, not a semantic one.
- **The execution adapter hides physical persistence.** Callers name a relationship, never a table.
- **Consumers operate on normalized relationship semantics.** Forms, Configuration Discovery,
  Processing and (future) Conversation Runtime resolve a definition and read/write through it. None
  of them branch on which physical table a role happens to land in. This is enforced by
  `web/tests/fields/relationshipStorageAbstraction.test.ts`.

**This is explicitly NOT the desired final storage architecture.** Converging guardian storage onto
`person_child_relationships` requires a SEPARATE migration mission with its own data migration,
dual-read/backfill strategy, compatibility testing and product approval. It is deliberately out of
scope for Configuration Discovery V1, and `persists_to` is the seam that makes that later migration a
configuration change plus a backfill rather than a rewrite.

### Implemented — Discovery's relationship bindings reach the form

Configuration Discovery resolves each relationship group to its canonical provider and write command,
and `projectRelationshipCollections.ts` now translates an ACCEPTED `relationship_binding` into a
collection-bound form group. Everything it needs is already on the definition row — `provider_ref`,
`item_entity_type`, `iteration_alias`, `nested_field_keys` — so it branches on no role.

Two exclusions are deliberate, because the first draft of this projection would have destroyed data:

- **Output-copy sections are never converted.** A section whose disposition is `static_reference`, or
  whose title reads as a copy, is left alone. Converting "(Classroom Copy)" would have stripped it.
- **Signature sections are not relationship groups.** "Parent/Guardian Signatures" names guardians but
  collects signatures; projecting it would have removed the signature fields from the form.

Certified live end to end: a freshly imported enrollment record produces a published form carrying
three relationship collections whose bindings and lineage survive publish and reopen.

### Implemented — public lead-capture intake reads the collection envelope

Projecting guardians into a collection SUPPRESSES the flat guardian contact questions. The public
form's CRM-intake path used to read only those flat fields, so a lead-capture submission recorded
`intake_resolution_path = "skipped_missing_config"` and **no Processing case was opened** — a form
could be published that silently could not capture a lead. Found by live certification, not by
inspection.

`resolveGuardianFromCollectionEnvelope.ts` closes it by making intake a CONSUMER of the same
collection model Forms, Discovery and Processing already use. Recognition is by IDENTITY, never by
label: a collection qualifies because its `provider_ref` resolves to a Relationship Definition whose
operational role is guardian or parent. Renaming a document section, or a tenant writing "Caregiver"
instead of "Parent", changes nothing. Field meaning comes from the schema's own `field_source`
bindings, so no id or label is ever parsed.

It selects a primary contact deterministically (an existing canonical guardian with usable contact,
then the first usable guardian in stable collection order) and never discards the other guardians. It
performs no canonical Person write — Processing identity resolution owns create-vs-link.

### Implemented — configured relationship commits are guarded

Configured relationship-collection commits converge on the canonical adapter through
`verifyRelationshipCommitAuthorization.ts`. The authority rule: a caller may identify WHICH proposal
to commit, plus an anchor and a scope. It may never assert the role, the command, the entities or the
write destination — all are re-derived server-side from the proposal's `collection_provider_ref`, and
anything the caller does assert is compared and rejected on conflict, so a spoof surfaces as an error
rather than succeeding under different semantics.

Supporting rules, each of which exists because its absence was a real defect:

- **The relationship anchor is explicit.** A child is never inferred from a household and a missing
  anchor is never silently expanded to every child. Preview and commit resolve the anchor through the
  same helper, so a preview always describes what the commit will do.
- **The resolved Processing Case is the household authority.** A public submission is truthful when
  created (`customer_id` null) and stays immutable source evidence; it is never back-filled to look as
  though the household was known at intake time. Disagreement between submission and resolved case is
  a 409 conflict, never a silent choice.
- **The resolution revision is part of the commit identity.** A retry replays; a case re-resolved to a
  different family is a distinct commit, never a replay against the previous household.
- **Omission is a no-op.** A later response that drops a member deletes nothing. No deletion workflow
  exists in V1 and none was introduced.

Nine spoof attempts are refused by the live route with specific codes, and the certification asserts
that none of them wrote anything — see
[`configuration-discovery-v1-certification.md`](./configuration-discovery-v1-certification.md).

### Remaining follow-up — the direct relationship-action route

`POST /api/admin/relationship-actions/execute` calls `executeRelationshipAction` **directly** rather
than through the command adapter. The spoofing half of this concern is now closed: the route resolves
the definition from the action key, rejects a client-supplied `role_key` that disagrees with it
(`client_role_not_authoritative`), derives the role from the definition, and validates scope against
the definition's supported scopes.

What remains is structural, not an authorization hole: this route still reaches the executor without
passing through the command adapter, so adapter-level concerns (ledger, delegation, invocation
identity) do not apply to it. It is the live UI path for the relationship modals. Deferred to a future
iteration — it is a pre-existing architectural seam, not a consequence of this work.

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
