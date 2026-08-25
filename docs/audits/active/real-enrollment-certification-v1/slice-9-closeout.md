# Clause-Level Document Requirement Projection · closeout

**All gates pass. The publish package is ready.** Nothing published.

---

## §0 — Where the four obligations disappeared

Traced through the real chain, not read from the docstring:

```
prose clause in a section's static text
  → conceptDiscovery: documentRequestClauses() → kind: "upload_requirement"   ✅ 4 found
  → configurationMatching → disposition: "upload_requirement" (+ document type) ✅ 4 proposals
  → applyDiscovery: obligation branch → record("applied"), MUTATES NOTHING     ❌ break #1
  → draftFormToFormSchemaV1: emits file_ref only when a SECTION is `upload`    ❌ break #2
  → enumerateRequirementsFromForm: types file_ref → upload                     ⛔️ 0 to type
  → Participant Runtime                                                        ⛔️ never asked
```

Two breaks, one cause. `applyDiscovery`'s own comment said the obligation branch would "confirm the
section disposition that already drives `draftFormToFormSchemaV1`" — true for a section-level upload,
and false for every one of this packet's four, which are **sentences inside consent and form pages**.
A section disposition cannot say *"this is a consent page that also, in its fourth sentence, asks you
to bring an immunization record."*

Where they live, from the corpus: 1 in an `acknowledgement` section (Tuition Agreement), 3 in
`fields` sections (CIS pages 1 and 2) — **two of them in the same section**.

## §1–2 — The narrowest legal representation

Answers to the five questions, from the code:

1. **Yes.** `DraftFormFieldType` and `FormField` both already have `file_ref`, and nothing requires
   the enclosing section to be an upload section. No new primitive was needed.
2. **The clause itself.** Its verbatim wording becomes the control's `description`; the participant
   label is the document type's canonical name when known, else the clause trimmed.
3. **Yes** — `FormSchemaV1`'s `file_ref` arm gains an optional `document_type`. Without it every
   upload is "a file", and a parent who uploaded a physical cannot be told they still owe an
   immunization record. Optional on purpose: an unknown type stays absent.
4. **By field-grain `RequirementRef`.** Each upload is its own field, so each is its own requirement.
5. **`refKey(ref)`** — `form_definition_id::section::field_id`. `evaluateCompletion` matches a
   submission to one identity, so one document cannot clear every upload ask.

No requirement-model change; no parallel upload system.

## §3 — What was implemented

`DraftClauseUpload` rides **beside** the section, never redefining it:

- `applyDiscovery` attaches one per **approved** upload proposal. It never touches `disposition` —
  retyping a consent page as an upload page would drop every acknowledgement it carries.
- `draftFormToFormSchemaV1` emits the control for **every** disposition, because a static or
  acknowledgement section drops the prompts the source *drew*, and this is an obligation the source
  *stated*.
- The control id derives from the concept id, so re-apply is idempotent and two artifacts correlated
  to one obligation ask the family once.
- Preserved: obligation identity, clause lineage, artifact ownership, label, requiredness, document
  type, placement, and the satisfaction identity.

Publication adds **no second text classifier**. Discovery already found these; publication only
projects what the operator approved.

## §4 — 4 → 4 → 4

Full table in [`FIRST-PUBLISH-PACKAGE.md`](FIRST-PUBLISH-PACKAGE.md) §6. Discovered 4, approved 4,
published 4. No clause disappeared, none duplicated, no unrelated prose became an upload.

**One thing the real corpus taught.** Two CIS clauses both classify as `immunization_record` — proof
of immunization, and a physician's exemption letter — because the vocabulary has no name for the
second. Two asks both labelled "Immunization record" read as one duplicated ask, so a colliding label
falls back to the clause's own wording. That disambiguates; it does not classify, and it does not
invent a document type.

## §5 — Negative controls (16 assertions, all passing)

| | Control | Result |
|---|---|---|
| A | A clause does not retype its section; the acknowledgement and static text survive; exactly one upload; unrelated text fields stay text | ✅ |
| B | Section text literally saying "records must be provided" creates **nothing** without an approved obligation — discovery is the only classifier | ✅ |
| C | An ignored obligation publishes nothing; so does one still merely proposed | ✅ |
| D | One obligation approved twice → one ask; re-apply is idempotent | ✅ |
| E | Two different documents in one section → two asks, two identities, two distinct labels, each clause's own wording | ✅ |
| F | A known type survives; an unknown one stays absent and the label falls back to the clause | ✅ |

## §6 — Satisfaction vertical

Approved obligation → published `file_ref` → `enumerateRequirementsFromForm` → participant
requirement instance with a responsible guardian → a submission carrying `document_id` →
**that** requirement complete, **the other upload still outstanding**. Existing machinery
throughout; no new evidence store. The BP requirement projection remains the readiness authority.

## §7 — Obligation matrix after the fix

| | Discovered | Projected |
|---|---|---|
| Acknowledgements | 22 | 18 |
| Signatures | 6 | **6 ✅** |
| Uploads | 4 | **4 ✅** (was 0) |
| Static / legal content | — | 3 preserved |
| Information (section-grain) | — | 9 |

### The two lesser findings — post-certification hardening, not blockers

**18 acknowledgement requirements, 16 distinct labels.** Three read "I acknowledge the above". Each
has a distinct `RequirementRef`, so nothing merges, and each sits directly beneath its own clause as
static content — the family reads what they are acknowledging. Confusing, not false. Recorded.

**Four CIS boolean controls typed as acknowledgements** (`Var History`, `Module`, `Provider`,
`Religious`). `fieldRequirementType` maps `boolean → acknowledgement`, and these are exemption
selections. Checked before deciding: **all four are `required: false`**, so they cannot block the
packet and cannot falsely satisfy anything. Poor labels on optional controls. Recorded.

Neither causes false participant behaviour, so neither is fixed here.

## §8 — Full certification preflight

`tests/pos/finalCertificationGate.test.ts`, 10 assertions over the real corpus — every gate in the
brief, all passing. Zero new test failures against the 110-failure clean baseline; brokered
`typecheck:tests` rc=0; route-capability gate green.

## §9 — Publication readiness: **YES**

The package is in [`FIRST-PUBLISH-PACKAGE.md`](FIRST-PUBLISH-PACKAGE.md): sources and hashes, the 21
bindings, 5 relationships, 3 safeguarding proposals, 4 upload requirements, 18 acknowledgements,
6 signatures, every held concept, every tenant mutation, version numbers, rollback path, and the
reconciliation counts.

> This publish creates no unapproved canonical field and drops no approved participant obligation.

**Stopped for your approval. Nothing is published.**
