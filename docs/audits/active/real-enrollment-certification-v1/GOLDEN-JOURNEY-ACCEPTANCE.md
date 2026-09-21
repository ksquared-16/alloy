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

---

# Status against this specification — 19 September 2026

The specification above is unchanged; this section records how much of it the product now meets, and
what it took. Every line was driven in Chromium against a clean v9-backed conversation for **Lennon
Kurzman** — a real child with a real date of birth in a real household, reached through the packet's
own distribution link, carrying **no** `QA probe answer` and no `Not applicable`.

| Acceptance rule | Status |
|---|---|
| 1 · A yes/no question offers Yes and No | **met** — 14 questions, authored as booleans in Admissions v9 |
| 2 · A follow-up to a No is never asked | **met** — all four pairs driven, both directions |
| 3 · What Alloy has is grouped by person and fits a screen | **met** — 2 blocks, 5 facts, no Show-more |
| 4 · What the family told us is grouped the same way, still correctable | **met** — 30 answers, 6 chapter lines, every Edit reachable behind *Review all answers* |
| 5 · "What you told us" contains only what this family supplied | **met** |
| 6 · No engineering value visible | **met** — the specimen contains none |
| 7 · One question at a time, with the chapter named | **met** |

## What the packet now says about itself

```
             v8            v9
questions    80            80
required     65            65
text         79            65
boolean       0            14
conditional   0             4
multiline     0            25
```

Nothing else moved: order, labels, sections, the thirteen canonical bindings, the four read-only
destinations and the signature are byte-identical, verified from the product's own read-back.

## The two losses that had to be repaired before v9 could be published at all

Publishing v9 against the pre-change runtime was measured, and it was **worse** than v8: all
fourteen new questions vanished from the conversation and all four follow-ups were asked regardless
of the answer above them.

**An unbound required boolean was always an attestation.** The rule separating "a statement the
family accepts" from "a question the family answers" was structural — unbound, boolean, required —
which is the exact shape of every one of the fourteen. They were classified as things to show beside
a document and dropped, with the packet still reporting them complete. The separating property is
grammar: an acknowledgement is a statement.

**The participant projection never read `visibility`.** The Form schema has carried it since v1; the
public renderer honours it and `validateSubmission` will not demand a hidden required field. The
participant projection was the one reader that never asked.

## What this specification still does not cover, and what is not yet met

- **Chapters 0–6 are certified; chapter 7 is not.** Review, Handbook, Immunisation and completion
  remain out of scope by the specification's own terms.
- **The Process Card send path could not be used to make this specimen.** Preparing enrolment
  paperwork for any child in this tenant refuses with *"This journey is not pinned to a published
  Business Process revision"* (D-96). The specimen was made through the packet's own distribution
  link, which is a supported product path and pins the current published version. The refusal itself
  is a data condition on the journey, not a defect in the send path, and it belongs to the same
  Director decision as `ENROLLING-ENTRY-DECISION.md`.
- **One question cannot be expressed.** *"Does your child have any allergies? If so, please list."*
  is a yes/no carrying its own detail, and the Form model has no single-destination primitive for
  that. Recorded in `ADMISSIONS-V9-INTERACTION-SEMANTICS.md`.


---

# V0.5 CERTIFIED DOCTRINE — 21 September 2026

Everything below was browser-certified on a clean specimen with realistic values and **zero**
accelerator values. It supersedes the v8/v9 measurements above where they differ.

## The packet

**Admissions v11** — **80 questions, 59 required.** 12 yes/no, 4 conditional pairs, 27 paragraphs,
1 signature, 6 optional narratives.

## Optional-narrative doctrine — the resolution of the yes/no-with-detail seam

Six health questions expect *"none"* from most families and a description from the few it applies
to: complications at birth, allergies, serious illness, regular medications, toileting needs,
naptime needs.

They are **one authored narrative destination with two conversational choices**:

```
Does your child have any allergies? If so, please list.

        [ No known allergies ]        [ Yes — I'll tell you ]
```

**Absence writes nothing.** Choosing the truthful absence records a participant DECISION through the
existing decline owner. No `"None"`, `"N/A"` or `"na"` reaches the destination — because a parent
forced to type "na" has put a false value into a document they will later sign. Certified: 0
synthetic values across the whole answer record, not merely the fields driven.

**Detail is retained verbatim** in that same single destination.

**No new Form primitive was required.** Optionality is the existing construct that expresses this,
and the tuned affordance — "No known allergies" rather than a generic label — already existed and
was simply unreachable while these fields were required.

## What the family sees

Named people, never slot numbers, the moment identity is known:

```
Lennon's details                    6 answers →
Daniel Kurzman · Guardian           5 answers →
Kelly Kurzman · Guardian            2 answers →
Marisol Vega · Emergency contact    4 answers →
Tomas Rivera · Emergency contact    4 answers →
Lennon · Emergency & pickup         2 answers →
Dr. Amelia Chen · Physician         2 answers →
Lennon · Health & development      28 answers →

Review all answers →
```

- **The row is the control** and the count is the affordance. One `<button>` per row, hover tint,
  focus outline measured `solid`, Tab-reachable, Enter activates. "Review" survives as the accessible
  name only.
- **Per-group review and edit**, opening that person or topic and nothing else. Reviewing is local
  state: the conversation's current question is byte-identical before and after — asserted on every
  certified edit.
- **Identity updates live.** Editing the physician's name to "Dr. Amelia Chen, MD" retitled the row
  immediately.
- **Every row leads with its subject.** A child topic is never presented as though it were a person.
- **Concise navigation labels** — "Health & development", "Emergency & pickup". The authored section
  name is unchanged everywhere the document is the subject; a heading the table does not recognise
  keeps its own words.
- **Relationship labels are read, never assumed.** A guardian slot says "Guardian" unless the
  relationship authority says the person is the primary contact. On the certified specimen no
  `person_child_relationships` row exists yet, so "Kelly Kurzman · Guardian" is the truthful label.

## Text contrast

Every participant-facing prose token measures **≥ 4.84 : 1** against the painted background,
alpha-composited (WCAG AA for small text is 4.5). Body text stays heavier, so the secondary layer
is still visibly secondary.

An earlier pass at this looked darker and was not enough: measured, the section eyebrow was 2.71:1
and the summary labels 3.58:1. The first measurement was itself wrong — Tailwind v4 computes to
`oklab(L a b / alpha)` and reading those as RGB reported 20.99:1 for everything.

## The participant presentation for V0.5

**Conversation is the sole participant presentation.** The link opens as a conversation and a
conventional Form is never painted for a journey that has one — certified from cold navigation,
hard reload, and a throttled load, sampling every animation frame: first Form control paint
**NEVER**, in all three.

**A Form-view switch is rejected for V0.5**, from measurement rather than preference:

```
Conversation live state   form_packet_sessions.shared_values
Form draft live state     form_submissions.payload
```

Neither presentation sees the other's edits before submit; convergence happens only at submit
through `advancePacketSessionAfterSubmit`. The certified specimen carried 68 conversational answers
in `shared_values` while its Form draft held 2 — and those 2 were prefill. Offering a switch over
two stores would show a family their answers had vanished.

**Dual presentation is a future platform capability**, and it is specific: one live participant
store, or a Form draft that reads through `shared_values` on load. It is not a presentation toggle.
