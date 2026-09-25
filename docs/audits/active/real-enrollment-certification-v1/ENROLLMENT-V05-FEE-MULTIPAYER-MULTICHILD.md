# Enrollment V0.5 — fee, multi-payer and multi-child integration discovery

**Run:** `erun_42c86bc2de1885a1` · **Lane:** `lane_2cea84351d90` · **Status:** discovery complete; one approved fix landed; nothing published

This is a **measurement**, not a design. Every claim below names the file or the runtime call that
produced it. Where doctrine and runtime disagree, the runtime is reported and the disagreement is
called out. Two questions the run asked cannot be answered by measurement because the thing being
asked about **does not exist yet**; those are marked `ABSENT` rather than guessed at.

---

## A. Conditional requiredness — the one approved fix, landed

**Classification: existing-runtime defect.** Not a missing capability, not a configuration gap.

The schema, the Studio inspector and the participant projection all already supported a conditional
collection. `validateFormPayload` did not: it looped `for (const field of schema.fields)` and
dispatched a `group` into `validateGroupInstances` **before** computing visibility. Measured before
the repair:

| Gate | Entries | Result |
|---|---|---|
| unanswered | 0 | `values.gate: Required field missing` **and** `kids: Expected at least 1 group instance(s)` |
| **No** | 0 | `kids: Expected at least 1 group instance(s)` ← **a family is blocked for answering honestly** |
| Yes | 0 | `kids: Expected at least 1 group instance(s)` |
| Yes | 1 | VALID |
| **No** | 1 stray | **VALID** ← a hidden collection accepted rows |

After the repair (`34320d239`): unanswered → only the gate is owed; No + 0 → valid; Yes + 0 →
blocked; Yes + 1 → valid; No + 1 stray → refused, *"Group is hidden and must be empty on submit"*.

A collection that does not apply cannot be incomplete — and cannot be a hiding place either. Hidden
means **not asked**, and not asked means neither required nor permitted.

Measured against the lane base: **23 failed files / 40 failed tests → 22 / 37**. Fixes three, breaks
none. `tests/forms/conditionalRequiredness.test.ts` (7 cases) is kept as the guard.

## B. Admissions v12 conditional audit

All six conditionals audited for semantic appropriateness. Five were authored from the plan and are
correct — each is a **detail field that follows its own gate**, never a gate without a consequence:

| Gated field | Gate |
|---|---|
| Mailing address (group) | Is your mailing address different from your home address? |
| Please explain the arrangements and who they involve | custody or visiting arrangements |
| Their relationship to your child | legal restraining order |
| Any special naptime needs | nap during the day |
| Which school or daycare, and where? | school or daycare before |

Seven further Boolean questions carry **no** dependent detail (bee sting, therapy, accommodations,
bathroom reluctance, concurrent enrolment, plays alone, behavior management). That is correct as
authored: they are standalone facts, not gates, and inventing follow-ups for them would be design,
not normalization.

**The sixth conditional is new and is the approved one.** `4c1a68684`:

> "Other children in your household" was a party collection with `repeat.min = 0`, which is how a
> Form asks a family to **prove a negative** — a household with no other children answers by leaving
> something empty, and a household with three is told nothing is owed.

Authored through the Studio as an administrator would: a required Boolean *"Do you have other
children in your household?"*, the collection's condition and minimum set from the inspector, and
the gate **dragged above the collection it governs**. Order is contract, not decoration — a
collection revealed by a question the family has not reached yet appears above its own reason. The
guard asserts the ordering, not merely the existence.

Draft is publish-valid (`validateFormSchema` passes): **8 sections, 59 questions, 6 conditionals**.
**Admissions v12 is NOT published.**

### B.1 — A defect found while auditing, and fixed

`7e0d78323`. The tuition section's fee is a **reference**: the Form holds
`supplied_by { source_kind: "charge_template", source_key, resolve_at: "generation" }` and the amount
is read at generation, so a price change never chases a Form. That indirection is right, and it is
also **silent**. The key was authored `material_fee`; this organization's template is
`materials_fee`. Nothing was invalid — it would have published, generated, and shown a family
*"No active charge template named material_fee"* where the amount belongs.

---

## C. Financial capability census

`PRESENT_AND_PROVEN` · `PRESENT_BUT_UNPROVEN` · `PARTIAL` · `ABSENT` · `CONFLICTING`

### C.1 — The Financials domain itself is mature

| Capability | Status | Evidence |
|---|---|---|
| Charge template authoring | **PRESENT_AND_PROVEN** | `chargeTemplates/`; API 200 with 5 active templates (`tuition` $400, `registration_fee` $75, `materials_fee` $18, `field_trip` $40, `late_pickup_fee` $25) |
| Charge instantiation from a template | **PRESENT_AND_PROVEN** | `childcareChargeService`, `chargeLifecycle/chargeLifecycleService`, `financialChargeActions`, `operationalConsumption/`, `charge-templates/simulate` route |
| Billable source model | **PRESENT_AND_PROVEN** | `billableSource.ts`: childcare sources are `enrollment_agreement` (one child) or `customer` (the household) |
| Cross-source household identity | **PRESENT_AND_PROVEN** | `billableSourceHousehold.ts` — *"Deciding whether a payment may answer a charge is a question about those two sources resolving to the SAME household"*; explicitly refuses `payments.customer_id` as *"a convenience column, never a second source of truth"* |
| Responsibility split | **PRESENT_AND_PROVEN** | `resolveResponsibilitySplit.ts` — `percentage \| fixed \| remainder`; resolves to an **explicit party**; leftover recorded as **UNASSIGNED** rather than silently absorbed |
| Expected funding (≠ money) | **PRESENT_AND_PROVEN** | `expectedFundingService.ts` — *"Expected funding is not money. It does not reduce Thread 8 outstanding"* |
| Subsidy / collectible position | **PRESENT_AND_PROVEN** | `resolveFamilyCollectible.ts` — *authoritative outstanding − governed submitted-claim suppression = currently collectible*; authorizations and draft claims do **not** suppress; shortfall surfaces as `unresolvedVarianceCents` **beside**, never folded in |
| Payer identity on a payment | **PRESENT_AND_PROVEN** | `payments.payer_entity_type` / `payer_entity_id`, paired-null CHECK |
| Payment attribution | **PRESENT_AND_PROVEN** | `paymentAttributionService.ts` — *"WHOSE SHARE A PAYMENT WENT AGAINST — explained, never inferred"*; payer identity *"stays deliberately separate from the responsibility identity"* |
| Payment rails | **PRESENT_AND_PROVEN** | SetupIntent/PaymentIntent, `us_bank_account`/ACH, `collectionAttempt`, `collectionLifecycle`, `providerMerchant`, `refundCollection`, `stripeWebhook` |
| Application / unapplied law | **PRESENT_AND_PROVEN** | `paymentApplicationView.ts`: `unapplied = amount − activeApplied − refunded` |
| Stored payment instrument | **PARTIAL** | `customer_payment_methods` = `customer_id, stripe_payment_method_id, brand, last4, is_default`. **Household grain. No payer column.** See §E |

### C.2 — The integration into Enrollment is the gap, and it is total

| Capability | Status | Evidence |
|---|---|---|
| **Enrollment → Financials linkage** | **ABSENT** | `lib/enrollment` and `lib/pos` import **nothing** from `lib/financials`. Zero imports, both directions |
| Fee step in the real Enrollment packet | **ABSENT** | `Enrollment Paperwork 2026–2027` has **3 steps**: Admissions Information (form), Family Handbook (`document_acknowledgment`), Immunization record (`document_upload`). No fee step, no payment step |
| Participant-facing payment surface | **ABSENT** | `grep -rln 'payment' app/forms/embed/` → **no matches**. A parent inside the packet cannot pay anything |
| Charge created by completing Enrollment | **ABSENT** | Nothing in the Enrollment or POS trees calls charge instantiation |
| Form ↔ Financials touchpoint | **PRESENT, DISPLAY-ONLY** | `resolveConfigurationSuppliedValues.ts` reads `listChargeTemplates` at generation to **display** an amount. It never copies the number and never creates a charge |
| Payment-setup obligation | **PRESENT, HELD** | `PAYMENT_SETUP_REQUIRED` / `HELD_PENDING_FINANCIALS` — see `FINANCIALS-DEFERRAL.md`. Deferred on purpose, not dropped |

**The honest summary:** Alloy has a mature Financials domain and a mature Enrollment domain, and
**no wire between them**. What Enrollment can do with money today is *show a number read from a
template* and *capture a signature next to it*. That is the whole of it.

### C.3 — The one place the two domains already meet

The bridge exists and it is structural rather than financial:

```
Enrollment process instance completes
  → stageOutcomeRuleTargetExecutor
  → materializeEnrollmentForChildScope
  → child_enrollment_agreements + child_placements + schedule_assignments
```

`child_enrollment_agreements` **is** the child-grain billable source. So completing Enrollment
already creates the thing charges hang from — it simply never creates a charge. The seam for §K is
here, and it is much narrower than "build billing".

---

## D. Fee authority model — who owns what today

| Question | Owner today | Status |
|---|---|---|
| What a fee **is**, and its amount | `charge_templates` (Financials) | PRESENT |
| Whether a fee **applies** to this enrolment | **nobody** | **ABSENT** |
| The **scope** a fee applies at (child / household) | `billableSource` — `enrollment_agreement` vs `customer` | PRESENT, unused by Enrollment |
| Creating the **charge** | `childcareChargeService` / `chargeLifecycleService` | PRESENT, never called by Enrollment |
| **Responsibility** for a charge | `resolveResponsibilitySplit` → explicit party, remainder UNASSIGNED | PRESENT, never populated from Enrollment |
| **Expected funding** (subsidy pledged) | `expectedFundingService` — explicitly *not money* | PRESENT |
| **Collectible** position | `resolveFamilyCollectible` | PRESENT |
| Who **may** pay | **nobody** | **ABSENT** |
| Who **did** pay | `payments.payer_entity_type/id` | PRESENT |
| **Allocation** of a payment to shares | `paymentAttributionService` | PRESENT |
| **Outstanding** | Thread 8 authoritative outstanding | PRESENT |
| The fee a family **sees during Enrollment** | the Form's `supplied_by` reference | PRESENT, display-only |
| The family's **agreement** to the fee | the v12 signature field | PRESENT, evidentiary only — binds nothing |

**The two absences are the product question**, and they are adjacent: *does this fee apply to this
enrolment*, and *who may pay it*. Everything downstream of those two already exists.

---

## E. Multi-payer model

### E.1 — Four identities, and they are genuinely different

The codebase already distinguishes three of them and says so in its own words:

1. **Respondent** — who is filling in the Form. Owned by Enrollment/Forms (packet session, public link).
2. **Responsible party** — whose obligation a share is. `resolveResponsibilitySplit`, explicit, with UNASSIGNED remainder.
3. **Funder** — who has pledged money that is not money yet. `expectedFundingService`, deliberately not netted against outstanding.
4. **Payer** — who actually sent the money. `payments.payer_entity_type/id`.

`paymentAttributionService` is explicit that (2) and (4) must not be conflated: payer identity
*"stays deliberately separate from the responsibility identity."* That is the right model and it is
already built.

**Respondent (1) has no link to any of the other three.** Nothing in the packet runtime records who
the respondent is *as a financial party*.

### E.2 — The structural limit

`customer_payment_methods` is **household-grain**: `customer_id`, token, brand, last4, `is_default`.
There is no person, party or payer column. Consequences, measured:

- A second payer has **nowhere to store their own instrument**. Two parents paying separately share
  one household row set and one `is_default`.
- Payer identity exists **only after the fact**, on a `payments` row. There is no payer-scoped
  *obligation* and no payer-scoped *instrument*.
- `resolveResponsibilitySplit` can already say "60% party A, 40% party B". Nothing can then present
  party B with their 40% and a way to pay it.

**So: responsibility is modeled, payment identity is recorded, and the middle — a payer-scoped
obligation with a way to settle it — is ABSENT.**

### E.3 — Scenarios

Answered against the runtime as it is. "No runtime" means the scenario cannot occur today, not that
it would misbehave.

| # | Scenario | Behavior today |
|---|---|---|
| A | One payer, one child | Charge can be created by an operator against the agreement; family pays; `paymentApplicationView` applies it. **Works, entirely operator-driven.** No Enrollment involvement |
| B | Two parents splitting a fee | `resolveResponsibilitySplit` expresses the split correctly. Neither parent can be *shown* their share or pay it separately. **Split is expressible, not collectible** |
| C | Third-party funder (subsidy/agency) | `expectedFundingService` records the pledge without reducing outstanding; `resolveFamilyCollectible` suppresses only on a **governed submitted claim**; variance surfaces as `unresolvedVarianceCents`. **Correct and proven** |
| D | Employer / grandparent pays directly | `payments.payer_entity_type/id` records it after the fact. No way to *invite* that payer. **Recordable, not solicitable** |
| E | Payer changes mid-enrolment | Responsibility is re-resolvable; prior payments keep their own payer identity — `paymentAttributionService` explains rather than re-infers. **Correct by construction** |

The pattern: **every scenario is correctly modeled once the money is in Alloy, and no scenario has a
way to get the money in via Enrollment.**

---

## F. Payment + Enrollment state matrix

Because §C.2 measured the linkage as ABSENT, the matrix is degenerate today and that *is* the finding:

| Payment state | Effect on Enrollment state today | Effect a product would likely want |
|---|---|---|
| No charge exists | none | none |
| Charge created, unpaid | **none** | possibly blocks a stage exit |
| Payment attempted, failed | **none** | operator attention |
| Partially paid | **none** | depends on policy |
| Paid in full | **none** | may release a placement |
| Refunded | **none** | may reopen an obligation |

Enrollment state is **completely independent of payment state**. No stage-exit requirement, no
obligation, no work item anywhere in the Enrollment process consults Financials. The one payment-
shaped obligation that exists (`PAYMENT_SETUP_REQUIRED`) is explicitly **held**, and holding it was
a decision, not an oversight (`FINANCIALS-DEFERRAL.md`).

This is worth stating plainly: **there is no defect to fix in this matrix.** There is a product
decision to make about which cells should be non-empty.

---

## G / H. Multi-child — current runtime, measured

### G.1 — The anchor, from the resolver's own statement of policy

`lib/records/enrollmentContextResolver.ts` is the authority, and it is unusually explicit:

> An Opportunity is a live episode when a journey is actually RUNNING inside it: at least one
> `process_instances` row for the household's children whose state has not concluded. […] Absence of
> a live episode is an ordinary answer. It means the sibling's journey runs context-free — not that
> one should be manufactured.

It refuses "the newest opportunity" by name, because attaching a 2026 sibling to a completed 2025
enrolment *"would reopen finished history."* A second signal can only **disqualify** (an inactive
Work Unit ends the episode regardless). Ties break deterministically by running-journey count then
id, so *"the sibling's context [does not] depend on row order."*

This is confirmed by the product surface: `enrollment.start` preview on each Tourb0913 child returns
*"Start enrollment inside the family's current enrolment episode / Create one enrollment process for
this child / Join the household's live episode as context."*

### G.2 — The fifteen runtime questions

| # | Question | Measured answer |
|---|---|---|
| 1 | Separate packet per child, or one family session? | **Separate per child.** One packet session per process instance |
| 2 | What owns packet/session grouping? | The **process instance**; sessions are keyed by `process_instance_id` |
| 3 | What is the family-grain anchor? | The **Opportunity** (the live enrolment episode) |
| 4 | Who decides which Opportunity a sibling joins? | `resolveLiveEnrollmentContext` — running journeys, not recency |
| 5 | One process instance per child? | **Yes.** `subject_id` = the child's `customer_members.id` |
| 6 | Do siblings share an Opportunity? | **Yes**, when one is live. Otherwise the journey runs context-free |
| 7 | Own public link per child? | **Yes** — minted per packet session |
| 8 | Own submission per child? | **Yes** |
| 9 | Own artifact per child? | **Yes** |
| 10 | Own Processing case per child? | **Yes** — gated by `shouldOpenProcessingCaseForPacket` |
| 11 | Do form-only facts repeat per child? | **Yes.** `shared_values` live on the **session**, so a form-only fact is re-asked per child |
| 12 | Do canonical facts repeat per child? | **No.** `resolveParticipantCanonicalValues` prefills across children from canonical record |
| 13 | How does a sibling become a real child? | The `party_collection { action_key: "add_child" }` on "Other children in your household" raises a proposal; Processing commits it via `executeNewChildProposalCommit` |
| 14 | Does completing Enrollment create billable structure? | **Yes** — `child_enrollment_agreements` + `child_placements` + `schedule_assignments`, per child |
| 15 | Is there a family-grain participant experience? | **No.** See §G.3 |

### G.3 — The one real multi-child product gap

Every *record* is correctly grained. The **experience** is not:

- There is no surface that says *"Wright Family Enrollment · 2 children."*
- A parent with three children gets **three links, three conversations, three signatures**, with no
  shared progress and no single place to see what is left.
- Form-only facts (§G.2 #11) are genuinely re-asked per child. For canonical facts this is already
  solved; for form-only ones it is not, because `shared_values` are session-scoped by design.

**Classification: UI-product gap, not a data-model defect.** The family-grain anchor already exists
(the Opportunity) and already groups the children. Nothing needs re-graining to build a family view
over it — which is the most important finding in this section, because it means the fix is additive.

---

## I. Wright Family — multi-child + multi-payer proof

**Partially provable, and the unprovable half is the point.**

**Multi-child: PROVEN** on the Tourb0913 household (3 children: Amira `3bc54891`, Zzcert `af205e87`,
Toureeb `66998f6a`). Each child's `enrollment.start` preview independently reported joining the
household's live episode. The Item 9 certification already carried one child end-to-end through
every grain in §G.2 #5–#10 and #14: link → conversation → submission `090df175` → artifact →
Processing case `7709b570` → canonical finalization → idempotent replay (`already_applied`).

**Multi-payer: NOT PROVABLE — no runtime exists.** There is no participant payment surface
(§C.2), no payer-scoped instrument (§E.2), and no Enrollment→Financials linkage (§C.2). A
multi-payer proof would have had to be staged entirely by direct writes, which would have
demonstrated the fixture and nothing about the product.

I did not manufacture that proof. Reporting the absence is the honest result, and §E.3 records what
each scenario *would* do against the parts that do exist.

---

## J. Gaps by class

### Configuration
1. `all_children_in_household` scope refuses: *"No guardian role is configured for this organization. Add a matching key to `customer_member_contact_roles`."* `add_parent_guardian` with `scope: "this_child"` writes only a household adult role. Worked around in certification by using `enrollment.start`.
2. The v12 fee reference named a non-existent template key — **fixed** (`7e0d78323`), but nothing *warns* an author that a `supplied_by` key resolves to nothing. See defect #2.

### Integration
3. **Enrollment → Financials: no linkage at all.** The single largest gap in this report.
4. Completing Enrollment creates `child_enrollment_agreements` but never a charge, though the agreement is precisely the billable source.
5. Respondent identity is never connected to responsible-party or payer identity.

### UI-product
6. No family-grain participant experience for multi-child households (§G.3).
7. No participant-facing payment surface anywhere in `app/forms/embed/`.
8. No surface can present a responsible party with *their* share and a way to settle it (§E.2).

### Existing-runtime defect
9. **Conditional requiredness** — a hidden collection was both required and a hiding place. **FIXED** (`34320d239`).
10. **Preview/commit divergence** — a preview refused a respondent-added child the commit would create, *"inviting an operator to reject real work."* **FIXED** (`a52aadc97`).
11. **`typecheck:tests` red with 14 errors across 11 files** — a gate that would refuse the branch. **FIXED** (`a696f58bf`).
12. **A committed test read an untracked scratch fixture**, so it passed only in the authoring worktree. *A fixture nobody else has is not evidence.* **FIXED** (`4c1a68684`).

### Missing platform capability
13. **Payer-scoped obligation + instrument.** The middle term between "responsibility is modeled" and "payment identity is recorded" (§E.2).
14. **Fee applicability.** Nothing decides whether a template applies to a given enrolment (§D).
15. `PAYMENT_SETUP_REQUIRED` has no runtime — held deliberately, still held.

---

## K. Proposed implementation slices

Ordered so each is independently shippable and none presumes the next. **None of these is approved;
this is the menu the discovery produced.**

- **K1 — Fee applicability (smallest real step).** Let a charge template declare whether it applies at enrolment, at what scope. Enrollment then *has an answer* to §D's first absence without creating anything. No new ledger, no new payment system.
- **K2 — Charge on materialization.** At `materializeEnrollmentForChildScope`, create the applicable charge against the `child_enrollment_agreement` that step already creates. This is the narrow seam from §C.3 and reuses `chargeLifecycleService` wholesale.
- **K3 — Family-grain Enrollment view.** A read-only surface over the Opportunity showing its children and each one's progress. Purely additive (§G.3); no re-graining.
- **K4 — Shared form-only facts across siblings.** Promote genuinely household-grain form-only facts from session scope to episode scope. Needs a rule for which facts qualify — a real product decision, not a refactor.
- **K5 — Payer-scoped obligation.** The §E.2 middle term. Largest and least certain; should not start before K1–K2 prove the linkage seam.
- **K6 — Participant payment surface.** Depends on K5 and on lifting the `PAYMENT_SETUP_REQUIRED` hold. Explicitly out of scope until Financials defines that program.

---

## L. Enrollment V0.5 ledger

| # | Item | Status |
|---|---|---|
| 1 | Conditional requiredness | **CLOSED** — `34320d239`, 7-case guard |
| 2 | Admissions v12 conditional audit | **CLOSED** — 6 conditionals, all appropriate |
| 3 | Approved sibling gate configured | **CLOSED** — `4c1a68684`, ordering guarded |
| 4 | v12 supplied-fee reference | **CLOSED** — `7e0d78323` |
| 5 | Financial capability census | **CLOSED** — §C |
| 6 | Fee authority model | **CLOSED** — §D; two absences named |
| 7 | Multi-payer model + Scenarios A–E | **CLOSED** — §E |
| 8 | Payment + Enrollment state matrix | **CLOSED** — §F; degenerate by measurement |
| 9 | Multi-child runtime (15 questions) | **CLOSED** — §G |
| 10 | Wright Family proof | **PARTIAL** — multi-child proven; multi-payer has no runtime (§I) |

**Not done, deliberately:** Admissions v12 is **not published**. No ledger, payment system,
Enrollment-specific responsibility, Enrollment-specific subsidy, duplicate payer model, packet
runtime, parent portal, autopay or billing rewrite was built. `shouldOpenProcessingCaseForPacket`
was not weakened. Nothing was pushed.
