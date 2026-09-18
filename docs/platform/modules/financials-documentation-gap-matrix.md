---
owner: modules
status: canonical
last_reviewed: 2026-09-17
supersedes: []
---

# Financials documentation gap matrix — Thread 11A, Stage A

**Status:** Stage A audit, produced before Human QA so the gaps are known while the accepted
behaviour is still provisional. This is deliberately **not** the canonical rewrite: Human QA may
still change accepted behaviour, and rewriting canon against behaviour that may move is how two
canons get created. Stage B converts this matrix into canonical doctrine after QA acceptance.

**Reconciled candidate:** `d2b2b1dab` (9 commits, rebased onto `origin/staging` `15639e053`).

## What was audited

The two canonical Financials documents —
[`financial-platform-domain.md`](./financial-platform-domain.md) (frozen, domain model) and
[`billing-financials-platform.md`](./billing-financials-platform.md) (canonical, L5 billing/posting
as-built) — against the implementation as it exists on the reconciled candidate.

Both were last reviewed **2026-09-10**. Every authority Thread 11A built or changed landed on
**16–17 September**, so the audit's question was narrow and answerable: which of those authorities
has a documented owner, and which exists only in code and tests.

## The finding, stated plainly

The canonical documents are **substantially accurate about the money** and **silent about the
surface**. Domain semantics, the posting model, responsibility, subsidy, periods and the journal are
documented and current. Everything Thread 11A established about *how an operator reaches that money*
— the command authority, the navigation model, the read/projection timing, the placement contract —
is code-only.

That asymmetry is the risk this matrix exists to name. A future lane reading the canon would
correctly conclude that charges, reductions and payments have one owner each, and would have no way
to discover that Financials commands, surfaces and reads also have owners — so it would invent new
ones. The 5I pass already had to *remove* one such duplicate.

## Matrix

| Concept | Implementation authority | Documentation authority | Status | Conflicts | Follow-up (Stage B) |
|---|---|---|---|---|---|
| Domain entities (charge, obligation, responsibility, payer, funding, payment, credit, adjustment, reversal, draft/posted, GL account) | migrations + `lib/financials/*` | `financial-platform-domain.md` | **Documented, current** | none found | Confirm no drift post-QA |
| Posting model, correction lineage, payment application | `lib/financials/childcareChargeService.ts`, `childcarePaymentService.ts` | `billing-financials-platform.md` | **Documented, current** | none found | Confirm post-QA |
| Responsibility, subsidy, reductions | `financialResponsibilityActions.ts`, `financialSubsidyActions.ts`, `financialReductionActions.ts` | `billing-financials-platform.md` | **Documented, current** — including the explicit warning that authority is ahead of product and has no operator surface | none found | Keep the warning; it is the most load-bearing sentence in the file |
| Billing period vs accounting period | `billingPeriodForDate`, `attribute_financial_journal_entry` | `billing-financials-platform.md` (periods + journal) | **Documented**, but the monthly-identity assumption is recorded in a handoff, not canon | Handoff `HANDOFF-BP-CADENCE-2026-09-16` is the only record | Promote the cadence gap into the canonical period section (Stage B §E) |
| **Financials command authority** | `lib/financials/commands/financialTransactionCommands.ts` | **none** | **CODE-ONLY** | Was duplicated across two hosts until 5I extracted it | Stage B §C — this is the highest-value gap |
| **Command host registration** | `components/financials/FinancialCommandChannel.tsx` | **none** | **CODE-ONLY** | none | Stage B §C |
| **Financials navigation model** (`FinancialsSurface` stack; dismissal pops one level; row commands have their own destinations) | `components/admin/focusPanel/cards/FinancialsCard.tsx` | **none** | **CODE-ONLY** | none | Stage B §G |
| **Details commit contract** (surface commits immediately at final geometry; only the ledger region may report pending; never rows it has not read) | same + `FinancialsDetailCard.tsx` | **none** | **CODE-ONLY** — and this doctrine *reversed twice* during 11A | Locks F41/F44 were rewritten twice as the doctrine moved | Stage B §G — document the final rule **and** why the earlier two were rejected |
| **Deep-read prewarm** (read begins on compact resolve; idle-queued; never a reveal gate) | `FinancialsCard.tsx`; doctrine precedent `focusPanelActivityPrewarm.ts` | **none** | **CODE-ONLY** | Traded away a *structural* stale guarantee for a defensive one — recorded only in `financialsRootStaleGuarantee.test.tsx` | Stage B §D — document the trade explicitly |
| **Read/projection authority** | `buildFinancialsCardVM.ts` | Named once in `billing-financials-platform.md` | **Under-documented** | none | Stage B §D — make it discoverable as *the* answer to "do I need a new VM?" |
| **Focus Panel placement/band contract** (solved band must reach the card at any wrapper depth) | `alloyOsRuntime.css`; lock `focusPanelBandFillRuntimePath.test.ts` | **none** | **CODE-ONLY** | Two independent lanes fixed this defect differently; staging's fix names one product card, the reconciled one is card-agnostic | Stage B §G — document the chain, and that the rule must not name cards |
| **Financials surface convergence locks** (F1–F48) | `tests/financials/accountSurfaceConvergence.test.ts` | **none** | **CODE-ONLY** | Several locks assert *superseded* doctrine rewritten in place | Stage B §I — document what a lock is for, and the rule that a reversed lock is re-stated rather than deleted |
| **Human QA model** (fixed-candidate runtime, catalog, classifications, build attribution) | `lib/qa/financialsDirectorQa/*`, `app/api/admin/qa/financials-director`, table `qa_director_acceptance_results` | **none** | **CODE-ONLY** | none | Stage B §I — this is the piece other domains must reuse rather than reinvent |
| Access/authorization for Financials | `lib/financials/financialsPermissions.ts` (`assertFinancialsReadAllowed`) | Access V2 doctrine (referenced, not restated) | **Partially documented** | none | Stage B §H — reference, do not restate |

## Stale documentation

None found that actively misleads. `docs/archive/2026-06-product/billing-and-financials.md` is
correctly marked archive and is referenced as the supplemental as-built record. The June 2026 sprint
documents under `docs/sprints/archive/` are archival by location.

The accurate characterisation is **not "stale docs"** but **"a documented money model and an
undocumented surface model."**

## Decisions currently preserved only in thread history

These were expensive to establish and would be expensive to rediscover:

1. A bounded operational projection **must not** be presented as the ledger — the defect recurred
   across three passes under different disguises.
2. Details' honest intermediate is the compact card or a reserved region — **never** placeholder
   rows. Row-shaped things in a ledger read as transactions whatever characters are in them.
3. One gesture moves the navigation stack exactly one level, however many layers announce it.
4. `Reverse` and `Adjust` are destinations with their own identity, not modes of `Add`.
5. The compact card carries contextual commands; the focused surface carries operational buttons.
6. A rule that exists is not a rule that applies — `focusPanelBandFillRuntimePath` passed while the
   product was wrong, because it asserted rule *text* rather than rule *effect*.

Item 6 is a **certification-doctrine** finding, not a Financials one, and Stage B should route it to
the certification doctrine rather than bury it here.

## What Stage B must not do

Do not restate Access V2, the operational truth-flow layering, or the L5 posting model. They have
owners. Stage B adds the surface, command, read and QA contracts, and links to the existing owners
for everything else.
