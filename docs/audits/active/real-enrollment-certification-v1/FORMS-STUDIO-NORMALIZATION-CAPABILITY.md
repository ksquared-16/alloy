# Forms Studio — what an administrator can now author, and what is still engineering-only

The benchmark: *an administrator imports paperwork, reviews what Alloy inferred, and turns that
imported structure into the normalized business model without engineering intervention.*

This run moved three capabilities from "the schema can represent it, only a script can author it"
to "the builder model can author it", exposed a fourth that was merely missing from a menu, and
established owners for two of the three genuinely missing capabilities.

## Where each capability actually stood

The earlier audit said six capabilities were "supported but not exposed". Re-measured against the
BUILDER MODEL (`lib/forms/formBuilderSchema.ts`) rather than only the schema, the picture is sharper
— two of the six were already expressible and four were not:

| capability | schema | builder model before | gap |
|---|---|---|---|
| canonical binding | yes | **yes** (`field_source` on the spec) | UI only — auto-applied from a stage library, never chosen per field |
| multi-select | yes | **yes** (in the type union) | UI only — absent from the question menu |
| option set (`option_set_key`) | yes | no | model **+** UI |
| conditional visibility | yes | no | model **+** UI |
| derived values | yes | no | model **+** UI |
| repeated person (`group`/`repeat`/`collection_binding`) | yes | no | model **+** UI — the heaviest, untouched |

## What this run implemented

**The builder model can now author** an organization vocabulary, a condition, and a derived value —
each proven to produce the exact shape the runtime already consumes, because a builder that writes
something the runtime does not read is worse than no builder.

- **Option sets.** A question binds to `person_gender` instead of copying the choices. A field can
  never hold both a vocabulary and a private list: choosing one clears the other, because a field
  with both has no single answer to "where do the choices come from".
- **Conditional visibility.** Authored as the schema's own `visibility`, and asserted against the
  platform's own `evaluateFieldVisibility` — no second conditional engine. Clearing the condition
  uses presence-in-patch as the signal, the same trap `field_source` already fell into once.
- **Derived values.** `age_from_date_of_birth` with its source and as-of fields, and
  `execution_date`. The participant is never asked for the result.
- **Multi-select** appears in the question menu. It was in the builder's own type union and in the
  schema the whole time; only the menu omitted it.

7 tests, each verified against a planted defect.

**Still engineering-only:** the inspector UI for all of the above, and repeated person entirely.
The model is the harder half and it is done; the surfaces are not.

## The three "missing" capabilities

### Structured address — OWNER EXISTS, FORM PRIMITIVE MISSING

The address is a **person structure**, not a single string and not a child fact:

```
persons.address_line1 · city · state · postal_code · address_source
```

`childcareLayoutFieldCatalog` already projects it per ROLE — `person.primary_address_line1`,
`person.secondary_address_*`, `person.emergency_address_*` — which is the answer to "who does the
address belong to": the person in that role, not the child whose application it prints on.

**Form capability: MISSING.** There is no `address` literal in `FormSchemaV1`. The participant
runtime decomposes an address for editing by reading a canonical key, which cannot help an unbound
text box like Admissions `field_12`. The smallest correct model is a field type whose value is the
four person address components, bound to a person role — not a new address store.

### Explicit absence / detail — BEHAVIOUR EXISTS, AUTHORING SEMANTICS ARE ACCIDENTAL

Certified and good: `[ No known allergies ] [ Yes — I'll tell you ]`, one narrative destination,
absence recorded through the decline owner without manufacturing "None".

But it is an emergent consequence of `required: false` on a narrative field. An administrator cannot
see it, name it or choose it.

**Proposed smallest model: interaction metadata on the field, not a new primitive and not a second
destination.** Something of the shape `absence: { offered: true, label?: string }`, which
`optionalSkipLabel` already approximates by inspecting the label for the word "allerg". That
inspection is the tell: the behaviour wants a declared property and is currently guessing at one.
It extends the existing optional/decline model rather than competing with it, and the Form keeps its
single narrative destination.

### Configuration-supplied value — OWNER FOUND, BRIDGE MISSING

**MATERIAL FEE OWNER: Financials → charge templates.** Not missing, and not Forms'.
`chargeTemplateTypes` / `chargeTemplateAuthoringService` own a template with `templateKey`, `label`,
`chargeCategory: "fee"`, `amountStrategy: "fixed"` and `amountCents`. The demo dataset carries
exactly this shape: `registration_fee` · "Registration Fee" · fee · fixed · 15000.

**What is missing is the bridge**, not the owner: a Form destination that declares *"this value is
supplied by charge template X at generation time"*. The Form must not hold the amount — a
participant typing it is a family asserting the school's own price, and a constant in Forms would be
a second price that drifts from the one being billed.

## The ten held destinations

Six Health & Safety, four Consent. Their status is **TEMPORARILY_FORM_ONLY_PENDING_CANONICAL_OWNER**
— Enrollment may collect them to complete enrollment, they remain packet evidence, and they must not
become Enrollment canonical truth or be labelled as intentionally permanent Form-only facts. Forms
Studio needs to say that in product language, not as "D-H5". **Not yet implemented.**


---

# Capability states — 21 September 2026

Four states, deliberately kept apart. An earlier version of this document collapsed them, which is
how "supported but not exposed" came to describe both a capability needing a menu entry and one
needing a model.

| capability | model | admin UI | product round-trip | note |
|---|---|---|---|---|
| canonical binding | **complete** | **complete** | **certified** | The UI already existed — *Store answer in → Record / Field* — and my earlier report was wrong to say it was only auto-applied from a stage library |
| conditional visibility | **complete** | **complete** | **certified** | *When to ask → Always / Only if — …* |
| option-set vocabulary | **complete** | **complete** | **certified** | *Answers come from → This form's own list / an organization vocabulary* |
| derived values | **complete** | **complete** | **certified** | *Who provides the answer → The family answers it / Alloy calculates it* |
| multiselect | **complete** | **complete** | certified by schema | in the question menu |
| repeated person | missing | missing | — | not started |
| structured address | missing | missing | — | owner exists (person, per role); Form field type missing |
| pending-canonical-owner status | n/a | missing | — | the ten held destinations have no product surface |
| explicit absence/detail | missing | missing | — | proposed shape: `absence: { offered, label? }` |
| configuration-supplied value | missing | missing | — | owner exists (Financials charge templates); bridge missing |

**"Certified" here means** the configuration was authored, saved through the real product versioning
path, reloaded from the product, and read back intact — on a throwaway fixture Form, since certifying
on Admissions or a participant packet would be using live paperwork as disposable test state.

Read back from the product after save and reload:

```
gender        option_set_key "person_gender" · static_options absent · bound customer_member.gender
first day     date · bound enrollment.start_date
age           derived age_from_date_of_birth · source dob · as of first_day
sibling list  visibility all[ siblings eq true ]
```

And after editing each one back and re-saving, **none of the previous configuration survived**:
vocabulary gone and the inline list restored, binding gone, derivation gone, condition gone. A
configuration that lingers after an administrator removes it is worse than one that never saved.

It does **not** yet mean a human has clicked through the Studio. That is the next step; the
walkthrough is in the run summary.

## What the inspector now asks

```
Store answer in          Record: Child / Parent / Enrollment / Household / Form field only
                         Field:  <from the stage-derived library>

Answers come from        This form's own list  |  <the organization's vocabularies>

When to ask              Always  |  Only if — <another question>  …is answered <value>

Who provides the answer  The family answers it  |  Alloy calculates it — <derivation>
                         Date of birth: <a date question>   Age as of: <a date question>
```

No raw JSON, no `option_set_key`, no `field_source` in the primary path — the existing
*Technical reference* disclosure still shows the underlying keys for anyone who wants them.
