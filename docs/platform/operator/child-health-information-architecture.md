---
owner: operator
status: draft
last_reviewed: 2026-08-25
supersedes: []
---
> **Cross-sprint reconciliation:**
> [`health-ownership-cross-sprint-contract.md`](./health-ownership-cross-sprint-contract.md) is the
> single ownership contract both the Real Enrollment Certification lane and the Health & Safety lane
> reference. Where the two disagree, that contract wins — it is repository-verified against
> `origin/staging` and it carries the READY NOW / HEALTH FOUNDATION REQUIRED / NOT HEALTH TRUTH /
> CROSS-SPRINT DECISION classification. This document remains the design rationale behind it.

# Child health information — verified inventory, ownership, and the smallest gaps

**Why this exists.** The Health & Safety card cannot be locked as a visual problem. Its content
has no canonical owner, so any layout would be a picture of data that does not exist. This
document is a repository-backed inventory of what Alloy stores today, a category-by-category
ownership recommendation, and the smallest platform gaps that would support it.

**Every claim below is verified against the schema and source, not against the Design Lab
fixture.** Where a previous pass asserted something this one disproves, the correction is marked.

**Nothing here proposes a medical-intake platform.** The recommended path is the Enrollment /
Forms / Processing / Trust program that already exists.

---

## 1. Verified inventory

### 1.1 What Alloy stores about a child's health today: two fields

`web/lib/forms/systemFieldRegistry.ts` holds 18 system fields. Exactly two are health:

| Field | Type | `entity_type` | `crm_mapping_key` |
|---|---|---|---|
| `allergy_notes` | textarea | **`enrollment`** | `health.allergy_notes` |
| `medication_flag` | checkbox | **`enrollment`** | `health.medication_flag` |

The registry already uses `entity_type: "child"` for three fields (`child_first_name`,
`child_last_name`, `child_date_of_birth`), so **binding a field to the child is already
expressible in the same registry**. Health simply is not bound that way.

> **The platform's own documentation disagrees with its binding.**
> `lib/forms/packets/sharedValuesToFieldIds.ts` gives the canonical example of an
> `entity_type` + `field_key` key as **`customer_member:allergies`**. The intended grain is the
> child. The shipped binding is the enrollment.

**Consequence:** a child's allergy is a property of an enrollment episode. Re-enroll next year and
it does not follow them. There is no severity, no reaction, no treatment, no medication record —
`allergy_notes` is one free-text blob and `medication_flag` is a boolean.

### 1.2 `customer_members` — no health columns

```
id · org_id · customer_id · display_name · relationship · first_name · last_name · dob
is_active · metadata(jsonb) · external_source · external_id · created_at · updated_at
status_key · person_id
```

No allergy, condition, medication, dietary or provider column. `metadata` is the only escape
hatch, and it is unindexed, untyped and unversioned.

### 1.3 `field_definitions` / `field_values` — a working configurable-field substrate

`field_definitions` is org-scoped with `entity_type`, `field_key`, `field_type`, `is_system`,
`is_required`, `section_key`, `sort_order` and a `config` jsonb. `field_values` is the EAV:
`field_definition_id` + `entity_type` / `entity_id`, with `value_text` / `value_number` /
`value_boolean` / `value_date` / `value_json`.

It has **no ordinal and no per-item identity**, so a repeatable record with its own lifecycle
cannot live there except as an opaque `value_json` array.

### 1.4 Documents — ✅ **CORRECTION: a full document substrate exists**

> **A previous pass recorded that document evidence exists only as `form_submission_documents`,
> and that a document required outside a form has no owner. That was WRONG.** It was taken from
> the code comment in `REQUIREMENT_KIND_UNSUPPORTED_REASON_V1` rather than verified against the
> schema. The correction materially shrinks the document gap.

```
public.documents
  org_id · owner_contact_id · entity_type · entity_id   ← POLYMORPHIC: attaches to any entity
  doc_type · title · original_filename · mime_type · byte_size
  bucket · storage_path · public_url · checksum_sha256 · status · metadata
  extracted_text · extracted_data(jsonb) · extraction_status · extraction_provider
  extraction_error · extracted_at · generated_from_document_id · template_key

public.document_versions            version_number · storage_path · checksum_sha256
public.document_field_definitions   org_id · doc_type · field_key · field_label · field_type
                                    is_required · is_ai_extractable · extraction_hint · sort_order
public.document_field_values        the extracted values
```

This is free-standing, polymorphic, versioned, checksummed, and it already carries the
Processing / Trust extraction columns. `document_field_definitions` is effectively a **per-org,
per-`doc_type` configurable schema with AI extraction hints** — a `doc_type` exists as a type
when an org has authored field definitions for it.

`documents` has **no expiry column** — an expiration date would be a `document_field_values` row
against a `document_field_definitions` field, which is the right place for it anyway, because
what expires differs per document type.

### 1.5 Requirements — the right architecture, two kinds authorable

`lib/lifecycle/stageRequirementsV1.ts` defines a requirement over five independent axes:

| Axis | Values |
|---|---|
| `kind` | `field` · `form` · `document` · `consent` · `acknowledgment` · `signature` |
| `level` | `recommended` · `required` · `enforced` |
| `scope` | `record` · `primary_contact` · `any_child` · **`each_child`** · `relationship` |
| `timing` | `record_creation` · `stage_progress` · `stage_exit` · `process_completion` |
| `enforcement` | `informational` · `attention` · `blocking` |

plus `applies_to_transition_keys` / `excluded_transition_keys` for conditionality.

Only `field` and `form` are in `REQUIREMENT_KINDS_AUTHORABLE_V1`. `document` is declared and
refused — but the recorded reason ("document evidence is bound to a form submission") is
**stale**, per §1.4.

### 1.6 Collection providers — a typed registry, extensible by design

`lib/fields/collection/canonicalCollectionProviderRegistry.ts`:

```ts
type CanonicalCollectionProviderKind =
  "household_membership" | "relationship_role" | "document" | "communication" | "work";

type CanonicalCollectionProviderDefinition = {
  refKey; collectionRef; label; itemEntityType; providerKind;
  sourceEntityType; requiredContextKeys; resolverOwner;
  activeOnly; itemIdentityField; orderingPolicy; relationshipRoleKey?;
};
```

Registered today: `children` and `household.members` (native structural), plus relationship-backed
providers derived from `RELATIONSHIP_DEFINITIONS` — including
`person.contact_role.emergency_contacts`.

The Forms schema can already bind a repeatable group to one of these:

```ts
type: "group"; fields; repeat?: FormRepeatRules; collection_binding?: { collection_provider_ref, iteration_entity_type }
```

**So repeatable structured collection is a built, typed platform seam.** What is missing for
health is a provider and an entity for its items to become — not a Forms capability.

### 1.7 Governed intake → canonical destination

`lib/forms/processing/adaptFormSubmissionToRelatedRecordProposals.ts` maps a submission's
collection envelope to `RelatedRecordProposal`s with:

- `origin`: `existing_record` | `proposed_new_record`
- `status`: `valid` | `invalid` | `unsupported` | `incomplete`
- `diagnostics`: including `unknown_provider`, `unsupported_item_entity`, `missing_field_binding`

A health collection today would produce exactly `unknown_provider` / `unsupported_item_entity`.
That is the platform correctly refusing to fabricate a destination.

### 1.8 Emergency contacts — correctly owned, do not touch

`person.contact_role.emergency_contacts` is a `relationship_role` collection provider with
`role_key_candidates: ["emergency_contact", "emergency"]`. Household renders it. Health projects
it and must never store it.

---

## 2. Ownership matrix

| Category | Example | Recommended owner | Exists today? |
|---|---|---|---|
| **A** simple child facts | dietary note, accommodation note, physician, general health note | `field_definitions` + `field_values` at `entity_type: "customer_member"` | Substrate ✅ · binding ❌ (health binds to `enrollment`) |
| **B** structured records | allergy, condition, medication | A new child-scoped health-fact collection + a registered `CanonicalCollectionProviderDefinition` | Seam ✅ · entity and provider ❌ |
| **C** documents / evidence | immunization, physical, medication authorization, health care plan | `documents` (+ `document_versions`, `document_field_definitions`, `document_field_values`) at `entity_type: "customer_member"` | ✅ **already sufficient** |
| **D** requirements | "immunization before Enrolling" | `stageRequirementsV1` on the published Business Process revision | Architecture ✅ · `kind: "document"` not authorable ❌ |
| **E** relationships | emergency contacts | `person.contact_role.emergency_contacts` | ✅ — Health projects, never owns |

### Why B needs structured records rather than repeaters over `field_values`

An allergy is not a value; it is a record with a lifecycle. It needs its own identity so a
medication can reference it, its own effective dates so a resolved condition stops appearing, and
its own evidence pointer so the card can say where the fact came from. `field_values` has no
ordinal and no per-item identity, so the alternative is a `value_json` array in which no item can
be referenced, superseded, or traced to the submission that asserted it.

**Recommended shape — one entity, not three.** A `fact_kind` discriminator
(`allergy` / `condition` / `medication`) with a typed per-kind payload, because the card, the
requirement evaluator and the packet planner all want one list, and because three near-identical
tables would triple the resolver, the provider and the proposal-adapter surface.

**This stays industry-transferable.** The entity is "a structured health fact about a person",
scoped by `entity_type` / `entity_id`, the same polymorphic shape `documents` already uses. It is
not a childcare subsystem: a home-care agency, a school district and a camp all need the same
three kinds. Nothing about it names a program, an age group or an industry.

> **Do not build this schema during this pass.** The recommendation is the ownership. The shape
> needs its own review.

---

## 3. Collection flow, end to end

```
Org / jurisdiction configuration
  · field_definitions at entity_type customer_member                    (A)
  · a Forms group with repeat + collection_binding → health facts       (B — blocked on B1)
  · document_field_definitions per doc_type, with extraction hints      (C — exists)
  · stage requirements_v1 per stage                                     (D — document kind blocked on D1)
        ↓  publish → immutable revision (checksum + CAS), D-96 pinned per instance
Configured Forms / enrollment packet
        ↓
Parent Participant Runtime
  · scalar answers settle into form_packet_sessions.shared_values, keyed by canonicalKeyFor
  · repeatable groups iterate the bound collection
  · documents upload to `documents` with entity_type/entity_id = the child
        ↓
Processing / Trust governed interpretation — ONLY where it is required
  · document extraction → extracted_data → document_field_values
  · collection envelope → RelatedRecordProposal (valid | invalid | unsupported | incomplete)
        ↓
Operator approval — ONLY for proposals, never for a validated direct mapping
        ↓
Canonical truth
  · field_values at customer_member          (A)
  · child health facts                        (B)
  · documents + document_field_values         (C)
        ↓
Requirement evaluation over the pinned revision            (D)
        ↓
Health & Safety card — projects what exists and what applies
```

**When each path applies:**

| Situation | Path |
|---|---|
| A form field with a validated `field_source` binding | **Direct write.** No interpretation, no approval. |
| A repeatable group bound to a collection provider | **Proposal.** `origin: proposed_new_record` or `existing_record`; operator approves. |
| A conversational answer in Participant Runtime | Settles to `shared_values`; the D-99 confirmation rule applies — a participant edit at review IS a confirmation. |
| An uploaded document | Direct to `documents`; extraction populates `document_field_values`; **the document is the evidence, never a boolean**. |
| Requirement satisfaction | **Derived, never stored.** Evaluated from the artifacts above against the pinned revision. |

There is **no parallel mutation path**: every write above is an existing one.

---

## 4. Configuration and portability

The model carries organization, jurisdiction, program, age group and industry **without any
runtime branch**, because all four axes are already configuration:

| Axis | Carried by |
|---|---|
| Organization | `field_definitions`, `document_field_definitions`, form definitions and business processes are all `org_id`-scoped rows |
| Jurisdiction | **A jurisdiction is a different published Business Process revision.** `normalizePublishedStageRequirements` (D-97) makes every published revision self-contained, so an Oregon org's revision requires Oregon's documents and no other revision knows it exists |
| Program | `applies_to_transition_keys` / `excluded_transition_keys` on the requirement, plus form-field `visibility` rules |
| Age group | `scope: "each_child"` evaluates per child; a conditional field rule keys off the child's own data |
| Industry | Nothing in A–E names a domain. The health-fact entity is polymorphic by `entity_type` / `entity_id`, exactly as `documents` is |

`if (state === "oregon")` is not needed and must not appear. **No jurisdiction rules engine should
be built** — the requirement model is already org-scoped, revision-pinned and conditional.

---

## 5. Gap register — smallest changes, in order

| # | Gap | Consequence today | Smallest fix | Size |
|---|---|---|---|---|
| **A1** | `allergy_notes` and `medication_flag` bind to `entity_type: "enrollment"` | A child's allergy does not survive their enrollment episode | Re-bind the registry entries to `customer_member`; migrate existing `field_values` rows | **Small** |
| **D1** | `requirement kind: "document"` is declared but not authorable | Health document requirements cannot be configured at all | A `doc_type` catalog for authoring, plus a satisfaction evaluator answering "does a `documents` row of type X exist for this child, accepted, and not expired". **The store already exists** — this is an evaluator, not a schema | **Medium** |
| **B1** | No child-scoped structured health-fact entity or collection provider | Allergy severity, reaction, treatment and medication records cannot be captured at all | One entity with a `fact_kind` discriminator, one `CanonicalCollectionProviderDefinition`, one resolver, one new `CanonicalCollectionProviderKind` | **Large** |
| ~~C1~~ | ~~No document owner outside a form submission~~ | — | **Withdrawn — `public.documents` is polymorphic, versioned and sufficient** | — |
| **E1** | None | — | Keep projecting emergency contacts, never store | — |

**Order: A1 → D1 → B1.**

A1 first because it is cheap and every later decision inherits the wrong grain otherwise. D1
second because it is now much smaller than previously believed and it unlocks the entire
jurisdiction story. B1 last because it is the only genuinely new schema, and it should not be
designed until A1 has settled the grain.

---

## 6. Decisions that require Director approval

1. **A1 is a migration of live data.** Re-binding `allergy_notes` / `medication_flag` to
   `customer_member` moves existing `field_values` rows between entity grains. Reversible, but it
   touches tenant data.
2. **B1 introduces a new canonical entity and a new `CanonicalCollectionProviderKind`.** That is a
   platform-vocabulary change, not a feature.
3. **Whether medication authorization is a document (C) or a requirement (D)** — it is both, and
   which one the card shows changes what "Missing" means. The recommendation is D: the requirement
   is the operator's concern and the document is its evidence.
4. **Whether an "active condition" distinction should exist**, which would justify a stronger
   alarm treatment than the restrained one now on the card. Absent that distinction, the card
   deliberately treats all critical facts as durable safety information.

---

## 7. Implementation-ready owner table

| Concept | Owner | Existing / New | Why |
|---|---|---|---|
| Dietary restriction, accommodation note, physician, health note | `field_definitions` + `field_values` at `entity_type: "customer_member"` | **Existing** | Scalar, no lifecycle, no evidence pointer. The substrate is built; only the binding is wrong (A1). |
| Allergy · Condition · Medication | `person_health_facts` — ONE entity, `fact_kind` discriminator | **New** | Each instance needs identity (so a medication can reference an allergy), effective dates (so a resolved condition stops projecting), and an evidence pointer. `field_values` has neither ordinal nor per-item identity. |
| Immunization, physical, medication authorization, health care plan | `documents` + `document_versions` at `entity_type: "customer_member"` | **Existing** | Polymorphic, versioned, checksummed, already extraction-aware. |
| Per-document-type fields (issue date, expiry, vaccine list) | `document_field_definitions` / `document_field_values` | **Existing** | Org-configurable per `doc_type`, with `is_ai_extractable` + `extraction_hint`. Expiry belongs here, not on `documents`. |
| "Immunization required before Enrolled" | `stageRequirementsV1` on the published revision | **Existing** | Requirement, not a health fact. Five axes already express applicability, timing and enforcement. |
| Emergency contacts | `person.contact_role.emergency_contacts` | **Existing** | Relationship truth. Health projects, never owns. |
| Health-fact collection binding for Forms | A `CanonicalCollectionProviderDefinition` + one new `CanonicalCollectionProviderKind` | **New (small)** | The registry is typed and extensible; `health_fact` is a fifth kind alongside `household_membership`, `relationship_role`, `document`, `communication`, `work`. |

### One entity or three?

**One**, with a `fact_kind` discriminator (`allergy` | `condition` | `medication`) and a typed
per-kind payload.

- The card, the requirement evaluator and the packet planner all want **one list** for a child.
- Three tables triple the resolver, the collection provider, the proposal adapter and the RLS
  surface, for three shapes that share `subject`, `effective_from/to`, `status`, `source_*` and
  `supersedes_id` — everything except the payload.
- Cross-references stay in one place: a medication points at the allergy or condition it treats
  via a self-reference, which across three tables would need a polymorphic join.

### How this avoids a childcare-only subsystem

The entity is **"a structured health fact about a person"**:

```
person_health_facts
  org_id · subject_entity_type · subject_entity_id     ← polymorphic, exactly like `documents`
  fact_kind · payload(jsonb, validated per kind)
  effective_from · effective_to · status
  source_kind · source_ref · confirmed_by · confirmed_at
  supersedes_id
```

Nothing names a program, an age group, a jurisdiction or an industry. A home-care agency, a school
district, a summer camp and a clinic all need the same three kinds against the same subject shape.
The **payload schema per kind is org-configurable**, exactly as `document_field_definitions` is
per `doc_type` — so what an allergy record captures is configuration, not code.

### Versioning and effective dates

- **Correction** — supersede: write a new row with `supersedes_id`, set the old row's
  `effective_to`. The lineage is readable and the card projects only `status = 'active'`.
- **Resolution** — set `effective_to`; the fact stops projecting but stays in history.
- **No hard delete.** Safety information that silently disappears is the failure mode this avoids.

This mirrors the correction semantics attendance already uses
(`entry_type: original | correction | reversal`), so the platform has one mental model for
"a durable fact changed", not two.

---

## 8. Mutation model

Nothing on the Health detail surface is a live input. The flow is
**understand → choose Add/Edit → focused command → validate → save**.

| Operation | Path | Registered today? |
|---|---|---|
| Add / Edit allergy, condition, medication | New capability against `person_health_facts` | ❌ — needs B1 first |
| Update a health profile fact | Existing `field_values` write for `customer_member` | ✅ substrate; ❌ binding (A1) |
| Upload a health document | Existing `documents` upload + extraction | ✅ |
| Satisfy a requirement | **Never written.** Derived from the artifacts above | ✅ by construction |
| End / resolve a fact | Same capability, sets `effective_to` | ❌ — with B1 |

**There are no card-specific writes.** A card assembles truth; it never owns it (Alloy Law #4).

---

## 9. Enrollment / Trust handoff contract

The parallel Enrollment / Trust program owns collection and interpretation. This domain owns
durable truth. The boundary, stated once:

```
Source                     parent response · uploaded document · operator entry
   ↓
TRUST / PROCESSING owns    interpretation · evidence lineage · ambiguity and conflict
                           · approval policy
   ↓  RelatedRecordProposal { origin, status, diagnostics, source_lineage }
   ↓
Operator approval          only for proposals; a validated direct field mapping needs none
   ↓
HEALTH owns                canonical durable health truth
                           field_values · person_health_facts · documents
   ↓
BUSINESS PROCESS owns      requirement applicability and readiness, over the pinned revision
   ↓
CARD owns                  presentation only
```

**Four rules that keep the boundary real:**

1. **Trust never writes health truth directly.** It emits a proposal; the health capability
   performs the write. A proposal carrying `status: "unsupported"` — which is exactly what a
   health collection produces today, via `unknown_provider` / `unsupported_item_entity` — must
   fail loudly rather than partially apply.
2. **Health never re-interprets.** If a document says "peanut allergy, severe", the severity
   arrived decided. Health stores `source_kind` + `source_ref` and does not second-guess.
3. **Requirements are never stored as satisfied.** Satisfaction is evaluated at read time from
   documents and facts against the pinned revision. Storing it would create a second truth that
   drifts.
4. **The card computes nothing.** It projects what exists and what applies.

---

## 10. Remaining gaps, consolidated

| # | Gap | Blocks | Size |
|---|---|---|---|
| **A1** | Health fields bind to `enrollment`, not `customer_member` | Durable child health profile | Small |
| **D1** | `requirement kind: "document"` not authorable | Configurable health document requirements, and the whole jurisdiction story | Medium — evaluator + `doc_type` catalog; the store exists |
| **B1** | No `person_health_facts` entity, provider or capability | Allergy / condition / medication records, and every Add/Edit on the detail surface | Large |
| **F1** | Autopay and scheduled payment have no owner | Billing's Payment zone renders them as fixture | Small–medium |
| **F2** | `customer_payment_methods` is household-scoped, not payer-scoped | Per-payer method on the Payment zone | Small |
| **F3** | No responsibility-split field (`billing_responsibility` has `defaultFieldKeys: []`) | The `70% / 30%` split | Small |
| **F4** | No `ledger_transactions` running balance | A running-balance column in Billing detail — deliberately not rendered | Not recommended |
| **G1** | Expanded card body is capped at `min(360px, 45vh)` and scrolls | Both detail surfaces are 400–950px of content in a 360px scroll window | **Director decision** |

---

## 11. Decisions that require Director approval

1. **Billing composition** — Current Period / Past Due / Payment is now built. Confirm.
2. **A1 migrates live tenant data** between entity grains. Reversible, but real.
3. **B1 adds a canonical entity and a new `CanonicalCollectionProviderKind`** — platform
   vocabulary, not a feature.
4. **Medication authorization is a requirement, with the document as its evidence** — recommended,
   and the detail surface is built that way.
5. **G1 — the 360px expanded-body cap.** Either the detail surfaces accept a scrolling panel, or
   expanded density needs a taller host. This is a platform decision, not a card decision, and it
   affects Household and Children equally.
6. **Whether an "active condition" distinction should exist**, which would justify a stronger
   alarm treatment than the restrained one now on the card.
