# Admissions Information — canonical ownership audit

**Form** `admissions_information` (`7d80ff71-2ae4-43f6-bd4d-0b8022e28f7d`), published version 4.
**80 destinations, 65 required, 4 canonically bound.**

This is the audit that decides which of those 80 questions Alloy has a legitimate right to own. It
was produced from the registries themselves — not from label similarity — and every classification
names the owner it consulted.

## Why the count is the wrong target

A high binding percentage is easy and wrong. Every binding is a claim that some Alloy record is the
authority for a fact, and a wrong claim is worse than no claim: it prints one person's answer in
another person's box, or it puts health truth in a profile text field where the Health domain cannot
govern it. The target is **every binding has a legitimate owner**, and the honest result here is
that most of this packet does not have one.

## The registries this audit consulted

| Question | Owner consulted |
|---|---|
| Is there a destination at all? | `field_definitions` for the org (person 27, customer_member 12, inquiry_child 7, opportunity 39, customer 12) plus `OPERATIONAL_FORM_SYSTEM_FIELDS` |
| Can a participant answer be written back? | `resolveMutationCapability` — only `customer_member` (native + config) and `person_child_relationship` are writable today |
| Will a bound fact prefill the conversation? | `resolveParticipantCanonicalContext` — reads `customer_members` native columns + metadata, `customers.metadata`, and the primary household `persons` row. It does **not** read `field_values` |
| Which child-profile facts may Enrollment own? | `CUSTOMER_MEMBER_CONFIG_FIELD_MANIFEST`, whose `match_terms` were authored against this packet |
| Which facts belong to Health? | D-H5, restated in that manifest: allergy, condition, medication and immunization are Health foundation kinds and Enrollment must not create a competing destination |
| Who is a question about? | `artifactPartySlots` — role + ordinal, from the relationship definitions |

## Classification

```
A  existing canonical owner, safe to bind                      13   (4 already bound + 9 proposed)
B  owner exists but subject/party/shape ambiguity blocks it    32
C  owner belongs to another domain, not bindable from here     11
D  legal / agreement-specific truth                             3
E  no canonical owner                                          21
                                                               ──
                                                               80
```

### What each class means here, and every reason used


**A**

- already bound (pre-existing). enrollment.start_date has no read and no writable capability; recorded as an existing gap, not changed by this slice.
- already bound. customer_member.dob; read for prefill and writable.
- already bound. guardian_email; read for prefill.
- already bound. guardian_phone; read for prefill.
- customer_member.display_name, aliased child_full_name. The child's FULL name to a full-name column, never to first_name. Both boxes are the same child on the same packet, so ask-once fills both.
- customer_member.eating_habits. One question, one destination, writable.
- customer_member.favorite_foods.
- customer_member.foods_refused.
- customer_member.special_diet. Named in the Slice 5 list the Health & Safety contract cleared for Enrollment to bind at child grain; it is a diet, and never stands in for an allergy.
- customer_member.temperament. The one durable profile fact among the nine getting-to-know-your-child questions; the other eight stay Director decisions.
- guardian.guardian_name, the primary adult's full name (persons.full_name). Read for prefill; person is not yet writable, which the return path reports as a visible diagnostic. Both boxes are Guardian #1.

**B**

- one composite box against five separate person address fields (line1, line2, city, state, postal_code). Binding it would collapse an address.
- owner is customer_member.gender, a closed option set (person_gender). The authored control is free text, so the answers would not be writable to it.
- owner is person_child_relationship.custody_notes, which is relationship-owned. The return path refuses a relationship-owned scalar by design, and this artifact has no relationship group.
- second guardian. The registry has ONE guardian destination; binding it here would put two people on one datum.
- the owner is the relationship model (role + ordinal). This artifact numbers the people as flat boxes, so there is no per-party scalar destination to bind.
- the packet asks four distinct questions and the owner (customer_member.toileting_routine) models ONE routine. Binding all would print one answer into every box; binding one would silently drop the rest.
- the packet asks two distinct questions and the owner (customer_member.nap_routine) models ONE routine. Binding all would print one answer into every box; binding one would silently drop the rest.

**C**

- Health owns this kind (D-H5). Form-only until Forms can bind a Health fact.
- owner is person.employer; person is neither a writable mutation entity nor read for participant prefill.

**D**

- agreement-specific truth. Belongs to the signed artifact.

**E**

- no canonical owner. Form-only by design.

## Two facts that decide most of this table

**A destination is not the same as a working destination.** Guardian email and phone are already
bound and they PREFILL, because the participant read includes the primary household adult. The
child-profile fields (`eating_habits`, `special_diet`, `favorite_foods`, `foods_refused`,
`temperament`) are writable but do **not** prefill, because FC-CM-1 config values live in
`field_values` and the participant canonical read does not look there. Binding them is still right —
the answer becomes durable child-profile truth instead of form text — but it reframes the work
rather than reducing it. Extending `resolveParticipantCanonicalContext` to read `field_values` for
`customer_member` config keys is the named seam, and it is not built here.

**The people on this packet are flat boxes, not a repeatable group.** "Parent/Guardian #2",
"Emergency Contact #1-#3", the Physician and the Dentist each have a real canonical owner — the
relationship model — and it addresses them by role AND instance. A scalar `field_source` cannot say
which instance it means, which is exactly why the return path refuses a relationship-owned scalar.
Twenty-three of the thirty-two B rows are that one fact. Making them bindable means projecting those
numbered boxes into a collection-bound group, which restructures the imported artifact and is a
different slice.

## Preflight, before anything was authored

```
BOUND TOTAL                     13
child_full_name              ->  field_1, field_78        (both the child)
guardian_name                ->  field_6, field_77        (both Guardian #1)
DESTINATION COLLISIONS           0
MULTI-PERSON COLLISIONS          0
SUPPRESSED BY BROADCAST GUARD    none — no question leaves the conversation
HEALTH OWNERSHIP VIOLATIONS      0
DEPRECATED DESTINATIONS USED     0   (allergy_notes, medication_flag untouched)
FULL-NAME -> SCALAR-NAME         none — display_name and guardian_name are full-name columns
ADDRESS COLLAPSE                 none — no address bound
```

Both new shared keys are already named by the D-100 confirmation policy, so a family whose record
holds them meets them as "is this still right?" rather than as a blank question.

## The 80 questions


### Contact Information

| Field | Question | Subject | Req | Current | Proposed | Class |
|---|---|---|---|---|---|---|
| `field_1` | Student Name: | the child | req | — | `customer_member.display_name` (`child_full_name`) | **A** |
| `field_2` | Student Date of Birth: | the child | req | `child:child_date_of_birth` | unchanged | **A** |
| `field_3` | Student Age Upon Enrolling: | the child | req | — | — | **E** |
| `field_4` | Student's first day: | the child | req | `enrollment:start_date` | unchanged | **A** |
| `field_5` | How would you describe your child's gender? | the child | opt | — | — | **B** |
| `field_6` | Parent/Guardian #1 Name: | guardian #1 | req | — | `guardian.guardian_name` (`guardian_name`) | **A** |
| `field_7` | Parent/Guardian #1 Phone Number: | guardian #1 | req | `guardian:guardian_phone` | unchanged | **A** |
| `field_8` | Parent/Guardian #1 Email Address: | guardian #1 | req | `guardian:guardian_email` | unchanged | **A** |
| `field_9` | Parent/Guardian #2 Name: | guardian #2 | opt | — | — | **B** |
| `field_10` | Parent/Guardian #2 Phone Number: | guardian #2 | req | — | — | **B** |
| `field_11` | Parent/Guardian #2 Email Address: | guardian #2 | req | — | — | **B** |
| `field_12` | Physical Address, City, State and Zip Code: | the child | req | — | — | **B** |
| `field_13` | Mailing Address or Secondary Parent Address (if applicable): | the child | opt | — | — | **B** |
| `field_14` | Parent/Guardian #1 Employer: | guardian #1 | req | — | — | **C** |
| `field_15` | Parent/Guardian #1 Employer Address: | guardian #1 | req | — | — | **C** |
| `field_16` | Parent/Guardian #2 Employer: | guardian #2 | req | — | — | **B** |
| `field_17` | Parent/Guardian #2 Employer Address: | guardian #2 | req | — | — | **B** |

### Emergency Contact Information & Authorized Adults

| Field | Question | Subject | Req | Current | Proposed | Class |
|---|---|---|---|---|---|---|
| `field_18` | LOCAL Emergency Contact #1 Authorized adult allowed to pick my student up in c | emergency_contact #1 | req | — | — | **B** |
| `field_19` | Emergency Contact #1 Relationship to Student: | emergency_contact #1 | req | — | — | **B** |
| `field_20` | Emergency Contact #1 Phone Number: | emergency_contact #1 | req | — | — | **B** |
| `field_21` | Emergency Contact #1 Address: | emergency_contact #1 | req | — | — | **B** |
| `field_22` | LOCAL Emergency Contact #2 Authorized adult allowed to pick my student up in c | emergency_contact #2 | req | — | — | **B** |
| `field_23` | Emergency Contact #2 Relationship to Student: | emergency_contact #2 | req | — | — | **B** |
| `field_24` | Emergency Contact #2 Phone Number: | emergency_contact #2 | req | — | — | **B** |
| `field_25` | Emergency Contact #2 Address: | emergency_contact #2 | req | — | — | **B** |
| `field_26` | (Optional) LOCAL Emergency Contact #3 Authorized adult allowed to pick my stud | emergency_contact #3 | opt | — | — | **B** |
| `field_27` | Emergency Contact #3 Relationship to Student: | emergency_contact #3 | opt | — | — | **B** |
| `field_28` | Emergency Contact #3 Phone Number: | emergency_contact #3 | opt | — | — | **B** |
| `field_29` | Emergency Contact #3 Address: | emergency_contact #3 | opt | — | — | **B** |
| `field_30` | Comments regarding authorized adults and emergency contacts: | the child | opt | — | — | **E** |
| `field_31` | Are there any custody or visiting arrangements we need to be aware of? | the child | req | — | — | **B** |
| `field_32` | If yes, please explain arrangements and custody: | the child | opt | — | — | **B** |
| `field_33` | Is there anyone who has a legal restraining order prohibiting or limiting cont | the child | req | — | — | **E** |
| `field_34` | If yes, their relationship to your child: | the child | opt | — | — | **E** |

### Health Information and Developmental History

| Field | Question | Subject | Req | Current | Proposed | Class |
|---|---|---|---|---|---|---|
| `field_35` | Primary Physician Name: | physician #1 | req | — | — | **B** |
| `field_36` | Primary Physician Phone Number: | physician #1 | req | — | — | **B** |
| `field_37` | Dentist Name, if applicable: | dentist #1 | opt | — | — | **B** |
| `field_38` | Dentist Phone Number, if applicable: | dentist #1 | opt | — | — | **B** |
| `field_39` | Developmental History: | the child | req | — | — | **C** |
| `field_40` | Has your student ever participated in speech, behavioral, play or occupational | the child | req | — | — | **C** |
| `field_41` | Does your student need any accommodations or have any special needs? | the child | req | — | — | **C** |
| `field_42` | General health: | the child | req | — | — | **C** |
| `field_43` | Does your child have siblings? | the child | req | — | — | **E** |
| `field_44` | If yes, please list siblings name(s) and age(s): | the child | opt | — | — | **E** |
| `field_45` | Any known complications at birth: | the child | req | — | — | **C** |
| `field_46` | Does your child have any allergies? If so, please list. | the child | req | — | — | **C** |
| `field_47` | Serious illness and/or hospitalizations: | the child | req | — | — | **C** |
| `field_48` | Has your child ever been stung by a bee or wasp? | the child | req | — | — | **C** |
| `field_49` | Regular medications? | the child | req | — | — | **C** |
| `field_50` | Eating habits: | the child | req | — | `customer_member.eating_habits` | **A** |
| `field_51` | Special diet: | the child | req | — | `customer_member.special_diet` | **A** |
| `field_52` | Favorite foods: | the child | req | — | `customer_member.favorite_foods` | **A** |
| `field_53` | Foods refused: | the child | req | — | `customer_member.foods_refused` | **A** |
| `field_54` | Toilet habits: | the child | req | — | — | **B** |
| `field_55` | How does your child indicate their bathroom needs? | the child | req | — | — | **B** |
| `field_56` | Are they ever reluctant to use the bathroom? | the child | req | — | — | **B** |
| `field_57` | Any specific toileting needs we need to be aware of? | the child | req | — | — | **B** |
| `field_58` | Does your child become tired or nap during the day? | the child | req | — | — | **B** |
| `field_59` | Any special naptime needs? | the child | req | — | — | **B** |
| `field_60` | When does your child go to sleep at night? | the child | req | — | — | **E** |
| `field_61` | When does your child wake up? | the child | req | — | — | **E** |
| `field_62` | Social relationships: | the child | req | — | — | **E** |
| `field_63` | Has your child been in a school or daycare before? | the child | req | — | — | **E** |
| `field_64` | If yes, please list the name and location of the program: | the child | opt | — | — | **E** |
| `field_65` | Will your student be simultaneously enrolled in an additional program, school, | the child | req | — | — | **E** |
| `field_66` | How does your child react to strangers? | the child | req | — | — | **E** |
| `field_67` | Is your child able to play alone? | the child | req | — | — | **E** |
| `field_68` | What are your child's favorite toys or activities? | the child | req | — | — | **E** |
| `field_69` | Does your child have any fears? (dark, spiders, etc.) | the child | req | — | — | **E** |
| `field_70` | How is your child comforted? | the child | req | — | — | **E** |
| `field_71` | How does your child express anger or frustration? | the child | req | — | — | **E** |
| `field_72` | Do you use any kind of behavior management at home? | the child | req | — | — | **E** |
| `field_73` | How would you describe your child's personality? | the child | req | — | `customer_member.temperament` | **A** |
| `field_74` | What would you like your child to gain from their School of Enrichment experie | the child | req | — | — | **E** |
| `field_75` | Is there anything else you would like us to know about your child? | the child | opt | — | — | **E** |

### Tuition & Enrollment Agreement

| Field | Question | Subject | Req | Current | Proposed | Class |
|---|---|---|---|---|---|---|
| `field_76` | Non-Refundable Annual Material Fee 🛈 | the child | req | — | — | **D** |
| `field_77` | Parent Name: | guardian #1 | req | — | `guardian.guardian_name` (`guardian_name`) | **A** |
| `field_78` | Student Name: | the child | req | — | `customer_member.display_name` (`child_full_name`) | **A** |
| `field_79` | Date: | the child | req | — | — | **D** |
| `field_80` | By signing below, I agree to the Tuition and Enrollment Agreement. Signing her | the child | req | — | — | **D** |
