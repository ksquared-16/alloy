---
owner: operator
status: draft
last_reviewed: 2026-08-24
supersedes: []
---

# Child health information — collection, ownership, and the smallest missing capability

**Why this exists.** The Health & Safety card could not be finished as a visual problem. Its
content has no canonical owner, so any layout would have been a picture of data that does not
exist. This document answers where each kind of health information should live, using systems
Alloy already has, and names the one capability that is genuinely missing.

**Nothing here proposes a medical-intake platform.** Every recommendation routes through Forms,
Fields, Documents, Business Process requirements and Relationships as they exist today.

---

## 0. What Alloy actually stores about a child's health today

Two fields, both in `lib/forms/systemFieldRegistry.ts`:

| Field | Type | `entity_type` | `shared_value_key` |
|---|---|---|---|
| `allergy_notes` | textarea | **`enrollment`** | `allergy_notes` |
| `medication_flag` | checkbox | **`enrollment`** | `medication_flag` |

That is the whole of it. Three consequences, and each one is load-bearing:

1. **Health is enrollment-scoped, not child-scoped.** Both fields bind to `entity_type:
   "enrollment"`. A child's peanut allergy is therefore a property of an *enrollment episode*, not
   of the child. Re-enroll the child next year and the allergy does not follow them.
2. **There is no structure.** Severity, reaction, treatment, where the EpiPen is kept, whether the
   authorization is current — none of it is expressible. `allergy_notes` is one free-text blob.
3. **`medication_flag` is a boolean.** It records *that* a child takes medication, never what,
   how much, or who authorized it.

Values land in `public.field_values` — an EAV row keyed by `field_definition_id` +
`entity_type`/`entity_id`, with `value_text` / `value_number` / `value_boolean` / `value_date` /
`value_json`. It has no ordinal and no per-item identity, so a repeatable record with its own
lifecycle cannot live there except as an opaque `value_json` array.

---

## 1. Recommended classification

### A — Simple child profile facts → configurable fields on the child

**Recommendation: canonical `field_values` rows at `entity_type: "customer_member"`.**

| Fact | Why it is scalar |
|---|---|
| Dietary restriction / preference | One value, no lifecycle, no evidence |
| Physician / provider name + phone | A contact detail of the child |
| General medical notes | Deliberately unstructured |
| Accommodation notes | Deliberately unstructured |

These need no new capability. They need the **field definitions to be re-scoped from
`enrollment` to the child**, which is a configuration change plus a migration of existing values,
not a schema change.

> **The one required correction:** a health fact about a child must bind to the child. Leaving
> health on `entity_type: "enrollment"` is the single biggest structural defect in this area.

### B — Structured repeatable health facts → a canonical collection, and this is the gap

Allergies, medical conditions and medications are **not scalars**. Each instance has its own
identity, its own lifecycle, and its own evidence:

```
allergy      allergen · severity · reaction · treatment · medication · instructions
             · effective from/to · source (which submission asserted it)
medication   medication · dosage · route · frequency · authorization · expires
             · storage location · administering staff role
condition    condition · onset · management plan · restrictions · review date
```

**What already exists.** The Forms schema can already express a repeatable structured group:

```ts
| (FormFieldBase & {
      type: "group";
      fields: FormField[];
      repeat?: FormRepeatRules;
      collection_binding?: FormGroupCollectionBinding;   // ← binds instances to a canonical collection
  })
```

`FormGroupCollectionBinding` carries `collection_provider_ref` + `iteration_entity_type`. The
machinery for "collect N of these and land each one as a canonical record" is built and running.

**What is missing.** Only ONE collection provider is bound anywhere in the repository today —
`"children"` (`lib/pos/processingCase/commit/auditExistingChildCommit.ts`). There is no
`child_health_facts` collection and no entity for the instances to become.

> **Gap B1 — the largest one.** A repeatable health collection is fully expressible in Forms and
> has nowhere to land. The missing capability is a canonical child-health-fact collection (entity
> + provider ref), NOT a new form capability. Recommend one table with a `fact_kind` discriminator
> (`allergy` / `condition` / `medication`) and a typed `details` payload per kind, rather than
> three tables — the card, the requirement evaluator and the packet planner all want one list.
>
> **Do not build this schema yet.** This document recommends the ownership; the shape needs its
> own review.

### C — Documents and evidence → Documents, via Forms

Immunization record, physical / health assessment, medication authorization, health care plan.

**These are documents, and they must not become boolean profile fields.** A `physical_received`
checkbox is a claim with no artifact behind it — exactly the failure mode this classification
exists to prevent.

The only document evidence store today is **`form_submission_documents`**, which is scoped to a
form submission. There is no free-standing `documents` table.

> **Gap C1.** A health document that is *not* collected through a form submission has nowhere to
> live. In practice this is tolerable — health documents arrive through the enrollment packet, so
> they arrive as submission-scoped evidence — but a document uploaded by an operator outside a
> packet cannot be recorded.

### D — Requirements → Business Process stage requirements, already correct

Requirements are **not health facts**, and Alloy already has the right architecture for them.
`lib/lifecycle/stageRequirementsV1.ts` defines a requirement over five independent axes:

| Axis | Values |
|---|---|
| `kind` | `field` · `form` · `document` · `consent` · `acknowledgment` · `signature` |
| `level` | `recommended` · `required` · `enforced` |
| `scope` | `record` · `primary_contact` · `any_child` · `each_child` · `relationship` |
| `timing` | `record_creation` · `stage_progress` · `stage_exit` · `process_completion` |
| `enforcement` | `informational` · `attention` · `blocking` |

`scope: "each_child"` plus `timing: "stage_exit"` plus `enforcement: "blocking"` already expresses
*"every child must have an immunization record before leaving Enrolling."* This is the existing
requirement/readiness architecture and the Health card should consume it, never restate it.

> **Gap D1 — and this is the smallest missing capability of the whole area.** Only `field` and
> `form` are authorable. `document` is declared but refused, with a concrete reason recorded in
> `REQUIREMENT_KIND_UNSUPPORTED_REASON_V1`:
>
> > "No canonical document-requirement owner exists. Document evidence is bound to a form
> > submission, so a document required outside a form has no owner that can prove it was
> > satisfied."
>
> Making `kind: "document"` authorable — which requires giving C1 an owner — is the single change
> that unlocks configurable health-document requirements. Everything else already works.

### E — Relationships → Household owns them; Health projects them

Emergency contacts are relationship truth on `_opportunity_persons` / `customer_persons`, and
Household already renders them. **Health must never store a contact.** The card projects a count
and the first call, and hands off.

---

## 2. Jurisdiction configuration — how Oregon differs, without `if (state === "oregon")`

The answer is that **a jurisdiction is not a runtime branch; it is a different published Business
Process revision**, and that mechanism already exists.

```
Org configures an Enrollment Business Process
        ↓
Stage requirements_v1 authored per stage      ← WHICH health facts / forms / documents
        ↓  (publish)
Immutable published revision, checksum + CAS
        ↓  (D-96 pin)
process_instances pinned to that revision
        ↓
Requirement evaluation → readiness
        ↓
Health & Safety card projects the result
```

Three properties make this sufficient:

- **Requirements are per published revision**, normalized into every stage at publish time by
  `normalizePublishedStageRequirements` (D-97), so a revision is a self-contained executable
  artifact. An Oregon org's revision requires an Oregon immunization document; another state's
  revision requires something else. Neither knows the other exists.
- **Conditionality is already expressible** two ways: `applies_to_transition_keys` /
  `excluded_transition_keys` on the requirement, and `visibility` rules on the form field. *"A
  medication authorization is required when the child takes medication"* is a conditional field
  requirement, not a jurisdiction rule.
- **The vocabulary is org-owned.** Field definitions, option sets and form definitions are all
  per-org rows, so "these health questions" is authored, never coded.

> **Do not build a jurisdiction rules engine.** The requirement is already
> org-scoped, revision-pinned and conditional. What is missing is only Gap D1 — the ability to
> require a *document* — plus Gap B1 for the structured facts themselves.

---

## 3. Recommended collection flow, end to end

```
Org / jurisdiction configuration
   · field definitions at entity_type customer_member      (A)
   · a repeatable health group with collection_binding     (B — blocked on B1)
   · document requirements per stage                       (D — blocked on D1)
        ↓
Enrollment packet / Forms
   · scalar facts bind through field_source
   · repeatable groups iterate the health collection
   · documents arrive as form_submission_documents
        ↓
Processing / governed interpretation where applicable
   · existing D-99 confirmation semantics; a participant edit at review IS a confirmation
        ↓
Approved canonical child health information
   · field_values at customer_member  +  the health-fact collection
        ↓
Requirement / readiness evaluation
   · stageRequirementsV1 over the pinned revision
        ↓
Health & Safety card
   · critical fact → insight; conditions → Medical; administration → Medications;
     requirement satisfaction → Enrollment health; contacts → projected from Household
```

---

## 4. Gap register

| # | Gap | Consequence today | Smallest fix |
|---|---|---|---|
| **A1** | Health fields bind to `entity_type: "enrollment"`, not the child | A child's allergy does not survive their enrollment episode | Re-scope the field definitions to `customer_member`; migrate existing `field_values` |
| **B1** | No canonical child-health-fact collection or provider ref | Allergies, conditions and medications cannot be structured; only `allergy_notes` free text and a `medication_flag` boolean exist | One collection entity with a `fact_kind` discriminator, plus its `collection_provider_ref` |
| **C1** | Document evidence exists only as `form_submission_documents` | A health document outside a packet cannot be recorded | Give documents an owner independent of a submission |
| **D1** | `requirement kind: "document"` is declared but not authorable | Health document requirements cannot be configured at all | Depends on C1; then add `document` to `REQUIREMENT_KINDS_AUTHORABLE_V1` |
| **E1** | None — emergency contacts are correctly owned | — | Keep projecting, never store |

**Order.** C1 → D1 unblocks configurable health documents, which is the jurisdiction requirement.
B1 unblocks the structured facts the card shows. A1 is independent, cheap, and should go first
because every later decision inherits the wrong grain otherwise.
