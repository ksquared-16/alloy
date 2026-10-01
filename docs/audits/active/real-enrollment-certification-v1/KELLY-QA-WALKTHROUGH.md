# Real Enrollment — human QA

This walkthrough has been rebuilt. The previous version started you at the participant packet, which
is halfway through the product: it asked whether the family's experience was good and never asked
whether anyone but an engineer could have produced it. You stopped it for that reason.

The lifecycle being tested is the whole one, in order:

**source document → import and extraction → operator review and correction → Form authoring →
publish → Enrollment configuration → operator launch → participant completion → payment → completed
evidence → Processing and finalisation → final Enrollment.**

You perform these personally. Eight human gates, **H1 to H8**, cover them.

> **Automated certification does not replace a human gate.** Plenty of what follows has been driven
> by an agent through the real runtime, and that is exactly why it is not finished. A passing test
> proves the software did not throw. It cannot tell you whether an operator could turn a PDF into the
> right Form, whether the fee arrived at a sensible moment, or whether this felt like enrolling a
> child. **No H gate closes because tests pass.**

> **Use `127.0.0.1`, not `localhost`** — they are separate sign-ins to the browser, and a session made
> on one is invisible to the other.

> **This QA server is currently running in DEVELOPMENT mode, and that is a known interim state, not a
> finding.** It is normally a production build precisely so nothing can reload the page under you.
> Restarting it as one needs a full build, and the machine is out of memory at the moment. So: if the
> page refreshes itself while you are mid-sentence, that is this, not a defect — note it only if it
> costs you work. Everything else on the page is real.

> **Inspection must not mutate live configuration.** Where the product requires you to create
> something, create a disposable copy. **Do not overwrite the published Admissions Packet** — H1 exists
> to find out whether you could have built it, and rebuilding it from itself would prove nothing.

## Where this stands

The ten delivery items are unchanged. Creating the human overlay does not advance them.

| # | Delivery item | State |
| --- | --- | --- |
| 1 | Admissions v12 authored | COMPLETE |
| 2 | Administrator QA | COMPLETE |
| 3 | Admissions v12 published | COMPLETE |
| 4 | Real Enrollment packet configured | COMPLETE |
| 5 | Operator launch QA | COMPLETE |
| 6 | Participant QA | NOT COMPLETE |
| 7 | Completed document QA | NOT STARTED |
| 8 | Processing / finalisation QA | NOT STARTED |
| 9 | Complete packet QA | NOT STARTED |
| 10 | Final Enrollment process validation | NOT STARTED |

## Human end-to-end QA

| Gate | What it proves | State |
| --- | --- | --- |
| **H1** Source → Form | an operator can turn real paperwork into a correct Form | **NOT STARTED — start here** |
| **H2** Form → Enrollment | an operator can configure the Enrollment that uses it | NOT STARTED |
| **H3** Operator launch | paperwork reaches a family deliberately | AUTOMATED CERTIFICATION COMPLETE / HUMAN QA NOT PERFORMED |
| **H4** Participant | the family's experience | BLOCKED UNTIL H1–H3 HUMAN QA COMPLETE |
| **H5** Payment | the fee becomes due and can be paid | NOT STARTED |
| **H6** Completed evidence | documents, signatures, acknowledgements, uploads | NOT STARTED |
| **H7** Processing | an operator can receive, correct, approve and file | NOT STARTED |
| **H8** Final Enrollment | the child is actually enrolled | NOT STARTED |

H4's journey is still live and is kept on this page, collapsed, because H4 will use it. It is not
where to begin.

## How to record what you find

There is a **Notes** button fixed in the bottom corner — it is there on every part of this page. Tap
it, write, close it, carry on; the text survives a reload and **Copy notes** hands you the lot.
Tag each note:

- **BLOCKER** — a family or an operator could not get through this.
- **EXTRACTION** — what Alloy read out of the source document was wrong.
- **FORM AUTHORING** — the draft could not be made into the Form you would publish.
- **PRODUCT / UX** — it works, but it is not good enough.
- **CONFIGURATION** — the wrong thing was set up, rather than the software misbehaving.
- **RUNTIME DEFECT** — an error, a blank screen, something that did not save.
- **DATA / CONTENT** — wrong name, wrong child, bad wording, wrong amount.
- **QUESTION** — you are not sure whether what you saw was intended.

## Findings already on the record

These are carried forward so they do not get lost, and are **not** fixed:

- **PRODUCT / UX — Payment is a detached status card.** You saw *Payment · Enrollment fee — not due
  yet* sitting outside the journey. The real question is whether payment should be a step in the
  journey rather than a status block beside it. That is judged at **H5**, once the whole lifecycle is
  visible — not before, and not by an agent.
- **Addresses have canonical ownership now, and no authoring path.** An address can belong to a
  person and carry a purpose, and the participant runtime reads it. Nothing writes it yet: no operator
  screen sets an address purpose or a person's own address. The QA family has no address on file, so
  **blank address answers are expected** and are not the defect. Whether an operator could author
  address ownership at all is part of **H1/H2**.

---

# H1 — source document → Form

**START HERE.** Everything else is locked behind this by choice, not by software.

## What the product actually supports today

Measured on current staging, not assumed:

> **Forms Studio does NOT import your document.** In **Studio → Forms → Create form**, the option
> **Existing document — Import from Work** is **disabled** in the product, and **Existing packet**
> reads *Coming later*. There is no working import button there and this page deliberately does not
> show you one.

The supported direction runs the other way round:

1. the document is a **source on a Processing case**;
2. Alloy **derives a Form draft** from it;
3. **you review and correct** the questions it found;
4. **you promote the draft** into a Form — which creates a **draft Form**, and does *not* publish it;
5. publishing is a separate, deliberate act afterwards.

A Form made that way is badged **From document** in the Forms library; one built by hand is badged
**Manual**.

## Your starting point — and one decision only you can make

The paperwork the programme was characterised against is **School of Enrichment, Inc. (Bend, Oregon)
2026–2027 admissions packet** — three documents, 30 pages, 182 fillable destinations:

| Document | Form | Pages | Fillable destinations |
| --- | --- | --- | --- |
| Family Handbook 2026–2027 | flat PDF, no fillable fields | 23 | 0 |
| Oregon Certificate of Immunization Status, bilingual | fillable PDF | 4 | 85 |
| "Admissions Packet" — hosted web form | HTML | 3 screens | 97 |

The third is where Admissions comes from. It is four things inside one submission: the Classroom
Application, the Tuition & Enrollment Agreement, the Parent Handbook Acknowledgement, and a Direct
Payment authorisation. The Handbook has nothing to fill in, and its final page repeats seven
authorisation clauses the web form also carries verbatim.

> **The card above cannot pick your source for you, and has not tried.** The case the certification
> lineage names does not exist in this database — it was recorded against the certification stack. The
> paperwork itself IS here, but as **separate cases with one source each**, and **three documents are
> called "Admissions Packet"** — two dated 08/25/2026 and one dated 09/10/2026. The programme baseline
> is dated 24 August 2026, which makes an 08/25 upload the likely characterised one and the 09/10 pair
> the likely later re-upload. That is an inference, not lineage, so the card lists all of them with
> their cases and **you choose**. Guessing here would start H1 from a stale artifact, which is the one
> thing H1 must not do.

**H1 begins when you pick one and say so.** If none of them is the real paperwork, that is the more
important finding and H1 should not start at all.

## The walkthrough

**H1a. DO** — Open the paperwork in Processing from the card above.

**H1a. EXPECT** — A case with the three sources on it, and the document readable beside the questions
Alloy found.

**H1b. DO** — Let Alloy read the document and wait for extraction to finish.

**H1b. EXPECT** — Questions grouped into sections, each with an answer type and a confidence signal —
*High confidence*, *Review recommended*, *Needs attention*, or *Could not determine*. If it spins
forever, or reports an error with no retry, stop and write it down.

**H1c. DO** — Read the extracted questions against the document itself. Take your time; this is the
gate.

**H1c. EXPECT** — Judge each of these, and note anything wrong:
- **labels** — do they say what the paper says?
- **answer types** — is a date a date, a yes/no a yes/no, an upload an upload?
- **sections and ordering** — does the shape of the paperwork survive?
- **static text** — is prose that nobody answers being offered as a question?
- **consent and acknowledgement wording** — is it intact and complete, not truncated?
- **signatures** — recognised as signatures?
- **addresses** — one address, or a pile of loose lines?
- **repeated people** — do guardians, emergency contacts and children come through as groups you can
  add to, rather than "Parent 2 First Name" over and over?
- **tables** — if the paper has one, what became of it?
- **things that should not be questions at all** — page numbers, headings, instructions.

**H1d. DO** — Correct at least one real extraction error. The controls are there: change the answer
type, fix a label, move it, **Ignore question**, **Delete question**, or edit what it maps to.

**H1d. EXPECT** — The correction sticks, and nothing else moves when you make it.

> **Do not manufacture a correction to satisfy this step.** If the extraction is genuinely right,
> write that down instead — it is a better result than an invented fix.

**H1e. DO** — Now look at the draft as a whole and ask the only question that matters here: **is this
becoming the Form you would actually publish?** Look for requiredness, optional questions with a
"nothing to report" choice, conditional questions, anything bound to what Alloy already knows, and
the address and signature semantics.

**H1f. DO** — Promote the draft into a Form.

**H1f. EXPECT** — You get a **draft** Form, badged **From document**. Nothing is published and no
family can see it.

> **STOP THERE.** Do not publish it as a replacement Admissions Packet, and do not point the real
> Enrollment packet at it. H1 ends with a draft you are willing to publish, not with a publish.

**H1g. DO** — Answer the gate: **could a school administrator have done all of that without an
engineer?** Where the answer is no, name the step.

---

# H2 — Form → Enrollment configuration

**Locked until you have finished H1.** Configuring an Enrollment around a Form you did not author
tests half the question.

When it opens, it covers: choosing the **Enrolling** stage; adding your Form as something a family
must complete; ordering the requirements; setting required, blocking and must-be-done-before-leaving
for each; adding the financial requirement and choosing **once per record** against **once per
child** against a canonical charge definition; and publishing the revision — including whether it is
clear what you published and that families part-way through are undisturbed.

---

# H3 — operator launch

**Mechanically certified; never walked by a person.** An agent has driven find-the-child, Start
Enrollment, reach Enrolling, send the paperwork, review and confirm. What nobody has judged is
whether the review before sending tells an operator what the family is about to receive, and whether
confirming feels like a decision rather than a formality.

---

# H4 — participant completion

**Blocked until H1 to H3 are done by hand.** The journey is live and collapsed at the top of this
page. When it opens, it covers first impression and whether this feels like enrolling a child;
Admissions, including reuse of what Alloy knows, guardians, siblings, emergency contacts, addresses,
optional and absence behaviour, signatures, repetition and language; leaving and coming back; the
Family Handbook; the Immunization upload; and the completion moment.

---

# H5 — payment

**Not started.** Covers the fee becoming due only after the paperwork is done, whether the amount and
reason are understandable to a parent, who the payer is, card and bank, confirmation, reload, and any
remaining balance.

This is where the **detached Payment card** finding gets judged: should payment be a step in the
journey rather than a status block beside it?

---

# H6 — completed evidence

**Not started.** Covers the documents that come out of the packet, signatures, acknowledgements,
uploads, and whether the packet is genuinely complete.

---

# H7 — Processing and finalisation

**Not started.** You become the operator receiving the packet: review it, correct what needs
correcting, approve, commit, file.

---

# H8 — final Enrollment

**Not started.** Covers whether the child is actually enrolled — canonical records, artifacts,
financial state, history — rather than merely having finished some paperwork.

---

# What this walkthrough does not cover

- **Anything an agent can settle alone.** Where automated certification already proves something it is
  not repeated here. What is left is the part that needs a person.
- **Fixing what you find.** Record it. A defect found during a gate is the gate working.
