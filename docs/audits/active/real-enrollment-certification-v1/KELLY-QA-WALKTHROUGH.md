# Technical QA appendix

The human QA guide is the page above this. Nothing here is needed to perform it; this is the
engineering record, kept beside the human one so the two cannot drift.

## Delivery ledger

| # | Item | State |
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

## Human QA gates

| Gate | Covers | State |
| --- | --- | --- |
| H1 | source document → Form | IN PROGRESS |
| H2 | Form → Enrollment configuration | NOT STARTED |
| H3 | operator launch | AUTOMATED CERTIFICATION COMPLETE / NOT WALKED |
| H4 | participant completion | NOT STARTED |
| H5 | payment | NOT STARTED |
| H6 | completed evidence | NOT STARTED |
| H7 | Processing and finalisation | NOT STARTED |
| H8 | final Enrollment | NOT STARTED |

Automated certification does not close a human gate.

## The document import path, measured from the product

> **A correction.** An earlier pass reported that importing a document was unsupported, on the
> strength of one disabled control: in Forms Studio, **Create form → Existing document — Import from
> Work** is `disabled: true` and **Existing packet** reads *Coming later*. That reading was too narrow.
> Those options are a secondary entry point. The working path is **Processing → Import document**, and
> it is fully built.

What the product actually does:

1. **Processing → Import document** opens a file picker. Accepted: `.pdf`, `.docx`, `.doc`, `.html`,
   `.htm`, `.png`, `.jpg`, `.jpeg`, `.txt`, `.csv`. HEIC is recognised but excluded.
2. The upload is followed by **"What would you like to do with this document?"** with four canonical
   intents:
   - **Create a native form** — *detect questions, review mappings, and generate an editable Alloy form*
   - **Process information** — *extract information for review and eventual record updates*
   - **Store on a record** — *upload and attach the document without generating a form*
   - **Analyze as one packet** — *attach this document to the case's packet and analyze every source together*
3. A review case is created, and extraction reports per-question confidence — *High confidence*,
   *Review recommended*, *Needs attention*, *Could not determine*.
4. The reviewer can change the answer type, fix a label, reorder, ignore a question, delete one, or
   edit what it maps to.
5. Promoting the draft creates a **draft Form** badged *From document*. It does not publish.

## Known gaps

- **UX FINDING — PAYMENT SHOULD LIKELY BE A JOURNEY STEP/STATE, NOT A DETACHED FOOTER/BLOCK.** The
  participant surface shows *Payment · Enrollment fee — not due yet* outside the journey. Not fixed;
  to be judged during the human payment step.
- **Addresses: canonical ownership exists, authoring does not.** An address can belong to a person and
  carry a purpose (`home`/`mailing`), and the participant runtime reads it. Nothing writes it: no
  operator screen sets an address purpose or a person's own address. Blank address answers on the QA
  family are expected and are not a defect.
- **`billing_contact` is not a relationship role.** It is resolved from financial responsibility —
  lowest-priority responsible party — and an arrangement split equally between two parties returns
  ambiguous rather than guessing.

## Why the QA page may reload under you

The QA server is meant to run as a **production build**, where nothing an engineer edits can reload the
page. When it is running in **development** mode instead, Next's Fast Refresh reloads the page whenever
a source file is saved — so editing the harness while it is open reloads it under the reader. That is
the only known cause: the harness has no polling, no interval, no forced revalidation and no
client-side navigation of its own.

The guide keeps your current step and your notes in the browser, so a reload costs a scroll position
and nothing more.
