---
owner: platform
status: canonical
last_reviewed: 2026-09-10
supersedes: []
---

# Thread 8C — ACH collection and provider-initiated reversals: certification matrix

Candidate `1636ff239` · staging baseline `a01a0280f` · lane `lane_a5ce60877b5f`

Mounted subject: `8c000000-0000-4000-8000-00000000e001` (dedicated, `source_key =
'thread-8c-certification'`). Connected merchant `acct_1UDU4mAN1Xu2guyW`, ACH capability read live
from the account.

## Evidence types

| Type | Means |
|------|-------|
| REAL STRIPE | A real object on the real connected account in test mode — intent, mandate, dispute, capability |
| REAL DB/APPLICATION | Canonical Alloy state read back from Postgres through the real services |
| MOUNTED BROWSER | The authenticated product, driven by real operator input |
| HERMETIC CONVERGENCE | A signed provider event synthesised locally to prove idempotency and ordering. Never called real Stripe proof |
| REGRESSION | A committed test that fails if the behaviour returns |

## The 18 mounted scenarios

All executed on the dedicated subject, 13 specs, 6.3 minutes, 18/18 PASS.

| # | Scenario | Result | Evidence pointer |
|---|----------|--------|------------------|
| 1 | Card remains unchanged | PASS | `financials-ach-collection.cert.spec.ts` "1,2,4" |
| 2 | Bank account offered from server readiness | PASS | same; `vm.achAvailable` cross-checked |
| 3 | ACH unavailable safely | PASS | "3 — an ACH-incapable merchant…" |
| 4 | Mandate authorization captured | PASS | "4 — the payer's mandate is real" (`mandate_…` retrieved) |
| 5 | Tokenized collection | PASS | "5 — tokenized; no bank credential…" |
| 6 | Verification Required | PASS | "6,9,18" (`verify_with_microdeposits`) |
| 7 | Card Action Required stays distinct | PASS | "7 — a card challenge and a bank verification" |
| 8 | ACH Processing | PASS | "8,9,18" |
| 9 | Processing moves no money | PASS | "6,9,18" and "8,9,18" |
| 10 | Received only after recognition | PASS | "10,12,18" |
| 11 | Partial ACH application | PASS | "11 — a partial bank payment" |
| 12 | Exact ACH application | PASS | "10,12,18" — one receipt, one application, zero outstanding |
| 13 | Pre-recognition failure | PASS | "13 — a bank debit that fails before settlement" |
| 14 | Returned after real dispute | PASS | "14,15,16,17,18" |
| 15 | Original receipt retained | PASS | same |
| 16 | Outstanding restored by `dispute.amount` | PASS | same — fee excluded explicitly |
| 17 | Returned is not Refunded | PASS | "17 — a returned payment renders as Returned" |
| 18 | Cold reload reconstructs lifecycle | PASS | scenarios 6, 8, 10, 11, 14 all read after real navigation |

## Requirements 1–28

| # | Requirement | Result | Evidence type(s) | Evidence pointer(s) | Notes |
|---|-------------|--------|------------------|---------------------|-------|
| 1 | Migrations replay cleanly | PASS | REAL DB/APPLICATION | 396/396 applied to an empty database, one transaction per file; `scripts/migration-preflight.mjs` OK | Thread 8C objects verified present after replay |
| 2 | ACH readiness checked on connected merchant | PASS | REAL STRIPE, REAL DB/APPLICATION, MOUNTED BROWSER | `achCollection.live` "reads ACH capability from the provider"; mounted 2, 3 | `us_bank_account_ach_payments`, never inferred from `charges_enabled` |
| 3 | Bank collection tokenized/Stripe-hosted | PASS | REAL STRIPE, MOUNTED BROWSER | mounted 5; `achCollection.live` "never persists raw bank credentials" | No routing/account number in Alloy payload or persistence |
| 4 | Mandate authorization captured | PASS | REAL STRIPE | mounted 4 — `mandates/mandate_…` retrieved, `status=active`, `customer_acceptance.type=online` | Not inferred from PaymentIntent success |
| 5 | Verification-pending truthful | PASS | REAL STRIPE, MOUNTED BROWSER | mounted 6 | `requires_action / verify_with_microdeposits` |
| 6 | Collection creation idempotent | PASS | REAL STRIPE, REAL DB/APPLICATION | `achCollection.live` "asks for the same bank collection twice and gets one intent" | Also card/bank separation on the same charge |
| 7 | Processing creates no receipt | PASS | REAL STRIPE, REAL DB/APPLICATION, MOUNTED BROWSER | mounted 8, 9; `achCollection.live` | Scoped to the intent, not the account |
| 8 | Processing does not reduce outstanding | PASS | REAL DB/APPLICATION, MOUNTED BROWSER | mounted 9 | |
| 9 | Success creates exactly one Thread 8 receipt | PASS | REAL STRIPE, REAL DB/APPLICATION | `canonicalPosting.live` "posts exactly one canonical receipt"; mounted 10, 12 | |
| 10 | Application reduces outstanding exactly once | PASS | REAL DB/APPLICATION | `canonicalPosting.live`; mounted 12 | |
| 11 | Partial and exact ACH correct | PASS | REAL STRIPE, REAL DB/APPLICATION, MOUNTED BROWSER | mounted 11, 12; `canonicalPosting.live` partial case | |
| 12 | Duplicate/concurrent success converges | PASS | HERMETIC CONVERGENCE, REAL DB/APPLICATION | `canonicalPosting.live` duplicate-event and concurrent cases | |
| 13 | Pre-settlement failure creates no receipt | PASS | REAL STRIPE, REAL DB/APPLICATION, MOUNTED BROWSER | mounted 13 (`account_closed`); `canonicalPosting.live` | |
| 14 | Post-recognition dispute → one provider reversal | PASS | REAL STRIPE, REAL DB/APPLICATION, MOUNTED BROWSER | `providerDispute.live` "funds withdrawn reverses exactly once"; mounted 14 | |
| 15 | Original receipt immutable | PASS | REAL DB/APPLICATION, MOUNTED BROWSER | `providerDispute.live`; mounted 15 | Not deleted, not rewritten, not negated |
| 16 | Applications reverse exactly once | PASS | HERMETIC CONVERGENCE, REAL DB/APPLICATION | `providerDispute.live` "three events for one dispute produce exactly one canonical reversal" | |
| 17 | Outstanding restores exactly | PASS | REAL STRIPE, REAL DB/APPLICATION, MOUNTED BROWSER | `providerDispute.live` "restores the DISPUTE amount, never the balance impact"; mounted 16 | Provider fee never becomes family debt |
| 18 | Thread 5 explanatory consequence | PASS | REAL DB/APPLICATION | `providerDispute.live` journal assertion; `canonicalPosting.live` "journals once" | Added this run for the return path |
| 19 | Duplicate/concurrent dispute events converge | PASS | HERMETIC CONVERGENCE | `providerDispute.live` "concurrent withdrawals produce exactly one reversal" | |
| 20 | Out-of-order dispute/success converges | PASS | HERMETIC CONVERGENCE | `providerDispute.live` "a withdrawal observed before recognition creates no reversal, and converges when it can" | |
| 21 | Actual payer identity correct | PASS | REAL DB/APPLICATION | `financialResponsibility.live` "lets a non-responsible party pay, records who paid" | Payer is evidence, never responsibility |
| 22 | Returned ACH is not an operator refund | PASS | REAL DB/APPLICATION, MOUNTED BROWSER, REGRESSION | mounted 17; `refundExpression.test.ts`; `manualRailPayments.live` origin guard | Operator path has no parameter for provider origin |
| 23 | Cold reload reconstructs lifecycle | PASS | MOUNTED BROWSER | mounted 6, 8, 10, 11, 14 | `openCollections` on the view model |
| 24 | Unauthorized/cross-org/cross-merchant denied | PASS | REAL DB/APPLICATION, REAL STRIPE | `cardCollection.live` "refuses another organization's obligation"; `connectedMerchant.live` no-fallback; `providerDispute.live` unsigned/forged event and unbound account | |
| 25 | Card collection and refunds green | PASS | REGRESSION, REAL STRIPE | `cardCollection.live` 6/6, `providerRefund.live` 6/6, `paymentActionsCard.live` 6/6 | |
| 26 | Manual rails green | PASS | REGRESSION, REAL DB/APPLICATION | `manualRailPayments.live` 4/4 | |
| 27 | Predecessor Financials threads regression-green | PASS | REGRESSION | see below | See classification |
| 28 | Independent promoted-staging certification | PENDING | — | — | Runs only after promotion |

### Requirement 27 — classification

**PASS — all required predecessor product suites independently and repeatably green. Residual
aggregate shared-tenant fixture collisions reproduce independently of Thread 8C and are documented
as pre-existing certification infrastructure debt.**

| Suite | Isolated | Aggregate | Collision / root cause | Branch-dependent? |
|-------|----------|-----------|------------------------|-------------------|
| responsibility (T6) | 16/16 | intermittent | fixed billing period consumed by a prior run | No — identical failure with Thread 8C modules reverted to `origin/staging` |
| workspace queue (T4) | 7/7 | intermittent | same | No |
| subsidy (T9) | 16/16 | intermittent | same, plus fixed idempotency keys and tenant-wide count assertions | No |
| workspace productization (T4) | 9/9 | intermittent | same, plus org-wide pricing-term delete, plus the 414 read defect | No — reproduced at staging |
| tuition generation (T7) | 4/4 | intermittent | same | No |
| tuition matrix (T7) | 14/14 | intermittent | single-active-calendar contention | No |

Evidence conditions, all satisfied: every required suite passes independently; isolated results
repeat across consecutive runs; residual aggregate failures reproduce with Thread 8C's shared
modules reverted to `origin/staging`; no predecessor product assertion was weakened; no posted
financial truth was deleted or rewritten.

Residual debt, recorded and not pursued further: five predecessor suites delete every pricing term
in the organization in setup and teardown, and the tenant permanently accumulates immutable posted
money, so which suite carries the residual aggregate failure moves between runs.

## Final floor

| Floor | Result |
|-------|--------|
| Thread 8/8B/8C live | 64 passed across 11 suites |
| Predecessor suites (T4, T6, T7, T9) | 66 passed across 6 suites, isolated |
| Financials units | 547 passed across 52 files |
| Mounted browser | 18/18 scenarios, 13 specs |
| `typecheck` | rc=0 |
| `typecheck:tests` | rc=0 |
| Migration replay | 396/396 onto an empty database |
| Migration preflight | consistent |
| `check:service-client-principal` | ✓ no unlisted service-role route without a principal resolution |
| `check:route-capabilities` | ✓ every exported API handler is declared |

## Defect history

Everything certification found, unsanitized. Classification is deliberate: most of these are not
product defects, and two of the worst were caused by this certification itself.

| # | Defect | Class | Root cause | Repair | Regression |
|---|--------|-------|------------|--------|------------|
| 1 | Dispute upsert could null out resolved original-payment linkage | Thread 8C product | Upsert wrote a null `canonical_payment_id` over evidence a prior delivery had resolved | Never clobber resolved evidence with null | `providerDispute.live` retry cases |
| 2 | Hidden sibling-suite merchant provisioning dependency | Certification/harness | Suites deleted the shared merchant row in teardown; siblings then skipped | Upsert what is needed; retire rather than delete where absence is the point | Thread 8 floor executes 64 tests, none skipped |
| 3 | Shared agreement accumulated immutable posted charges across runs | Certification/harness | Certification billed a shared subject; posted money is immutable and never gives a day back | Dedicated Thread 8C subject with its own provenance | `thread-8c-collection-subject.sql` |
| 4 | Test fixture missed a new field, breaking `typecheck:tests` | Self-inflicted | `reversalOrigin` added to the service, not to the fixture | Fixture carries the field | `typecheck:tests` in the floor |
| 5 | ACH chooser could route through `payment.record` | Thread 8C product | The chooser's `collects` branch did not include the bank rail, so selecting it would have written a receipt for money no bank had moved | Bank account enters the provider collection path | mounted 4; commit `e42b884a4` |
| 6 | Reversal presentation treated provider returns as operator refunds | Thread 8C product | Presentation assumed every reversal was a refund | `reversal_origin` threaded to the surface; Returned vs Refunded | mounted 17; `refundExpression.test.ts` |
| 7 | Cold-reload collection lifecycle existed only in React state | Thread 8C product | `cardStage` was `useState`; the view model exposed no attempts; the lifecycle module was unreferenced | `openCollections` on the view model, rendered by the card | mounted 18 |
| 8 | Canonical ACH receipt posted with `paymentMethod = card` | Thread 8C product | The posting seam hardcoded the rail from when card was the only one | Rail survives recognition | `achCollection.live` "recognises a settled bank debit as a BANK receipt" |
| 9 | `provider_action_type` captured too early and always null | Thread 8C product | Read at creation, before any payment method exists | Captured from the provider event that moves the attempt | mounted 7 — `redirect_to_url` vs `verify_with_microdeposits` |
| 10 | Provider reversal lacked Thread 5 journal certification | Certification gap | The return path asserted money but not its explanation | Journal assertion on the reversal | `providerDispute.live` |
| 11 | Oversized PostgREST `.in(...)` produced 414, read as "no applications" | Pre-existing product | A list of ids goes in the URL; ~300 uuids exceeds the limit; the error was discarded and `data: null` read as no rows | Batched reads that raise on failure | Converged on staging's `readInBatches`, which fixed the same defect independently |
| 12 | Requirement-27 cleanup deleted the mounted subject's enrollment agreement | Self-inflicted (this certification) | Cleanup was widened from "the agreement this suite created" to "whatever agreement this child holds at this site", and the suites work on whichever members the tenant has | Cleanup scoped by provenance; a suite clears only what it can prove it created | Dedicated subject plus `source_key` scoping |
| 13 | Focus Panel depth scrim not dismissed before interacting | Certification/harness | The harness clicked a card the panel had deliberately made inert (`pointer-events: none` under an armed scrim), and waited for an impossible interaction until timeout | Bring the card forward first, as an operator does — never a force-click | `panelClick` in the mounted spec |
| 14 | Eight-minute waits to learn an optional attribute was absent | Certification/harness | `.getAttribute(...).catch(() => null)` waits the full action timeout before the catch runs | Ask whether the element exists first | Scenario 10 runs in 23s, was 20m |

Not a product defect: 2, 3, 10, 13, 14 are certification harness; 4 and 12 are self-inflicted during
this thread and repaired before promotion; 11 pre-existed Thread 8C and reproduces without it.
