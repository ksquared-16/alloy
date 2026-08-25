---
owner: operator
status: draft
last_reviewed: 2026-08-25
supersedes: []
---

# Health foundation — the H1–H4 contract

**Requested by the Director before Enrollment binds Health-owned concepts.** This is the contract
the Enrollment lane can build against: what H2 exposes, when, and what it guarantees.

Boundary accepted: Enrollment creates **no** allergy / condition / medication / immunization
storage. Health owns H1–H4. Enrollment proceeds with READY NOW bindings and holds Health-owned
concepts until **H2** publishes the collection contract.

Ownership rationale: [`health-ownership-cross-sprint-contract.md`](./health-ownership-cross-sprint-contract.md).

---

## H1 — the entity

**One** entity, `person_health_facts`, with a `fact_kind` discriminator.

```
person_health_facts
  id · org_id
  subject_entity_type · subject_entity_id      polymorphic, as `documents` already is
  fact_kind            allergy | condition | medication | immunization
  payload              jsonb, validated per kind against org configuration
  status               active | ended | superseded
  effective_from · effective_to
  source_kind          form_submission | document_extraction | operator | import
  source_ref           the submission / document / action that asserted it
  confirmed_by · confirmed_at
  supersedes_id        self-reference — correction lineage
  related_fact_id      self-reference — a medication points at what it treats
```

**Immunization is one fact per vaccine**, dose series in the payload:

```
payload: { vaccine_key, doses: [{ administered_on, dose_number, source_ref }], history_state }
```

Doses are ordered values of one fact — nothing references a single dose — so the collection grain
stays uniform and no immunization special case reaches the resolver. `vaccine_key` and the required
series are **org configuration**, which is how a jurisdiction differs without a code branch.

**Exemption is not in the payload.** It is a Business Process requirement exception (D-H2).

**Nothing is deleted.** A correction writes a new row with `supersedes_id` and closes the old row's
`effective_to`; a resolution closes it. This mirrors attendance's `original | correction |
reversal`, so the platform keeps one mental model.

---

## H2 — the collection contract *(this is what Enrollment waits for)*

A registered `CanonicalCollectionProviderDefinition`, plus one new
`CanonicalCollectionProviderKind` — `health_fact` — alongside `household_membership`,
`relationship_role`, `document`, `communication`, `work`.

```ts
{
  refKey: "health.facts",              // + per-kind refs, see below
  collectionRef: "health_facts",
  label: "Health facts",
  itemEntityType: "person_health_fact",
  providerKind: "health_fact",
  sourceEntityType: "customer_member",
  requiredContextKeys: ["customer_member_id"],
  resolverOwner: "web/lib/health/healthFactCollectionResolver.ts",
  activeOnly: true,                    // status = active only
  itemIdentityField: "id",
  orderingPolicy: "created_at",
}
```

**Four provider refs, not one** — `health.allergies`, `health.conditions`, `health.medications`,
`health.immunizations` — because a Forms group binds to *one* collection and an operator authoring
an allergy section must not receive medications. All four resolve through the same entity and the
same resolver; the ref carries the `fact_kind` filter.

### What Enrollment may do the moment H2 lands

```ts
type: "group"
repeat: { ... }
collection_binding: {
  collection_provider_ref: "health.allergies",
  iteration_entity_type: "person_health_fact"
}
```

Forms binding and Trust proposals both start working **at H2**, because both already speak the
collection-provider contract:
`adaptFormSubmissionToRelatedRecordProposals` stops emitting `unknown_provider` /
`unsupported_item_entity` and starts emitting `valid` proposals.

**H2 guarantees, so Enrollment can plan against them:**

1. The four `collection_provider_ref` values are stable and will not be renamed.
2. `iteration_entity_type` is `person_health_fact` for all four.
3. The subject context key is `customer_member_id` — child grain, per D-H1.
4. A binding authored before H1 data exists resolves to an empty collection, never an error.

---

## H3 — the resolver

`healthFactCollectionResolver.ts`, per the registry's `resolverOwner` contract. Read path only.
Filters `status = active` and `effective_to is null or > now`, orders per `orderingPolicy`, and
returns items shaped for the collection contract. **It never interprets** — a severity that arrived
from Trust is carried, not recomputed.

---

## H4 — the mutation capabilities

Registered action definitions, one set per kind:

| Capability | Effect |
|---|---|
| `health_fact.add` | New row, `status = active`, `source_kind` + `source_ref` required |
| `health_fact.edit` | New row with `supersedes_id`; old row `status = superseded`, `effective_to` closed |
| `health_fact.end` | `status = ended`, `effective_to` set. Never a delete |

Each carries the standard `{ eligible, blockers[], requiredInputs[] }` contract. **Trust never
writes** — it emits a proposal and the capability performs the write. A proposal with
`status: "unsupported"` fails loudly and never partially applies.

**Requirement satisfaction is never stored.** It is evaluated at read time.

---

## Sequence and the Enrollment handshake

```
H1  entity + per-kind payload configuration          Health
H2  provider registration + the four refs            Health   ← ENROLLMENT UNBLOCKS HERE
H3  resolver                                         Health
H4  add / edit / end capabilities                    Health
```

**Enrollment's dependency is H2 only.** It may author bindings against the four refs as soon as
they are registered; H3 makes them read, H4 makes them writable. Until then Enrollment holds the
concepts as artifact-scoped responses and importer proposals with **no destination**, which is
the state the publication-readiness classification already assumes.

### Prerequisite

**M1 (D-H1) lands first.** The health grain must be `customer_member` before H2 registers a
provider whose `sourceEntityType` is `customer_member`, or the two disagree from day one.

### Not in scope

Requirement exceptions (D-H2) · Consent (D-H3) · Safeguarding (D-H4) · health visibility
permission and Safety Signals (D-H6, and signals must not ship before it).
