---
owner: operator
status: draft
last_reviewed: 2026-08-25
supersedes: []
---

# Child health — cross-sprint canonical ownership contract

**Purpose.** One contract that the Real Enrollment Certification lane and the Health & Safety lane
both reference, so neither creates durable medical vocabulary the other has to undo.

**Method.** Repository audit against this worktree and against `origin/staging` (fetched, tip
`9aad66349`, Aug 23). Nothing below is inferred from doctrine. Where a claim comes from a code
comment rather than the schema, it says so — a previous pass of mine was wrong for exactly that
reason, and the correction is recorded in §1.5.

**Scope.** No schema created, no data migrated, no Enrollment binding altered, no provider
registered, nothing promoted.

---

## 1. Current-state inventory

### 1.1 Child health storage today: two fields, at the wrong grain

`web/lib/forms/systemFieldRegistry.ts` holds 18 system fields. Exactly two are health:

| Field | Type | `entity_type` | `crm_mapping_key` |
|---|---|---|---|
| `allergy_notes` | textarea | **`enrollment`** | `health.allergy_notes` |
| `medication_flag` | checkbox | **`enrollment`** | `health.medication_flag` |

`customer_members` has **no health column at all** — `id · org_id · customer_id · display_name ·
relationship · first_name · last_name · dob · is_active · metadata · external_source ·
external_id · status_key · person_id`.

### 1.2 ⚠ CONFLICT — the shipped code disagrees with itself about the health grain

Three Forms subsystems, two answers:

| Source | Says health binds to |
|---|---|
| `lib/forms/systemFieldRegistry.ts` | **`enrollment`** (`allergy_notes`, `medication_flag`) |
| `lib/forms/canonicalBindingSuggestions.ts:83–84` | **`customer_member`** — `cm("allergies")`, `cm("medical_notes")`, where `cm = entity_type: "customer_member", scope: "child"` |
| `lib/forms/packets/sharedValuesToFieldIds.ts` | **`customer_member`** — its canonical key example is literally `customer_member:allergies` |

**Two of three point at the child. The one that ships the registered fields points at the
enrollment.** So an operator authoring a form is *suggested* a child-grain destination that has no
registered field, while the registered field lands on the enrollment episode.

**Consequence:** a child's allergy is a property of an enrollment, not of the child. Re-enroll next
year and it does not follow them.

**Recommended canonical owner: the child** (`customer_member`). Two of three subsystems already
say so, and the operational question — "what is true about this child?" — is child-grain by
nature. See §7 for the migration implication.

### 1.3 Configurable field substrate — exists, works

`field_definitions` (org-scoped: `entity_type`, `field_key`, `field_type`, `is_system`,
`is_required`, `section_key`, `config`) and `field_values` (`field_definition_id` +
`entity_type`/`entity_id`, with `value_text/number/boolean/date/json`).

**No ordinal, no per-item identity.** A repeatable record with its own lifecycle cannot live here
except as an opaque `value_json` array in which no item can be referenced, superseded, or traced.

### 1.4 Relationships — the correct owner for physician and dentist, and it is OPEN

`person_child_relationship` is a full subsystem (22 modules in
`lib/fields/personChildRelationship/`):

```ts
PersonChildRelationshipRecord = {
  org_id · customer_id · customer_member_id · person_id     ← CHILD grain
  relationship_type · priority · status · metadata
}
PersonChildRelationshipRoleAssignment = { relationship_id · role_key · is_active }
PersonChildRelationshipInstance = … & { operational_roles[] · person · custom_field_values }
```

Platform-fixed roles: `parent · guardian · emergency_contact · authorized_pickup ·
billing_contact · communication_recipient · financial_responsibility`.

And critically:

```ts
/** Open by design: a relationship definition can declare a role the platform has never heard of
 *  (physician, attorney, case worker). */
export type OperationalRoleKey = PersonChildOperationalRoleKey | (string & {});
```

`canonicalCollectionResolver.ts` is explicitly "Generic for ANY configured role
(authorized_pickup, physician, …) — no per-role code". `processingPersonChildRelationshipProposalFoundation.ts`
already carries `ProcessingRelationshipFieldProposal` and `ProcessingRelationshipRoleProposal`.

> **Correction to the mission brief.** The brief states physician/dentist relationships have
> already been *registered*. Verified against `origin/staging`: `RELATIONSHIP_DEFINITIONS` contains
> exactly three roles — `guardian`, `emergency_contact`, `authorized_pickup`. **Physician and
> dentist are not registered as relationship definitions in code.**
>
> This is not a blocker and not a conflict of ownership: the role vocabulary is *open by design*,
> so physician and dentist are **configuration**, not code. If the Enrollment lane created them as
> org configuration, that is correct and complete. If it expected a code-level definition, none
> exists and none is needed.

### 1.5 Documents — a complete evidence substrate

```
public.documents            org_id · owner_contact_id · entity_type · entity_id   ← POLYMORPHIC
                            doc_type · title · mime_type · checksum_sha256 · status · metadata
                            extracted_text · extracted_data · extraction_status
                            extraction_provider · extracted_at · generated_from_document_id
public.document_versions    version_number · storage_path · checksum_sha256
public.document_field_definitions  org_id · doc_type · field_key · field_type
                                   is_required · is_ai_extractable · extraction_hint
public.document_field_values       the extracted values
```

> **Correction to a claim I previously made.** An earlier pass of mine recorded that document
> evidence exists only as `form_submission_documents` and that a document required outside a form
> has no owner. **That was wrong** — I quoted the code comment in
> `REQUIREMENT_KIND_UNSUPPORTED_REASON_V1` instead of checking the schema. `public.documents` is
> free-standing, polymorphic, versioned and extraction-aware.

`documents` has **no expiry column** — an expiration belongs in `document_field_values` against a
`document_field_definitions` field, which is correct anyway because what expires differs per type.

Processing already classifies **`immunization_record`** as a `ProcessingClassificationKey`
(`subsidy_contract · remittance · immunization_record · enrollment_document ·
form_like_document · unknown`), with explainable signals and an honest `unknown` outcome.

### 1.6 Requirements

`stageRequirementsV1`: `kind` ∈ `field · form · document · consent · acknowledgment · signature`;
`level` ∈ `recommended · required · enforced`; `scope` ∈ `record · primary_contact · any_child ·
each_child · relationship`; `timing` ∈ `record_creation · stage_progress · stage_exit ·
process_completion`; `enforcement` ∈ `informational · attention · blocking`; plus
`applies_to_transition_keys` / `excluded_transition_keys`.

**Only `field` and `form` are authorable.** `document` is refused — and the recorded reason is now
stale per §1.5.

### 1.7 Collections and governed intake

`canonicalCollectionProviderRegistry` is typed and extensible —
`CanonicalCollectionProviderKind = household_membership | relationship_role | document |
communication | work`. Registered: `children`, `household.members`, plus relationship-role
providers. Forms can already bind a repeatable `group` with `repeat` + `collection_binding`.

`adaptFormSubmissionToRelatedRecordProposals` emits `RelatedRecordProposal { origin: existing_record
| proposed_new_record, status: valid | invalid | unsupported | incomplete, diagnostics }`. A health
collection today produces exactly `unknown_provider` / `unsupported_item_entity` — the platform
correctly refusing to fabricate a destination.

### 1.8 What does not exist

| Concern | State |
|---|---|
| Structured allergy / condition / medication entity | ❌ none |
| Immunization / vaccine / dose schema | ❌ none (only the document classification key) |
| Meals domain | ❌ none |
| Safeguarding / custody domain | ❌ none as its own owner |
| Health-specific action or capability provider | ❌ none |
| Field-level health visibility permission | ❌ none |

---

## 2. Cross-sprint ownership table

| Concept | Canonical owner | Grain | Shape | Storage / model | Sensitivity | Validation owner | Evidence owner | H&S projection | Enrollment may bind? | Impl. status | Classification |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Allergy** | Health | child | collection | `person_health_facts` `fact_kind=allergy` | High | Participant Runtime (type/plausibility) → Trust (severity, normalization) | `documents` when document-derived | Critical region | **No** — not until the entity exists | Missing owner | **HEALTH FOUNDATION REQUIRED** |
| **Medical condition** | Health | child | collection | `person_health_facts` `fact_kind=condition` | High | Runtime → Trust | `documents` | Health section | **No** | Missing owner | **HEALTH FOUNDATION REQUIRED** |
| **Medication** | Health | child | collection | `person_health_facts` `fact_kind=medication` | High | Runtime → Trust | `documents` (authorization) | Health section, nested under its need | **No** | Missing owner | **HEALTH FOUNDATION REQUIRED** |
| **Dietary restriction** | Health (child profile) | child | scalar | `field_values` @ `customer_member` | Medium | Runtime | — | Health section + Safety Signal | **Yes**, at `customer_member` | Substrate exists; binding wrong (§1.2) | **READY NOW** ¹ |
| **Physician / pediatrician** | Relationships | child | relationship | `person_child_relationship`, configured `role_key=physician`; name/phone/address on `person`; practice + provider type in `custom_field_values` | Medium | Runtime | — | Detail only, never the summary | **Yes** | Exists, open by design | **READY NOW** |
| **Dentist** | Relationships | child | relationship | same, `role_key=dentist` | Medium | Runtime | — | Detail only | **Yes** | Exists | **READY NOW** |
| **Immunization — vaccine / dose** | Health | child | collection | `person_health_facts` `fact_kind=immunization` (see §4) | High | Trust (CIS extraction) | `documents` `doc_type=immunization_record` | Requirement state only | **No** | Missing owner | **HEALTH FOUNDATION REQUIRED** |
| **Immunization exemption** | Business Process | child × process | requirement | A requirement **exception** on the pinned revision, not a health fact | High | Operator approval | `documents` (exemption form) | Requirement state | **No** | Requirement exceptions not modelled | **CROSS-SPRINT DECISION** |
| **Physical / health assessment — the document** | Documents | child | document | `documents` `doc_type=physical` | Medium | — | itself | Documents table | **Yes** | Exists | **READY NOW** |
| **Physical — required** | Business Process | child × process | requirement | `stageRequirementsV1` `kind=document` | Low | — | the document | Enrollment health row | **No** | `document` kind not authorable | **HEALTH FOUNDATION REQUIRED** ² |
| **Physical — extracted facts** | Health | child | collection | `person_health_facts`, only where durably true | High | Trust | source document | Health section | **No** | Missing owner | **HEALTH FOUNDATION REQUIRED** |
| **Medication authorization** | Business Process | child × process | requirement | requirement resolving against a document | High | — | `documents` | Enrollment health row + a pointer on the medication | **No** | `document` kind not authorable | **HEALTH FOUNDATION REQUIRED** ² |
| **Health-care / action plan — document** | Documents | child | document | `documents` `doc_type=health_care_plan` | Medium | — | itself | Documents table | **Yes** | Exists | **READY NOW** |
| **Health-care plan — derived facts** | Health | child | collection | `person_health_facts` after governed resolution | High | Trust + operator approval | the plan document | Health section | **No** | Missing owner | **HEALTH FOUNDATION REQUIRED** |
| **Medical evidence / document (generic)** | Documents | child | document | `documents` polymorphic @ `customer_member` | Medium | — | itself | Documents table | **Yes** | Exists | **READY NOW** |
| **Emergency medical authorization** | Consent | child × org | requirement | **No canonical consent record exists** — see §2.1 | High | — | signature / document | Enrollment health row | **No** | No owner | **CROSS-SPRINT DECISION** |
| **Emergency contacts** | Relationships | child | relationship | `person_child_relationship` `role_key=emergency_contact` | Medium | Runtime | — | Projected footer line only | **Yes** | Exists | **READY NOW** |
| **Safeguarding / custody / pickup restriction** | Not Health | child | other | No canonical owner; nearest is relationship role + status | **Highest** | — | court document | **Never** on Health | **No** | No owner | **CROSS-SPRINT DECISION** |
| **Routines · toileting · naps · temperament** | Not Health | child | scalar | Child profile `field_values` @ `customer_member` | Low | Runtime | — | **Never** on Health | **Yes**, as profile facts | Substrate exists | **NOT HEALTH TRUTH** |

¹ Dietary is READY NOW **only at `customer_member`**. Binding it to `enrollment` would repeat §1.2.
² The concept is a requirement, not health truth, but it is unusable until `kind: "document"` is
authorable — which depends on no Health foundation, only on §5.

### 2.1 Emergency medical authorization — why it is a decision, not an answer

`REQUIREMENT_KIND_UNSUPPORTED_REASON_V1` records, accurately: *"No canonical consent record
exists. A consent is currently only a form control, which cannot carry withdrawal, versioned
policy text, or an audit trail."*

An emergency medical authorization is a **consent** — it must carry the version of the text
authorized, who authorized it, when, and whether it was withdrawn. A signature on a form
submission proves a signature happened; it does not model withdrawal. **Neither lane should
implement it.** Options: (a) a canonical consent record, (b) treat it as a document requirement
and accept that withdrawal is not modelled, (c) defer. Recommend (a), scoped separately.

---

## 3. Minimal Health foundation

### 3.1 One entity, not three

**`person_health_facts`** with a `fact_kind` discriminator.

```
person_health_facts
  org_id
  subject_entity_type · subject_entity_id      ← polymorphic, exactly as `documents` is
  fact_kind            allergy | condition | medication | immunization
  payload              jsonb, validated per kind against org configuration
  effective_from · effective_to · status
  source_kind · source_ref · confirmed_by · confirmed_at
  supersedes_id · related_fact_id
```

**Why one:** the card, the requirement evaluator and the packet planner all want one list per
child. Three tables would triple the resolver, the collection provider, the proposal adapter and
the RLS surface, for shapes that share everything except the payload. A medication references the
allergy or condition it treats via `related_fact_id`; across three tables that needs a polymorphic
join.

**Why it is transferable:** the entity is *"a structured health fact about a person"*. Nothing
names a program, an age group, a jurisdiction or an industry, and the payload schema per kind is
**org-configurable**, exactly as `document_field_definitions` is per `doc_type`. A home-care
agency, a school district, a camp and a clinic need the same four kinds against the same subject
shape. **No childcare conditionals.**

**Subject grain:** `customer_member` for a child. Polymorphic so a staff member or an adult
participant can carry the same facts without a second entity.

**Effective dating and versioning:**
- **Correction → supersede.** New row with `supersedes_id`; close the old row's `effective_to`.
- **Resolution → close.** Set `effective_to`; the fact stops projecting, stays in history.
- **No hard delete.** Safety information that silently disappears is the failure this avoids.

This mirrors attendance's `original | correction | reversal`, so the platform keeps **one** mental
model for "a durable fact changed".

**Evidence and provenance:** `source_kind` + `source_ref` point at the form submission, the
document, or the operator action that asserted the fact. Health stores lineage and **never
re-interprets** — if a document says "severe", the severity arrived decided.

### 3.2 What must be built, in dependency order

| # | Capability | Note |
|---|---|---|
| **H1** | The `person_health_facts` entity + per-kind payload configuration | The schema |
| **H2** | `CanonicalCollectionProviderDefinition` + a fifth `CanonicalCollectionProviderKind` (`health_fact`) | Registration into an existing typed registry |
| **H3** | Resolver, per the registry's `resolverOwner` contract | Read path |
| **H4** | Registered mutation capabilities — add / edit / end, per kind | Write path. **No card-local writes** |
| **H5** | Requirement evaluator extension so a requirement can resolve against a health fact | Only if a requirement ever depends on a fact rather than a document |

**H1 → H2 → H3 → H4.** Forms binding and Trust proposals both work the moment H2 lands, because
both already speak the collection-provider contract.

---

## 4. Immunization — specialized, and here is why

Immunization does **not** fit the flat allergy/condition/medication shape. It is
`vaccine → doses[] → administered date`, plus disease-history state and exemption state. That is
two levels of nesting, and 69 CIS destinations compress to ~15 semantic needs precisely because of
that nesting.

**Recommendation: `fact_kind = "immunization"` inside `person_health_facts`, one fact per
vaccine, with the dose series in the payload.**

```
fact_kind: "immunization"
payload: {
  vaccine_key: "dtap",
  doses: [ { administered_on, dose_number, source_ref } ],
  history_state: "none" | "disease_history" | "titer_immune"
}
```

- One row per vaccine keeps the collection grain uniform, so the resolver, provider and proposal
  adapter need no immunization special case.
- Doses are ordered values of one fact, not independent facts — nothing references a single dose.
- `vaccine_key` and the required series come from **org configuration**, which is what makes
  Oregon's schedule different from another state's without a jurisdiction branch.

**Exemption is NOT a dose and NOT a payload field.** It is a requirement exception — the child is
excused from a requirement, which is a Business-Process fact with its own approval and evidence.
Burying it in vaccine data makes "no doses recorded" and "lawfully exempt" indistinguishable.
Requirement exceptions are **not modelled today** → `CROSS-SPRINT DECISION`.

**The CIS document stays `documents` evidence.** Never
`immunization_document_present = true` — requirement evaluation answers that by looking for the
document.

---

## 5. Contracts

### 5.1 Document / evidence

```
upload → documents (entity_type=customer_member, doc_type=<configured>)
       → extraction (extracted_data, extraction_status)
       → document_field_values against document_field_definitions
       → requirement evaluation reads the document; Health reads only approved facts
```

Document existence is **never** a health boolean. Expiry lives in `document_field_values`.

### 5.2 Requirement satisfaction

**Never stored.** Evaluated at read time from documents and facts against the pinned revision.
Storing satisfaction creates a second truth that drifts.

> **Gap R1 — `kind: "document"` is not authorable.** The store exists (§1.5), so this is a
> `doc_type` catalog for authoring plus a satisfaction evaluator: *does a `documents` row of type
> X exist for this child, accepted, and not expired?* **This blocks physical, immunization and
> medication-authorization requirements, and it does not depend on the Health foundation.**

### 5.3 Forms direct-bind vs Trust-interpreted

| Destination | Path | Why |
|---|---|---|
| Child name, DOB | **Direct bind** | Typed scalar, registered field |
| Dietary restriction (closed choice) | **Direct bind** → `field_values` @ `customer_member` | Closed vocabulary |
| Dietary restriction (open text) | **Trust** | Normalization into a controlled value |
| Physician / dentist name, phone | **Direct bind** → `person` + relationship role | Typed scalar; role is configuration |
| Allergy from a closed allergen list + closed severity | **Direct bind** → health fact (once H1–H4) | Both ends are controlled vocabulary |
| Allergy from open text ("peanuts, gets hives") | **Trust** | Allergen extraction *and* severity classification |
| Medication with structured dose controls | **Direct bind** → health fact | Typed |
| Medication from open text | **Trust** | Dose/frequency normalization |
| CIS immunization dates | **Trust** | Document-derived, OCR/layout, per-vaccine mapping |
| Any conflicting source | **Trust** | Conflict resolution is Trust's job by definition |
| Uploaded document | **Direct** → `documents` | The artifact is the truth |
| Acknowledgment / signature | Neither | Form-submission artifacts |

**Do not route everything through AI.** A closed choice bound to a registered field must take the
deterministic path — sending it to interpretation adds cost, latency and a failure mode for no
gain. Participant Runtime type/validation/plausibility checks stay **upstream** of every path.

### 5.4 Trust → Health apply

```
Trust emits   RelatedRecordProposal { origin, status, diagnostics, source_lineage }
              status ∈ valid | invalid | unsupported | incomplete
operator      approves proposals; a validated direct binding needs no approval
Health        the registered capability (H4) performs the write; Trust NEVER writes health truth
requirements  re-evaluated at read time — nothing to invalidate
projection    Health & Safety re-reads
```

An `unsupported` proposal — which is exactly what a health collection produces today — **must fail
loudly, never partially apply.**

### 5.5 Safety Signals eligibility

```
canonical Health fact → configured signal eligibility → permission/context evaluation
                      → Safety Signal projection
```

| Concept | Signal-eligible? | Why |
|---|---|---|
| Allergy, severity ≥ configured threshold | **Yes** | Affects safe care in the moment |
| Emergency medication (EpiPen, Diastat) | **Yes** | Staff must know it exists and where |
| Condition with an emergency protocol (seizure) | **Yes** | Same |
| Dietary restriction | **Yes**, to Meals and Attendance only | Operationally scoped |
| Routine medication | **No** | Not moment-of-care |
| Medical condition without a protocol | **No** | Detail, not signal |
| Immunization / exemption | **No** | Compliance, not safe care |
| Physician / dentist | **No** | Not moment-of-care |
| Clinical notes, history, plan text | **Never** | Minimum useful fact only |

> **Gap S2 — health visibility is not a field-level permission.** The permission-evaluation step
> is specified but **not enforceable today**. Safety Signals must not ship until S2 lands, or the
> projection would push health information past a policy that does not exist.

---

## 6. Classification lists

**READY NOW** — Enrollment may bind during Real Enrollment Certification:
dietary restriction (**at `customer_member`, not `enrollment`**) · physician relationship ·
dentist relationship · emergency contacts · physical/assessment document · health-care plan
document · generic medical evidence document · routines / toileting / naps / temperament as child
profile facts.

**HEALTH FOUNDATION REQUIRED** — valid durable health truth, blocked on H1–H4:
allergy · medical condition · medication · immunization vaccine/dose · facts extracted from a
physical · facts derived from a health-care plan. Plus, blocked on R1 only (no Health foundation
needed): physical required · medication authorization required.

**NOT HEALTH TRUTH** — another owner:
routines, toileting, naps, bedtime, comfort strategies, preferences, temperament → child profile
`field_values` · emergency contacts → Relationships · every document → Documents · every
requirement → Business Process.

**CROSS-SPRINT DECISION** — neither lane may implement:
immunization exemption (requirement exceptions are not modelled) · emergency medical authorization
(no canonical consent record) · safeguarding / custody / pickup restriction (no owner, highest
sensitivity, and it must not land in Health by proximity).

---

## 7. Migration and deprecation

**M1 — health fields are at the wrong grain (§1.2).** `allergy_notes` and `medication_flag` bind
to `enrollment`. Re-binding to `customer_member` moves existing `field_values` rows between entity
grains. Reversible, but it touches tenant data, and any form already bound to the enrollment-grain
field needs its `field_source` updated. **Do this before either lane binds more health.**

**M2 — `allergy_notes` free text is not migratable to a structured allergy.** When H1 lands, the
existing blob cannot be mechanically split into allergen/severity/reaction. Options: leave it as a
legacy note field, or route it through Trust as a one-time interpretation pass with operator
approval. Recommend the latter, and **do not delete the note until its facts are approved.**

**M3 — `medication_flag` is a boolean and should be deprecated, not migrated.** "This child takes
medication" is derivable from the medication collection once H1 lands. Keeping both creates two
answers to one question.

---

## 8. Recommended sequencing

| Order | Work | Lane | Unblocks |
|---|---|---|---|
| 1 | **M1** re-bind health fields to `customer_member` | Platform | Everything downstream inherits the right grain |
| 2 | **READY NOW bindings** — dietary, physician, dentist, emergency contacts, documents, profile facts | Enrollment | Real Enrollment Certification proceeds now |
| 3 | **R1** authorable `kind: "document"` + satisfaction evaluator | Platform | Physical, immunization and medication-authorization requirements |
| 4 | **CROSS-SPRINT DECISIONS** — exemption, emergency medical authorization, safeguarding | Director | Removes three blocked concepts from both backlogs |
| 5 | **H1 → H2 → H3 → H4** the Health foundation | Health | Allergy, condition, medication, immunization |
| 6 | **M2** governed interpretation of legacy `allergy_notes` | Health + Trust | Retires the blob |
| 7 | **M3** deprecate `medication_flag` | Platform | One answer per question |
| 8 | **S2 → S1** health visibility permission, then signal configuration | Platform | Safety Signals |

**The two lanes do not block each other until step 5.** Enrollment can complete every READY NOW
binding while the Health foundation is designed, provided M1 goes first.

---

## 9. Decisions required

1. **M1** — approve the grain migration. Everything else assumes it.
2. **Immunization exemption** — requirement exception, health fact, or process state? Recommend
   requirement exception; requirement exceptions are not modelled today.
3. **Emergency medical authorization** — canonical consent record, document requirement without
   withdrawal semantics, or defer? Recommend the consent record, scoped separately.
4. **Safeguarding / custody** — needs an owner, and it is not Health. Highest sensitivity of
   anything in this document.
5. **One `person_health_facts` entity with four `fact_kind`s**, including immunization with a dose
   series in the payload — confirm.
6. **S2** — health visibility as a field-level permission, before any Safety Signal ships.
