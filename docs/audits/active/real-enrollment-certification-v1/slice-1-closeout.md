# Real Enrollment Certification V1 — Slice 1 closeout

**Slice:** Import Fidelity + Semantic Understanding
**Base:** packet baseline `e15dae5de` (accepted)
**Commits:** `78146fe58` · `dc86de208` · `09039d09c`
**Status:** complete. Slice 2 not started. No HTML import. No conversation batching. Nothing published.

---

## 1. Importer architecture, before and after

### Before

```
document bytes
  ├── AcroForm widgets found? ─── yes ──► buildFormDraftFromAcroForm ──► RETURN
  │                                       (85 exact destinations, no understanding)
  ├── native layout lines? ────── yes ──► detectLayoutStructure
  │                                        └► discoverConfiguration ──► RETURN
  └── flat text ──────────────────────────► detectDocumentStructure ──► RETURN
```

Configuration Discovery lived **inside one branch**. The branch with the best field evidence
returned before reaching it, so the choice was 85 exact destinations with no semantics, or 14
layout-guessed fields with semantics.

### After

```
document bytes
  │
  ├─ selectDraftSource()  ── selects only, never enriches
  │    ├── AcroForm widgets ──► draft + buildStructureFromAcroForm(widgets + page text)
  │    ├── native layout ─────► draft + detectLayoutStructure(lines)
  │    └── flat text ─────────► draft + detectDocumentStructure(text)
  │                                      │
  │                              { draft, structure, origin }
  ▼
chooseDraftForCase()
  └─ ONE enrichment point: discoverConfiguration(structure) ──► draft.configuration_discovery
                                                                     │
                                                                  RETURN
```

Selection and enrichment are separate functions. Every reader returns the structure it read, and
discovery runs once on whatever that is. The AcroForm adapter changes nothing about a widget —
same name, type, page, bounding box — and adds the page's own text runs as section evidence so the
prose a widget cannot hold is finally readable. That text is **evidence only**: widget sections keep
the `fields` disposition, because letting a page's footer reclassify the page would discard the 49
input widgets above it.

**Negative control** — `tests/pos/formDraftDiscoveryComposition.test.ts`:

- discovery is asserted present for all three readers;
- a discovery failure is asserted not to cost the operator any destination;
- structurally, nothing may `return` between selecting a source and enriching it, `chooseDraftForCase`
  has exactly one draft return, and `selectDraftSource` never calls `discoverConfiguration`.

Both halves were verified by **reintroducing the original early return** and watching the behavioural
test and the structural guard go red, then restoring.

---

## 2. CIS before / after

Reproducible: the fixture is the blank public Oregon form, sha256-pinned in
`tests/pos/realEnrollmentCisCertification.test.ts`.

| | before | after |
|---|---:|---:|
| destinations | 85 | **85** |
| · with native name + page + bbox | 85 | **85** |
| · typed as signature | 1 | **3** |
| semantic facts (concepts) | 0 | **31** |
| canonical bindings proposed | 0 | 3 |
| new fields proposed | 0 | 8 |
| form-only responses | 0 | 1 |
| unbound — needs a Slice-2 decision | 85 | **28** |
| repeating structures recognized | 0 | **13** (9 collections + 4 grouped choices) |
| · destinations they cover | 0 | **67** |
| acknowledgements recognized | 0 | 4 |
| signatures recognized | 0 | 3 |
| uploads / evidence recognized | 0 | 3 |

The signature row is the G8 result and is measured across both commits: the pre-slice pipeline typed
`Signature update` and nothing else. Reconstructing the "before" architecture on today's code gives
3/3, because typing was fixed first — the honest before-value is 1.

`85 → 31` is the composition result. Nothing was collapsed to get it: every destination is still in
`draft.fields` with its own name and box, unsuppressed, and every proposal is still `proposed`.

---

## 3. Disposition of G1 / G3 / G5 / G8

### G1 — discovery after AcroForm extraction · **RESOLVED**

The early return is gone; discovery is applied at one point for every reader. Negative control in
place, verified by reintroducing the defect.

### G8 — signature recognition · **RESOLVED**

A field name is now read as a compound noun rather than matched as a substring. Tokens are walked
right to left; ordinals and qualifiers that modify a signature are skipped; the first substantive
token decides. A leading Hungarian widget prefix declares a type rather than heading the noun —
the convention the label cleaner already followed.

| name | verdict |
|---|---|
| `Signature`, `Signature1`, `Signature2`, `Signature_1`, `Parent Signature`, `sigParent`, `Signature II` | signature |
| `Signature update`, `signature_updated` | signature, variant `update` |
| `signature_count`, `signature_date`, `signature_name`, `signature_printed_name`, `signature_image_url`, `signature_type`, `signature_status` | **not** a signature |

The variant is preserved, so the CIS's re-sign line stays distinguishable from the two mandatory
attestations, and the dates beside each signature stay typed as dates.

### G5 — acknowledgement granularity · **RESOLVED within a document**

Consent is read clause by clause. A sentence carrying first-person commitment becomes its own
acknowledgement, deduped by clause text, and the clause reading supersedes the section-level concept
wherever it finds anything. Proven on the real handbook page: **7 clauses where there was 1.**

Document requests are split the same way and are now **named from the sentence that asks for them**
instead of a fixed list of document types. That is why the existing acceptance fixture reports three
upload requirements rather than two — "bring us updated records after new immunizations" is a
different obligation from "records before the first day", and the fixed lexicon had merged them.

**Not resolved:** cross-document clause dedup. The handbook's seven authorizations are repeated
verbatim inside the Formsite agreement, and recognizing that requires seeing both documents at once
— which is G3.

### G3 — multi-document packet intake · **NOT ADDRESSED, deliberately**

Correlating a fact across documents needs packet intake (`packet_source`, still `available: false`).
Nothing in this slice needed it, and inventing it against a single document would have been building
against a hypothesis. It stays open, and it is what makes the packet's 23 repeated facts collapse.

---

## 4. Structured collections

Repeated destinations are recognized from **geometry**, which every form carries, not from field
names. A grid announces itself through shared column edges and shared baselines; a grid whose columns
are all one type is a row repeating one value, while a grid of mixed column types is a table of
records. A table's rows must occupy the same columns, which is what stops two widgets that merely
share a baseline from reading as a row.

Checkbox groups are recognized the same way — same size within a tolerance, aligned, regular spacing,
no larger break inside — and are expressed as a **choice with options**, reusing vocabulary that
already exists rather than adding any.

Measured on the real CIS:

| structure | groups | destinations |
|---|---:|---:|
| per-vaccine dose schedules (5, 5, 5, 5, 5, 5, 5, 2) | 8 | 37 |
| "other vaccines received" table (8 rows × name + date) | 1 | 16 |
| exemption checkbox blocks (7, 3, 2, 2) | 4 | 14 |
| **total** | **13** | **67** |

No destination belongs to two groups, and none is suppressed or rewritten. Grouping is a proposal.

**The 69 immunization destinations project to 15 participant needs** where the hand baseline counted
13. Both differences are recorded rather than smoothed away: the English and Spanish
exemption-document blocks stay separate, because telling translated duplicates apart needs language
awareness the importer does not have; and "had chickenpox disease" stays separate from its date.

---

## 5. Binding proposals

See §2. Three canonical reuses (`child.name`, `child.date_of_birth`, `person.phone`), eight proposed
new fields, one form-only response. **Nothing is applied.** Every proposal carries
`decision_state: "proposed"`, asserted in the certification.

No AI or provider assistance was used anywhere in this slice. Discovery is deterministic end to end.

---

## 6. All 78 unbound facts, classified

`unbound-fact-classification.mjs`, with `classification-check.mjs` proving the partition is exact —
78 facts, 78 classified, none missing, none in two buckets.

| | bucket | count |
|---|---|---:|
| A | existing canonical fact — binding or synonym missing | 4 |
| B | legitimate new reusable domain fact | 40 |
| C | process / participant-runtime fact | 2 |
| D | artifact-specific fact | 1 |
| E | structured collection member | 11 |
| F | acknowledgement / signature / evidence / payment — owned elsewhere | 20 |

Three things this classification says that a count of 78 does not:

- **A is a warning, not a gap.** `household.has_siblings` and `household.sibling_names_ages` are
  household membership, which Alloy already models as records. A tenant that knows the household
  should not be asking a parent to type their other children's names into a text box.
- **F is 20 facts — a quarter of the "field gap" is not a field problem at all.** Nine
  acknowledgements, three signatures and one upload belong to Requirements. Six banking fields and
  the material fee belong to a payment system; Alloy should hold a payment-method reference, never a
  routing number.
- **B is 40, and much of it is health data.** Developmental history, therapy history, illness history
  and birth complications need a sensitivity classification, not just a field key.

---

## 7. Updated semantic compression

Packet-level, with the importer's measured reading of the immunization record:

```
raw destinations                            182
unique semantic needs                       115   (was 113 — the measured +2)
parent-supplied needs                        96
  · already known → confirm once              9
  · genuinely missing → collect              85
needs asked unconditionally                  89
needs behind a gate                           7
```

CIS-only, which is what this slice actually moved:

```
85 destinations → 31 decisions   (was 85 destinations → 85 decisions)
67 of those 85 destinations now sit behind 13 group decisions
```

---

## 8. Section-level participant workload

Evidence for later conversation planning. **No multi-need packaging is implemented**; the nine
deterministic sections are preserved exactly as the packet drew them. "Already known" and "confirm"
are equal by design — a fact Alloy holds is always confirmed once, never assumed.

| section | needs | known | confirm | collect | cond. | artifact |
|---|---:|---:|---:|---:|---:|---:|
| About your child | 4 | 3 | 3 | 1 | 0 | 0 |
| Family & contact information | 13 | 5 | 5 | 8 | 0 | 0 |
| Emergency contacts & authorized adults | 12 | 0 | 0 | 12 | 0 | 0 |
| Health & medical | 15 | 1 | 1 | 14 | 1 | 0 |
| Immunization record | 15 | 0 | 0 | 13 | 2 | 0 |
| Daily routines | 12 | 0 | 0 | 12 | 0 | 0 |
| Getting to know your child | 14 | 0 | 0 | 14 | 1 | 0 |
| Custody & legal | 4 | 0 | 0 | 4 | 2 | 0 |
| Tuition & payment | 7 | 0 | 0 | 7 | 0 | 0 |
| Review & sign | 0 | 0 | 0 | 0 | 1 | 15 |
| **total** | **96** | **9** | **9** | **85** | **7** | **15** |

Reproduce: `node docs/audits/active/real-enrollment-certification-v1/section-projection.mjs`

---

## 9. Certification

`tests/pos/realEnrollmentCisCertification.test.ts` — 19 assertions over the real document.

| required proof | how it is asserted |
|---|---|
| source CIS | blank public form, sha256-pinned; no field carries a value |
| 85 native destinations preserved | count, plus native name + page + bbox on every one |
| semantic discovery runs | `configuration_discovery` present on the AcroForm draft |
| signatures correctly classified | all three found; re-sign line distinguished; dates still dates |
| repeated destinations compressed | 67 → 13, no destination in two groups, dose schedules `[2,5,5,5,5,5,5,5]` |
| proposals produced | 31 concepts → 31 proposals |
| source geometry unchanged | bounding boxes asserted per field; nothing suppressed or rewritten |
| no automatic publication | every proposal `decision_state: "proposed"` |

**No regression on layout / OCR import.** Layout, OCR, structure, AcroForm and draft suites: 124 of
125 green, the single failure (`deriveDocumentTitle`'s classification label) verified pre-existing on
the base commit. Across `tests/pos`, `tests/forms` and `tests/fields` the failing-test **list** is
byte-identical to the pre-change baseline — 45 before, 45 after, none new, none fixed. Every test
consumer of the changed modules lives in those directories; the three app consumers are covered by a
clean brokered typecheck (`rc=0`), which is what caught the two exhaustive maps in the concept-review
UI that the new disposition and category required.

---

## 10. Remaining gaps before this packet can be published as an Enrollment configuration

1. **G2 — the Formsite packet cannot be imported at all.** 97 of 182 destinations, and three of the
   four artifacts a parent actually signs. **This is the critical-path question for the Director:**
   if the hosted form is the authoritative parent artifact, the next importer program must treat
   existing web forms as legitimate source artifacts — not convert them into PDFs to get them
   through a PDF pipeline.
2. **G3 — no packet intake.** Each document imports as its own case, so the 23 facts this packet
   repeats across documents cannot be correlated, and the handbook's seven authorizations cannot be
   recognized as the same seven the Formsite agreement repeats.
3. **G4 — the handbook still proposes 8 fields from prose.** A reference document should yield zero
   fields and one acknowledgeable artifact. Untouched by this slice: no AcroForm, so it takes the
   layout path.
4. **G6 / G7 — the vocabulary decision itself.** 78 facts classified, none created. Slice 2 owns
   names, grains, sensitivity, and the shape-independent binding that lets one `child.full_name`
   populate both a composite destination and a last/first/middle triple. `child.middle_name` still
   does not exist.
5. **Cross-document identity.** `child.name` deduped correctly inside the CIS, but the current scalar
   dedup also collapsed *first*, *middle* and *last* name into one `child.name` concept. Right for
   compression, wrong for a form that needs the three parts separately — a Slice-2 problem, recorded
   here because the CIS is where it shows.
6. **Signature dates are not yet associated with their signatures.** They are correctly typed and
   correctly distinguished, but nothing links "Date Fecha_2" to "Signature update".
7. **G9 — validation.** Dose dates must be ascending and after the date of birth; a routing number
   has a checksum; bedtime is a time. None of this is expressed yet.
