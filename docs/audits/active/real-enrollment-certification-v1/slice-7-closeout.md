# Slice 7 — Ownership Routing Before New-Field Creation · closeout

**Publication readiness: YES.** False canonical-field proposals: **0**. Ownerless concepts: **0**.

Branch `agent/claude/4-enrollment-phase2-participant-anchor`, base staging `73d9872c1`, clean tree,
nothing pushed, nothing published.

---

## The rule, and where it lives

> **`NEW_CANONICAL_FIELD` is an affirmative ownership conclusion, never the fallback for
> "nothing else matched."**

The importer had become good at understanding the **question** and was still guessing at the
**owner** — and from inside the code those two failures look identical: nothing matched, so propose a
field. That is how a bank routing number became a `customer` text field.

`lib/pos/discovery/ownershipRouting.ts` decides ownership at the one point where a concept used to
become a field. Its **default is `HELD_UNKNOWN_OWNER`**, and `CANONICAL_FIELD` is reachable only by
positively resolving a destination that already exists.

**The rule is structural, not a rule list.** A routing that is not `CANONICAL_FIELD` returns a held
proposal *even when no branch handles its owner*. That mattered within the hour: a missing
`RELATIONSHIP` branch fell through and turned a guardian's name into a `person.name` field mid-slice
— the exact behaviour being removed, reappearing through a gap in the handler rather than a gap in
the doctrine. A rule list would have shipped that.

The router delegates rather than re-deciding: `ownershipHoldFor`, `safeguardingConceptKind`,
`suggestFieldBinding`, the child-profile manifest, `systemFieldRegistry`. It is a routing pass, not a
second proposal engine.

## What the real packet did

**58 proposed new fields → 0.** Nothing was dropped to get there: 180 destinations, 86 merged facts
and 32 obligations are unchanged, and the reconciliation checker still fails if any destination
disappears or is counted twice.

| Disposition | Slice 6 | Slice 7 | Why |
|---|---|---|---|
| New canonical field | 58 | **0** | the fallback is gone |
| Bind to an existing canonical field | 9 | **21** | Slice 5 settled twelve child-profile facts and seeded them for every org — the importer could not *reach* them |
| Held: unknown owner | — | **28** | ownership genuinely undecided; reviewable, never durable |
| Held: Health | 10 | **14** | widened to clinical facts (general health, complications at birth, serious illness/hospitalisations, a bee-sting reaction) |
| Derived by Alloy | — | **8** | execution dates ×6, age, sibling existence |
| Financial / payment | — | **6** | credentials, setup inputs, billing configuration |
| Relationship | 5 | 5 | unchanged |
| Safeguarding | 3 | 3 | Slice 6 preserved |
| Form-only response | 4 | 4 | unchanged |
| Acknowledgements / signatures / uploads | 28 / 6 / 4 | 28 / 6 / 4 | unchanged |

### The finding behind the biggest number

Slice 5 created twelve durable child-profile destinations, seeded them into every org, and derived
them across seven surfaces. The importer still proposed **new fields beside them**, because
`suggestFieldBinding` had never heard of them. "Eating habits", "Special diet", "Favourite foods",
"Toilet habits", naps and temperament were all one edit away from being duplicated permanently.

The fix keeps Slice 5's property: each field declares its own `match_terms` **in the manifest, beside
the field**, so a newly settled fact becomes routable by adding one row. Those terms are the field's
vocabulary, not a school's phrasing — "toilet habits" and "toileting routine" are one routine, and
`Favourite foods` and `Favorite foods` are one fact.

## §3 — the cases the brief named

| Concept | Was | Now | Reasoning |
|---|---|---|---|
| Student Age Upon Enrolling | `customer_member` text | **DERIVED_SYSTEM** | DOB + the enrolment start date. Stored, it is wrong by the next birthday and two places disagree about the child's age |
| Today's Date / Date / Date Fecha ×3 | `person` / `customer_member` field | **DERIVED_SYSTEM** | `suggestFieldBinding` *already* classified these as submission dates; discovery discarded the answer because it carried no `field_source`, and proposing a field is what happened next |
| Student's first day | `customer_member` text | **binds `enrollment.start_date`** | the registry row already existed; a child-profile copy would be a second answer |
| Does your child have siblings? | `customer_member` text | **DERIVED_SYSTEM** | household membership already answers it, and a stored answer goes stale the moment a family adds a child |
| 6 financial concepts | `customer` / `person` fields | **FINANCIAL_PAYMENT** | see [`slice-7-financial-ownership.md`](slice-7-financial-ownership.md) |
| Health/clinical concepts | generic child text | **HEALTH held** | the accepted contract, extended to clinical facts |
| Safeguarding | — | unchanged | Slice 6 preserved; no safeguarding concept can fall back to a field |
| Consent / exemption | — | unchanged | explicit holds preserved |

## §4 — challenging the remaining proposals

After routing, **no proposal remains that claims durable Field System truth**, so the per-field
justification table has no rows. The profile and routine concepts the brief listed split three ways:

- **Settled and bound** (12): diet, eating habits, favourite foods, foods refused, toileting, naps,
  temperament, plus preferred name, gender, allergies note, medical notes, special instructions.
- **Blocked on TIME** (2): bedtime, wake time — see below.
- **Held, undecided** (27 distinct): developmental history, therapy participation, accommodations,
  social relationships, fears, comfort, anger, behaviour management, goals, prior schooling, "anything
  else". These describe the child, and describing the child is not the same as being durable profile
  truth Alloy should own. They are held rather than guessed.

Held rows keep an explicit operator escape hatch: **"Make this a durable child field"** as a
single-row alternative, labelled *"operator decision — Alloy did not conclude this"*. Unknown can
become a field only by a deliberate human act, never by inference and never by bulk accept.

Four concepts are held with a note worth reading: `Module`, `Sp`, `Polio`, `Religious` are AcroForm
checkbox names from the CIS exemption page that carry no vocabulary at all. Guessing them would be
the school-specific lookup this program has refused since Slice 1; they are correctly held. A fifth,
`subject_line`, is an artifact of the HTML capture appearing as a fact — a small importer defect,
also correctly held.

## §5 — TIME

**Decision: not adopted, and no workaround shipped.** Bedtime and wake time are held with
`blockedOn: "TIME_ADOPTION"` and an explicit basis: *"A text field here would accept 'whenever' as a
bedtime."* Slice 5's ratchet (`tests/forms/timeTypeAdoptionRatchet.test.ts`) still enforces
all-or-nothing adoption across the seven surfaces, with the three silent failures asserted by name.
The publish does not require TIME, so the type system was not touched.

## §6 — before / after in the operator review

| Before | After |
|---|---|
| "50 New fields proposed" | ownership groups, exceptions first |
| Opened with *Existing data*; exceptions buried | opens with **Needs an owner**, then Safeguarding, Financials, Health |
| Held, safeguarding and financial groups had **no place on the page at all** — `CATEGORY_ORDER` omitted them | every group renders |
| "Accept 28 high-confidence" | "Accept N safe to accept" |

No new chrome: same strip, honest labels, ordered by what only a person can decide. The subtitle now
says a new field appears **only where Alloy concluded it owns durable truth**.

## §7 — bulk-accept safety

Two independent agreements are required, and either alone is insufficient: the matcher is confident
**and** the ownership conclusion is one a person need not see. `bulkAcceptSafety.ts` also uses an
allowlist, so a disposition invented later is excluded by default.

**Proven:** every financial row is refused at 99% confidence. `create_proposed_field` is excluded
outright — creating durable vocabulary deserves one person reading one row, however sound the
conclusion. Count and action share one predicate, so the button can no longer offer 28 and accept 19.

For the real packet: **39 bulk-safe, 76 needing a person.**

## §8 — the re-run

180 raw → 180 normalized destinations → 86 merged facts + 32 obligations (22 acknowledgements,
6 signatures, 4 uploads, 3 of them typed as documents). Unchanged from Slice 6 — nothing was dropped.

**Ownership at publish, distinct concepts:**

| Ownership | Count |
|---|---|
| `HELD_UNKNOWN_OWNER` | 27 |
| `CANONICAL` | 22 |
| `HELD_PENDING_HEALTH` | 17 |
| `ARTIFACT_SPECIFIC` | 14 |
| `DERIVED_SYSTEM` | 8 |
| `FINANCIAL_PAYMENT_HELD` | 6 |
| `RELATIONSHIP` | 5 |
| `PROCESS_SCOPED_FOR_CERTIFICATION` | 4 |
| `DOCUMENT` | 3 |
| `HELD_PENDING_REQUIREMENT_EXCEPTION` | 1 |
| `HELD_PENDING_CONSENT` | 1 |
| **`OWNERLESS`** | **0** |

`CANONICAL` rose 10 → 22 and `PROCESS_SCOPED` fell 61 → 4, and both moves are the same event: 57
unapproved new-field proposals stopped existing. Twelve became real bindings; the rest became held
with a named reason.

## §9 — publication gate

| Disposition | Concepts |
|---|---|
| `CAN_PUBLISH_PROCESS_SCOPED` | the 27 undecided, the 4 form-only, the 8 derived, the 2 TIME-blocked |
| `CAN_PUBLISH_ARTIFACT_SCOPED` | 14 acknowledgements/signatures/static content |
| `HELD_AND_EXCLUDED` | 17 Health, 6 Financial, 1 Consent, 1 requirement exception — collected, never durable |
| `BLOCKS_CERTIFICATION` | **none** |

**0 false canonical-field proposals.** Unknown ownership cannot publish as a field: it has no
`proposed_field` to publish, and the operator alternative is a single-row human act.

## §10 — browser proof: needs your session

Server is up on **3014**; sign-in requires your identity, so I stopped at the steps.

    http://localhost:3014/login

Sidebar → **Processing** → **Import document** (all three from `web/tests/fixtures/processing/`:
the handbook PDF, the Oregon CIS PDF, the `…capture.html` hosted form) → **"Analyse as one packet"**.
Processing is a workspace modal, so there is no deep link. First load is 15–25s of `next dev`
compilation, not a performance defect.

The ten rows you asked to see:

| What | Where |
|---|---|
| Existing DOB | *Existing data* — binds `customer_member.dob` |
| Physician relationship | *Relationships* — "A linked person" |
| A legitimate new profile field | **There is none, and that is the result.** The closest row is *Special diet* under *Existing data* — a durable child fact that now **binds** the destination Slice 5 created instead of duplicating it |
| Health-held concept | *Owned elsewhere in Alloy* — e.g. "Serious illness and/or hospitalizations" |
| Safeguarding restriction | *Safeguarding* — rose chip, 3 rows |
| Routing / account number | *Financials & payments* — violet chip, "Financials owns this" |
| Derived age / today value | *Alloy already knows these* — "Student Age Upon Enrolling", "Today's Date" |
| Form-only response | *Form responses* |
| Acknowledgement | *Acknowledgements* — 28 |
| Signature | *Signatures* — 6 |

Please confirm the summary reads as ownership decisions rather than guesses, and that the violet
Financials rows offer nothing that could create a field.

## Publication readiness: **YES**

### The exact proposed first certification publish

- **Packet:** School of Enrichment admissions packet — 3 sources, 4 logical artifacts, 180
  destinations, 86 facts, 32 obligations.
- **Accept at publish:** the **22 canonical bindings**, the **5 relationships**, the **3 safeguarding
  proposals**, and all **32 obligations** (22 acknowledgements, 6 signatures, 4 uploads).
- **Publish as collected-but-not-durable:** 27 undecided, 8 derived, 4 form-only, 2 TIME-blocked.
- **Do not accept:** the 17 Health, 6 Financial, 1 Consent and 1 requirement-exception holds.
- **Create zero new fields.**
- **After publish:** no safeguarding restriction becomes active until approved through
  `crm.customers.safeguarding.manage`; no payment credential is stored anywhere in Alloy.

The honest sentence to publish it under:

> Every question in this packet has an owner. Twenty-two answers update records Alloy already keeps.
> Thirty-one are collected as form answers because no one has yet decided they should be permanent,
> and Alloy does not pretend otherwise. Eight need no answer stored at all — Alloy already knows
> them. Six belong to payments and are never kept here. Seventeen wait for the health record Alloy
> has not built yet.

## Boundary

Not built: H1–H4, Consent, requirement exceptions, Financials/payment storage, Safeguarding
redesign, conversation batching. Participant Runtime untouched. No routing or account number is
stored anywhere. Nothing published.

**Stopping here.** The next action is your approval → first real certification publish.
