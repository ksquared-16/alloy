# Admissions normalization — the imported document is evidence, not the interaction model

**Discovery only. Nothing was published, changed or driven.** Admissions **v11** (80 destinations,
59 required) is the source package. This is the Director review artifact for a proposed v12.

## The finding in one line

Of 80 destinations, **13 carry a canonical binding today**. The classification below says **11**
belong to canonical Alloy facts, **2** should be calculated and never asked, **1** should be supplied
by configuration, **27** are facts about named people, and **10 are already held by this platform for
owners that do not exist yet**.

## Primary semantic owner — one per destination

| | owner | n |
|---|---|---|
| A | CANONICAL_ALLOY_FACT | **11** |
| B | DERIVED_FACT | **2** |
| C | ORGANIZATION_OR_CONFIGURATION_FACT | **1** |
| D | PARTICIPANT_FORM_FACT | **20** |
| E | CONDITIONAL_PARTICIPANT_FACT | **16** |
| F | PARTY_FACT | **27** |
| G | DOCUMENT_EVIDENCE | 0 |
| H | ACKNOWLEDGMENT_OR_SIGNATURE | **1** |
| I | REDUNDANT_OR_SHOULD_NOT_BE_ASKED | **2** |
| | **total** | **80** |

Secondary traits, reported separately and not double-counted: 8 conditional destinations, 6 optional
narratives, 13 currently bound, **10 held for a missing owner**.

## The ten the platform has already decided it does not own

These are not my classification. `canonicalOwnershipHolds.ts` records them, with decisions:

**D-H5 — Health & Safety** (6): general health, complications at birth, allergies, serious illness,
bee/wasp sting, regular medications. The hold's own words: *"Enrollment must not create a second
list that would then disagree with it."* Today Enrollment collects all six as Form-only values,
which is the thing the hold exists to prevent.

**D-H3 — Consent** (4): the three *"Authorized adult allowed to pick my student up"* lines and the
comments about authorized adults. *"A signature on this form is evidence that it was granted, not
the grant itself."*

Deliberately NOT health, by the hold's own exception: special diet, physician, dentist.

## The six questions Kelly met

| question | today | proposed |
|---|---|---|
| **Gender** (field_5) | free text, absence/detail | **canonical child fact** — `customer_member.gender`, `select` from the **existing** `person_gender` option set declared in `customerMemberFieldRegistry` |
| **Student's first day** (field_4) | free text, bound to `enrollment.start_date` | **process-owned date** — reuse and confirm, never retype |
| **Age upon enrolling** (field_3) | participant types "2" | **derived, never asked** — the `age_from_date_of_birth` primitive already exists in the Form schema and in `lib/fields/derived/` |
| **Physical address** (field_12) | asked as the child's fact | **household/person address** — `persons.address_line1/city/state/postal_code`. The document heading put it under the child; the data owner is the person |
| **Mailing / secondary address** (field_13) | free text, optional | **guardian #2's address**, conditional on differing from the first; reuse existing address truth |
| **Material fee** (field_76) | participant text box | **organization/program configuration** — the amount is the school's, not the family's. **MISSING CONFIGURATION OWNER**: no fee configuration store was found |

## Derived destinations — 2

- **field_3** Student Age Upon Enrolling — inputs: `child_date_of_birth` + `enrollment.start_date`;
  owner: `lib/fields/derived/ageFromDateOfBirth.ts`; currently asked; should never be asked.
- **field_79** Date (beside the signature) — the execution date; `derived.kind = "execution_date"`
  already exists; currently asked; should never be asked.

## Configuration-supplied destinations — 1

- **field_76** Non-Refundable Annual Material Fee. **MISSING CONFIGURATION OWNER.** The amount
  belongs to the organization, programme or location. A participant typing it is the family
  asserting the school's own price.

## Document destination, canonical owner and participant subject are three different things

The clearest case is the address: it **prints** in the child's section, its **canonical owner** is
the person record, and its **participant subject** is the household. Being printed inside a child's
application is not a statement that the value belongs to the child.

## The 80-destination decision table

| field | source label | section | now | req | proposed owner | subject | interaction | destination | participant |
|---|---|---|---|---|---|---|---|---|---|
| field_1 | Student Name: | Contact Information | text | R | CANONICAL_ALLOY_FACT | child | text | customer_member.display_name | reuse + confirm |
| field_2 | Student Date of Birth: | Contact Information | text | R | CANONICAL_ALLOY_FACT | child | text | child.child_date_of_birth | reuse + confirm |
| field_3 | Student Age Upon Enrolling: | Contact Information | text | R | DERIVED_FACT | child | derived (age_from_date_of_birth) | DOB + first day | never asked |
| field_4 | Student's first day: | Contact Information | text | R | CANONICAL_ALLOY_FACT | child | date | enrollment.start_date | confirm, do not retype |
| field_5 | How would you describe your child's gender? | Contact Information | text | - | CANONICAL_ALLOY_FACT | child | select (person_gender) | customer_member.gender | confirm or choose |
| field_6 | Parent/Guardian #1 Name: | Contact Information | text | R | PARTY_FACT | guardian#1 | repeated person | person.name for guardian#1 | ask once per person |
| field_7 | Parent/Guardian #1 Phone Number: | Contact Information | text | R | PARTY_FACT | guardian#1 | person attribute | person.phone for guardian#1 | ask once per person |
| field_8 | Parent/Guardian #1 Email Address: | Contact Information | text | R | PARTY_FACT | guardian#1 | person attribute | person.email for guardian#1 | ask once per person |
| field_9 | Parent/Guardian #2 Name: | Contact Information | text | - | PARTY_FACT | guardian#2 | repeated person | person.name for guardian#2 | ask once per person |
| field_10 | Parent/Guardian #2 Phone Number: | Contact Information | text | R | PARTY_FACT | guardian#2 | person attribute | person.phone for guardian#2 | ask once per person |
| field_11 | Parent/Guardian #2 Email Address: | Contact Information | text | R | PARTY_FACT | guardian#2 | person attribute | person.email for guardian#2 | ask once per person |
| field_12 | Physical Address, City, State and Zip Code: | Contact Information | text | R | CANONICAL_ALLOY_FACT | child | address | person.address_line1/city/state/postal_code | reuse + confirm |
| field_13 | Mailing Address or Secondary Parent Address (i | Contact Information | text | - | CANONICAL_ALLOY_FACT | child | address, conditional | person.address_* of guardian #2 | ask only if different |
| field_14 | Parent/Guardian #1 Employer: | Contact Information | text | R | PARTY_FACT | guardian#1 | person attribute | person.employer for guardian#1 | ask once per person |
| field_15 | Parent/Guardian #1 Employer Address: | Contact Information | text | R | PARTY_FACT | guardian#1 | person attribute | person.employer_address for guardian#1 | ask once per person |
| field_16 | Parent/Guardian #2 Employer: | Contact Information | text | R | PARTY_FACT | guardian#2 | person attribute | person.employer for guardian#2 | ask once per person |
| field_17 | Parent/Guardian #2 Employer Address: | Contact Information | text | R | PARTY_FACT | guardian#2 | person attribute | person.employer_address for guardian#2 | ask once per person |
| field_18 | LOCAL Emergency Contact #1 Authorized adult al | Emergency Contact Info | text | R | PARTY_FACT | emergency_contact#1 | repeated person | consent record + party identity | ask; the authorization is a consent grant |
| field_19 | Emergency Contact #1 Relationship to Student: | Emergency Contact Info | text | R | PARTY_FACT | emergency_contact#1 | person attribute | person.relationship for emergency_contact#1 | ask once per person |
| field_20 | Emergency Contact #1 Phone Number: | Emergency Contact Info | text | R | PARTY_FACT | emergency_contact#1 | person attribute | person.phone for emergency_contact#1 | ask once per person |
| field_21 | Emergency Contact #1 Address: | Emergency Contact Info | text | R | PARTY_FACT | emergency_contact#1 | person attribute | person.address for emergency_contact#1 | ask once per person |
| field_22 | LOCAL Emergency Contact #2 Authorized adult al | Emergency Contact Info | text | R | PARTY_FACT | emergency_contact#2 | repeated person | consent record + party identity | ask; the authorization is a consent grant |
| field_23 | Emergency Contact #2 Relationship to Student: | Emergency Contact Info | text | R | PARTY_FACT | emergency_contact#2 | person attribute | person.relationship for emergency_contact#2 | ask once per person |
| field_24 | Emergency Contact #2 Phone Number: | Emergency Contact Info | text | R | PARTY_FACT | emergency_contact#2 | person attribute | person.phone for emergency_contact#2 | ask once per person |
| field_25 | Emergency Contact #2 Address: | Emergency Contact Info | text | R | PARTY_FACT | emergency_contact#2 | person attribute | person.address for emergency_contact#2 | ask once per person |
| field_26 | (Optional) LOCAL Emergency Contact #3 Authoriz | Emergency Contact Info | text | - | PARTY_FACT | emergency_contact#3 | repeated person | consent record + party identity | ask; the authorization is a consent grant |
| field_27 | Emergency Contact #3 Relationship to Student: | Emergency Contact Info | text | - | PARTY_FACT | emergency_contact#3 | person attribute | person.relationship for emergency_contact#3 | ask once per person |
| field_28 | Emergency Contact #3 Phone Number: | Emergency Contact Info | text | - | PARTY_FACT | emergency_contact#3 | person attribute | person.phone for emergency_contact#3 | ask once per person |
| field_29 | Emergency Contact #3 Address: | Emergency Contact Info | text | - | PARTY_FACT | emergency_contact#3 | person attribute | person.address for emergency_contact#3 | ask once per person |
| field_30 | Comments regarding authorized adults and emerg | Emergency Contact Info | long_text | - | PARTY_FACT | child | repeated person | consent record + party identity | ask; the authorization is a consent grant |
| field_31 | Are there any custody or visiting arrangements | Emergency Contact Info | boolean | R | CONDITIONAL_PARTICIPANT_FACT | child | Yes/No gate | Form-only | gate then detail |
| field_32 | If yes, please explain arrangements and custod | Emergency Contact Info | long_text | - | CONDITIONAL_PARTICIPANT_FACT | child | conditional detail | Form-only | gate then detail |
| field_33 | Is there anyone who has a legal restraining or | Emergency Contact Info | boolean | R | CONDITIONAL_PARTICIPANT_FACT | child | Yes/No gate | Form-only | gate then detail |
| field_34 | If yes, their relationship to your child: | Emergency Contact Info | text | - | CONDITIONAL_PARTICIPANT_FACT | child | conditional detail | Form-only | gate then detail |
| field_35 | Primary Physician Name: | Health Information and | text | R | PARTY_FACT | physician#1 | repeated person | person.name for physician#1 | ask once per person |
| field_36 | Primary Physician Phone Number: | Health Information and | text | R | PARTY_FACT | physician#1 | person attribute | person.phone for physician#1 | ask once per person |
| field_37 | Dentist Name, if applicable: | Health Information and | text | - | PARTY_FACT | dentist#1 | repeated person | person.name for dentist#1 | ask once per person |
| field_38 | Dentist Phone Number, if applicable: | Health Information and | text | - | PARTY_FACT | dentist#1 | person attribute | person.phone for dentist#1 | ask once per person |
| field_39 | Developmental History: | Health Information and | long_text | R | PARTICIPANT_FORM_FACT | child | long_text | Form-only | ask |
| field_40 | Has your student ever participated in speech,  | Health Information and | boolean | R | PARTICIPANT_FORM_FACT | child | Yes/No | Form-only | ask |
| field_41 | Does your student need any accommodations or h | Health Information and | boolean | R | PARTICIPANT_FORM_FACT | child | Yes/No | Form-only | ask |
| field_42 | General health: | Health Information and | long_text | R | CONDITIONAL_PARTICIPANT_FACT | child | optional absence/detail | health record, not an Enrollment field | ask, but do not make it canonical here |
| field_43 | Does your child have siblings? | Health Information and | boolean | R | CONDITIONAL_PARTICIPANT_FACT | child | Yes/No gate | Form-only | gate then detail |
| field_44 | If yes, please list siblings name(s) and age(s | Health Information and | long_text | - | CONDITIONAL_PARTICIPANT_FACT | child | conditional detail | Form-only | gate then detail |
| field_45 | Any known complications at birth: | Health Information and | long_text | - | CONDITIONAL_PARTICIPANT_FACT | child | optional absence/detail | health record, not an Enrollment field | ask, but do not make it canonical here |
| field_46 | Does your child have any allergies? If so, ple | Health Information and | long_text | - | CONDITIONAL_PARTICIPANT_FACT | child | optional absence/detail | health record, not an Enrollment field | ask, but do not make it canonical here |
| field_47 | Serious illness and/or hospitalizations: | Health Information and | long_text | - | CONDITIONAL_PARTICIPANT_FACT | child | optional absence/detail | health record, not an Enrollment field | ask, but do not make it canonical here |
| field_48 | Has your child ever been stung by a bee or was | Health Information and | boolean | R | CONDITIONAL_PARTICIPANT_FACT | child | optional absence/detail | health record, not an Enrollment field | ask, but do not make it canonical here |
| field_49 | Regular medications? | Health Information and | long_text | - | CONDITIONAL_PARTICIPANT_FACT | child | optional absence/detail | health record, not an Enrollment field | ask, but do not make it canonical here |
| field_50 | Eating habits: | Health Information and | long_text | R | CANONICAL_ALLOY_FACT | child | long_text | customer_member.eating_habits | reuse + confirm |
| field_51 | Special diet: | Health Information and | long_text | R | CANONICAL_ALLOY_FACT | child | long_text | customer_member.special_diet | reuse + confirm |
| field_52 | Favorite foods: | Health Information and | long_text | R | CANONICAL_ALLOY_FACT | child | long_text | customer_member.favorite_foods | reuse + confirm |
| field_53 | Foods refused: | Health Information and | long_text | R | CANONICAL_ALLOY_FACT | child | long_text | customer_member.foods_refused | reuse + confirm |
| field_54 | Toilet habits: | Health Information and | long_text | R | PARTICIPANT_FORM_FACT | child | long_text | Form-only | ask |
| field_55 | How does your child indicate their bathroom ne | Health Information and | long_text | R | PARTICIPANT_FORM_FACT | child | long_text | Form-only | ask |
| field_56 | Are they ever reluctant to use the bathroom? | Health Information and | boolean | R | PARTICIPANT_FORM_FACT | child | Yes/No | Form-only | ask |
| field_57 | Any specific toileting needs we need to be awa | Health Information and | long_text | - | CONDITIONAL_PARTICIPANT_FACT | child | absence/detail | Form-only | absence writes nothing |
| field_58 | Does your child become tired or nap during the | Health Information and | boolean | R | PARTICIPANT_FORM_FACT | child | Yes/No | Form-only | ask |
| field_59 | Any special naptime needs? | Health Information and | long_text | - | CONDITIONAL_PARTICIPANT_FACT | child | absence/detail | Form-only | absence writes nothing |
| field_60 | When does your child go to sleep at night? | Health Information and | text | R | PARTICIPANT_FORM_FACT | child | text | Form-only | ask |
| field_61 | When does your child wake up? | Health Information and | text | R | PARTICIPANT_FORM_FACT | child | text | Form-only | ask |
| field_62 | Social relationships: | Health Information and | long_text | R | PARTICIPANT_FORM_FACT | child | long_text | Form-only | ask |
| field_63 | Has your child been in a school or daycare bef | Health Information and | boolean | R | CONDITIONAL_PARTICIPANT_FACT | child | Yes/No gate | Form-only | gate then detail |
| field_64 | If yes, please list the name and location of t | Health Information and | long_text | - | CONDITIONAL_PARTICIPANT_FACT | child | conditional detail | Form-only | gate then detail |
| field_65 | Will your student be simultaneously enrolled i | Health Information and | boolean | R | PARTICIPANT_FORM_FACT | child | Yes/No | Form-only | ask |
| field_66 | How does your child react to strangers? | Health Information and | long_text | R | PARTICIPANT_FORM_FACT | child | long_text | Form-only | ask |
| field_67 | Is your child able to play alone? | Health Information and | boolean | R | PARTICIPANT_FORM_FACT | child | Yes/No | Form-only | ask |
| field_68 | What are your child's favorite toys or activit | Health Information and | long_text | R | PARTICIPANT_FORM_FACT | child | long_text | Form-only | ask |
| field_69 | Does your child have any fears? (dark, spiders | Health Information and | long_text | R | PARTICIPANT_FORM_FACT | child | long_text | Form-only | ask |
| field_70 | How is your child comforted? | Health Information and | long_text | R | PARTICIPANT_FORM_FACT | child | long_text | Form-only | ask |
| field_71 | How does your child express anger or frustrati | Health Information and | long_text | R | PARTICIPANT_FORM_FACT | child | long_text | Form-only | ask |
| field_72 | Do you use any kind of behavior management at  | Health Information and | boolean | R | PARTICIPANT_FORM_FACT | child | Yes/No | Form-only | ask |
| field_73 | How would you describe your child's personalit | Health Information and | long_text | R | CANONICAL_ALLOY_FACT | child | long_text | customer_member.temperament | reuse + confirm |
| field_74 | What would you like your child to gain from th | Health Information and | long_text | R | PARTICIPANT_FORM_FACT | child | long_text | Form-only | ask |
| field_75 | Is there anything else you would like us to kn | Health Information and | long_text | - | PARTICIPANT_FORM_FACT | child | long_text | Form-only | ask |
| field_76 | Non-Refundable Annual Material Fee 🛈 | Tuition & Enrollment A | text | R | ORGANIZATION_OR_CONFIGURATION_FACT | child | acknowledgment of a supplied amount | MISSING CONFIGURATION OWNER | supplied, not typed |
| field_77 | Parent Name: | Tuition & Enrollment A | text | R | REDUNDANT_OR_SHOULD_NOT_BE_ASKED | guardian#1 | - | guardian.guardian_name | already collapsed by ask-once |
| field_78 | Student Name: | Tuition & Enrollment A | text | R | REDUNDANT_OR_SHOULD_NOT_BE_ASKED | child | - | customer_member.display_name | already collapsed by ask-once |
| field_79 | Date: | Tuition & Enrollment A | text | R | DERIVED_FACT | child | derived (execution_date) | signature date | never asked |
| field_80 | By signing below, I agree to the Tuition and E | Tuition & Enrollment A | signature | R | ACKNOWLEDGMENT_OR_SIGNATURE | child | signature | artifact signature | sign |
## Forms Studio — can an administrator configure this today?

Measured against the builder at `adminV2/pos/ProcessingFormBuilder.tsx` and the schema at
`lib/forms/schema.ts`. This is the gap between what the platform can REPRESENT and what an
administrator can CHOOSE.

**CONFIGURABLE_TODAY — 10.** The builder offers short text, long text, text block, number, date,
dropdown with inline options, Yes/No, signature, file upload, and requiredness.

**SUPPORTED_BUT_NOT_EXPOSED — 6.** The schema has carried these since v1; the builder mentions none
of them, so an administrator cannot reach them:

| capability | schema | builder |
|---|---|---|
| conditional visibility (`visibility`) | yes | **0 mentions** |
| multi-select | yes | **0 mentions** |
| DB-backed vocabulary (`option_set_key`) — the one `person_gender` needs | yes | **0 mentions** |
| repeated person (`group` + `repeat` + `collection_binding`) | yes | **0 mentions** |
| canonical binding (`field_source`) | yes | only auto-applied from a stage-derived library, never chosen per field |
| derived values (`derived`) | yes | no authoring path |

**MISSING_PLATFORM_CAPABILITY — 3.**

1. **Address as an interaction type.** No `address` literal exists in the Form schema. The
   participant runtime decomposes an address for editing by reading a canonical key, which cannot
   help an unbound field like field_12.
2. **An organization/programme fee configuration owner.** None found.
3. **Optional absence/detail as an AUTHORED interaction.** It works, and it is certified — but it is
   an emergent consequence of `required: false` on a narrative field. An administrator cannot see it,
   name it, or choose it. Kelly's conceptual `Interaction [Yes/No] → If Yes [Ask another question]`
   has no representation in the editor.

**This is the heart of it.** Every normalization decision in the table above is one an administrator
should be able to make. Today most of them can only be made by publishing a schema through the API,
which is what this lane has been doing. Closing that gap is the product boundary Kelly named — not
an Enrollment feature.

## What this run deliberately did not do

No v12. No change to the 80 destinations, canonical mappings, requiredness, Participant Runtime, or
any participant specimen. No new configuration primitive. The Lennon QA journey was not touched.
