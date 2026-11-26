# Real Enrollment Certification V1 — Slice 2 closeout

**Slice:** Packet Intake + Multi-Source Artifact Normalization
**Base:** Slice 1 accepted (`db07ec2b0`)
**Status:** complete. Slice 3 not started. Nothing published. No conversation batching. No parent QA.

---

## 1. Packet / source-artifact architecture

**No new schema.** The investigation found the substrate already in place, and Slice 2 uses it rather
than adding beside it:

| §1 requirement | Where it already lives |
|---|---|
| artifact identity | `documents.id` |
| source kind | `documents.mime_type` + `doc_type` |
| source URI / file identity | `documents.bucket` + `storage_path` + `public_url` + `original_filename` |
| immutable source hash | **`documents.checksum_sha256`** |
| page / section structure | the stored draft preview on the case |
| extracted destination identity | the reader's own stable id, carried as each field's `evidence` |
| extraction method | `documents.extraction_provider` + the draft's `origin` |
| several artifacts in one packet | `processing_case_sources` — N rows per case, `role: primary \| related` |

The one thing missing was that `buildFormDraftForCaseSafe` reads only the `primary` source. The case
could always hold several; nothing composed across them.

**Hosted-form versioning needs no new doctrine.** A hosted form enters as a **capture**: the HTML
bytes stored as a document, with `public_url` recording where they came from and `checksum_sha256`
pinning exactly what was read. If the school edits its Formsite form, that is a *new capture* — a new
document, a new hash — and a configuration published from the old one still points at the old one.
Immutability is the hash; versioning is a second document. Both already exist, so §1's STOP condition
was not reached.

```
PacketIntakeInput[]  ──►  composePacket()  ──►  PacketIntakeResult
  { artifact, structure, discovery }             sources
                                                 artifacts        (logical, inside each source)
                                                 destinations     (addressed packet-wide)
                                                 correlations     (proposed facts)
                                                 obligations      (proposed relations)
                                                 signatures       (artifact-scoped, dated)
                                                 reconciliation   (the audit)
```

Packet intake describes source artifacts and proposes semantics. It creates no requirement
authority: published BP requirements still decide what Enrollment requires, and Forms, Fields,
Requirements and Signatures keep their ownership. Every proposal carries `decision_state: "proposed"`
and the evidence that produced it.

---

## 2. Formsite reader result

A first-class reader beside AcroForm and layout, driven by **standard form semantics** — `label/for`,
control types, `required`, `<option>`, radio/checkbox groups sharing a name, headings. Two structural
conventions are also honoured because signature widgets have no standard element: a container class
marking requiredness, and a `signature` container backed by a hidden value input. It reads a stored
capture and performs **no network access of any kind**.

Measured on the real capture:

| | |
|---|---:|
| raw source controls and widgets | 97 |
| normalized destinations | **95** |
| required, matching the source's own markup exactly | **79 / 79** |
| sections, in source order | 7 |
| signatures | 3 |
| declared option sets preserved | gender (3), account type (2), 2 × Yes/No |
| destinations with a stable source identity | 95 / 95 |

The 97 → 95 difference is the two Yes/No questions: two checkbox elements each, one question each.
It is reported as normalization, not absorbed as loss.

Nothing semantic is inferred from a class name or a display label. Configuration Discovery proposes
meaning afterwards, exactly as it does for a PDF.

**Requiredness was the subtle one.** Reading it from a window of a few hundred characters before the
control let the previous question's asterisk bleed onto the next and made every optional field look
mandatory. Scoping it to the destination's own container is what produces 79/79.

---

## 3. The four Formsite artifacts

Drawn from structure, not from reading the headings' words: **a signature executes an artifact, an
artifact opens at the heading introducing that signature, and everything before the first of them is
the unsigned collection artifact.**

| # | Artifact | Destinations | Signatures |
|---|---|---:|---:|
| 1 | School of Enrichment Admissions Packet *(the collection artifact)* | 76 | 0 |
| 2 | Tuition & Enrollment Agreement | 5 | 1 |
| 3 | Parent Handbook Acknowledgement | 4 | 1 |
| 4 | Direct Payment Authorization | 10 | 1 |
| | **total** | **95** | **3** |

They partition the 95 destinations exactly once each, and the certification asserts that a signature
on one never appears in another. The same segmentation applied to the CIS separates its front
(vaccination attestation, 2 signatures) from its back (exemption attestation, 1).

The collection artifact takes the source's own first heading as its name. The school calls it the
Classroom Application in the handbook prose; the source never says so, so the operator names it.

---

## 4. Cross-artifact correlation

Correlation requires a **derived canonical identity** or an **identical declared option set**. Never
string similarity, and never a reference document's concepts — a handbook declares no participant
facts.

| basis | fact | destinations | artifacts |
|---|---|---:|---:|
| canonical concept key | `child.name` | 7 | CIS + Formsite |
| canonical concept key | `guardian.name` | 4 | CIS + Formsite |
| canonical concept key | `child.date_of_birth` | 3 | CIS + Formsite |

Composing the packet exposed a defect underneath the correlation, which is the reason to compose it:
concept keys were assigned by substring inside a section's subject, so **every prompt containing
"name" in a child-subject section became the child's name**. The first correlation run asserted that
the child's name, the guardian's name and the physician's name were one fact. The label now names the
party and the party wins over the section — with plurals, because a state form writes "Parents' or
Guardians' names" and a singular-anchored rule files it under the child.

`Physical Address, City, State and Zip` and the ACH form's `City` are **not** correlated. Nothing
derived says they are the same fact, and that is the right answer rather than a miss.

---

## 5. Cross-document obligation dedupe

Obligations merge only on **verbatim clause identity after normalization** — the same sentence,
printed in two places. Similar language is reported as distinct.

- **6 same_obligation** — clauses the handbook and the tuition agreement print identically.
- **the rest distinct**, including three of the handbook's authorizations that the form reprints with
  a typo ("secure form for my child the necessary treatment"). Reported as distinct, which is what
  the evidence supports.
- **0 instruction_and_requirement**, and that is a measured finding, not a gap: the handbook **never
  mentions immunization at all**. The CIS's presence in the packet is the only statement of that
  obligation anywhere in the corpus.

32 unique obligations survive: 22 acknowledgements, 6 signatures, 4 upload requirements.

---

## 6. Signature relationships

Six signatures, each scoped to exactly one artifact, each with a signer grain of `recipient`, each
linked to the date the source puts with it:

| source | artifact | variant | date evidence |
|---|---|---|---|
| CIS | Page 1 (vaccination attestation) | initial | same baseline, within 12pt |
| CIS | Page 1 (re-sign line) | **update** | same baseline, within 12pt |
| CIS | Page 2 (exemption attestation) | initial | same baseline, within 12pt |
| Formsite | Tuition & Enrollment Agreement | initial | immediately preceding, in source order |
| Formsite | Parent Handbook Acknowledgement | initial | immediately preceding, in source order |
| Formsite | Direct Payment Authorization | initial | immediately preceding, in source order |

No two signatures claim the same date. Where a source proves nothing — two dates sharing a
signature's baseline, say — nothing is claimed and the ambiguity is recorded.

---

## 7. G-status

| gap | status | note |
|---|---|---|
| **G1** discovery after AcroForm | **resolved** (Slice 1) | single enrichment point, negative control |
| **G2** hosted-form ingestion | **resolved** | first-class reader; capture + hash, never a fetch |
| **G3** multi-document packet intake | **resolved for reasoning** | `composePacket` composes N sources. The `packet_source` *import intent* is still `available: false` — wiring the operator flow to attach several sources to one case is Slice 3 |
| **G4** prose false positives | **resolved** | 8 → 0; source intent decided at document scope, verdict in the warnings |
| **G5** obligation dedupe | **resolved** | in-document (Slice 1) and cross-document (above) |
| **G6** signature relationships | **resolved** | artifact, signer grain, variant and date, all from source structure |
| **G7** shape-independent binding | **open** | `child.name` correlates across artifacts, but the CIS wants last/first/middle and the form wants one composite. `child.middle_name` still does not exist |
| **G8** signature typing | **resolved** (Slice 1) | |
| **G9** validation | **open** | dose dates ascending and after DOB; routing-number checksum; bedtime is a time |

---

## 8. A–F, re-run

`slice-2-classification.mjs`, checked against the **measured** key list by
`slice-2-classification-check.mjs` — 75 keys, 75 classified, none missing, none in two buckets.

| | bucket | Slice 1 | Slice 2 |
|---|---|---:|---:|
| A | existing canonical — binding missing | 4 | **11** |
| B | new reusable domain fact | 40 | **34** |
| C | process / participant-runtime | 2 | **3** |
| D | artifact-specific | 1 | **1** |
| E | structured collection member | 11 | **15** |
| F | acknowledgement / signature / evidence / payment | 20 | **11** |
| | **total unbound** | **78** | **75** |

Every delta is recorded in `DELTAS`. The four that move the most:

- **Obligations left the fact denominator.** 13 facts in Slice 1 (9 acknowledgements, 3 signatures,
  1 upload) are obligations, and are now counted as 32 unique obligations instead. F falls from 20 to
  11 for this reason, not because the work went away.
- **Emergency contacts became one relationship.** 12 unbound facts → 1 covering 13 destinations.
- **The hosted form bound what a PDF heuristic could not.** 11 facts carry a canonical binding
  proposal, against 3 on the CIS alone in Slice 1.
- **Party scoping split facts that were wrongly one.** This *raises* the count and lowers the risk.

---

## 9. Compression scorecard

```
raw source destinations                      182
normalized artifact destinations             180   (2 Yes/No pairs collapse; nothing lost)
  · claimed by a fact                        174
  · claimed by an obligation (signatures)      6
  · semantically orphaned                      0

unique semantic facts                         86
  · already carrying a canonical binding      11
  · unbound — Slice 3's input                 75
  · standing for a recognized collection      13   covering 80 destinations
  · correlated across artifacts                3   covering 14 destinations

unique obligations                            32
  · acknowledgements                          22   (6 merged across artifacts)
  · signatures                                 6   (artifact-scoped, all dated)
  · upload requirements                        4

conditional facts                              3   (custody, restraining order, prior program)
artifact-specific actions                      6   signatures, one per signed artifact
```

**182 destinations → 86 facts + 32 obligations.** The parent-question denominator is not yet final:
`ask`-kind (confirm vs collect) depends on tenant state, and Slice 3's vocabulary work will collapse
more. That is the point of stabilizing the denominator before touching the conversation.

---

## 10. Section workload

Measured from the packet, not from the hand inventory. **No conversation packaging is implemented.**

| section | facts | destinations | collections | cross-artifact |
|---|---:|---:|---:|---:|
| Org / system | 1 | 1 | 0 | 0 |
| About your child | 8 | 16 | 0 | 2 |
| Family & contact | 7 | 16 | 0 | 1 |
| Emergency contacts | 1 | 13 | 1 | 0 |
| Health & medical | 15 | 15 | 0 | 0 |
| Immunization | 15 | 69 | 13 | 0 |
| Daily routines | 12 | 12 | 0 | 0 |
| Getting to know your child | 13 | 13 | 0 | 0 |
| Custody & legal | 2 | 2 | 0 | 0 |
| Tuition & payment | 6 | 6 | 0 | 0 |
| Review & sign | 6 | 6 | 0 | 0 |
| **total** | **86** | **169** | **14** | **3** |

Plus 32 obligations, all resolved at Review & sign. Two sections carry nearly all the compression —
Immunization (69 destinations behind 15 facts) and Emergency contacts (13 behind 1). The rest are
already one destination per fact, which is where the remaining conversational work actually is.

---

## 11. Certification

`tests/pos/realEnrollmentPacketCertification.test.ts` — 34 assertions over the real corpus.

| required proof | how it is asserted |
|---|---|
| packet intake | three sources composed, each by the reader its format deserves |
| 3 source artifacts / 4 logical Formsite artifacts | reader list and artifact titles asserted exactly |
| 182 source destinations reconciled | `total_raw` 182 → `total_reported` 180 → `total_accounted` 180, per source |
| AcroForm geometry preserved | 85 CIS destinations, every one with page and bbox |
| Formsite controls preserved | 95 destinations, 79 required, options, stable identity |
| handbook produces no fake fields | 0 destinations, ≥9 acknowledgements, no `scalar_field` |
| discovery over every reader | Slice 1's negative control, still green |
| cross-artifact correlations proposed | 3, all `canonical_concept_key`, all `proposed` |
| signatures artifact-scoped | 6, each in exactly one artifact, none reaching another |
| signature dates linked where proven | 6 / 6, no date claimed twice, evidence named |
| obligations correlated without unsafe merge | 6 verbatim merges; "By signing below, I agree" × 3 stay distinct |
| no automatic publication | every proposal, correlation and obligation `proposed` |

**The reconciliation checker fails on loss and on duplication**, and has positive controls: strip a
section and destinations go missing; duplicate one and it reports them counted twice, unbalanced,
with a warning.

**Corpus.** All three fixtures are blank/redacted public documents, sha256-pinned in the test. The
CIS carries no field values. The capture's two hidden platform session tokens (`GenId`, `EParam`) are
replaced with `REDACTED-FOR-FIXTURE`; they are not data any reader looks at.

**No regression.** Failing-test list across `tests/pos`, `tests/forms`, `tests/fields` is identical to
the pre-Slice-1 baseline — 45 before, 45 after, none new, none fixed. Brokered typecheck `rc=0`.

---

## 12. Remaining blockers before operator review and publish

1. **`packet_source` import intent is still `available: false`.** The reasoning layer composes N
   sources; the operator flow that attaches three documents to one case does not exist yet. Today the
   packet can only be composed programmatically.
2. **A wrong canonical binding is being proposed.** `physician.phone` and `dentist.phone` are
   correctly separate facts, but the matcher resolves them by attribute and proposes the canonical
   *person* phone field for both. An operator would reject it; it should not be offered.
3. **G7 — shape-independent binding.** `child.name` is one fact across the packet, but the CIS wants
   last / first / middle and the hosted form wants one composite. `child.middle_name` does not exist.
   Nothing can populate both shapes from one value yet.
4. **Choice options survive the draft but not a publish.** `DraftFormFieldType` has no `select`, so a
   hosted form's declared options ride alongside the field rather than becoming a real choice on the
   published form. This is the one place a web source's best evidence is still degraded.
5. **Concept lineage carries labels, not destination ids.** Two destinations in different artifacts
   that share a label ("Today's Date:") cannot be told apart by label-keyed accounting. Coverage is
   measured destination-side to work around it; the fix is to carry destination ids on concepts.
6. **The CIS's artifacts are named "Page 1" and "Page 2".** Accurate, unhelpful. The front is a
   vaccination attestation and the back an exemption attestation; nothing in the source says so.
7. **G9 — validation.** Unchanged.
8. **The parent-question denominator is still not final.** 86 facts is the packet's semantics, not
   the participant's workload; `ask`-kind depends on tenant state, and Slice 3's vocabulary decisions
   will collapse more.

---

## 13. Reproducing

```
cd docs/audits/active/real-enrollment-certification-v1
node slice-2-classification-check.mjs     # 75 unbound facts, each in exactly one bucket

cd web && npx vitest run tests/pos/realEnrollmentPacketCertification.test.ts
```

Vitest in this worktree needs an arm64 node (`PATH=$HOME/.nvm/versions/node/v22.21.1/bin:$PATH`);
`/usr/local/bin/node` is x64 and rolldown ships only the arm64 binding.
