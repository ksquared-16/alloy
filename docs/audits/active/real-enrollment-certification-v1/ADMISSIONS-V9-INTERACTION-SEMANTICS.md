# Admissions v9 — the paperwork now says how it wants to be answered

**Published 19 September 2026.** Form `Admissions Information`, version **9**, through
`POST /api/admin/forms/{formId}/versions` then `/publish` — the same product path that published v8.
No published schema was patched.

## What changed, and only what changed

| | v8 | v9 |
|---|---|---|
| Questions | 80 | **80** |
| Required | 65 | **65** |
| Sections, order, labels | 4 / fixed / fixed | **unchanged** |
| Canonical bindings | 13 | **13, unchanged** |
| `read_only` destinations | 4 | **unchanged** |
| Signature | 1 | **unchanged** |
| `text` | 79 | 65 |
| **`boolean`** | **0** | **14** |
| **Conditional (`visibility`)** | **0** | **4** |
| **Multiline** | 0 | 25 |

Every row above is counted from the product's own read-back of the published version, not from what
was sent to it.

## The fourteen closed questions were chosen by grammar, not by hand

They are exactly the fourteen that `labelIsClosedQuestion` returns true for across all eighty v8
labels — a question mark plus an auxiliary opener (*has, does, is, are, will, do…*). The rule was
written for the importer, and applying it to the published packet reproduced the hand audit's count
with no disagreement:

```
field_31  Are there any custody or visiting arrangements we need to be aware of?
field_33  Is there anyone who has a legal restraining order …?
field_40  Has your student ever participated in speech, behavioral, play or occupational therapy?
field_41  Does your student need any accommodations or have any special needs?
field_43  Does your child have siblings?
field_48  Has your child ever been stung by a bee or wasp?
field_56  Are they ever reluctant to use the bathroom?
field_58  Does your child become tired or nap during the day?
field_63  Has your child been in a school or daycare before?
field_65  Will your student be simultaneously enrolled in an additional program …?
field_67  Is your child able to play alone?
field_69  Does your child have any fears? (dark, spiders, etc.)
field_72  Do you use any kind of behavior management at home?
field_75  Is there anything else you would like us to know about your child?
```

`field_69` needed one repair to the rule to be caught: its question mark is followed by a
parenthetical, so reading only the last character called it open. A trailing parenthetical is now
stripped before the question mark is looked for.

## The four conditional pairs

```
field_32  If yes, please explain arrangements and custody     visible_when field_31 = true
field_34  If yes, their relationship to your child            visible_when field_33 = true
field_44  If yes, please list siblings name(s) and age(s)      visible_when field_43 = true
field_64  If yes, please list the name and location …          visible_when field_63 = true
```

Authored with the Form schema's own `visibility` primitive, which has existed since v1. **No new
conditional model was invented**, and nothing in the participant runtime matches on the words
"If yes" — see the runtime note below.

They stay **optional**, which is what preserves 65 required. Making a follow-up required-when-visible
is a coherent thing to want and would be a deliberate change to what the packet demands; it is not
smuggled in with a presentation slice.

## The one question that is not a boolean, and why

`field_46` — *"Does your child have any allergies? **If so, please list.**"* — is the packet's one
yes/no question carrying its own follow-up, and it has **one** destination. The Form schema can
express `boolean`, and it can express `boolean` + a conditional text field; it cannot express both in
one box. Authoring it as a boolean would refuse the list the school is explicitly asking for, so it
stays text, multiline.

**The seam, recorded rather than closed:** a yes/no-with-detail question needs two destinations, and
adding one would make this packet 81 questions. That is an authoring decision about the school's
paperwork, not a runtime repair, and it belongs to whoever owns the form.

## What was deliberately NOT reconciled

- **Dates.** `field_2` (date of birth) and `field_4` (first day) are canonically bound and hold
  whatever the record holds; retyping them as `date` would make the Form validator demand ISO of
  values that may not be ISO yet. `semanticEditorFor` already gives a date control for a date of
  birth from the canonical key, so the participant already meets the right control.
- **Addresses.** The Form schema has no address type. The participant runtime decomposes a whole
  address into street/city/state/ZIP from the canonical key; `field_12` and `field_13` are unbound,
  so they stay single-line here.
- **The other 65 text fields.** Counts were not made to match by rewriting fields.

## What the runtime had to learn, and one trap it walked into first

Publishing v9 against the pre-change runtime was measured, and it was worse than v8:

```
v9 on the old runtime:   14 questions silently disappeared      4 follow-ups asked regardless
```

Both halves have owners now:

**An unbound required boolean was always an attestation.** `fieldIsAcknowledgement` separated a
statement a family accepts from a question it answers by structure alone — unbound, boolean,
required — which is exactly the shape of all fourteen of these questions. So they were classified as
things to show beside a document and dropped from the conversation, with the packet still reporting
them complete because nobody had been asked. The fourth clause is grammar: an acknowledgement is a
STATEMENT. *"I agree to the Tuition and Enrollment Agreement"* is still an acknowledgement.

**The participant projection never read `visibility`.** The public renderer honours it and
`validateSubmission` will not demand a hidden required field; the projection was the one reader that
did not ask. It now evaluates the operator's own condition with the platform's own evaluator, after
the walk, because a condition names another field.
