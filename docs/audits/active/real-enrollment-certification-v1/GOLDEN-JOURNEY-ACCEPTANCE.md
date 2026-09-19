# The golden enrolment journey — acceptance specification

**This document is the specification. The source code is not.**

It describes what one family meets when they enrol one child, using the real published package
**Enrollment Paperwork 2026–2027** (Admissions Information **v8**, 80 questions, 65 required). It is
written to be read without opening a single file, and the runtime is measured against it — not the
other way round.

## The principle this exists to enforce

```
The Form owns WHAT information and evidence are required.
The Participant Runtime owns HOW a human is guided through providing it.
AI helps interpret what a person says.
AI does not invent the information architecture.
```

"Walk the fields in order and ask each one" is not a journey. It is a form read aloud.

## What the packet actually contains, measured

Every number below is counted from the published v8 schema, not estimated.

| | |
|---|---|
| Questions | 80 (65 required, 15 optional) |
| Subjects | 8 — the child, Guardian #1, Guardian #2, three emergency contacts, a physician, a dentist |
| Questions about the child | 53 |
| Questions about a named other person | 27 |
| **Semantically yes/no** | **15** (14 plain, 1 carrying its own follow-up) |
| **Conditional pairs** ("If yes, …") | **4** |
| Canonically bound | 13 |
| Interaction types the schema declares | **1** — everything is `text`, plus one signature |

That last row is the defect this specification exists to correct. The paperwork asks fifteen yes/no
questions and the runtime offers a text box for every one of them.

## The chapters

Not a wizard. The surface stays conversational — one meaningful question or decision at a time — and
chapters exist to orient the family and to group what belongs together.

### 0 · Opening — what Alloy already has

**Alloy knows** whatever the household record holds that this packet binds: at most the child's full
name, date of birth and desired start date, and the primary adult's name, email and phone.

**The family sees** a greeting naming the child, and a summary **grouped by person**, never a list of
rows:

```
Here's what we already have

  Toureeb              Name · Birthday
  Parent/Guardian      Name · Email · Phone
  Household            Address
  Emergency contacts   2 contacts

  Review details →
```

**Alloy asks** nothing yet.

**Conditional** — when Alloy holds nothing, the claim is not made at all and the opening says so.

**Retained** — nothing. This is presentation of existing truth.
**Canonical** — nothing. **Form-only** — nothing.

> **Acceptance:** the default summary is at most one line per subject. A "Show 35 more" control is a
> failure of this chapter, not a feature of it.

### 1 · About the child

**Alloy knows** the child's name and date of birth when the record holds them.
**The family sees** those facts offered for confirmation, not as empty boxes.
**Alloy asks** age at enrolment, gender, first day, and the home and mailing addresses.
**Retained** — all of it. **Canonical** — full name, date of birth. **Form-only** — the rest.

### 2 · Parent / Guardian #1

**Alloy knows** this adult's name, email and phone when the household record holds them.
**Alloy asks** employer and employer address, and confirms the rest.
**Canonical** — name, email, phone (read only; the person record is not yet writable from here).

### 3 · Parent / Guardian #2

**Alloy knows** nothing — a second guardian has no canonical destination in this packet.
**Alloy asks** name, phone, email, employer, employer address.
**Form-only** — all five. Answers must never land on Guardian #1.

### 4 · Emergency contacts and authorised adults

Three numbered people, each with an authorisation line, a relationship, a phone and an address.

**Alloy asks**, per person, and then asks whether there is another:

```
Add another emergency contact?          [ Yes ]  [ No, continue ]
```

**Conditional** — declining moves the conversation on; it does not leave blanks behind.
**Form-only** — all twelve destinations. The relationship model owns these people, but this artifact
numbers them as flat boxes, so nothing is written canonically.

### 5 · Physician and dentist

Two more named people, two fields each. Same rules as chapter 4.

### 6 · Health and developmental history

The largest chapter — 37 questions about the child — and the one that most needs interaction
semantics rather than a wall of text boxes.

**Alloy asks**, in the school's own words. Of these, **fourteen are yes/no**, and four of them open a
follow-up only when the answer is yes:

| Question | Then |
|---|---|
| Does your child have siblings? | **Yes** → list names and ages |
| Has your child been in a school or daycare before? | **Yes** → name and location of the programme |
| Are there any custody or visiting arrangements we need to be aware of? | **Yes** → explain |
| Is there anyone with a legal restraining order limiting contact with your child? | **Yes** → their relationship to the child |

**Conditional** — answering **No** must not ask the follow-up at all. Not disabled, not skipped past:
not asked.

**Canonical** — eating habits, special diet, favourite foods, foods refused, temperament.
**Deferred to Health** — allergies, medications, conditions, immunisation. Asked, retained as Form
truth, and never written into a child-profile text field (D-H5).

### 7 · Review, Handbook, Immunisation, completion

Out of scope for this specification until chapters 0–6 are accepted.

## What "acceptable" means for the whole journey

1. A yes/no question offers **Yes** and **No**, not a text box.
2. A follow-up to a **No** is never asked.
3. What Alloy already has is grouped **by person**, and fits on a screen.
4. What the family has told us is grouped the same way, and every answer stays correctable.
5. "What you told us" contains **only** what this family supplied or confirmed in this sitting.
6. No engineering value — `QA probe answer`, `Not applicable` — is ever visible in an experience put
   in front of a human for judgement.
7. One question or decision at a time, with the chapter named so the family knows where they are.

## Where the semantics were lost, exactly

`suggestType()` in `lib/pos/processingCase/structure/detectDocumentStructure.ts`.

It classifies an extracted line by keyword — dates, amounts, signatures, uploads, the words "check"
or "agree" — and has **no rule for an interrogative**. A document that prints Yes/No boxes is caught
by a different path (`extractYesNoQuestion`, `isYesNoPair`); a question LIST, which is what a Formsite
export is, is not. So every one of these fifteen questions was drafted as `text`, and everything
downstream carried that faithfully: `buildFormDraftFromStructure` and `draftFormToFormSchemaV1` both
publish `boolean` correctly when they are told, and nobody told them.

The repair is a language-level rule, not a list of labels: a question opening with an auxiliary verb
— *has, have, does, do, did, is, are, was, were, can, could, will, would, should* — is closed. One
opening with *how, what, when, where, which, who, why* is open. The participant runtime already draws
exactly this distinction to decide whether a label may be asked as written; the importer simply never
did. That rule is now in the text detector, with proof.

**Two honest caveats, because the measurement said so rather than the other way round.**

*The published packet is not repaired by that rule.* Admissions v8 exists already, with 79 `text`
fields; an importer fix changes what the NEXT document produces, not what this one published. Making
the live packet match this specification means authoring the fifteen interactions onto the form and
publishing v9 — the same product path the canonical-binding slice used to publish v8 — and then
teaching the participant runtime to render a `boolean` field as Yes / No. Neither is done yet.

*The same detector has a second, worse loss.* It drops any label longer than 60 characters as header
noise, which silently discards *"Does your student need any accommodations or have any special
needs?"* — 68 characters, and one of the two questions this slice was asked about. Such a question
does not merely lose its type; it never becomes a field at all. Since the published packet DOES
contain that question, the real import did not take this path, and widening the cap blind would
change what every other document produces. It is recorded here and left alone.
