# Enrollment financial bridge V1 — closeout

**Run:** `erun_947084bc61ec8b61` · **Lane:** `lane_2cea84351d90` · Certified against the mounted application and the real local stack.

Discovery (`ENROLLMENT-V05-FEE-MULTIPAYER-MULTICHILD.md`) measured the gap: `lib/enrollment`
and `lib/pos` imported nothing from `lib/financials`. This slice builds that wire and nothing else.

---

## A. Outcome

`ADMISSIONS_V12_PUBLISHED_ENROLLMENT_FINANCIAL_BRIDGE_V1_COMPLETE` — **with one named exception.**

Per-child fees are certified end to end. **Per-family fees are blocked** by a disagreement inside
Financials, reported rather than worked around (§D.4). Cases F and G are proven by unit contract but
not live, for want of subsidy and payment fixtures (§J).

## B. Admissions v12 closeout

| | |
|---|---|
| Form | `57507992-db0e-4ceb-b4ba-ba2d9bc0155f` (`admissions_v12`) |
| **Published version** | **v2 · `ee75bbc6-bfec-41a8-821f-a8a427afe0cf` · 2026-09-25T17:53:55.281Z** |
| Shape | 8 sections · 58 questions · 6 conditionals · **0 supplied values** |
| Fee | **Removed.** Not repointed from `material_fee` to `materials_fee` |
| Tuition section | `text_block` + `signature` only — assent is admissions information; the amount is not |
| Sibling gate | Intact: required Boolean, collection conditional at `min: 1`, gate ordered **before** the collection |

Published through the Studio's own Republish control. A prior report called `80e2b3c2` the draft;
it was in fact published v1, and the correction is recorded here.

## C. Fee configuration contract

**No new vocabulary was invented.** `RequirementScope` already carried the grain, so there is no
`per_family | per_enrolling_child` enum anywhere in this work:

| Director's term | Existing vocabulary used | Billable source produced |
|---|---|---|
| Per family | `scope: "record"` | one `{ type: "customer", id }` |
| Per enrolling child | `scope: "each_child"` | one `{ type: "enrollment_agreement", id }` per child |

The requirement itself is a new **authorable kind** on `requirements_v1`:

```jsonc
{ "requirement_id": "enrollment_fee", "kind": "financial",
  "charge_template_key": "registration_fee",
  "level": "required", "scope": "each_child",
  "timing": "stage_exit", "enforcement": "blocking" }
```

`stageRequirementsV1` sets an explicit bar — a kind is authorable only when something canonical can
**prove** it — and refuses `document`, `consent`, `acknowledgment` and `signature` by name for
failing it. Money passes that bar more comfortably than anything else in the platform, so `financial`
joins `field`, `form`, `packet` and `work`. The compiler located both call sites that had to learn
the kind; one of them, the participant-packet projection, correctly records that a financial
requirement is **not realizable by a packet** — for the same reason `work` is not.

**The reference is a definition, never an amount.** `charge_template_key`, following the
`work_template_key` precedent. An amount on the requirement would be stale the next time a rate,
discount or funding arrangement changed. A guard asserts a planted `amount_cents` never survives
parsing.

## D. Obligation creation

### D.1 Trigger — dueness is a question, not an event

`enrollmentFeeIsDue()` answers: is every **non-financial** requirement resolved (satisfied, excepted,
or merely advisory)? A financial requirement is excluded from its own precondition, because one that
gated itself could never come due.

An event was the tempting shape and is the wrong instrument: it fires once, from one path, and every
other path reaching the same state — resume, replay, a late Processing commit, an operator exception —
must remember to fire it too. Paired with idempotent creation, a question can be asked at packet
completion, at stage completion, on a retry or on an ordinary refresh, and all converge.

### D.2 Draft, then post

`writeTemplateDraftCharge` → `postChildcareCharge`. Posting is what makes a charge collectible —
*"a draft charge owes nothing yet"* — so a fee left in draft would show a family `$0` forever.
Both services are idempotent on the Financials side. `post: false` looks without committing.

### D.3 Idempotency — borrowed, not invented

**No Enrollment ledger exists.** Financials keys a template charge
`tpl:<template_key>:<occurs_on>:<scopeKey>`, deduped within the billable source, with the scope key
forced to the source id. That distinguishes:

| Required distinction | Carried by |
|---|---|
| organization | the org-scoped query |
| charge definition | `template_key` |
| family / account | `customer` billable source |
| child | `enrollment_agreement` billable source |
| Enrollment episode | the agreement (a new episode is a new agreement) |

The one thing Enrollment must supply is a **stable date**: `occurs_on` is part of the key, so
passing "today" would mint a second charge every morning. The caller passes the date the requirement
*became due*.

**Residual collision, recorded rather than papered over:** two episodes falling due for the same
household on the same day against the same definition, at `record` grain, would share a key.

### D.4 The blocker — Financials disagrees with itself about household charges

`writeTemplateDraftCharge` accepts a `customer` billable source **by design**; its own comment names
*"a waitlist fee, a registration fee, a deposit"*. `resolveAllocatableNet` — which the collectible
resolver calls first — refuses it: **"Only an enrolment-backed charge carries responsibility."**

So a per-family fee posts as real money that nothing can position. Measured live: HTTP 500 before
the repair.

**Enrollment does not resolve this in either direction.** Inventing a position would be the second
balance this design exists to prevent; dropping the obligation would hide posted money. The
obligation is reported **without** a position, contributes nothing to any total shown to a family,
and reads `ATTENTION_REQUIRED` — a charge nobody can position needs a person, not a default.

**This is the gap that blocks per-family fees, and it belongs to Financials.**

## E. Readiness contract

Pure. Every figure arrives as an argument, quoted from `resolveFamilyCollectible`.

| State | When |
|---|---|
| `NOT_APPLICABLE` | no fee configured |
| `NOT_DUE` | prerequisites incomplete, or the charge is still a draft |
| `DUE` | collectible > 0, nothing received |
| `PARTIALLY_SATISFIED` | collectible > 0, some money applied |
| `PROCESSING` | collectible 0 because a **submitted claim** suppresses an outstanding balance |
| `SATISFIED` | collectible 0 on its own merits, or the fee resolves to nothing, or Financials reversed it |
| `ATTENTION_REQUIRED` | unresolved variance · unpositionable charge · definition naming no active template |

Two distinctions the certification forced:

- **`PROCESSING` vs `SATISFIED`.** Collectible reaches zero both when money arrived and when a
  governed claim suppresses the balance. Calling the second SATISFIED would tell a family it is
  finished before the agency has paid.
- **A misspelled definition is not a free fee.** `resolvesToZero` briefly carried both meanings, so
  `material_fee` (against a template named `materials_fee`) read as **SATISFIED** — telling a family
  its fee was settled because it could not be priced. `definitionUnresolved` keeps them apart.

## F. Financials parity

The projection holds **no** balance. `gross`, `expectedFunding`, `collectibleNow`, `applied` and
`outstanding` are each quoted field-for-field from `CollectiblePosition`; the only arithmetic is
summing per-child obligations into a family total, which is Enrollment's own question.

**The funding law**, asserted directly: gross $200, expected subsidy $100, collectible $100 — a
family that pays $100 is **SATISFIED**, and Enrollment never waits for a second $100.

## G. Multi-child proof — live

Household `29944d3e-8267-45b7-8dcb-7405060e2573`, two children with active agreements.

| Call | Result |
|---|---|
| per-child, first | `created` ×2 — `020082db` (child `46105cd4`), `a53659a6` (child `e408fa51`) · gross **$36.00** |
| per-child, replay | `skipped_posted` ×2 — **the same two charge ids** |
| per-child, third | same two ids again |
| distinct charges | **2** — never merged, though both fees are $18.00 |

Resolution keys, distinct by agreement:
`tpl:materials_fee:2026-09-25:fa3767f8-…` · `tpl:materials_fee:2026-09-25:43ef5615-…`

Per-family: **blocked** per §D.4.

## H. Correction proof — live

1. Two per-child obligations posted, $36.00 due.
2. Reversal of `020082db` → correction charge `fc53f5d8`, **−1800**, status `posted`.
3. Second reversal → refused: *"has already been reversed by fc53f5d8 … and admits no further
   correction"* — the database's own bound, not a check this slice added.
4. Projection re-read: the withdrawn child reads **SATISFIED**, the family total falls to **$18.00**,
   the remaining child stays **DUE**. Both obligations remain reported.

**A defect this caught.** A correction is its **own charge row**, so netting happens across a cohort;
this projection reads one charge at a time, which is right, and therefore could not see the row that
retired it. Before the fix, a withdrawn child's fee stayed owed **forever** and the withdrawal could
never complete. The bridge now reads Financials' own lineage predicate — a non-void charge whose
`source_charge_id` is this one with `correction_kind: "reversal"` — which is reading a fact, not
recomputing money. Nothing is deleted; nobody pretends the fee was paid.

## I. Security proof — live

| Probe | Result |
|---|---|
| unauthenticated resolve | **401** |
| unauthenticated reversal | **401** |
| authenticated reversal of a charge outside the org | **422 "not found"** — org-scoped, and does not leak existence |
| surviving obligation after the refused attempts | untouched, still `DUE` $18.00 |

## J. What was NOT built

Confirmed absent from this slice: participant checkout · Stripe UI · payer invitations ·
payer-scoped saved methods · new responsibility engine · new subsidy engine · family multi-child
participant envelope · autopay · parent portal changes · **any new ledger**.

Cases proven by contract but **not live**: **F** (funding) and **G-partial** needed subsidy and
payment fixtures this slice was not permitted to build participant UI for; the $200/$100/$100 law and
the none/partial/satisfied readings are asserted as unit contracts. **E** (different child context)
is **not supported by current configuration** — every template carries `service_id: null` and no
location variance, so there is nothing for a per-site fee to resolve differently.

## K. Multi-child future seam — documented, NOT implemented

`Family Enrollment Experience` composes existing child packet sessions. It **does not merge** child
process instances, packet sessions, submissions, artifacts or Processing cases — discovery measured
every one of those as already correctly grained.

What this bridge already provides it:

- **per-obligation child attribution** — `subjectCustomerMemberId` on every obligation;
- **a family aggregate** derived from the per-child positions, never stored;
- **stable ids** — each obligation carries its charge id and resolution key, so one later payment
  experience can settle several children without re-deriving what is owed.

## L. Payer future seam — documented, NOT implemented

`customer_payment_methods` is `customer_id, stripe_payment_method_id, brand, last4, is_default` —
**household-grain, with no payer column**. Payment-method ownership must become payer/person scoped
before saved instruments can safely serve Mom, Dad, Grandma and other eligible payers in one
household. **Do not equate a payment-method owner with a responsible party** — `paymentAttribution`
already keeps payer identity and responsibility identity deliberately separate, and this slice
preserves that by not collecting payment at all.

The next payer slice decides: eligible-payer policy · person-scoped instrument · one-time third-party
payment · saved-method privacy · payer invitations · partial contributions.

## M. Next bounded objective

`FAMILY ENROLLMENT EXPERIENCE + PAYER/PAYMENT METHOD OWNERSHIP` — not started here.

**Recommended predecessor:** close §D.4 first. Per-family fees cannot work until Financials decides
whether a household-sourced charge carries responsibility, and a payer experience built over a
position that cannot be resolved would inherit the same hole.
