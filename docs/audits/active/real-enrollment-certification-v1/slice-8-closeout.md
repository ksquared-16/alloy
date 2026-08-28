# Operator Review UX Convergence · closeout

**Publication readiness: NO** — and not because of the UI. The §8 preflight found that publishing
today would drop **every document requirement** in the packet. Details in
[`slice-8-obligation-preflight.md`](slice-8-obligation-preflight.md).

The presentation work is complete and verified in the browser on the real packet.

---

## 1. Before / after

Screenshots in [`evidence/`](evidence/), captured signed-in at 1440×900 against the real
School of Enrichment case.

| | Before | After |
|---|---|---|
| Default view | one list, 84 rows | **Needs review — 26 rows** |
| Headline | a strip of 11 raw counts | **Alloy handled 58** · **Needs your review 26** · **Nothing here blocks publishing** |
| Navigation | scroll | 11 section chips with counts |
| Row | title + chips + a paragraph + provenance | title + reason chip + ownership line + one consequence |
| Audit | always on, in every row | one click away, on every row |
| Bulk action | "Accept 28 high-confidence" | "Accept 28 safe to accept" |

`A-default-needs-review.png` · `B-financials.png` · `C-derived.png` · `D-existing.png` ·
`05-detail.png` (expanded audit) · `06-laptop.png` (1280) · `E-after-bulk.png`

## 2. The section model

Membership over one result set, using the settled category vocabulary — no second taxonomy:

| Section | Categories | Live count |
|---|---|---|
| **Needs review** (default) | computed | 26 |
| Existing data | `existing_fields`, `new_fields`, `collections` | 18 |
| Relationships | `relationships` | 5 |
| Safeguarding | `safeguarding` | 3 |
| Health / held | `held_for_owner` | 5 |
| Financials | `financial` | 6 |
| Derived by Alloy | `derived` | 5 |
| Form responses | `form_responses`, `static_content`, `output_copies` | 3 |
| Acknowledgements | `acknowledgements`, `upload_requirements` | 13 |
| Signatures | `signatures` | 3 |
| All | everything | 84 |

Counts reconcile exactly: 87 section memberships − 3 safeguarding rows that are also in Needs review
= **84**, which is All, which is every proposal.

## 3. Default operator workload

**26 decisions**, out of 84 concepts. Alloy handled 58.

By reason, so twenty-six rows sort themselves by eye rather than reading as one repeated paragraph:

| Reason chip | Count |
|---|---|
| Owner undecided | 25 |
| Sensitive restriction | 3 |
| Unsupported type | 2 |
| Ambiguous grain | 1 |

(Full-packet figures across all three artifacts: 31 needing review of 127.)

## 4. Concise rows, across eight ownership types

| Source concept | Ownership | Consequence |
|---|---|---|
| Routing number… | Financials · Bank credential | Sent directly to the payment provider. Not stored as an Alloy field. |
| Non-Refundable Annual Material Fee | Financials · Billing | An amount the school sets. Owned by your rate plans, not by this family. |
| Account Holder Full Name | Financials · Payment setup | Needed while payment is set up. Not kept as an Alloy field. |
| Custody or visiting arrangements | Safeguarding · Restriction | Creates a reviewable restriction with evidence. Nothing becomes active until approved. |
| Student age upon enrolling | Derived by Alloy | Calculated from date of birth and the enrolment start date. No field needed. |
| Today's Date | Derived by Alloy | Recorded when the form was submitted. No field needed. |
| Hib (dose schedule) | Health · Held | Collected for this enrollment; durable health ownership lands in the Health foundation. |
| Child's last name | Child · Child first name | Uses the existing canonical value. |
| Primary Physician Name | Relationship · Physician | Links or creates a person. Not stored as a field on the child. |
| Tuition Agreement | Requirement · Acknowledgement | Every guardian must acknowledge it. |
| Parents' or guardians' names | Needs an owner | Owner undecided — durable ownership not settled. |

Financials was the copy that mattered most: three different reasons had been reading as one label.
A school's annual fee is not payment setup, and a routing number is not a fee.

## 5. Filters are presentation only

- One `discovery.proposals` array; sections are a **membership index** built in a single `useMemo`.
- **Zero network calls** across eight section switches, measured in the browser.
- ~180 ms per switch; 1,417 ms for all eight.
- Each tab's count equals the rows it renders — verified tab by tab.
- A proposal in two sections is the *same object*, so its decision state is shared.

## 6. Bulk accept remains ownership-safe

Proven live, not by unit test alone: on **Needs review**, 26 pending items before pressing
"Accept 28 safe to accept" — **26 pending after**. Not one review-required item was swept in.
`isBulkAcceptSafe` requires both a confident matcher and an ownership conclusion no person needs to
see, and the count and the action share one predicate.

## 7. Obligation-publication preflight — **FAILS**

See the full report. In short:

- Signatures project exactly (6 → 6); `initials` stays distinct from `signature`.
- Static content projects correctly; responsibility differs correctly by type (every guardian vs one).
- **All 4 upload obligations project to 0 upload requirements.** The projection emits a `file_ref`
  only for a *section* dispositioned `upload`, and the packet's document requirements are **prose
  clauses**. Publishing today produces a packet that never asks for the immunization record while
  the review reports four document requirements found.
- Acknowledgement labels collapse: 18 requirements, 16 distinct labels, three of them literally
  "I acknowledge the above".
- `boolean → acknowledgement` types four CIS exemption checkboxes as acknowledgements.

Reported, not redesigned — this slice's boundary forbids changing requirements. The narrowest fix is
named in the report.

## 8. Publication readiness: **NO**

One blocker, and it is not presentational:

> A packet that displays four document requirements and asks the family for none of them implies
> behaviour it does not have. That is precisely what the publish gate exists to prevent.

Everything else is ready. When the upload projection is fixed, nothing in this slice needs revisiting.

## Defect found and fixed during browser acceptance

The review kept a **private copy of the category switch**, and the copy had fallen behind:
`financial_payment` and `derived_value_system` rendered correctly inside "All" while their own tabs
read zero and were hidden entirely. A duplicated taxonomy does not disagree loudly — it disagrees
where nobody is looking, and here it hid the one group where a wrong answer stores a credential.
The component now imports the canonical `categoryFor`, and a control asserts every disposition is
reachable through a section other than "All".

It took opening the page to find it. The unit tests were green throughout.

## Boundary

Unchanged: packet denominator (180/86/32), ownership routing, canonical destinations, safeguards,
Financials boundaries, Health holds, requirements, Participant Runtime. Nothing published.
