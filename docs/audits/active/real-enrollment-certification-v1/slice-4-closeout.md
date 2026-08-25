# Real Enrollment Certification V1 — Slice 4 closeout

**Slice:** Canonical Vocabulary + Semantic Ownership
**Base:** Slices 1–3 accepted (`e0b911b86`)
**Commits:** `ca3be9737` · `f98c2b3fe`
**Status:** complete. Nothing published. Slice 5 not started.

---

## 1. The B ledger — 37 rows, not 36

Slice 3 reported 36. A rule in its own classification script matched **`hib` as a substring — inside
the word "prohibiting"** — and filed a restraining-order question as a vaccine dose schedule. The
same defect class this program has been chasing since Slice 1, this time in the audit rather than the
product. Corrected; the ledger covers 37.

`slice-4-b-ledger.mjs`, checked by `slice-4-ledger-check.mjs` — every B fact has exactly one complete
row (concept · occurrences · proposed key · grain · durable · sensitivity · existing owner · proposed
owner · rationale · disposition).

| disposition | rows | implemented |
|---|---:|---|
| `RELATIONSHIP_FACT` | 4 | **yes** — two definition rows |
| `NEW_CANONICAL_FIELD` | 8 | **no** — blocked, see §3 |
| `PROCESS_PARTICIPANT_FACT` | 3 | n/a — stays with the process |
| `STRUCTURED_COLLECTION` | 1 | n/a — belongs to the immunization record |
| `NEEDS_DIRECTOR_DECISION` | 21 | **not implemented, by instruction** |

Nothing was forced into the Field System. Twenty-one rows come back as decisions because ontology is
a product decision, and a field created wrongly is harder to remove than one never created.

---

## 2. Director decisions (21)

**Safeguarding (4)** — custody arrangements flag + detail, contact-restriction flag + restricted
party. Durable and operationally critical; who may see them, how long they are kept, and whether a
contact restriction is a household flag or a NEGATIVE relationship are privacy decisions.

**Clinical history (2)** — birth complications, serious illness / hospitalizations. Does Alloy model
clinical history as distinct categories, or one narrative? `medical_notes` would swallow both and
lose the distinction.

**Toileting (4)** — habits, how the child signals, reluctance, specific needs. Plausibly ONE durable
routine fact; merging four authored questions into one concept is a product decision.

**Naps (2)** — whether the child naps, and naptime needs. Two questions about one routine.

**Child profile (9)** — temperament, fears, comfort strategy, expressing frustration, social style,
independent play, reaction to strangers, favourite activities, behaviour management at home. A
teacher uses these all year, so they are durable — but the right concepts (a proposed five from these
nine) are an ontology call, and encoding this school's sentences as field keys is what §7 forbids.

---

## 3. What was implemented — and the primitive that stopped the rest

### Implemented: two relationship definition rows

The relationship doctrine names **physician** as its worked example: *"Adding a new collectable role
(physician, attorney, case worker…) must be ONE new definition row — never new provider code."* A real
packet asked for a child's doctor, so the example became real.

| | |
|---|---|
| owner | `lib/fields/relationship/relationshipDefinitions.ts` |
| rows | `child_physicians` (role `physician`), `child_dentists` (role `dentist`) |
| grain | `customer` → `person`, cardinality **many**, child-scoped |
| nested fields | `full_name`, `phone` — what a packet asks for; nothing invented |
| storage | `person_child_relationships` + `person_child_relationship_roles` (`role_key` is open text — **no migration**) |
| validation owner | the person record's own field validation |
| derived automatically | action registry · capability registry · role mapping · collection projection · discovery detection |

The repository's conformance test used physician as its hypothetical and **collided on the capability
key**. That collision was the one-row property being met; the hypothetical moved to `case_worker`.

### Not implemented: eight fields, two different blockers

**Bedtime and wake time need a TIME type that does not exist.** Not in `FormSchemaV1`
(text/number/date/boolean/select/multiselect/file_ref/signature/group/text_block), not in the child
field manifest (`"text" | "select"`). The ownership answer is settled; the type primitive is missing.

**Six durable child-profile facts** — special diet, developmental history, therapy history, eating
habits, favourite foods, foods refused — are blocked on something more interesting:

> The child-profile config key set is declared **by hand in four separate places**:
> `customerMemberFieldRegistry` (the manifest), `childcareLayoutFieldCatalog` (picker rows *and* a
> second ref-key list), `identitySurfaceCompose`, and `identityInlineChildSave`.

Adding one durable child fact is not one row. I implemented all six, measured the blast radius
(2 test failures, both conformance locks on the FC-CM-1 provider set), added the layout catalog rows,
and found a **third** and **fourth** hand-authored surface still gating exposure — while the
conformance test's own name asserts *"without picker allowlists"*, a property that holds only because
five keys happen to be enumerated everywhere.

So the additions were reverted and the primitive is named instead:

**Missing primitive — derive the child-profile surfaces from the manifest**, the same refactor the
relationship layer already completed. Adding physician was one row *because that layer did it*.

### Implemented: sensitivity as a declared property

`CustomerMemberConfigFieldManifestRow.sensitivity?: "standard" | "health"`, applied to allergies,
medical notes and special diet's future home. Health data carries different access and retention
expectations, and a field that never declares its class cannot be governed by one.

---

## 4. G7 — final status: **closed for composition, open for storage**

- Composition doctrine already existed: `NameRepresentation = full_name | first_last |
  first_middle_last`, expanded by `expandQuestionsForDraftSave` into registered split fields.
- Slice 3 gave the middle name the ask-once identity (`shared_value_key: child_middle_name`), so one
  semantic name populates Full Name, First, Middle and Last **without asking twice**.
- **Durable storage is still missing.** Neither `customer_members` nor `persons` has a middle-name
  column, and `customer_members` config fields are `field_values` rows — while first/last are NATIVE
  columns, which is where a name part belongs. Adding it is one migration; it was not taken because
  the same four-surface problem applies to the native key list, and a name column that only half the
  surfaces know about is worse than an honest gap.

---

## 5. Care providers — resolved

`physician phone → person.phone` is impossible now, by two independent mechanisms: the party boundary
refuses it, and the relationship definition gives it somewhere correct to go. Measured on the packet:
4 provider facts bind to `physician` / `dentist` roles, and **no proposal with a provider party
targets any person field**.

It generalizes beyond this packet: a *different* school's enrollment record in the existing
acceptance fixture stopped proposing "Primary Care Doctor Name/Practice" and "Dentist Name/Practice"
as new child fields with no edit to that fixture's logic.

---

## 6. Emergency contacts / authorized people — already canonical

Both are existing relationship definitions with `cardinality: "many"` and nested field keys
`[full_name, phone, relationship_type, address]`. The packet's 13 emergency-contact destinations
resolve to **one relationship**, and the certification asserts no `emergency_contact_1_name`-shaped
key is proposed anywhere. Ask-once identity operates over the relationship member, not the row number.

---

## 7. Tuition / payment — the boundary holds

`customer_payment_methods` stores `stripe_payment_method_id` + brand + last4: **a processor token, not
an account number.** The platform's own answer is that Alloy never holds these values.

| packet fact | owner | verdict |
|---|---|---|
| routing number, account number | Payments | must NOT be stored as fields — the owner holds a token |
| financial institution, city, state, account type | Payments | payment-method descriptors |
| account holder identity | `billing_contact` operational role (exists) | relationship, not a field |
| annual material fee | `financials/tuitionPlans` | fee configuration |
| ACH authorization consent | Requirements (acknowledgement) | obligation |

These stay unavailable to Enrollment canonical prefill until Financials exposes an owner. Nothing was
built in Financials.

---

## 8. Obligation publication model

`RequirementRef` is `{ form_definition_id, section_id?, field_id? }`, so:

| obligation | publishes as |
|---|---|
| acknowledgement | a form section/field with requirement type `acknowledgement` |
| signature | a `signature` field |
| upload / evidence | a `file_ref` field |
| static policy content | a `text_block` |

**Which owns a merged obligation's published identity?** The FORM does — a requirement is identified
by a form plus a section or field. A clause printed in two source artifacts publishes **once**, on
whichever artifact's form carries it.

**Missing primitive:** `RequirementRef` cannot express multi-artifact provenance. The packet layer
holds that lineage (destination refs per artifact); nothing carries it into the published
requirement, so source-artifact lineage survives *in the packet* and is lost *at publish*.

---

## 9. G9 — closed as far as owners permit

```
source declared → normalized → publishable → Participant Runtime
required            ✅            ✅ required        ✅
type                ✅            ✅                 ✅
allowed choices     ✅            ✅ static_options   ✅ closed vocabulary
max/min length      ✅            ✅ validate         ✅
pattern, min, max   ✅            ✅ validate         ✅
```

`validateParticipantCandidate` delegates to `validateScalarValue`, documented as *"the single owner of
authored min/max/pattern, the closed option vocabulary"* — so a published rule is enforced at the
participant's keystroke. The lineage is complete for everything a source declares.

**Still lost, and flagged in the review rather than approximated:** conditional gates (this packet's
conditionality is prose — the capture declares no logic at all) and collection constraints (the source
states a layout, not a rule). The packet review states what the sources declared and what was carried.

---

## 10. Proposal engine adoption

| | before | after |
|---|---:|---:|
| safe canonical proposals | 8 | **13** |
| — canonical fields | 8 | 8 |
| — relationship bindings | 0 | 5 |
| refused as unsafe | 3 | **1** |
| unbound | 78 | **73** |

Adoption is **semantic**: discovery derives whose fact a label names, the relationship layer owns
which parties are relationships, and where they agree the proposal is a relationship binding. No
school-specific lookup — a tenant configuring "therapist" gets the same treatment with no code edit.

Routing is restricted to parties with **no canonical field of their own**. A guardian has registered
fields, and those are what a form collects and what prefill reads; rerouting them would move a working
binding for no gain. Slice 3's false-positive safety is intact — the one remaining refusal is a
secondary parent's mailing address, which no relationship collects.

---

## 11. Updated A–F

`slice-4-classification.mjs`, checked against measured keys — 73, exact partition.

| | bucket | S2 | S3 | S4 |
|---|---|---:|---:|---:|
| A | existing canonical — binding missing | 11 | 12 | **12** |
| B | new reusable domain fact | 34 | 37 | **33** |
| C | process / participant-runtime | 3 | 3 | **3** |
| D | artifact-specific | 1 | 1 | **1** |
| E | structured collection member | 15 | 14 | **13** |
| F | owned elsewhere | 11 | 11 | **11** |
| | **unbound** | **75** | **78** | **73** |

All five departures left by **gaining an owner**, none by being flattened into a field.

---

## 12. Updated denominator

```
182 raw destinations
→ 180 normalized
→  86 semantic facts
     13 with a safe proposal (8 canonical fields · 5 relationships)
     73 unbound → Slice 5's input
     14 collections covering 80 destinations
→  32 obligations (6 signatures, artifact-scoped and dated)
```

| section | facts | destinations | safe | collections |
|---|---:|---:|---:|---:|
| About your child | 7 | 15 | 3 | 0 |
| Family & contact | 7 | 16 | 3 | 0 |
| Emergency contacts | 1 | 13 | 1 | 1 |
| Health & medical | 15 | 15 | 6 | 0 |
| Immunization | 14 | 68 | 0 | 13 |
| Daily routines | 12 | 12 | 0 | 0 |
| Getting to know your child | 13 | 13 | 0 | 0 |
| Custody & legal | 4 | 4 | 0 | 0 |
| Tuition & payment | 6 | 6 | 0 | 0 |
| Review & sign | 6 | 6 | 0 | 0 |
| Org / system | 1 | 1 | 0 | 0 |
| **total** | **86** | **169** | **13** | **14** |

"Facts Alloy could already know for an existing family" is still not measurable from the packet — it
depends on tenant state, and asserting a number for it would be inventing one.

---

## 13. "Approved" — the narrowest meaning

**Approval means: the operator accepts this proposed semantic mapping into the Processing/Form draft.**

It does not publish, does not mutate canonical participant data, does not activate a BP requirement,
and does not create vocabulary. Enforced structurally: the decision store touches one table and two
metadata keys and matches none of `customer_members | persons | person_child_relationships |
field_definitions | form_definitions | business_process`. Accepting a relationship binding records the
ROLE, not a write to the relationship table.

---

## 14. Publication readiness

# NO.

Faithful representation is close but not reached. Exact blockers:

1. **73 of 86 facts have no owner an operator can accept.** Publishing would mean 73 form-only
   responses that never become record data — a form, not an Enrollment configuration.
2. **21 Director decisions are unanswered.** Safeguarding classification is among them, and the
   contact-restriction fact decides who may not collect a child.
3. **The child-profile surfaces are not manifest-derived**, so even the answered vocabulary cannot be
   added as one row.
4. **No TIME type exists**, so two settled facts cannot be typed correctly.
5. **`child_middle_name` has no durable storage**, so the composition works within a packet and
   nothing persists.
6. **Merged obligations lose their multi-artifact provenance at publish** — `RequirementRef` cannot
   express it.
7. **Conditional gates and collection constraints have no reader**, so a published form would not
   reproduce the packet's own conditionality.
8. **The operator flow is unproven in a browser** — the QA session needs a human sign-in (Slice 3).

Blockers 1 and 2 are the real ones; the rest are narrow and named.

---

## 15. Slice 5 recommendation

**Answer the 21 Director decisions, then do the manifest-derivation refactor — in that order, and
nothing else.**

The decisions are Kelly's and cost no engineering. The refactor is the primitive that makes every
answered decision cheap to implement, and it is the same move the relationship layer already proved:
one owner, every surface derived. Doing it first would mean implementing vocabulary twice.

Explicitly NOT Slice 5: conversation packaging, publication, Participant Runtime. The denominator is
86 facts and 32 obligations; it will move once more when the vocabulary lands, and packaging a
conversation against a denominator still in motion is the mistake this program has avoided four times.

---

## 16. Reproducing

```
cd docs/audits/active/real-enrollment-certification-v1
node slice-4-ledger-check.mjs           # 37 B facts, one complete row each
node slice-4-classification-check.mjs   # 73 unbound, one bucket each

cd web && PATH=$HOME/.nvm/versions/node/v22.21.1/bin:$PATH npx vitest run \
  tests/pos/packetReviewSafety.test.ts tests/pos/bindingSafety.test.ts \
  tests/fields/relationshipDefinitionSmellTest.test.ts
```
