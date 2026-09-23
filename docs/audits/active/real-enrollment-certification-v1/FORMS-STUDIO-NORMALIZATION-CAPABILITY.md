# Forms Studio — what an administrator can now author, and what is still engineering-only

> ## CORRECTION — 2026-09-22: this document claimed HUMAN QA READY, and human QA failed
>
> An earlier revision of this file, and the run summary that accompanied it, reported the
> normalization inspector as certified and ready for human QA. An administrator then opened the
> product and could not complete the first step. **That classification was wrong, and the way it was
> reached was wrong.**
>
> What the certification actually proved, and what it did not:
>
> | claim as filed | what was measured | what was true |
> |---|---|---|
> | option-set vocabulary PASS | the control renders; a scripted `option_set_key` round-trips | the selector's OPTIONS were never read. `GET /api/admin/option-sets` answers `{ option_sets: […] }`; the builder read `data`, matched nothing, and offered an empty list on **every form in the product** |
> | canonical binding PASS | a scripted `field_source` round-trips | true, but picking `Gender` from the Alloy-field catalog produced a plain short-text box, because the catalog dropped the type and the vocabulary the organization had already declared |
> | conditional visibility PASS | control renders; schema round-trips | true and still true — re-measured in the mounted product on 2026-09-22 |
> | derived values PASS | control renders; schema round-trips | true and still true — re-measured in the mounted product on 2026-09-22 |
> | "UI → save → reload → schema → runtime PASS" | a fixture form driven through `POST /versions` | the **operator's own path** was never driven. Nothing typed a label, and so nothing discovered that a space could not be typed at all |
>
> **The method failure, stated plainly.** The round trip was driven through the API with a schema
> built in code. That proves the model and the persistence layer, which is worth proving — but it
> exercises none of the authoring surface, and a control's PRESENCE in the DOM was read as its
> being usable. Two defects lived in exactly the gap between those two things: a reducer that
> trimmed on every keystroke, and a response envelope that was read with the wrong key. Neither is
> visible to a test that never types and never opens a list.
>
> **The four states are kept apart below**, because collapsing them is what produced the false
> return. `MODEL IMPLEMENTED` is not `MOUNTED IN PRODUCT`; neither is `PRODUCT ROUND-TRIP CERTIFIED`;
> and none of the three is `HUMAN ACCEPTED`, which only Kelly can set.
>

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

---

# Capability status after the 2026-09-22 repair

Four states, never collapsed. `HUMAN ACCEPTED` is Kelly's to set and nobody else's.

| capability | MODEL IMPLEMENTED | MOUNTED IN PRODUCT | PRODUCT ROUND-TRIP CERTIFIED | HUMAN ACCEPTED |
|---|---|---|---|---|
| canonical binding (`field_source`) | yes | yes | yes — driven through the operator's own clicks | **PENDING** |
| option-set vocabulary | yes | yes | yes — selector now lists the org's vocabularies | **PENDING** |
| conditional visibility | yes | yes | yes | **PENDING** |
| derived value | yes | yes | yes | **PENDING** |
| canonical type fidelity on insert | yes | yes | yes — `Gender` inserts as a choice over `person_gender` | **PENDING** |
| child-grain person attributes in the picker | **no** | no | n/a | **FAIL — see below** |
| repeated person / structured address / configuration-supplied | no | no | n/a | n/a |

## What the repair changed, and why each is a mechanism rather than a patch

**1. The canonical type and vocabulary now survive the projection.**
`field_definitions` records `person.gender` as a `select` over `person_gender`.
`LifecycleFieldPaletteEntry` carried neither, so the Forms picker had nothing to reason from but the
spelling of the field key — and no rule matches "gender", so it fell to the default text box. The
palette entry now carries `canonical_field_type` and `canonical_option_set_key`, and the Forms
library prefers them over its own guess. **Every** canonical field benefits; nothing about Gender is
named anywhere.

**2. An unsupported type fails closed.**
A declared type with no Form answer control is offered as "Tracked on the record — cannot be
captured by a form" rather than silently downgraded. A text box that claims to write a typed
canonical field is a lie the administrator cannot see.

**3. Normalization moved from the keystroke to the commit.**
`updateField` trimmed the label on every change. A controlled input sends its whole value on every
keystroke, so "Does " arrived, came back "Does", and the space was erased before the next character
— **spaces were untypeable in every question label and every help-text box in the Studio**. The
editor now holds text verbatim; `normalizeFormSchemaForPersist` applies the trim and the "Untitled"
fallback once, in `saveDraft`, which is the single place a draft becomes bytes (publish routes
through it too). This was never a keyboard shortcut — `defaultPrevented` was `false` at both capture
and bubble phases in the mounted product.

**4. The vocabulary list is read from the envelope the route actually returns.**
`{ option_sets: [...] }`, not `data`. This one had no symptom an author would recognise: the fetch
succeeded, the parse succeeded, and the list was simply empty everywhere.

## The one defect NOT repaired, and why

**Gender appears under PARENT / GUARDIAN and there is no Child Gender.**

Measured cause: the picker infers grain from the entity a field is STORED on. `person` holds
guardians, so `person.gender` is filed correctly. The child's own person attributes live on
`customer_member` — which `LIFECYCLE_FIELD_ENTITY_TYPES` does not load — so **no child-grain Gender
is offered at all**, and the single Gender in the menu reads as though it were the child's.

So this is a COVERAGE gap wearing an owner bug's clothes. The mapping is now declared
(`customer_member → child`) so the grain is right the moment that entity is carried, and a test
holds it. Actually carrying it means adding `customer_member` to the lifecycle palette's entity
set — which changes what the Business Process requirements engine can require, on a surface this
slice's scope guard protects. That is a Business Process decision, not a Forms one, and it is left
for a run that is allowed to make it.

---

# Canonical field catalog audit — 2026-09-22

Every field the Add-question picker exposes, read from the live coverage payload in the mounted
product (not from source), classified against the Data Model's own `field_definitions`.

**Total exposed: 60.**

| classification | count | what it means |
|---|---|---|
| PASS | 52 | type, grain, binding and option source all agree with the record |
| UNSUPPORTED_IN_FORMS | 8 | declared type has no Form answer control, or a choice with no answers behind it — now offered as a labelled dead end |
| WRONG_TYPE | 0 | was ~every org choice field before this repair; all now carry the declared type |
| WRONG_OPTION_SOURCE | 0 | a vocabulary-backed field now arrives with its vocabulary |
| MISSING_BINDING | 0 | every offer carries an entity and a field key |
| WRONG_OWNER | 1 | `Allergies` is offered under Parent / Guardian while its registry id is `child_allergies` |
| AMBIGUOUS | 4 | `Location` and `Start date` each appear under two grains; `Vertical` appears under both Enrollment and Household |

## The 8 that now fail closed

`child/Location` · `child/Tuition plan` · `enrollment/Opportunity Status` · `enrollment/Status Group`
· `enrollment/Tour status` · `enrollment/Vertical` · `household/Primary Contact` ·
`household/Vertical`

Six of these are **reference** fields: declared `select`, but pointing at rows in another table
(`location_id`, `pipeline_stage_id`, `primary_contact_id`, `vertical_id`) rather than at a list of
answers. Before this repair they were offered as dropdowns **containing nothing** — a question a
family cannot answer and an administrator cannot repair from the builder. Two (`Tuition plan`,
`Tour status`) have declared types with no Form answer control at all.

None of the eight is newly broken. Each was already incapable of being captured by a form; the
change is that the picker now says so instead of inserting a control that lies about it.

## Still open, and owned elsewhere

- **`Allergies` under Parent / Guardian** — a curated-label overlay decision, not the palette
  projection this run repaired.
- **`Location` / `Start date` / `Vertical` across two grains** — one canonical field reachable from
  two subjects. Needs a rule for which grain owns the offer; that rule belongs with the lifecycle
  requirement catalog.
- **A record-picker Form primitive** — the honest answer for the six reference fields, and the
  reason they fail closed rather than being quietly dropped.

---

# Canonical child-profile coverage — 2026-09-22 (second slice)

## The three person-shaped things Forms consumes, and which is which

This is not a new doctrine. It is the existing one, written down where Forms can read it.

| record | what it holds | Forms grain | example |
|---|---|---|---|
| `person` | a **guardian**'s own attributes | Parent / Guardian | `person.gender` — the adult's gender |
| `customer_member` | the **child**'s durable profile | Child | `customer_member.gender` — the child's gender |
| enrollment / opportunity | the child's **participation** in a program, not the child | Enrollment | start date, desired schedule |

`person.gender` and `customer_member.gender` are **two canonical fields with two owners**, not one
field seen twice. Aliasing them would let a child's answer overwrite an adult's record. Both are
offered; each is named by the grain that owns it.

## Why `+ customer_member` was the wrong repair

`LIFECYCLE_FIELD_ENTITY_TYPES` is a module-private constant inside
`loadOrgFieldDefinitionsForLifecycle`, and that loader is read by:

- Business Process requirement authoring (`/api/admin/departments/{id}/lifecycle-requirements`)
- `buildLifecycleStageBootstrap` and `persistLifecycleStageFieldRules`
- Create Lead eligibility (`resolveCreateLeadEligibilityForInvocation`)
- the action intake spec route
- **`validatePublicSubmissionLifecycleRequirements`** — which decides whether a family's submission
  is accepted at runtime
- and the Forms coverage payload

Its entity vocabulary is `LifecycleRequirementEntityKey = person | child | opportunity | customer`,
and `lifecycleEntityFromFieldDefinitionEntityType` returns `null` for anything outside it. So that
constant does not own "every field Alloy has". **It owns the Business Process requirement
contract.** Widening the table read alone would have changed nothing; widening the contract would
have changed what five other surfaces require, including what a family is allowed to submit.

**Chosen seam (outcome B):** Forms projects the child profile itself — same `field_definitions`
table, a second reader with a different question. `lib/forms/childProfileFieldProjection.ts` derives
WHICH fields belong to the child profile from `CUSTOMER_MEMBER_CONFIG_FIELD_MANIFEST` (the
platform's own declaration) and WHAT each one is from the org's own rows. No hand-curated Forms
list; no field is named anywhere in it.

## Grain now follows the record the answer is written to

A palette rule carries the entity its RULE is written against; the registry entry it resolves to
carries the entity the field is STORED on. Those disagree for any child fact a guardian-facing rule
asks for — which is why `child_allergies`, declared `entity_type: "child"`, was reaching the picker
under Parent / Guardian. The registry's entity decides the grain now.

## Duplicate labels are named by owner

Where one label is claimed by two grains, each copy is prefixed with the operator word for the group
that owns it — `Child — Gender` / `Parent — Gender`. A label owned by one grain is left exactly as
the organization wrote it. Where one CONCEPT is claimed twice at the SAME grain, the established
registry-backed offer wins and the second is suppressed, rather than presenting two identical rows.

## Capability status

| capability | MODEL | MOUNTED PRODUCT | CANONICAL FIELD COVERAGE | PRODUCT ROUND TRIP | HUMAN ACCEPTANCE |
|---|---|---|---|---|---|
| canonical binding | yes | yes | yes | yes | **PENDING** |
| option-set vocabulary | yes | yes | yes | yes | **PENDING** |
| conditional visibility | yes | yes | n/a | yes | **PENDING** |
| derived value | yes | yes | n/a | yes | **PENDING** |
| child profile (`customer_member`) | yes | yes | yes | yes | **PENDING** |
| guardian profile (`person`) | yes | yes | yes | yes | **PENDING** |
| repeated person · structured address · configuration-supplied | no | no | no | n/a | n/a |

HUMAN ACCEPTANCE is Kelly's to set. Nothing in this run changes it.

---

# Repeated people / relationship collection — 2026-09-23

## What already existed, and what did not

Most of this primitive was already in the platform. The audit before any code changed:

| layer | state before this slice |
|---|---|
| `FormSchemaV1` `group` + `repeat {min,max}` + `collection_binding` | **existed** |
| payload `groups: Record<id, GroupRow[]>` with `instance_key` | **existed** — arrays, never `sibling_1_name` |
| `GroupRow.collection.origin: "existing" \| "respondent_added"` | **existed** |
| submission validation of group rows, nested groups, signatures | **existed** |
| engine renderer add / remove rows | **existed** — but labelled "Add item" |
| `payloadWithMinimumRepeatingGroups` | existed, and **pre-seeded blank rows** to satisfy `repeat.min` |
| a statement of WHAT an entry is | **absent** |
| Forms Studio authoring of any repeating group | **absent** |
| participant conversation runtime | **flattens groups** into loose questions |

So the gap was never the repetition. It was that a repeated entry had no meaning: nothing could say
a row was a sibling rather than a payer, so the only button a family could be shown was "Add item",
and the minimum was met by rendering the paper form's blank slots in HTML.

## The primitive

One optional block on the group the schema already had:

```
party_collection: {
  action_key          // add_emergency_contact | add_child | add_parent_guardian | …
  subject             // person | child
  role?               // emergency_contact, guardian, …
  scope?              // this_child | all_children_in_household | household | …
  show_known          // confirm what Alloy knows instead of asking again
  allow_add           // may the family add someone new
  add_another_label?  // the words on the button
  entry_label?
}
```

Every value is the platform's own relationship vocabulary — `RELATIONSHIP_ACTION_KEYS` and
`RelationshipActionScope`, verbatim. **A test fails if Forms ever grows a second list.** Forms states
the intent; `lib/admin/relationship/` still performs every write.

## Canonical mutation timing

Clicking `+ Add emergency contact` creates nothing. It cannot: the participant path — the renderer,
the payload helpers, the party module — contains **no canonical writer at all**, and a test asserts
that. The measured chain is:

```
participant adds a row        → draft state, stable instance_key, no ids resolved
submission                    → adaptSourceToRelatedRecordProposals  (read-only)
                              → adaptFormSubmissionToRelatedRecordProposals
operator reviews in Processing
commit                        → POST …/related-record-proposals/{id}/commit
                              → executeRelationshipProposalCommit
                              → command runtime → relationshipExecutionAdapter
                              → executeRelationshipAction   ← the only writer
```

`executeRelationshipProposalCommit` carries an `idempotency_key` and an `already_applied` outcome, so
a replayed commit does not create a second person.

## A form cannot delete a person

A row whose `collection.origin` is `existing` is never offered a Remove control. Taking a known
emergency contact off a form is the family saying they do not belong on **this paperwork** — it is
not an instruction to delete them from the record, and a form that treated it as one would quietly
destroy canonical data. The minimum still applies to rows the family owns.
