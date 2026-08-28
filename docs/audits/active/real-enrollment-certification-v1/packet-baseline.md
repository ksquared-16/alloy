# Real Enrollment Certification V1 — packet baseline

**Program:** Real Enrollment Certification V1
**Status:** inspection complete — no implementation started
**Date:** 2026-08-24
**Packet:** School of Enrichment, Inc. (Bend, Oregon) — 2026–2027 admissions packet

This is the measured characterization of a real enrollment packet. Every number below is
reconciled against extraction output, not estimated. The reconciliation script proves the
semantic inventory accounts for exactly the destinations the extractors found.

---

## 1. The packet

| # | Document | Form | Pages | Raw destinations |
|---|----------|------|-------|------------------|
| A | Family Handbook 2026–2027 | flat PDF, no AcroForm | 23 | 0 |
| B | Oregon Certificate of Immunization Status (CIS), bilingual EN/ES | fillable PDF, AcroForm | 4 (2 fillable + 2 instruction) | 85 |
| C | "Admissions Packet" — hosted Formsite web form | HTML | 3 screens | 97 |
| | **Total** | | **30** | **182** |

Document C is four artifacts inside one submission: Classroom Application (contact +
emergency contacts + health/developmental history), Tuition & Enrollment Agreement,
Parent Handbook Acknowledgement, and Direct Payment (ACH) Authorization.

Document A is a **reference** artifact — zero fillable destinations. Its page 23
("Parent Authorizations") carries seven authorization clauses that document C repeats
**verbatim** inside the Tuition & Enrollment Agreement.

---

## 2. Baseline

```
documents                                    3  (2 PDF + 1 hosted HTML form)
pages                                       30  (23 handbook + 4 CIS + 3 form screens)
raw fillable/write-in destinations          182
unique semantic facts                       113
repeated semantic facts (>1 destination)     23
facts already represented canonically        30  (+5 canonical-composite)
facts with no canonical binding               78
conditional questions                         6  (behind 6 gate questions)
acknowledgements                              9
signatures                                    6
document uploads / evidence requests          1
participant/child grain                      54
household grain                              41  (household 12, guardians 10,
                                                  emergency contacts 12, account holder 7)
recipient/signer grain                       15
org/system supplied                           3
```

## 3. Compression

```
raw destinations                            182
unique semantic needs                       113   (38% below raw)
parent-supplied needs                        94   (48% below raw)
  · already known → confirm once              9
  · genuinely missing → collect              85
needs asked unconditionally                  88   (52% below raw)
needs behind a gate (typical parent: 0–2)     6
artifact-specific signatures                  6
acknowledgement decisions                     9
```

**182 destinations → 88 unconditional questions.** The bulk of that compression is the
immunization record: **69 destinations collapse to 13 semantic needs** (a dose *schedule*
per vaccine, not 5 independent date fields).

The "already known → confirm" figure of 9 assumes an Alloy tenant that already holds child
identity, guardian 1 contact, household address, start date and allergies from the
preceding lead/inquiry — the realistic Enrollment-time state under the certified
Participant Runtime. It is an assumption about tenant state, not a measured property of
the packet.

### Worst repeated facts

| Destinations | Fact |
|---|---|
| 16 | `imm.other_vaccines` (8 name+date rows) |
| 10 | `child.full_name` (4 Formsite composite + 6 CIS last/first/middle across 2 pages) |
| 7 | `imm.exempted_vaccines` |
| 5 each | DTaP / Tdap / Polio / MMR / HepB / HepA / Hib dose dates |
| 4 | `guardian1.name` |

---

## 4. Natural section clustering

The packet clusters itself. These are **deterministic** sections derived from the needs,
not an AI grouping:

| Section | Needs | Destinations |
|---|---|---|
| About your child | 4 | 16 |
| Family & contact information | 13 | 17 |
| Emergency contacts & authorized adults | 12 | 12 |
| Health & medical | 15 | 15 |
| Immunization record | 13 | 69 |
| Daily routines | 12 | 12 |
| Getting to know your child | 14 | 14 |
| Custody & legal | 4 | 6 |
| Tuition & payment | 7 | 7 |
| Review & sign | — | 9 (6 signatures + 3 dates) |

"Getting to know your child" (14 open-ended free-text needs: personality, fears, comfort
strategy, anger expression, favourite activities, goals) is the one block where
conversational packaging would plausibly earn its keep. Everything else is typed and
deterministic.

---

## 5. Gaps found, classified

Measured against the existing importer (`lib/pos/processingCase/**`) by running the real
documents through it.

### G1 — importer/document-understanding: AcroForm and Configuration Discovery are mutually exclusive

`chooseDraftForCase` returns early on the AcroForm branch. Configuration Discovery — the
stage that proposes acknowledgements, relationship groups, upload requirements and
canonical bindings — runs **only** on the positional-layout branch.

Measured on the CIS: the AcroForm branch yields **85 exact fields with page + bbox** and
**no configuration discovery at all**. Forcing the layout branch instead yields 14 fields,
11 of which are junk lifted from the instruction pages ("Contact information", "Exemptions",
"Información de contacto"). The packet's most machine-readable document gets the least
semantic understanding.

*Reference:* `lib/pos/processingCase/formDraft/buildFormDraftForCaseSafe.ts` — AcroForm
return at the PRIMARY branch; `discoverConfiguration` only in the SECONDARY branch.

### G2 — importer: no HTML / hosted-form ingestion

`ProcessingSourceFormat` supports `pdf | docx | doc | png | jpeg | heic | txt | csv`.
HTML is `unsupported`. Document C — **97 of 182 destinations, 53% of the packet** — cannot
be imported at all today. Its markup carries labels, required flags, select options and
conditional structure that are strictly better signal than any PDF heuristic.

*Reference:* `lib/pos/processingSourceCapabilities.ts`.

### G3 — importer: multi-document packet intake is explicitly unavailable

The `packet_source` import intent is declared `available: false` — *"Coming soon — packet
intake is not available in V1."* Each document imports as an independent Processing Case.
Nothing correlates `child.full_name` between the CIS and the Formsite form, which is
precisely where the packet's 23 repeated facts live.

*Reference:* `lib/pos/processingImportIntent.ts`.

### G4 — importer/document-understanding: reference documents produce false fields

The handbook has **zero** fillable destinations. Layout detection produced **40 sections**
with correct titles — genuinely good structural reading — but also proposed **8 scalar
fields** from prose ("All students please bring", "Other health considerations"). The
correct output for a reference document is 0 fields and 1 acknowledgement artifact.

Discovery did correctly flag three sections as `acknowledgement` disposition (Tuition
Agreement, Toilet Learning, Parent Authorizations).

### G5 — importer: acknowledgement granularity and cross-document clause dedup

Handbook p23 contains **7 distinct authorization clauses** (medical treatment, care and
equipment, off-premises, hold harmless, photo release, parent directory, terms). Discovery
proposed **one** `acknowledgement` concept for the whole section. Document C repeats the
same 7 clauses verbatim; nothing detects that they are the same clauses.

### G6 — canonical field/binding: 69% of the packet has no canonical binding

78 of 113 facts have no canonical Alloy field. `suggestFieldBinding` proposed a binding for
**16 of 85** CIS fields (19%). Entire domains are absent:

- **Immunization schedule** — every dose date, exemption reason, exemption document, and
  the vaccine-name/date rows. This is a first-class childcare compliance concept, not a
  form-specific field.
- **Health providers** — physician name/phone, dentist name/phone.
- **Child routines** — eating, diet, foods, toileting (×4), naps (×2), bedtime, wake time.
- **Behavioural profile** — personality, fears, comfort, anger expression, social
  relationships, plays alone, reaction to strangers, favourite activities.
- **Banking/ACH** — institution, city, state, account type, routing number, account number.
- **Custody & legal** — custody arrangements, restraining order.
- **Employer address** (employer itself is canonical; its address is not).

### G7 — canonical field: repeated-fact identity needs shape-independent binding

`child.full_name` populates 10 destinations in two incompatible shapes: one composite
string (Formsite ×4) and separate last/first/middle (CIS ×6). Alloy has
`child.first_name` / `child.last_name` but **no `child.middle_name`**. The same problem
appears for addresses: 4 packet destinations want one composite
"Address, City, State and Zip" string; Alloy stores four canonical parts.

Dedup must be on the **fact**, with the destination choosing its own rendering — the same
principle already proven for dates in the Synthetic Participant Runtime certification.

### G8 — artifact rendering/signature: the CIS's mandatory signatures type as text — CONFIRMED

The Oregon CIS carries its signature lines as AcroForm **text** fields. `mapFieldType`
matches `/\bsign(ature)?\b/` against the field name; the trailing `\b` fails on a
digit-suffixed name. Measured on the real document:

```
text        Signature1        → label "Signature1"
signature   Signature update  → label "Signature Update"
text        Signature2        → label "Signature2"
```

`Signature1` (front, parent attestation) and `Signature2` (back, exemption attestation)
are the two **mandatory** signatures on the form. Both would be filled as typed text
rather than signed. Only the optional re-sign line types correctly.

*Reference:* `lib/pos/processingCase/structure/pdfAcroForm.ts` → `mapFieldType`.

### G9 — validation: the packet demands typed rules Alloy must not guess

- Routing number — 9 digits, ABA checksum. Account number — institution-specific length.
- Dose dates must be **ascending within a vaccine** and **after date of birth**.
- "Student Age Upon Enrolling" is derived from DOB and first day — it must never be asked.
- Bedtime / wake time are times, not free text.
- The gender question is a 3-option enumeration (Male / Female / Gender-diverse).

### G10 — conversation-planning: 88 unconditional needs is still too many for one conversation

The deterministic clustering in §4 gives nine natural sections. The 14-need
"Getting to know your child" block is the bounded set where AI packaging of *how to
discuss* would help. The deterministic runtime stays authority over *what* the needs are
and *whether* they are satisfied.

### G11 — process/configuration: conditional artifacts and re-signature over time

Six signatures across four artifacts. `sig.cis_exemption` exists **only** if the parent
takes the exemption path. `Signature update` on the CIS is a **re-sign requirement** that
recurs whenever the immunization record changes. Enrollment requirement binding must be
able to express a conditionally-required artifact and a recurring attestation.

### G12 — tenant-specific configuration, not parent facts

$550 annual material fee ($450 sibling), $50 application fee, $25 late/return fee,
$20 late-pickup per 15 min then per 5 min; priority enrollment deadline 2026-01-26, open
enrollment 2026-02-02, open house 2026-04-02; ratios, hours, capacity 75, ages 30 months–6
years. These are org configuration.

---

## 6. What the packet did NOT demonstrate a need for

Recorded so we do not build against hypotheses:

- No repeating collection beyond a **fixed 3** emergency contacts and 8 vaccine rows.
- No branching deeper than one level — every conditional is a single gate → one follow-up.
- No cross-child logic; the packet is single-child, with siblings captured as free text.
- No payment capture beyond ACH details on paper.
- No multi-signer flow — one parent signs all four artifacts.

## 7. Reproducing these numbers

```
node docs/audits/active/real-enrollment-certification-v1/packet-reconcile.mjs
node docs/audits/active/real-enrollment-certification-v1/packet-metrics.mjs
```

`packet-inventory.mjs` is the semantic inventory: one row per fact, with every raw
destination it must populate, its grain, its canonical status and its ask kind.
`packet-reconcile.mjs` proves it accounts for exactly 85 CIS + 97 Formsite = 182
destinations — the counts the extractors actually produced.
