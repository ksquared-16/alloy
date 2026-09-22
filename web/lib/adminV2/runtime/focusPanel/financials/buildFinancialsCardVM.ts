/**
 * THE FINANCIALS READ MODEL — one server composition, three densities.
 *
 * Compact, summary and expanded all render THIS. React computes no financial truth: every total,
 * every period placement and every GL code arrives decided, because a card that recomputed a balance
 * would be a second answer to a question the ledger already answers, and the two would disagree the
 * first time a category was added.
 *
 * ── WHAT THE SUBJECT IS ──
 *
 * `charges.billable_source_type = 'enrollment_agreement'` + `billable_source_id`. Child attribution is
 * DERIVED from there (agreement → `customer_member_id`), which is why no `child_id` column is needed
 * and none is added. A household's financial picture is the union over its children's agreements.
 *
 * ── PAYMENTS ARE REAL HERE ──
 *
 * `paymentsCents` was hard-zero, on the stated grounds that `payments.job_id` was NOT NULL and that
 * payments had never been generalized. The census settled both against the deployed database
 * (certification/financials/payments-spine-census.sql, tha_be923375ea3595): `job_id` is NULLABLE and
 * has been since `20260329210000`, and `payment_allocations.charge_id` already applies a payment to a
 * charge. What was missing was a write path, not a schema.
 *
 * So payments received are now READ, by the same rule `jobPaymentBalances` uses for a job: active
 * applications whose parent payment is POSTED. A pending or failed attempt is money that has not
 * arrived and reduces nothing. An application is filed under the BILLING PERIOD OF THE CHARGE IT
 * PAYS, not the date it was applied — a period's balance is what that period's charges still owe, and
 * a payment made in October against a September charge settles September.
 *
 * ── WHAT IS STILL DELIBERATELY ABSENT ──
 *
 * Autopay exists only in card-lab fixtures and the concept catalog, so it is reported absent rather
 * than invented. Payer SPLITS belong to Processing and are not modelled here at all.
 */

import { readAllPages, readInBatches } from "@/lib/financials/workspace/resolveFinancialPosition";
import {
    deriveAccountChargeLedgerRows, reversalBySourceChargeId,
    type AccountChargeLedgerRow,
} from "@/lib/financials/account/accountChargeLedger";
import { railCollectionAvailable } from "@/lib/financials/payments/providerMerchant";
import { resolveHouseholdPaymentViews, type PaymentView } from "@/lib/financials/paymentApplicationView";
import { resolveAccountPrepaidPosition } from "@/lib/financials/prepaid/availableFunds";
import { heldCentsFor, readHoldsForPayments, type HeldDeposit } from "@/lib/financials/prepaid/heldDeposits";
import type { SupabaseClient } from "@supabase/supabase-js";

import { CHILDCARE_BILLABLE_SOURCE_TYPES } from "@/lib/financials/billableSource";
import { listFinancialPolicies } from "@/lib/financials/policies/financialPolicyService";
/*
 * THE REVIEW BOUNDARY'S OTHER HALF. `listFinancialPolicies` reads the org's policies; this resolves
 * the one that governs a given service. The pair is what makes `posting_review` a configured fact
 * rather than a template's private opinion, and a restore that brought back only the reader left
 * the resolver called but undeclared.
 */
import { resolveFinancialPolicy } from "@/lib/financials/policies/resolveFinancialPolicy";
import { resolveFamilyCollectible } from "@/lib/financials/subsidy/resolveFamilyCollectible";
import { financialsClock, recordFinancialsSpans } from "@/lib/perf/routeTimingDiagnostic";
import { CHARGE_CATEGORY_GL_MAPPING_KEY, chargeCategoryLabel } from "@/lib/financials/chargeCategories";
import { readAccountReductions, type AccountReduction } from "@/lib/financials/reductions/readAccountReductions";
import {
    reductionProvenanceByChargeId,
    type ReductionPolicyWindow,
    type ReductionProvenance,
} from "@/lib/financials/reductions/reductionProvenance";
import {
    resolvePayerCandidates,
    resolvePaymentSetup,
    type PayerCandidate,
    type PaymentSetupState,
} from "@/lib/financials/payments/paymentSubjectModel";
import {
    billingPeriodForDate,
    billingPeriodFromKey,
    placeInBillingPeriod,
    sortBillingPeriodKeysDescending,
    type BillingPeriod,
    type BillingPeriodBasis,
} from "@/lib/financials/billingPeriod";

/**
 * How a category contributes to the reconciliation.
 *
 * `charge` raises what the family owes; `reduction` lowers it. The split is by CATEGORY rather than by
 * the sign of the stored amount, because the sign convention is not enforced by the schema — the only
 * constraint is `amount_cents <> 0`. Classifying by category and then summing the SIGNED amounts means
 * the breakdown is readable however a row was written, and the total still reconciles: responsibility
 * is the sum of every line, so it cannot drift from the rows beneath it.
 */
const REDUCTION_CATEGORIES = new Set(["discount", "credit", "subsidy_offset"]);
const FUNDING_CATEGORIES = new Set(["subsidy_offset"]);
const ADJUSTMENT_CATEGORIES = new Set(["adjustment"]);

/**
 * Is this posted row a thing that happens TO an obligation, rather than an obligation?
 *
 * Funding, discounts, adjustments and corrections are all already counted inside the net of the
 * charge they act on — `resolveAllocatableNet` sums them against their `source_charge_id`. Asking
 * the collectibility resolver about them a second time counts them twice, and because a credit is
 * negative and its REVERSAL is positive, the double count is asymmetric: the credit is refused as
 * `not_allocatable` and silently contributes nothing, while its reversal contributes in full.
 *
 * Exported so the rule can be bound by a test rather than restated by one.
 */
export function isCollectibleOffsetRow(row: Pick<FinancialsLedgerRow, "categoryKey" | "correctsChargeId">): boolean {
    return (
        Boolean(row.correctsChargeId)
        || FUNDING_CATEGORIES.has(row.categoryKey)
        || REDUCTION_CATEGORIES.has(row.categoryKey)
        || ADJUSTMENT_CATEGORIES.has(row.categoryKey)
    );
}

/** Statuses that count toward what is owed. `draft` is not yet owed; `void` never was. */
const OWED_STATUSES = new Set(["posted", "partially_paid", "paid"]);

/** One payment on the account, as the card reads it. */
export type FinancialsPaymentRow = {
    paymentId: string;
    /** inbound = money received; outbound = a refund. */
    direction: "inbound" | "outbound";
    /** The receipt this refund reverses, when it is one. */
    refundsPaymentId: string | null;
    /**
     * WHO caused this reversal — `operator` for a refund somebody asked for, `provider` for money a
     * bank or network took back. Null on a receipt. Without it the surface cannot tell a family's
     * refund from their bank reversing a debit, and the two mean opposite things about who acted.
     */
    reversalOrigin: "operator" | "provider" | null;
    amountCents: number;
    currencyCode: string;
    /** pending | posted | failed | voided. Only `posted` is money. */
    status: string;
    method: string;
    processor: string | null;
    /** The date the money arrived — not the date it was applied. */
    receivedAt: string | null;
    postedAt: string | null;
    /** Active applications on this payment, summed. Zero for a payment sitting on the account. */
    appliedCents: number;
    /**
     * Received money not currently answering any obligation. NOT a credit and NOT a refund: the
     * organisation holds it and it can still be applied. Canonical — `readPaymentUnappliedCents`.
     */
    unappliedCents: number;
    /**
     * The household the receipt was taken against, named. Null when canonical data cannot name it —
     * an absent label is never replaced with a guess, because the wrong family on a payment is worse
     * than no family at all.
     */
    payerLabel: string | null;
    /**
     * The applications themselves, active and reversed. The summed `appliedCents` above says HOW MUCH
     * is doing something; this says WHICH obligations, and which were undone — the difference between
     * a balance and an explanation, and the thing an operator needs before moving money.
     */
    applications: FinancialsPaymentApplication[];
    reference: string | null;
    notes: string | null;
};

export type FinancialsPaymentApplication = {
    allocationId: string;
    chargeId: string | null;
    chargeLabel: string;
    chargeServiceDate: string | null;
    appliedCents: number;
    /** `active` answers an obligation now; `reversed` is history that no longer counts. */
    status: string;
    allocatedAt: string | null;
    reversedAt: string | null;
    reversalReason: string | null;
};

export type FinancialsSubject = {
    customerMemberId: string;
    agreementId: string;
    displayName: string;
    /** Agreement status — a closed agreement still owns its history. */
    agreementStatus: string;
};

export type FinancialsLedgerRow = {
    chargeId: string;
    /** The date this row is FILED under, and which column decided it. */
    date: string | null;
    periodKey: string | null;
    periodBasis: BillingPeriodBasis;
    subjectMemberId: string | null;
    subjectName: string | null;
    categoryKey: string;
    categoryLabel: string;
    description: string | null;
    amountCents: number;
    currencyCode: string;
    status: string;
    /**
     * DERIVED lifecycle, never a stored status.
     *
     * `scheduled` — a draft whose billable date has not arrived.
     * `reversed`  — posted money that a later correction has fully undone. The row is still `posted`
     *               in the database and still stands in the ledger; what changed is that it no
     *               longer represents an open obligation, and no further correction is lawful.
     */
    lifecycleStatus: "scheduled" | "draft" | "posted" | "reversed" | "void";
    /** The charge this row corrects, when it is a correction. Null for an original charge. */
    correctsChargeId: string | null;
    /** `reversal` | `credit` | `replacement` — from the correction's own metadata. */
    correctionKind: string | null;
    /** The correction that reversed THIS row, when one exists. Null while the charge stands. */
    reversedByChargeId: string | null;
    /**
     * Whether this row admits a correction — the transition the card renders as `Reverse`.
     *
     * Decided HERE, not in the component. The card asks one question of a ledger row and it is a
     * question about money: posted money that still stands and is not itself a correction. Leaving
     * that to JSX meant the rule existed twice — once in the component and once in every test and
     * certification that restated it — and a certification that restates the rule proves only that
     * it can restate it.
     */
    offersReverse: boolean;
    /**
     * Money already applied to THIS charge, and what it therefore still owes.
     *
     * Not new arithmetic: `appliedByChargeId` is the same map `reconcileRows` and `pastDueFor`
     * already sum, under the one balance rule (active applications whose parent payment is POSTED).
     * It is surfaced per row because the card previously had no way to say which charge a payment
     * settled, and an operator deciding what to collect needs the row's own number rather than the
     * account total.
     */
    appliedCents: number;
    /** `amountCents − appliedCents`. Zero or negative means nothing is left to collect. */
    outstandingCents: number;
    /**
     * Whether this row can receive a payment — the transition the card renders as `Record payment`.
     *
     * Decided HERE for the same reason `offersReverse` is: leaving it to JSX puts the rule in the
     * component and again in every test that restates it. `payment.record`'s own eligibility check
     * refuses a draft or void charge, and the database bounds over-application; this is the card's
     * mirror of that answer, never a second rule.
     */
    offersPayment: boolean;
    dueDate: string | null;
    /** Operator-facing GL code, or null when nothing maps it. Never silently blank. */
    glCode: string | null;
    glAccountName: string | null;
    /**
     * WHO OWNS THIS CHARGE'S OBLIGATION — at the grain the model actually has.
     *
     * `financial_responsibility_allocations` is keyed by `charge_id`, so responsibility IS
     * charge-grain and a ledger row can state its own responsible party without inventing one. It
     * is deliberately NOT the same question as `subjectName`: the subject is the CHILD the charge is
     * for, the responsible party is the person who owes it, and one child's tuition may be owed by
     * a parent who is not on any other row. Conflating them is how a surface ends up telling an
     * operator that a four-year-old owes $1,850.
     *
     * Null with `responsibilityUnassigned` false means no allocation exists for the charge at all —
     * which is different from an allocation that exists and names nobody. Both are real states and
     * neither is a person.
     *
     * NO ARITHMETIC. The name is read; the amounts stay where `readResponsibility` computes them.
     */
    responsiblePartyName: string | null;
    /** An allocation exists for this charge and deliberately names no party. */
    responsibilityUnassigned: boolean;
    /*
     * Owed by a named party on this obligation, and owed by nobody yet — both are true at once.
     * Optional because a row that has never been through allocation simply has neither; the
     * projection always supplies them, and absent reads as zero everywhere they are used.
     */
    responsibilityAssignedCents?: number;
    responsibilityUnassignedCents?: number;
    /** Where the row came from — template key, or the manual service. */
    source: string | null;
    /**
     * WHY THIS REDUCTION EXISTS, where the row IS one.
     *
     * Null on an ordinary charge. Present on a discount, credit, adjustment or reversal, carrying
     * the decision behind the money — which policy, on what basis, one-time or ongoing, and what it
     * reverses. Derived once by `reductionProvenance` so both deep surfaces state the same meaning.
     */
    reduction: ReductionProvenance | null;
};

export type FinancialsReconciliation = {
    grossCents: number;
    discountsCents: number;
    fundingCents: number;
    adjustmentsCents: number;
    /** gross + discounts + funding + adjustments — the sum of every owed line, by construction. */
    responsibilityCents: number;
    paymentsCents: number;
    /** responsibility − payments. */
    balanceCents: number;
    /** Drafts whose billable date has not arrived. STATED beside the balance, never inside it. */
    scheduledCents: number;
    /**
     * Drafts whose billable date HAS arrived but which have not been posted.
     *
     * Neither owed nor scheduled, and previously counted in neither — so a period holding only
     * unposted drafts reconciled to zero with nothing on the card explaining where the money went.
     * A draft is not a debt; it is also not nothing.
     */
    draftCents: number;
};

export type FinancialsPastDue = {
    amountCents: number;
    oldestDueDate: string;
    agingDays: number;
};

export type FinancialsPeriodGroup = {
    period: BillingPeriod;
    rows: FinancialsLedgerRow[];
    totalCents: number;
};

export type FinancialsChargeTemplateOption = {
    id: string;
    label: string;
    categoryKey: string;
    categoryLabel: string;
    amountStrategy: string;
    /** Present only for `fixed` templates; anything else is priced by resolution. */
    amountCents: number | null;
    currencyCode: string;
    /**
     * WHETHER CONFIRMING THIS TEMPLATE WILL WAIT FOR REVIEW.
     *
     * The tenant's `posting_review` Financial Policy resolved for this template's service, OR'd with
     * the template's own `review_required` — the same disjunction `resolveChargeFromTemplate` applies
     * when it writes. It is carried here so the command can PREVIEW the act it will perform rather
     * than describing a mechanism that may not apply.
     */
    reviewRequired: boolean;
    occursOnStrategy: string;
    billableOnStrategy: string;
};

/** A fact the platform does not own yet, named rather than rendered as zero. */
export type FinancialsUnavailable = { fact: string; reason: string };

export type FinancialsCardVM = {
    /** Null when the subject has no enrollment agreement at all — nothing financial to say. */
    account: { customerId: string | null; label: string | null } | null;
    period: BillingPeriod;
    subjects: FinancialsSubject[];
    /**
     * The manual reductions recorded against this account, newest first.
     *
     * The reconciliation already says what they came to. A total cannot be reversed, and reversing
     * one needs its application id — which an operator cannot be expected to know — so the records
     * themselves reach the surface.
     */
    reductions: AccountReduction[];
    /** Every row across every period, already placed and presented. */
    rows: FinancialsLedgerRow[];
    /** The CURRENT period only. */
    reconciliation: FinancialsReconciliation;
    /** The same reconciliation, narrowed per child — keyed by `customer_members.id`. */
    reconciliationBySubject: Record<string, FinancialsReconciliation>;
    pastDue: FinancialsPastDue | null;
    pastDueBySubject: Record<string, FinancialsPastDue | null>;
    ledgerPeriods: FinancialsPeriodGroup[];
    /**
     * Money received on this account, newest first — receipts AND refunds.
     *
     * A refund is not a negative receipt: it is an outbound row naming the receipt it reverses, so
     * the pair reads as "this arrived, and this much of it went back" rather than as two unrelated
     * amounts. `appliedCents` is what each one is actually doing to a balance right now, which is
     * how an operator tells a payment sitting unapplied on the account from one that has settled an
     * obligation.
     */
    payments: FinancialsPaymentRow[];
    chargeTemplates: FinancialsChargeTemplateOption[];
    unavailable: FinancialsUnavailable[];
    /**
     * Canonical payment state to show the operator, or null when none exists.
     *
     * Deliberately NOT the `unavailable` list: that records why the PLATFORM cannot answer, which is
     * a development finding and never operator copy.
     *
     * DERIVED, not declared. This was the literal `null` for the whole life of the card, and the
     * adapter read it as "no payment method on file" — a claim about a family made from a constant
     * nobody had ever computed. It now comes from `resolvePaymentSetup`, which looks.
     */
    paymentSetup: string | null;
    /**
     * The Autopay sentence, from the canonical arrangement (W5). Null means NO arrangement, which
     * is a measurement — it used to be listed as a platform unavailability because nothing could
     * answer the question at all.
     */
    autopayLine: string | null;
    autopayHealthy: boolean;
    /**
     * WHAT THIS ORGANISATION CAN ACTUALLY DO WITH MONEY, per capability, with a reason when it
     * cannot. `unsupported` (Alloy has no implementation) and `not_configured` (it has one and this
     * organisation has not set it up) are deliberately different answers.
     */
    paymentCapabilities: PaymentSetupState | null;
    /**
     * WHO COULD HAVE PAID — household membership, never responsibility.
     *
     * Distinct from `payers`, which is persisted responsibility. A grandparent settling a bill is a
     * payer and is responsible for nothing; defaulting one to the other is the collapse the payment
     * model forbids.
     */
    payerCandidates: PayerCandidate[];
    /**
     * Whether this organization's merchant can actually take a bank debit.
     *
     * Resolved from the merchant's provider capability on the SERVER. The browser is told the
     * answer and never computes it: a surface that decided its own rail availability would offer a
     * collection the provider then refuses, after the operator had been told it was under way.
     */
    achAvailable: boolean;
    /**
     * Collections the provider has not finished, as the DATABASE holds them.
     *
     * An in-flight card collection lasts seconds and lived happily in component state. A bank debit
     * lasts days: the operator closes the tab, comes back tomorrow, and must still be told the money
     * is on its way. Lifecycle that exists only in React disappears on reload and takes the truth
     * with it, so the open attempts travel on the view model and the surface reads them.
     *
     * Recognised collections are absent on purpose — once Thread 8 has the receipt, the payment
     * history is the truth and an attempt is just how it got there.
     */
    openCollections: Array<{
        attemptId: string;
        rail: string;
        processorState: string;
        providerActionType: string | null;
        chargeId: string | null;
        amountCents: number;
        currencyCode: string;
        updatedAt: string | null;
    }>;
    /**
     * WHO is responsible for this account, from the canonical `payer` contact role.
     *
     * `share` is deliberately nullable and is null today for every payer. Alloy has a payer ROLE
     * (`customer_person_role_types`, seeded `childcare_contact_role` → `payer`) but NO allocation
     * store — nothing anywhere records that Jordan carries 70% and Taylor 30%. The card therefore
     * names the payers and states no split, because a split invented here would assign real money
     * to real people on no record.
     */
    payers: Array<{ personId: string; name: string; share: string | null; method: string | null }>;
    /**
     * WHO OWES WHAT, from persisted allocations — never a share invented here.
     *
     * Thread 2 shipped `payers[]` with `share: null` for everyone and said so plainly: there was a
     * payer contact ROLE and no allocation store, so a split rendered here would have assigned real
     * money to real people on no record. Thread 6 built the record, and this is the read of it.
     *
     * `unassignedCents` is not a rounding artefact and is not zero by default: it is money for
     * which no arrangement names anybody, held in the open rather than handed to whichever adult
     * the platform could most plausibly blame.
     */
    responsibility: {
        parties: Array<{ personId: string; name: string; assignedCents: number; attributedCents: number; remainingCents: number }>;
        unassignedCents: number;
        allocatedCents: number;
        /** True when at least one charge in the period has no active allocation at all. */
        hasUnresolvedCharges: boolean;
    };
    /** Expected funding attached to responsibility — never a receipt, never a balance. */
    expectedFunding: Array<{ label: string; sourceType: string; expectedCents: number | null; percentBasisPoints: number | null }>;
    /**
     * WHAT SHOULD ACTUALLY BE COLLECTED FROM THIS FAMILY RIGHT NOW.
     *
     * Thread 8's outstanding is unchanged and remains the authority for what a charge owes. This is
     * the governed position beside it: a SUBMITTED subsidy claim may suppress collection for the
     * amount it attributed, so a family is not chased for money an agency has been asked for. Every
     * figure is derived server-side by `resolveFamilyCollectible` and simply rendered here — a card
     * that recomputed any of it could disagree with the operator's own screen.
     *
     * `unresolvedVarianceCents` sits BESIDE the collectible figure and is never folded into it:
     * when an agency short-pays, the difference is a decision somebody owes, not a bill the family
     * silently inherits.
     */
    /**
     * MONEY THIS ACCOUNT HOLDS THAT IS NOT YET SPENT — and only the part that may be spent.
     *
     * Projected by `resolveAccountPrepaidPosition`, which is the authority; nothing here computes
     * it. UNAPPLIED IS NOT AVAILABLE: a pending receipt is money the platform has been told about,
     * not money it has, so it is reported separately and never offered.
     *
     * `heldSupported: false` means the platform CANNOT TELL a restricted deposit from ordinary
     * prepaid money. A surface must not render that as "$0 held" — an absent capability is not a
     * zero measurement, and claiming it would let an operator spend a refundable deposit believing
     * none was held.
     *
     * Since W4 the authority reports `true`, so a zero IS a measurement. The false branch remains
     * because the empty VM below still uses it: a card that has not read yet has not measured
     * anything, and that is the same claim.
     */
    prepaid: {
        availableCents: number;
        pendingCents: number;
        heldCents: number;
        heldSupported: boolean;
    };
    /**
     * The held deposits behind `prepaid.heldCents` (Payments V1 · W4).
     *
     * Summary needs only the total; DETAILS owns administration and needs the lots — what was
     * originally held, what became of it, under which terms, and since when. Empty until a hold
     * exists, which is why Summary can render from the total alone.
     */
    heldDeposits: HeldDeposit[];
    collectible: {
        outstandingCents: number;
        expectedSubsidyCents: number;
        submittedClaimSuppressionCents: number;
        actualSubsidyReceivedCents: number;
        unresolvedVarianceCents: number;
        currentlyCollectibleCents: number;
    };
    /** Absent when the subject has no attendable/billable enrolment — the card renders no controls. */
    unavailableReason: string | null;
};

/** No id can equal this, so an empty source list selects nothing rather than everything. */
const NO_SOURCE_SENTINEL = "00000000-0000-0000-0000-000000000000";

/*
 * THE EXPLICIT BOUNDS, stated rather than inherited from a server default.
 *
 * These are not the PostgREST page size — `readAllPages` pages past that. They are the point at
 * which this reader refuses to answer at all, because beyond them a single account's balance would
 * cost an unbounded number of round trips. They are deliberately far above any real childcare
 * account: the largest on the certification tenant holds 2,821 charges after months of generated
 * tuition, and a bound is only useful if reaching it means something has gone wrong rather than
 * something has grown.
 *
 * Reaching one is reported as an unavailability, never as a smaller number.
 */
const ACCOUNT_CHARGE_SCAN_CAP = 25_000;
const ACCOUNT_PAYMENT_SCAN_CAP = 25_000;

function t(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

function ymdToday(): string {
    return new Date().toISOString().slice(0, 10);
}

function emptyReconciliation(): FinancialsReconciliation {
    return {
        grossCents: 0,
        discountsCents: 0,
        fundingCents: 0,
        adjustmentsCents: 0,
        responsibilityCents: 0,
        paymentsCents: 0,
        balanceCents: 0,
        scheduledCents: 0,
        draftCents: 0,
    };
}

function baseVm(period: BillingPeriod): FinancialsCardVM {
    return {
        account: null,
        period,
        payers: [],
        responsibility: { parties: [], unassignedCents: 0, allocatedCents: 0, hasUnresolvedCharges: false },
        expectedFunding: [],
        prepaid: { availableCents: 0, pendingCents: 0, heldCents: 0, heldSupported: false },
        heldDeposits: [],
        collectible: {
            outstandingCents: 0,
            expectedSubsidyCents: 0,
            submittedClaimSuppressionCents: 0,
            actualSubsidyReceivedCents: 0,
            unresolvedVarianceCents: 0,
            currentlyCollectibleCents: 0,
        },
        subjects: [],
        reductions: [],
        rows: [],
        reconciliation: emptyReconciliation(),
        reconciliationBySubject: {},
        pastDue: null,
        pastDueBySubject: {},
        ledgerPeriods: [],
        payments: [],
        chargeTemplates: [],
        unavailable: [],
        paymentSetup: null,
        autopayLine: null,
        autopayHealthy: false,
        paymentCapabilities: null,
        payerCandidates: [],
        achAvailable: false,
        openCollections: [],
        unavailableReason: null,
    };
}

/**
 * The unavailabilities that are properties of the PLATFORM rather than of this record.
 *
 * Stated on every composition, because "we have no payments for this family" and "this platform
 * cannot record a payment for this kind of family" are different answers and only one of them is
 * true. See the schema note in the module docstring.
 */
function platformUnavailabilities(): FinancialsUnavailable[] {
    return [
        {
            fact: "payer_split",
            reason: "responsibility splits are owned by Processing, not by Financials configuration",
        },
    ];
}

/**
 * The account's payers, from the canonical contact role — never from a guess about who pays.
 *
 * `share` comes back null for everyone because no allocation store exists. That is the honest
 * answer and the card renders no split for it; when Processing gains an allocation, this is the one
 * place that has to learn to read it.
 */

/**
 * RESPONSIBILITY, READ FROM WHAT WAS PERSISTED.
 *
 * One query over the account's charges, then the attributions against those allocations, so a
 * party's remaining share is DERIVED — assigned less attributed — rather than stored. A stored
 * per-party balance would be the second balance Thread 6 is forbidden to create, and it would drift
 * from Thread 8's the first time an application was reversed.
 *
 * This replaces the payer read Thread 2 shipped, which listed whoever held the `payer` CONTACT role
 * and stated no share because no allocation store existed. That role is still a way to reach a
 * human; it is no longer what makes somebody financially responsible.
 */
/*
 * Exported because charge detail asks the same question about one charge that the card asks
 * about an account's. Two readers of `financial_responsibility_allocations` would be two
 * chances to disagree about who owes what, so there is one.
 */
export async function readResponsibility(
    supabase: SupabaseClient,
    orgId: string,
    chargeIds: readonly string[],
): Promise<{
    responsibility: FinancialsCardVM["responsibility"];
    payers: FinancialsCardVM["payers"];
    expectedFunding: FinancialsCardVM["expectedFunding"];
    /** The same allocations, indexed by charge, so a ledger row can name who owes it. */
    responsibilityByCharge: Map<string, {
        name: string | null; unassigned: boolean; assignedCents: number; unassignedCents: number;
    }>;
}> {
    const empty = {
        responsibility: { parties: [], unassignedCents: 0, allocatedCents: 0, hasUnresolvedCharges: false },
        payers: [],
        expectedFunding: [],
        /* No allocations read means no row can name a responsible party. It never means nobody owes. */
        responsibilityByCharge: new Map<string, {
            name: string | null; unassigned: boolean; assignedCents: number; unassignedCents: number;
        }>(),
    };
    if (chargeIds.length === 0) return empty;

    let allocationRows: Array<Record<string, unknown>>;
    try {
        allocationRows = await readInBatches<Record<string, unknown>>(
            "who is responsible for these charges",
            [...chargeIds],
            (batch) => supabase
                .from("financial_responsibility_allocations")
                .select("id, charge_id, responsible_party_id, is_unassigned, assigned_amount_cents, share_id")
                .eq("org_id", orgId)
                .eq("state", "active")
                .in("charge_id", batch) as never,
        );
    } catch {
        // A responsibility read that fails is an absence of responsibility on the card, never a
        // reason to fail the account — the same rule the payer read has always followed.
        return empty;
    }
    const allocations = (allocationRows ?? []) as Array<{
        id: string;
        charge_id: string;
        responsible_party_id: string | null;
        is_unassigned: boolean;
        assigned_amount_cents: number;
        share_id: string | null;
    }>;
    if (allocations.length === 0) {
        return { ...empty, responsibility: { ...empty.responsibility, hasUnresolvedCharges: true } };
    }


    const { data: attributionRows } = await supabase
        .from("payment_responsibility_attributions")
        .select("responsibility_allocation_id, amount_cents")
        .eq("org_id", orgId)
        .in("responsibility_allocation_id", allocations.map((a) => a.id));
    const attributed = new Map<string, number>();
    for (const row of (attributionRows ?? []) as Array<{ responsibility_allocation_id: string; amount_cents: number }>) {
        attributed.set(row.responsibility_allocation_id, (attributed.get(row.responsibility_allocation_id) ?? 0) + Number(row.amount_cents));
    }

    const byParty = new Map<string, { assigned: number; attributed: number }>();
    let unassignedCents = 0;
    for (const a of allocations) {
        const amount = Number(a.assigned_amount_cents);
        if (a.is_unassigned || !a.responsible_party_id) {
            unassignedCents += amount;
            continue;
        }
        const seen = byParty.get(a.responsible_party_id) ?? { assigned: 0, attributed: 0 };
        seen.assigned += amount;
        seen.attributed += attributed.get(a.id) ?? 0;
        byParty.set(a.responsible_party_id, seen);
    }

    const partyIds = [...byParty.keys()];
    const { data: people } = partyIds.length
        ? await supabase.from("persons").select("id, first_name, last_name, full_name").eq("org_id", orgId).in("id", partyIds)
        : { data: [] };
    const nameById = new Map(
        ((people ?? []) as Array<Record<string, unknown>>).map((p) => [
            t(p.id),
            t(p.full_name) || [t(p.first_name), t(p.last_name)].filter(Boolean).join(" ") || "Responsible party",
        ]),
    );

    const parties = partyIds.map((id) => {
        const totals = byParty.get(id)!;
        return {
            personId: id,
            name: nameById.get(id) ?? "Responsible party",
            assignedCents: totals.assigned,
            attributedCents: totals.attributed,
            remainingCents: totals.assigned - totals.attributed,
        };
    });

    const shareIds = [...new Set(allocations.map((a) => a.share_id).filter((v): v is string => !!v))];
    const { data: fundingRows } = shareIds.length
        ? await supabase
              .from("financial_expected_funding")
              .select("funding_source_label, funding_source_type, expected_amount_cents, percent_basis_points, state")
              .eq("org_id", orgId)
              .eq("state", "active")
              .in("share_id", shareIds)
        : { data: [] };

    const allocatedCents = parties.reduce((acc, p) => acc + p.assignedCents, 0);
    const chargesWithAllocations = new Set(allocations.map((a) => a.charge_id));

    /*
     * ── THE SAME ALLOCATIONS, INDEXED BY CHARGE ────────────────────────────────────────────────
     *
     * So a ledger row can say who owes it. Nothing is re-read and nothing is summed: this walks the
     * rows already in hand. A charge whose allocations name two different people is reported as
     * SPLIT rather than as one of them — picking a winner would be this projection deciding a
     * responsibility question the allocations deliberately left as two.
     */
    const byCharge = new Map<string, {
        names: Set<string>; unassigned: boolean; assignedCents: number; unassignedCents: number;
    }>();
    for (const a of allocations) {
        const entry = byCharge.get(a.charge_id)
            ?? { names: new Set<string>(), unassigned: false, assignedCents: 0, unassignedCents: 0 };
        const amount = Number(a.assigned_amount_cents) || 0;
        if (a.is_unassigned || !a.responsible_party_id) {
            entry.unassigned = true;
            entry.unassignedCents += amount;
        } else {
            entry.names.add(nameById.get(a.responsible_party_id) ?? "Responsible party");
            entry.assignedCents += amount;
        }
        byCharge.set(a.charge_id, entry);
    }
    /*
     * ── A NAME AND A REMAINDER ARE BOTH TRUE AT ONCE ───────────────────────────────────────────
     *
     * A $75.00 obligation resolved under an arrangement naming one $18.00 fixed share produces TWO
     * allocations: $18.00 owed by a person and $57.00 owed by nobody. This map carried only
     * `{name, unassigned}`, the surfaces rendered the name, and an operator read a partially
     * allocated obligation as fully owned by the person named. The $57.00 was invisible.
     *
     * The amounts travel with the name so a surface can say PARTIAL without recomputing anything.
     * They are sums of the allocations already in hand — no second read, and no second opinion
     * about what is owed.
     */
    const responsibilityByCharge = new Map<string, {
        name: string | null; unassigned: boolean; assignedCents: number; unassignedCents: number;
    }>(
        [...byCharge].map(([chargeId, entry]) => [
            chargeId,
            {
                name:
                    entry.names.size === 1 ? [...entry.names][0]!
                    : entry.names.size > 1 ? "Split"
                    : null,
                unassigned: entry.unassigned,
                assignedCents: entry.assignedCents,
                unassignedCents: entry.unassignedCents,
            },
        ]),
    );

    return {
        responsibilityByCharge,
        responsibility: {
            parties,
            unassignedCents,
            allocatedCents,
            hasUnresolvedCharges: chargeIds.some((id) => !chargesWithAllocations.has(id)),
        },
        payers: parties.map((p) => ({
            personId: p.personId,
            name: p.name,
            // A REAL share, because a real allocation assigned it.
            share: `$${(p.assignedCents / 100).toFixed(2)}`,
            // Still null: there is no per-payer payment-method store, and inventing one here would
            // repeat exactly the mistake Thread 2 refused to make about shares.
            method: null,
        })),
        expectedFunding: ((fundingRows ?? []) as Array<Record<string, unknown>>).map((f) => ({
            label: t(f.funding_source_label),
            sourceType: t(f.funding_source_type),
            expectedCents: f.expected_amount_cents == null ? null : Number(f.expected_amount_cents),
            percentBasisPoints: f.percent_basis_points == null ? null : Number(f.percent_basis_points),
        })),
    };
}

/**
 * MONEY RECEIVED ON THIS ACCOUNT, and what each payment is actually paying.
 *
 * ── THE ONE BALANCE RULE ──
 *
 * `appliedByChargeId` counts an application only when it is ACTIVE and its parent payment is POSTED.
 * That predicate is `jobPaymentBalances`'s, quoted rather than re-derived, so the childcare card and
 * the job drawer cannot answer the same question differently. A pending attempt has not arrived; a
 * reversed application was given back; neither moves a balance.
 *
 * ── WHY THE PAYMENTS ARE FOUND THROUGH THE CHARGES ──
 *
 * Applications name a charge, and the charges are already narrowed to this account's billable
 * sources, so the applications reachable from them are this account's by construction. The
 * account-level read (`billable_source_id`) additionally picks up payments that have arrived and been
 * applied to NOTHING yet — money on the account, which a balance-only read would render invisible.
 */
async function readAccountPayments(
    supabase: SupabaseClient,
    orgId: string,
    billableSourceIds: readonly string[],
    chargeIds: readonly string[],
): Promise<{ payments: FinancialsPaymentRow[]; appliedByChargeId: Map<string, number> }> {
    const appliedByChargeId = new Map<string, number>();
    const sourceIds = billableSourceIds.length ? [...billableSourceIds] : [NO_SOURCE_SENTINEL];

    const [allocResult, accountPaymentResult] = await Promise.all([
        /*
         * Batched, because this list of charge ids goes into the URL. On an account with a few
         * hundred charges the request came back `414 URI Too Long`, the error was discarded with the
         * rest of the response, and the card read the empty result as "none of this has been paid" —
         * showing a family the whole balance again after they had settled it.
         */
        readInBatches<Record<string, unknown>>(
            "money applied to these charges",
            [...chargeIds],
            (batch) => supabase
                .from("payment_allocations")
                .select("id, payment_id, charge_id, allocated_amount_cents, status")
                .eq("org_id", orgId)
                .eq("status", "active")
                .in("charge_id", batch) as never,
        ).then((data) => ({ data, error: null })),
        /*
         * PAGED, for the reason the charges read is: an account's receipts are a cohort, not a
         * page, and a receipt the server did not return reads here as money the family never paid.
         * `received_at` is not unique — a day of recorded cheques shares a timestamp — so the order
         * ends in `id` or paging could drop one.
         */
        readAllPages<Record<string, unknown>>(
            "account payments",
            ACCOUNT_PAYMENT_SCAN_CAP,
            (fromIndex, toIndex) =>
                supabase
                    .from("payments")
                    .select(
                        "id, direction, refunds_payment_id, reversal_origin, amount_cents, currency, status, payment_method, "
                        + "processor, received_at, posted_at, reference_number, notes",
                    )
                    .eq("org_id", orgId)
                    /*
                     * The TYPE as well as the id. A billable source id is only unique within its kind, and
                     * an account read that matched on the id alone would claim a job payment that happened
                     * to share a uuid. The applications read below is what picks up a job-era payment
                     * legitimately applied to one of this account's charges.
                     */
                    .in("billable_source_type", [...CHILDCARE_BILLABLE_SOURCE_TYPES])
                    .in("billable_source_id", sourceIds)
                    .order("received_at", { ascending: false })
                    .order("id", { ascending: true })
                    .range(fromIndex, toIndex) as never,
        ).then(({ rows, truncated }) => {
            if (truncated) {
                throw new Error(
                    `this account holds more than ${ACCOUNT_PAYMENT_SCAN_CAP.toLocaleString()} receipts, `
                    + "which is more than one balance read may carry",
                );
            }
            return { data: rows, error: null as { message: string } | null };
        }),
    ]);

    /*
     * A PAYMENTS READ THAT FAILS IS NOT A ZERO BALANCE.
     *
     * Returning "nothing has been paid" when the truth is "we could not look" is the exact defect
     * this model closed for charges. The account read failing is reported by the caller as an
     * unavailability; it never silently becomes a full balance owed.
     */
    if (accountPaymentResult.error) {
        throw new Error(accountPaymentResult.error.message);
    }
    // The allocation read raises on failure inside `selectIn` rather than returning an empty answer,
    // which is the same rule this block already stated for the account read.

    const allocRows = (allocResult.data ?? []) as unknown as Array<Record<string, unknown>>;
    const paymentRows = (accountPaymentResult.data ?? []) as unknown as Array<Record<string, unknown>>;

    const statusByPaymentId = new Map(paymentRows.map((r) => [t(r.id), t(r.status).toLowerCase()]));
    /*
     * An application can name a payment the ACCOUNT read did not return — a job-era payment whose
     * billable source is a job, applied to a charge this account owns. Its status still decides
     * whether it counts, so it is looked up rather than assumed.
     */
    const unknownPaymentIds = [
        ...new Set(
            allocRows
                .map((r) => t(r.payment_id))
                .filter((id) => id && !statusByPaymentId.has(id)),
        ),
    ];
    if (unknownPaymentIds.length) {
        /*
         * Batched for the same reason the applications read is: this id list comes from the
         * applications and grows with the account, and an over-long URI would be discarded exactly
         * where a payment's status decides whether it counts.
         */
        const extra = await readInBatches<Record<string, unknown>>(
            "statuses of payments named by applications",
            unknownPaymentIds,
            (batch) => supabase
                .from("payments")
                .select("id, status")
                .eq("org_id", orgId)
                .in("id", batch) as never,
        );
        for (const r of extra as unknown as Array<Record<string, unknown>>) {
            statusByPaymentId.set(t(r.id), t(r.status).toLowerCase());
        }
    }

    const appliedByPaymentId = new Map<string, number>();
    for (const raw of allocRows) {
        const paymentId = t(raw.payment_id);
        const chargeId = t(raw.charge_id);
        if (!paymentId || !chargeId) continue;
        // Only POSTED money reduces a balance. This is the whole rule, and it lives here once.
        if (statusByPaymentId.get(paymentId) !== "posted") continue;
        const cents = Number(raw.allocated_amount_cents) || 0;
        appliedByChargeId.set(chargeId, (appliedByChargeId.get(chargeId) ?? 0) + cents);
        appliedByPaymentId.set(paymentId, (appliedByPaymentId.get(paymentId) ?? 0) + cents);
    }

    const payments: FinancialsPaymentRow[] = paymentRows.map((raw) => {
        const id = t(raw.id);
        return {
            paymentId: id,
            direction: t(raw.direction) === "outbound" ? "outbound" : "inbound",
            refundsPaymentId: t(raw.refunds_payment_id) || null,
            reversalOrigin: (t(raw.reversal_origin) || null) as "operator" | "provider" | null,
            amountCents: Number(raw.amount_cents) || 0,
            currencyCode: t(raw.currency) || "USD",
            status: t(raw.status).toLowerCase(),
            method: t(raw.payment_method),
            processor: t(raw.processor) || null,
            receivedAt: t(raw.received_at) || null,
            postedAt: t(raw.posted_at) || null,
            appliedCents: appliedByPaymentId.get(id) ?? 0,
            // Enriched below from the canonical application composition; a payment read that never
            // reaches it still renders, with no applications rather than invented ones.
            unappliedCents: 0,
            payerLabel: null,
            applications: [],
            reference: t(raw.reference_number) || null,
            notes: t(raw.notes) || null,
        };
    });

    return { payments, appliedByChargeId };
}

type FinancialsBuildArgs = {
    orgId: string;
    /** The household whose children's agreements make up the account. */
    customerId?: string | null;
    /** Narrow the whole model to ONE child. The card's subject filter uses this. */
    customerMemberId?: string | null;
    /** Operating day; defaults to today. Certification pins it. */
    today?: string | null;
    /**
     * Server-Timing phase marker, supplied by the route that is already measuring itself.
     *
     * Optional and defaulted to a no-op at the single consumption site, so a caller that is not
     * instrumenting — every test, and the workspace path — passes nothing and measures nothing.
     * The build does NOT create its own timing authority: it writes into the route's.
     */
    mark?: (phase: string) => void;
};

type FinancialsBuildClock = ReturnType<typeof financialsClock>;

/**
 * SLICE 12E — the build reports its own internal boundaries.
 *
 * Slice 12D measured this function deployed as the card-producer LONG POLE: `financials_build_ms`
 * 2,423 ms median, 89 % of `card_producers_ms`. It could not say what inside it costs that, because
 * the whole build was one span over roughly fifteen table reads.
 *
 * The wrapper exists so the spans are filed on EVERY exit — the four early returns for "no household
 * in scope", a failed agreements read and a failed charges read, and a throw. Recording at each
 * `return` instead would have left the interesting failure paths unmeasured, which is how a boundary
 * gets called cheap because nobody ever saw its number.
 */
export async function buildFinancialsCardVM(
    supabase: SupabaseClient,
    args: FinancialsBuildArgs,
): Promise<FinancialsCardVM> {
    const clock = financialsClock();
    try {
        return await buildFinancialsCardVMInner(supabase, args, clock);
    } finally {
        recordFinancialsSpans(clock.spans());
    }
}

async function buildFinancialsCardVMInner(
    supabase: SupabaseClient,
    args: FinancialsBuildArgs,
    clock: FinancialsBuildClock,
): Promise<FinancialsCardVM> {
    const mark = args.mark ?? (() => {});
    const today = t(args.today) || ymdToday();
    const period = billingPeriodForDate(today);
    const vm = baseVm(period);
    vm.unavailable = platformUnavailabilities();

    const customerId = t(args.customerId) || null;
    const memberId = t(args.customerMemberId) || null;
    if (!customerId && !memberId) {
        return { ...vm, unavailableReason: "No household or child in scope." };
    }

    /*
     * ── SLICE 12E · THE ORG-GRAIN READS START NOW, NOT FOUR AND NINE ROUND TRIPS LATER ───────────
     *
     * These depend on `orgId` and on nothing else. They were issued deep inside the build — the GL
     * configuration behind four serial reads, the merchant behind nine — purely because that is
     * where their results are first USED. Source order was standing in for a dependency that does
     * not exist.
     *
     * Same queries, same predicates, same rows. `processor = stripe` is kept: `resolvePaymentSetup`
     * also reads this table, but it takes ANY active merchant, so the two are not the same question
     * and collapsing them would quietly change which merchant answers for ACH. Hoisted, not deduped.
     *
     * `.catch` is attached at creation because the early-return paths below never await these, and
     * an unawaited rejection must not surface as an unhandled one.
     */
    const configRead = clock.time("config_ms", () =>
        Promise.all([
            supabase.from("gl_account_mappings").select("key, gl_account_id, is_active").eq("org_id", args.orgId),
            supabase.from("gl_accounts").select("id, code, name, is_active").eq("org_id", args.orgId),
            supabase
                .from("financial_charge_templates")
                .select(
                    "id, label, charge_category, amount_strategy, amount_cents, currency_code, "
                    /*
                 * `review_required` and `service_id` are read because the CARD has to be able to
                 * say what confirming Add will actually do. Without them the command could only
                 * assume, and it assumed the old universal-draft behaviour — telling an operator
                 * a charge would wait for review on a tenant that posts it immediately.
                 */
                + "occurs_on_strategy, billable_on_strategy, trigger_type, is_active, effective_start, effective_end, "
                + "review_required, service_id",
                )
                .eq("org_id", args.orgId)
                .eq("is_active", true)
                .order("label", { ascending: true }),
        ]),
    ).catch(() => [{ data: [] }, { data: [] }, { data: [] }] as Array<{ data: unknown }>);

    /*
     * ── SLICE 12F · THE PAYMENT VIEWS NEVER NEEDED THE PAYMENTS READ ─────────────────────────────
     *
     * `resolveHouseholdPaymentViews(supabase, { orgId, customerId })` takes those two arguments and
     * nothing else. It issues its OWN `payments` read and its own allocations, charges and customers
     * reads, and never touches what `readAccountPayments` returned — the two answers are married
     * afterwards, by payment id. Slice 12E chained it behind the payments read anyway, on my reading
     * that the dependency was real. It is not, and the deployed spans put a number on the mistake:
     * `payment_views_ms` 1,152 ms median, 75 % of `financials_build_ms`, waiting for a read it does
     * not consume.
     *
     * Both inputs are known HERE, before the first await, so this is where it starts. The household
     * is `args.customerId` — the account this card is about — and when the caller gave only a child
     * there is no household to resolve views for, exactly as before.
     *
     * It resolves to a TAGGED OUTCOME rather than rejecting, because the early-return paths below
     * never await it and an unawaited rejection must not surface as an unhandled one. The failure
     * itself is not swallowed: §2's contract is re-imposed at the join, where a views failure still
     * makes the whole payments answer unavailable.
     */
    const household = t(args.customerId) || null;
    const paymentViewsP: Promise<
        { ok: true; views: PaymentView[] | null } | { ok: false; error: unknown }
    > = household
        ? clock
              .time("payment_views_ms", () =>
                  resolveHouseholdPaymentViews(supabase, { orgId: args.orgId, customerId: household }),
              )
              .then((views) => ({ ok: true as const, views }))
              .catch((error: unknown) => ({ ok: false as const, error }))
        : Promise.resolve({ ok: true as const, views: null });

    const merchantRead = clock
        .time("merchant_ms", () =>
            supabase
                .from("payment_provider_merchants")
                /* BOTH readiness facts: the rail rule needs merchant-level readiness first. */
                .select("readiness, ach_readiness")
                .eq("org_id", args.orgId)
                .eq("processor", "stripe")
                .eq("is_active", true)
                .maybeSingle(),
        )
        .catch(() => ({ data: null }));

    // ── SUBJECTS: the agreements that ARE the billable sources ────────────────────────────────────
    let agreementQuery = supabase
        .from("child_enrollment_agreements")
        .select("id, customer_member_id, customer_id, status")
        .eq("org_id", args.orgId);
    agreementQuery = memberId
        ? agreementQuery.eq("customer_member_id", memberId)
        : agreementQuery.eq("customer_id", customerId as string);
    const { data: agreementRows, error: agreementError } = await clock.time("agreements_ms", () => agreementQuery);
    if (agreementError) {
        return { ...vm, unavailableReason: `Financial records unavailable: ${agreementError.message}` };
    }
    const agreements = (agreementRows ?? []) as Array<{
        id: string;
        customer_member_id: string;
        customer_id: string | null;
        status: string;
    }>;
    /*
     * AN ENROLMENT IS ONE BILLABLE SOURCE, NOT ELIGIBILITY FOR FINANCIALS.
     *
     * This used to return "No enrollment agreement, so there is nothing billable yet" and replace the
     * whole card. That encoded a product assumption the business rejects: a family incurs charges
     * BEFORE they enrol — a waitlist fee, a registration or application fee, a deposit. Gating the
     * card on an agreement made those charges unreachable and, worse, told the operator the family
     * had nothing billable when the truth was that we had not looked.
     *
     * Whether a PARTICULAR charge needs an agreement belongs to the charge template and the
     * `charge.add` resolver — tuition may require one, a waitlist fee must not. It is never the
     * card provider's question.
     */
    const resolvedCustomerId = customerId ?? (t(agreements[0]?.customer_id) || null);
    const memberIds = [...new Set(agreements.map((a) => a.customer_member_id))];
    const memberByAgreement = new Map(agreements.map((a) => [a.id, a.customer_member_id]));
    /*
     * Every id this account can be charged against: its enrolment agreements, and the household.
     * A charge whose source is the household has no child subject, which the ledger renders as the
     * account rather than inventing an attribution.
     */
    const billableSourceIds = [
        ...agreements.map((a) => a.id),
        ...(resolvedCustomerId ? [resolvedCustomerId] : []),
    ];

    /*
     * ── SLICE 12E · EVERYTHING THE AGREEMENTS UNLOCK, IN ONE PASS ────────────────────────────────
     *
     * Members, reductions and charges each need the agreements and nothing else — yet they ran one
     * after another, so a card waited three round trips deep for reads that could have gone out
     * together. None of them consumes another's result: `nameByMember` decorates rows the charges
     * read produces, and `vm.reductions` is its own history.
     *
     * Each keeps its OWN failure behaviour. Reductions still degrade to an empty history rather
     * than taking the account down; a members read that fails still leaves rows named "Child"; and
     * a charges failure is still the one that makes the card unavailable, below.
     */
    const [memberResult, reductions, chargeResult, configResult] = await Promise.all([
        clock.time("members_ms", () =>
            supabase
                .from("customer_members")
                .select("id, first_name, last_name, display_name")
                .eq("org_id", args.orgId)
                .in("id", memberIds),
        ).catch(() => ({ data: [] as unknown })),
        clock
            .time("reductions_ms", () =>
                readAccountReductions(supabase, {
                    orgId: args.orgId,
                    agreementIds: agreements.map((a) => a.id),
                }),
            )
            // A reduction read that fails must not take the whole account down with it: the balance
            // is still true, and an empty history is the honest presentation of "not loaded".
            .catch(() => [] as AccountReduction[]),
        /*
         * BOTH SOURCES, in one read. A household's account is the union of what its enrolments owe
         * and what the household itself owes — the pre-enrolment fees that have no agreement to hang
         * off. `billable_source_type` already carries the distinction; nothing new is invented here.
         */
        /*
         * PAGED, because a long-lived account outgrows one PostgREST response.
         *
         * This read asked for an account's whole charge history in one query and got the server's
         * first 1,000 rows — silently, with no error and nothing on screen to say so. The balance,
         * past due and collectible below were then computed from part of a ledger. Measured on the
         * certification tenant: 2,821 charges on the account, 1,000 read, and the Financials
         * Workspace — which already paged — reporting a different figure for the same family.
         *
         * `readAllPages` is the Workspace's own loop, so both surfaces now walk the cohort the same
         * way. The order ends in `id` because paging over a non-unique key can repeat or skip rows
         * across page boundaries, and a repeated charge is money counted twice.
         */
        clock.time("charges_ms", () =>
            readAllPages<Record<string, unknown>>(
                "account charges",
                ACCOUNT_CHARGE_SCAN_CAP,
                (fromIndex, toIndex) =>
                    supabase
                        .from("charges")
                        .select(
                            "id, billable_source_type, billable_source_id, source_charge_id, charge_category, charge_type, status, amount_cents, currency_code, charge_template_id, "
                            + "service_date, occurs_on, billable_on, due_date, posted_at, voided_at, description, metadata, created_at",
                        )
                        .eq("org_id", args.orgId)
                        .in("billable_source_id", billableSourceIds.length ? billableSourceIds : [NO_SOURCE_SENTINEL])
                        .order("id", { ascending: true })
                        .range(fromIndex, toIndex) as never,
            ).then(({ rows, truncated }) =>
                /*
                 * A BALANCE IS NOT ALLOWED TO BE PARTIAL. The workspace may report "there is more
                 * than this scan carried" because it answers an operational question across an
                 * organisation. This answers one family's account, where a number derived from part
                 * of the ledger is not incomplete — it is wrong. So the cap failing is an
                 * unavailability, which the card already knows how to say.
                 */
                truncated
                    ? {
                          data: null,
                          error: {
                              message:
                                  `this account holds more than ${ACCOUNT_CHARGE_SCAN_CAP.toLocaleString()} charges, `
                                  + "which is more than one balance read may carry",
                          },
                      }
                    : { data: rows, error: null },
            ),
        ).catch((e: unknown) => ({ data: null, error: { message: e instanceof Error ? e.message : String(e) } })),
        configRead,
    ]);
    const memberRows = (memberResult as { data: unknown }).data;
    const [glMappingResult, glAccountResult, templateResult] = configResult as Array<{ data: unknown }>;
    vm.reductions = reductions;

    /*
     * ── THE POLICIES THOSE REDUCTIONS NAME ────────────────────────────────────────────────────
     *
     * Read ONLY for the ids the applications actually carry, so an account with no policy-produced
     * reductions asks nothing. The window is what makes "ongoing" a fact rather than a guess: a
     * policy still active with an open end recurs, one whose window closed does not, and an
     * application whose policy cannot be found reports `unknown` rather than inventing "one-time".
     */
    const policyIds = [...new Set(reductions.map((r) => r.commercialPolicyId).filter((v): v is string => !!v))];
    const policyWindows = new Map<string, ReductionPolicyWindow>();
    if (policyIds.length) {
        const { data: policyRows } = await supabase
            .from("commercial_policies")
            .select("id, effective_start, effective_end, is_active")
            .eq("org_id", args.orgId)
            .in("id", policyIds);
        for (const p of (policyRows ?? []) as unknown as Array<Record<string, unknown>>) {
            policyWindows.set(t(p.id), {
                id: t(p.id),
                effectiveStart: t(p.effective_start) || null,
                effectiveEnd: t(p.effective_end) || null,
                isActive: p.is_active !== false,
            });
        }
    }
    const provenanceByCharge = reductionProvenanceByChargeId(
        reductions,
        policyWindows,
        today,
        /*
         * The basis phrase needs a formatted figure and the VM has no formatter — `money` belongs to
         * the adapter, which runs later. A local one here keeps the layers where they are; it states
         * cents in the account's currency and decides nothing about the amount.
         */
        (cents) =>
            (cents / 100).toLocaleString(undefined, {
                style: "currency",
                // The reductions' own currency; they are stored with one and it is the row's.
                currency: reductions[0]?.currencyCode || "USD",
            }),
    );
    const nameByMember = new Map(
        ((memberRows ?? []) as unknown as Array<Record<string, unknown>>).map((m) => [
            t(m.id),
            t(m.display_name) || [t(m.first_name), t(m.last_name)].filter(Boolean).join(" ") || "Child",
        ]),
    );

    vm.account = { customerId: resolvedCustomerId, label: null };
    // `vm.payers` is filled from PERSISTED RESPONSIBILITY once the charges are known — see below.
    // The `payer` contact role is no longer what makes somebody a payer on this card.
    vm.payers = [];
    /*
     * ── ONE SUBJECT PER CHILD, NOT PER AGREEMENT ──────────────────────────────────────────────
     *
     * A household with no enrolment still HAS an account, and Financials answers for it. But this
     * mapped AGREEMENTS, and a child with more than one — a closed enrolment beside a live one,
     * or a second placement — became two subjects carrying the same name.
     *
     * MEASURED: two children, four entries. Every surface reading `vm.subjects` inherited it. The
     * Add target rendered four checkboxes, and before the unified control the "Applies to" select
     * listed each child twice. The defect predates the control; the control made it visible.
     *
     * A subject is a CHILD. The agreement carried alongside is the billable source, so an ACTIVE
     * one is preferred where a child has several — an open agreement is what a new charge belongs
     * to, and a closed one still owns its history without being what an operator bills against
     * today. Insertion order is preserved so the list does not reshuffle.
     */
    const subjectByMember = new Map<string, { id: string; customer_member_id: string; status: string }>();
    for (const a of agreements) {
        const held = subjectByMember.get(a.customer_member_id);
        if (!held) {
            subjectByMember.set(a.customer_member_id, a);
            continue;
        }
        const heldActive = (held.status ?? "").trim().toLowerCase() === "active";
        const thisActive = (a.status ?? "").trim().toLowerCase() === "active";
        if (!heldActive && thisActive) subjectByMember.set(a.customer_member_id, a);
    }
    vm.subjects = [...subjectByMember.values()].map((a) => ({
        customerMemberId: a.customer_member_id,
        agreementId: a.id,
        displayName: nameByMember.get(a.customer_member_id) ?? "Child",
        agreementStatus: a.status,
    }));

    if (chargeResult.error) {
        return { ...vm, unavailableReason: `Financial records unavailable: ${chargeResult.error.message}` };
    }

    /*
     * GL: `metadata.gl_mapping_key` → `gl_account_mappings.key` → `gl_accounts`.
     *
     * This is the CHARGE's chain. `commercial_revenue_categories → mapped_gl_account_id → gl_accounts`
     * is real and is the Tuition/Catalog configuration chain, but a charge carries no
     * `revenue_category_id` and revenue categories have no key column — only a unique label — so
     * nothing joins a charge to one. Both chains end at `gl_accounts`; this is the one a charge can
     * actually travel. A charge with no mapping renders `Unmapped`, never a blank.
     */
    const accountById = new Map(
        ((glAccountResult.data ?? []) as unknown as Array<Record<string, unknown>>).map((a) => [
            t(a.id),
            { code: t(a.code), name: t(a.name) },
        ]),
    );
    const accountByMappingKey = new Map<string, { code: string; name: string }>();
    for (const raw of (glMappingResult.data ?? []) as Array<Record<string, unknown>>) {
        if (raw.is_active === false) continue;
        const account = accountById.get(t(raw.gl_account_id));
        if (account) accountByMappingKey.set(t(raw.key), account);
    }

    /*
     * THE OPERATOR-FACING LABEL, not the template key.
     *
     * `writeTemplateDraftCharge` writes `description: intent.templateKey`, so a charge's stored
     * description is `field_trip` — an internal key. The tenant already configured "Field trip" as
     * the template's label, and that is what an operator named it, so the label is resolved here and
     * the key is never rendered. A charge whose template has since been retired keeps its stored
     * description rather than losing its identity.
     */
    const labelByTemplateId = new Map(
        ((templateResult.data ?? []) as unknown as Array<Record<string, unknown>>).map((row) => [
            t(row.id),
            t(row.label),
        ]),
    );

    const charges = (chargeResult.data ?? []) as unknown as Array<Record<string, unknown>>;

    /*
     * CORRECTION LINEAGE — which posted charge no longer stands.
     *
     * A reversal is a NEW row pointing at the original through `source_charge_id`, and the original
     * is left exactly as posted because posted money is immutable. Read without that link the
     * ledger shows a charge still reading `posted` beside an unexplained credit — and the card,
     * which offers a transition per lifecycle state, offered `Reverse` on it a second time. That is
     * how one charge came to be reversible twice. Projecting the link is what lets the ledger say
     * `reversed` and the card offer nothing further.
     *
     * `status <> 'void'` and `correction_kind = 'reversal'` are the same predicate the database's
     * unique index uses, so the card and the constraint agree on what a live reversal is.
     */
    const reversalBySource = reversalBySourceChargeId(charges);

    /*
     * THE RECONCILIATION-RELEVANT DERIVATIONS COME FROM THEIR CANONICAL OWNER.
     *
     * Period, category and lifecycle used to be decided here, inline, and the first-order runtime
     * could reach `reconcileRows` but not these — so a second consumer would have had to re-derive
     * what a period is and when a draft is "scheduled". They now come from
     * `deriveAccountChargeLedgerRows`, which both surfaces call, and this mapper layers its
     * PRESENTATION on top: GL account, template label, subject name, reduction provenance.
     */
    const canonicalByChargeId = new Map(
        deriveAccountChargeLedgerRows(charges, today).map((r) => [r.chargeId, r]),
    );

    const rows: FinancialsLedgerRow[] = charges.map((c) => {
        const canonical = canonicalByChargeId.get(t(c.id))!;
        const categoryKey = canonical.categoryKey;
        const metadata = (c.metadata ?? {}) as Record<string, unknown>;
        const mappingKey =
            t(metadata.gl_mapping_key)
            || CHARGE_CATEGORY_GL_MAPPING_KEY[categoryKey as keyof typeof CHARGE_CATEGORY_GL_MAPPING_KEY]
            || "";
        const account = mappingKey ? accountByMappingKey.get(mappingKey) ?? null : null;
        const placement = placeInBillingPeriod(c);
        const status = canonical.status;
        const billableOn = t(c.billable_on) || null;
        const agreementId = t(c.billable_source_id);
        const subjectMemberId = memberByAgreement.get(agreementId) ?? null;
        const correctsChargeId = t(c.source_charge_id) || null;
        const correctionKind = t(metadata.correction_kind) || null;
        const reversedByChargeId = reversalBySource.get(t(c.id)) ?? null;
        const amountCents = Number(c.amount_cents ?? 0);
        return {
            chargeId: t(c.id),
            date: billableOn ?? t(c.occurs_on) ?? t(c.service_date) ?? null,
            periodKey: canonical.periodKey,
            periodBasis: placement.basis,
            subjectMemberId,
            subjectName: subjectMemberId ? nameByMember.get(subjectMemberId) ?? null : null,
            categoryKey,
            categoryLabel: chargeCategoryLabel(categoryKey),
            description: labelByTemplateId.get(t(c.charge_template_id)) || t(c.description) || null,
            amountCents,
            currencyCode: t(c.currency_code) || "USD",
            status,
            lifecycleStatus: canonical.lifecycleStatus,
            correctsChargeId,
            correctionKind,
            reversedByChargeId,
            offersReverse: offersReverseTransition({ status, reversedByChargeId, correctsChargeId }),
            /*
             * Filled in below, once the payments read has answered. Until then a row owes its whole
             * amount and offers nothing — the honest state for a card that has not yet been told
             * what has been paid, and the state that survives if the payments read fails.
             */
            appliedCents: 0,
            outstandingCents: amountCents,
            offersPayment: false,
            dueDate: canonical.dueDate,
            glCode: account?.code ?? null,
            glAccountName: account?.name ?? null,
            /* Filled in below, once the responsibility read has answered. Absent until then. */
            responsiblePartyName: null,
            responsibilityUnassigned: false,
            responsibilityAssignedCents: 0,
            responsibilityUnassignedCents: 0,
            /*
             * PROVENANCE, not a key. `metadata.charge_template_key` is `field_trip`; the operator
             * configured that template and already sees its LABEL in the description, so this column
             * says HOW the row came to exist rather than repeating an identifier.
             */
            source: t(metadata.source) === "charge_template" ? "Template" : t(metadata.source) ? "Import" : "Manual",
            /*
             * The decision behind this row, when the row is a reduction. Looked up by the charge the
             * application wrote, which is exactly how a reduction reaches the ledger in the first
             * place. Null for an ordinary charge, and null for a reduction with no application
             * record — an absence stated rather than a shape invented.
             */
            reduction: provenanceByCharge.get(t(c.id)) ?? null,
        };
    });
    // Newest first inside a period; the ledger reads downward through time.
    rows.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || a.chargeId.localeCompare(b.chargeId));

    /*
     * ── SLICE 12E · EVERY REMAINING READ IS ISSUED HERE, WHERE ITS INPUTS EXIST ──────────────────
     *
     * From this point the build made five more trips through the database strictly one after
     * another — responsibility, the collectibility loop, payments, payment setup, open collections —
     * and NONE of them consumes another's result. Each needs only the charge ids and the account,
     * both of which are known now. They were serial because each was awaited where its answer is
     * first read, which is a statement about the code's layout, not about the data.
     *
     * The promises are created here and awaited below in exactly the order they always were, so the
     * assembly sequence — responsibility onto the rows, then collectibility, then applied money — is
     * unchanged and every failure still degrades exactly where it did. What changes is only that the
     * waiting overlaps.
     *
     * The collectibility LOOP is deliberately left serial: parallelising a per-obligation subsidy
     * resolver multiplies concurrent database pressure by the number of obligations, and that is a
     * money-facing change that deserves its own slice and its own regression rather than a ride on
     * this one.
     */
    const chargeIdsForReads = rows.map((r) => r.chargeId);
    const accountCustomerId = vm.account.customerId;

    const responsibilityP = clock.time("responsibility_ms", () =>
        readResponsibility(supabase, args.orgId, chargeIdsForReads),
    );
    /*
     * The payments read starts here, where ITS inputs exist — the billable sources and the charge
     * ids. The views have been in flight since entry; this JOINS them.
     *
     * The join, not the sequencing, is what carried the contract, and the contract is unchanged:
     * either read failing means the card cannot say what has been paid, so both still resolve into
     * ONE outcome and a views failure is re-thrown here rather than quietly becoming an absence.
     */
    const paymentsP = clock
        .time("payments_ms", () =>
            readAccountPayments(supabase, args.orgId, billableSourceIds, chargeIdsForReads),
        )
        .then(async (received) => {
            const seen = await paymentViewsP;
            // A VIEWS FAILURE IS STILL A PAYMENTS FAILURE. Letting it resolve to `null` here would
            // be the one thing concurrency must not buy: an error presented as "no payment views".
            if (!seen.ok) throw seen.error;
            return { ok: true as const, received, views: seen.views };
        })
        .catch((e: unknown) => ({ ok: false as const, error: e }));
    const setupP = clock
        .time("payment_setup_ms", () =>
            resolvePaymentSetup(supabase, { orgId: args.orgId, customerId: accountCustomerId }),
        )
        .catch(() => null);
    /* Chained, not concurrent: the candidates read genuinely needs the responsible parties. */
    const payersP = responsibilityP
        .then((read) =>
            clock.time("payer_candidates_ms", () =>
                resolvePayerCandidates(supabase, {
                    orgId: args.orgId,
                    customerId: accountCustomerId ?? "",
                    /* Reported as an overlap on each candidate. Never used to order or default the choice. */
                    responsiblePersonIds: (read.responsibility?.parties ?? []).map((party) => String(party.personId)),
                }),
            ),
        )
        .catch(() => ({ candidates: [] as PayerCandidate[] }));
    const openCollectionsP = chargeIdsForReads.filter(Boolean).length
        ? clock
              .time("open_collections_ms", () =>
                  supabase
                      .from("payment_collection_attempts")
                      .select("id, rail, processor_state, provider_action_type, charge_id, requested_amount_cents, currency, updated_at, canonical_payment_id")
                      .eq("org_id", args.orgId)
                      .in("charge_id", chargeIdsForReads.filter(Boolean).slice(0, 200))
                      .is("canonical_payment_id", null)
                      .in("processor_state", ["initiated", "requires_payment_method", "requires_action", "processing", "succeeded"])
                      .order("updated_at", { ascending: false }),
              )
              .catch(() => ({ data: null }))
        : Promise.resolve({ data: null });

    /*
     * WHO OWES IT — read once, from what Thread 6 persisted, and shared by every density.
     *
     * This is the seam Thread 2 named and deliberately left open: it shipped `payers[]` with a null
     * share because no allocation store existed, and said the card would have to learn to read one
     * when Processing gained an allocation. This is that read. Nothing is computed here — the cents
     * come from the allocations, and what a party still owes is assigned less attributed.
     */
    const responsibilityRead = await responsibilityP;
    /*
     * The responsible party lands on the ROW, from the allocations already read. A second query
     * here would be a second answer to the same question; this is the same answer, indexed.
     */
    for (const row of rows) {
        const owned = responsibilityRead.responsibilityByCharge.get(row.chargeId);
        row.responsiblePartyName = owned?.name ?? null;
        row.responsibilityUnassigned = owned?.unassigned ?? false;
        /* Both halves, so a surface can state PARTIAL from canonical truth rather than infer it. */
        row.responsibilityAssignedCents = owned?.assignedCents ?? 0;
        row.responsibilityUnassignedCents = owned?.unassignedCents ?? 0;
    }

    /*
     * COLLECTIBILITY, SUMMED FROM THE PERIOD'S POSTED OBLIGATIONS.
     *
     * One resolver call per posted obligation, added up — not a second implementation of the rule.
     * Only posted charges are asked about, because a draft owes nothing yet and asking would report
     * a suppression against money that is not owed.
     *
     * ── AND ONLY OBLIGATIONS, WHICH IS NOT THE SAME AS "EVERY POSTED ROW" ──────────────────────
     *
     * A reduction and a correction are posted rows too, and they are already counted INSIDE the net
     * of the charge they reduce — `resolveAllocatableNet` sums them against their `source_charge_id`.
     * Asking the resolver about them again counts them twice.
     *
     * That used to be invisible because it was silent: a reduction is negative, the resolver refuses
     * a non-tuition charge worth nothing or less with `not_allocatable`, and the catch below turned
     * the refusal into a zero. So credits vanished from this total and nothing looked wrong.
     *
     * REVERSING a reduction is what exposed it. The reversal appends a POSITIVE `adjustment` row,
     * which reads to the resolver as an ordinary obligation — so the credit contributed nothing on
     * the way down and its reversal contributed in full on the way up. A household owing $93.00 was
     * reported as $173.00 collectible, overstated by exactly the reversed credits, while the account
     * side's own reconciliation had it right the whole time. Two canonical authorities, one wrong
     * answer, and a demand for money the family did not owe.
     *
     * The filter is the same distinction `reconcileRows` already makes: gross is what is owed, and
     * funding, discounts, adjustments and corrections are things that happen TO it.
     */
    /*
     * ── ASKED CONCURRENTLY, BECAUSE THE QUESTIONS ARE INDEPENDENT ──────────────────────────────
     *
     * The resolver is unchanged and is still the only authority on a family's collectible position;
     * what changed is that the account no longer waits for each charge in turn. Measured on the
     * mounted card via Server-Timing: this phase was 1206ms of a 3157ms response — 38% of the whole
     * Details wait — because one round trip per posted obligation ran end to end.
     *
     * Nothing here caches a financial figure or answers the question a second way. The charges are
     * independent of each other, the sums are addition, and a refusal still contributes nothing.
     * Concurrency is bounded so a long period cannot open an unbounded number of connections.
     */
    const collectible = { outstandingCents: 0, expectedSubsidyCents: 0, submittedClaimSuppressionCents: 0, actualSubsidyReceivedCents: 0, unresolvedVarianceCents: 0, currentlyCollectibleCents: 0 };
    const collectibleRows = rows.filter(
        (r) => r.lifecycleStatus === "posted" && r.periodKey === period.key && !isCollectibleOffsetRow(r),
    );
    // How many round trips this loop makes. A duration alone cannot tell one slow read from N reads,
    // and those two facts want opposite repairs.
    clock.count("collectible_calls", collectibleRows.length);
    /*
     * ── ASKED CONCURRENTLY, BECAUSE THE QUESTIONS ARE INDEPENDENT ──────────────────────────────
     *
     * Staging parallelised the phases around this one and left this loop serial. Measured on the
     * mounted card through Server-Timing before that change: 1206ms of a 3157ms response — 38% of
     * the whole Details wait — because one round trip per posted obligation ran end to end.
     *
     * The resolver is untouched and is still the only authority on a family's collectible position.
     * The charges are independent of one another, the sums are addition, and a refusal still
     * contributes nothing. Only the waiting is concurrent, and it is bounded so a long period
     * cannot open an unbounded number of connections. The diagnostics above are staging's and are
     * kept: the call count is exactly what distinguishes one slow read from N reads.
     */
    const COLLECTIBLE_CONCURRENCY = 8;
    for (let i = 0; i < collectibleRows.length; i += COLLECTIBLE_CONCURRENCY) {
        const positions = await clock.time("collectible_ms", () =>
            Promise.all(
                collectibleRows.slice(i, i + COLLECTIBLE_CONCURRENCY).map((row) =>
                    resolveFamilyCollectible(supabase, { orgId: args.orgId, chargeId: row.chargeId }).catch(
                        () => null,
                    ),
                ),
            ),
        );
        for (const position of positions) {
            if (!position) {
                // A charge the resolver cannot speak for (a void, a charge with no allocatable net)
                // contributes nothing rather than failing the account — the same rule every other
                // read on this card follows.
                continue;
            }
            collectible.outstandingCents += position.outstandingCents;
            collectible.expectedSubsidyCents += position.expectedSubsidyCents;
            collectible.submittedClaimSuppressionCents += position.submittedClaimSuppressionCents;
            collectible.actualSubsidyReceivedCents += position.actualSubsidyReceivedCents;
            collectible.unresolvedVarianceCents += position.unresolvedVarianceCents;
            collectible.currentlyCollectibleCents += position.currentlyCollectibleCents;
        }
    }
    mark("collectible");
    vm.collectible = collectible;
    vm.responsibility = responsibilityRead.responsibility;
    vm.payers = responsibilityRead.payers;
    vm.expectedFunding = responsibilityRead.expectedFunding;

    vm.rows = rows;

    /*
     * RECONCILIATION, ONCE PER SCOPE.
     *
     * Computed for the whole account AND for each child, because the card's subject filter narrows
     * the LEDGER and a total that did not narrow with it would sit above rows that do not add up to
     * it — the exact defect the browser found: "$100.00" over a filtered ledger showing $75. Doing it
     * here rather than in the card keeps the rule in one place; doing it per subject rather than
     * re-fetching keeps the filter free of a network round trip.
     */
    let appliedByChargeId = new Map<string, number>();
    const paymentsOutcome = await paymentsP;
    try {
        if (!paymentsOutcome.ok) throw paymentsOutcome.error;
        const received = paymentsOutcome.received;
        vm.payments = received.payments;
        appliedByChargeId = received.appliedByChargeId;

        /*
         * ONE COMPOSITION OWNS APPLICATIONS AND UNAPPLIED MONEY.
         *
         * `readAccountPayments` sums active allocations and then discards them, which is all a balance
         * needs. Rendering "which charge, and was it undone" needs the rows themselves plus the
         * reversed history it deliberately filters out. Rather than widen that query and grow a second
         * place where applied money is decided, the canonical composition is asked and merged in by
         * payment id. It is the same authority the service uses, so the two cannot disagree.
         */
        const views = paymentsOutcome.views;
        if (views) {
            const byPaymentId = new Map(views.map((v) => [v.paymentId, v]));
            vm.payments = vm.payments.map((row) => {
                const view = byPaymentId.get(row.paymentId);
                if (!view) return row;
                return {
                    ...row,
                    unappliedCents: view.unappliedCents,
                    payerLabel: view.payerLabel,
                    applications: view.applications,
                };
            });

            /*
             * THE PREPAID POSITION, FROM THE AUTHORITY THAT OWNS IT.
             *
             * Asked here rather than derived in a component: a card that summed unapplied cents
             * itself would be a second answer to "what may this family spend", and it would get the
             * PENDING case wrong — which is the one that can offer money that never arrives.
             */
            /*
             * HELD MONEY (Payments V1 · W4), read here and passed IN.
             *
             * `availableFunds` sums what canonical authorities report and computes no money of its
             * own, so it is told how much of each receipt is restricted rather than reading it. A
             * failed holds read leaves the map empty, which reports held money as zero — the
             * conservative direction is arguable either way, and this one is chosen because the
             * alternative is refusing to show a family's prepaid position at all because a
             * restriction could not be counted. The holds themselves travel to Details separately.
             */
            const holds = await readHoldsForPayments(supabase, {
                orgId: args.orgId,
                paymentIds: views.map((v) => v.paymentId),
            });
            const heldByPayment: Record<string, number> = {};
            for (const v of views) {
                const held = heldCentsFor(v.paymentId, holds);
                if (held > 0) heldByPayment[v.paymentId] = held;
            }
            vm.prepaid = resolveAccountPrepaidPosition(views, heldByPayment);
            /* Details owns held-money administration and needs the lots, not just the total. */
            vm.heldDeposits = holds.filter((h) => h.remainingCents > 0 || h.dispositions.length > 0);
        }
    } catch (e) {
        /*
         * A payments read that fails must not become "nothing has been paid" — that would show a
         * family the full amount owed for money they have already sent. The card says it cannot
         * answer, which is what the `unavailable` list is for.
         */
        vm.unavailable = [
            ...vm.unavailable,
            { fact: "payments", reason: e instanceof Error ? e.message : String(e) },
        ];
    }

    /*
     * WHAT EACH ROW HAS BEEN PAID, AND WHETHER IT CAN TAKE MORE.
     *
     * After the payments read, never before: a row's outstanding amount is not knowable until the
     * applications are in, and if that read FAILED the rows keep the state they were built with —
     * owing their whole amount and offering nothing. That is the safe direction. The alternative,
     * defaulting `offersPayment` to true, would put a Record-payment control on a card that has just
     * admitted it cannot say what has been paid.
     */
    for (const row of rows) {
        row.appliedCents = appliedByChargeId.get(row.chargeId) ?? 0;
        row.outstandingCents = row.amountCents - row.appliedCents;
        row.offersPayment = offersPaymentTransition({
            status: row.status,
            correctsChargeId: row.correctsChargeId,
            outstandingCents: row.outstandingCents,
        });
    }

    vm.reconciliation = reconcileRows(rows, period.key, today, appliedByChargeId);
    vm.reconciliationBySubject = Object.fromEntries(
        vm.subjects.map((s) => [
            s.customerMemberId,
            reconcileRows(
                rows.filter((r) => r.subjectMemberId === s.customerMemberId),
                period.key,
                today,
                appliedByChargeId,
            ),
        ]),
    );

    // ── PAST DUE: real due-date semantics, over owed rows only ───────────────────────────────────
    vm.pastDue = pastDueFor(rows, today, appliedByChargeId);
    vm.pastDueBySubject = Object.fromEntries(
        vm.subjects.map((s) => [
            s.customerMemberId,
            pastDueFor(rows.filter((r) => r.subjectMemberId === s.customerMemberId), today, appliedByChargeId),
        ]),
    );

    // ── LEDGER, grouped by billing period ────────────────────────────────────────────────────────
    const byPeriod = new Map<string, FinancialsLedgerRow[]>();
    for (const row of rows) {
        if (!row.periodKey) continue;
        byPeriod.set(row.periodKey, [...(byPeriod.get(row.periodKey) ?? []), row]);
    }
    vm.ledgerPeriods = sortBillingPeriodKeysDescending(byPeriod.keys()).map((key) => {
        const periodRows = byPeriod.get(key) ?? [];
        return {
            period: billingPeriodFromKey(key),
            rows: periodRows,
            /*
             * POSTED MONEY INCLUDES REVERSED MONEY. A reversed original and its reversal are both
             * posted rows that sum to zero; counting only the ones still reading `posted` would drop
             * the original and leave the period showing the credit alone — a negative total for a
             * period in which nothing was refunded.
             */
            totalCents: periodRows
                .filter((r) => isPostedMoney(r.lifecycleStatus))
                .reduce((sum, r) => sum + r.amountCents, 0),
        };
    });

    // ── ADD CHARGE OPTIONS: the tenant's own templates, effective today ──────────────────────────
    /*
     * ── THE REVIEW BOUNDARY, RESOLVED ONCE FOR EVERY TEMPLATE ON OFFER ──────────────────────────
     *
     * One read of the tenant's financial policies, then a per-service resolution, because
     * `posting_review` may be scoped to a service. This is the same authority the writer consults;
     * consulting it here means the command can state what confirming will do instead of assuming.
     */
    mark("payments");
    const financialPolicies = await listFinancialPolicies(supabase, args.orgId).catch(() => []);
    mark("policies");
    const reviewPolicyForService = (serviceId: string | null) => {
        const r = resolveFinancialPolicy(financialPolicies, "posting_review", { serviceId: serviceId ?? undefined }, today);
        return r.resolved ? r.policy.value.required === true : false;
    };

    vm.chargeTemplates = ((templateResult.data ?? []) as unknown as Array<Record<string, unknown>>)
        .filter((row) => {
            const start = t(row.effective_start);
            const end = t(row.effective_end);
            return (!start || start <= today) && (!end || end >= today);
        })
        .map((row) => ({
            id: t(row.id),
            // The operator-facing label the tenant configured. Never `template_key`.
            label: t(row.label),
            categoryKey: t(row.charge_category),
            categoryLabel: chargeCategoryLabel(t(row.charge_category)),
            amountStrategy: t(row.amount_strategy),
            amountCents: row.amount_cents == null ? null : Number(row.amount_cents),
            currencyCode: t(row.currency_code) || "USD",
            occursOnStrategy: t(row.occurs_on_strategy),
            billableOnStrategy: t(row.billable_on_strategy),
            reviewRequired:
                reviewPolicyForService(t(row.service_id) || null) || row.review_required === true,
        }));

    /*
     * ── WHETHER A BANK DEBIT IS EVEN POSSIBLE HERE ───────────────────────────────────────────────
     *
     * Read from the merchant's own recorded capability, on the server, so the browser is told the
     * answer rather than deciding it. A surface that worked this out for itself would offer a
     * collection the provider then refuses — after the operator had been told it was under way.
     * Absent or non-ready is `false`, which is the honest reading of "nobody has asked the provider
     * about this merchant".
     */
    const { data: merchantRow } = await merchantRead;
    /*
     * BOTH readiness facts, through the one rule.
     *
     * This read `ach_readiness === "ready"` alone, so a merchant that could not accept a single
     * charge — onboarding unfinished, or restricted by Stripe — still offered the bank rail on the
     * card. `railCollectionAvailable` asks merchant-level readiness first, in the same order the
     * collection path does.
     */
    const merchantReadiness = merchantRow as { readiness: string | null; ach_readiness: string | null } | null;
    vm.achAvailable = railCollectionAvailable(
        merchantReadiness
            ? { readiness: merchantReadiness.readiness, achReadiness: merchantReadiness.ach_readiness }
            : null,
        "ach",
    );

    /*
     * ── PAYMENT SETUP, AND WHO COULD HAVE PAID — derived, where a literal used to sit ───────────
     *
     * `paymentSetup` was `null` for the life of this reader, with no producer anywhere, and the
     * card adapter turned that constant into "no payment method on file" and an unhealthy autopay
     * badge. A hardcoded null was being read as a fact about a family's money.
     *
     * Both reads fail soft and independently. Payment setup is context: an operator must still be
     * able to see what is OWED when the provider tables cannot be read, and a payer chooser that
     * could not load must not make the account look like it has nobody who can pay — the surfaces
     * below distinguish "could not be read" from "there are none".
     */
    const setup = await setupP;
    vm.paymentCapabilities = setup;
    vm.paymentSetup = setup?.summaryLine ?? null;
    /*
     * "Healthy" means ON AND NOT ASKING FOR ANYTHING. A paused arrangement is a decision somebody
     * made rather than a problem, so it is neither healthy nor an alarm — it simply reads as paused.
     */
    vm.autopayLine = setup?.autopayArrangement?.summaryLine ?? null;
    vm.autopayHealthy = setup?.autopayArrangement?.status === "active"
        && setup.autopayArrangement.needsAttention === false;

    vm.payerCandidates = (await payersP).candidates;

    /*
     * The collections still in flight for the charges this card is about. Scoped to those charges so
     * a household's card never reports another household's attempt, and limited to states the
     * provider has not finished — a recognised attempt has become a payment and is read there.
     */
    const { data: attemptRows } = await openCollectionsP;
    {
        vm.openCollections = ((attemptRows ?? []) as Array<Record<string, unknown>>).map((r) => ({
            attemptId: t(r.id),
            rail: t(r.rail) || "card",
            processorState: t(r.processor_state),
            providerActionType: t(r.provider_action_type) || null,
            chargeId: t(r.charge_id) || null,
            amountCents: Number(r.requested_amount_cents) || 0,
            currencyCode: t(r.currency) || "USD",
            updatedAt: t(r.updated_at) || null,
        }));
    }

    return vm;
}


/**
 * THE TRANSITION A LEDGER ROW OFFERS — posted money that still stands, and is not itself a
 * correction.
 *
 * One definition, used by the composer and asserted directly by test and certification. A reversed
 * row fails it (that is the bound: one reversal), and so does a correction (a reversal is not itself
 * reversed). Drafts are posted, not reversed, and void rows have no lawful next step.
 */
export function offersReverseTransition(row: {
    status: string;
    reversedByChargeId: string | null;
    correctsChargeId: string | null;
}): boolean {
    return (
        row.status !== "draft"
        && row.status !== "void"
        && !row.reversedByChargeId
        && !row.correctsChargeId
    );
}

/**
 * THE TRANSITION A LEDGER ROW OFFERS FOR MONEY COMING IN — a posted obligation that still owes
 * something.
 *
 * The mirror of `offersReverseTransition`, and deliberately the same shape: one definition, asserted
 * directly, never restated in JSX. Three conditions, each of which the domain already enforces and
 * this only anticipates:
 *
 *   - posted. `payment.record`'s eligibility refuses a draft or void charge, because paying a draft
 *     settles an obligation the family was never told about.
 *   - not a correction. A reversal or credit is money going the other way; it is not a receivable.
 *   - still owed. Applying to a settled charge is refused by the allocation bounds trigger, so
 *     offering it would be offering a refusal.
 *
 * A REVERSED row fails the last test by arithmetic rather than by special case: its reversal does not
 * reduce `outstandingCents`, so a reversed charge can still legitimately show an outstanding amount.
 * That is correct — the pair nets to zero at the ACCOUNT level, and this row-level question is only
 * about whether this row can receive money. The service and the database remain the authority; if
 * they refuse, the card surfaces the refusal rather than having pre-empted it wrongly.
 */
export function offersPaymentTransition(row: {
    status: string;
    correctsChargeId: string | null;
    outstandingCents: number;
}): boolean {
    return (
        row.status !== "draft"
        && row.status !== "void"
        && !row.correctsChargeId
        && row.outstandingCents > 0
    );
}

/**
 * Posted money, whether or not a later correction undid it.
 *
 * `reversed` is a derived READING of a posted row, not a different kind of row: the charge was
 * posted, it still stands in the ledger, and its reversal stands beside it. Any total over "what was
 * posted" has to include both or it reports half of a pair.
 */
export function isPostedMoney(lifecycleStatus: FinancialsLedgerRow["lifecycleStatus"]): boolean {
    return lifecycleStatus === "posted" || lifecycleStatus === "reversed";
}

/**
 * THE reconciliation rule, in one place so no scope can compute it differently.
 *
 * `appliedByChargeId` is money RECEIVED and applied, keyed by the charge it paid. Passing it per
 * charge rather than as a total is what makes the subject filter and the period filter work on
 * payments for free: narrowing the rows narrows the payments with them, so a per-child total can
 * never sit above a ledger that does not add up to it. An empty map is "nothing has been paid",
 * which is a different statement from "we cannot say" and is the honest one now that we can.
 */
export function reconcileRows(
    /*
     * The CANONICAL reconciliation input, not this card's presentation row.
     *
     * `FinancialsLedgerRow` structurally satisfies `AccountChargeLedgerRow`, so this card keeps
     * passing its own richer rows unchanged while the first-order runtime passes the narrow ones
     * its reader produces. One implementation of the arithmetic, two shapes of caller — rather
     * than a second reconciliation written against a second row type.
     */
    rows: readonly AccountChargeLedgerRow[],
    periodKey: string,
    _today: string,
    appliedByChargeId: ReadonlyMap<string, number> = new Map(),
): FinancialsReconciliation {
    const out = emptyReconciliation();
    for (const row of rows) {
        if (row.periodKey !== periodKey) continue;
        if (row.lifecycleStatus === "scheduled") {
            out.scheduledCents += row.amountCents;
            continue;
        }
        if (row.lifecycleStatus === "draft") {
            out.draftCents += row.amountCents;
            continue;
        }
        /*
         * A REVERSED CHARGE IS STILL A LINE IN THE RECONCILIATION. It is not skipped: the original
         * lands in gross and its reversal lands in reductions, and the two net to zero. Skipping the
         * original would leave the credit unmatched and drive responsibility NEGATIVE — the ledger
         * would show money owed TO a family that was only ever charged and refunded.
         */
        if (!OWED_STATUSES.has(row.status)) continue;
        if (FUNDING_CATEGORIES.has(row.categoryKey)) out.fundingCents += row.amountCents;
        else if (REDUCTION_CATEGORIES.has(row.categoryKey)) out.discountsCents += row.amountCents;
        else if (ADJUSTMENT_CATEGORIES.has(row.categoryKey)) out.adjustmentsCents += row.amountCents;
        else out.grossCents += row.amountCents;
    }
    // Responsibility is the SUM OF EVERY OWED LINE, so it cannot drift from the rows beneath it.
    out.responsibilityCents =
        out.grossCents + out.discountsCents + out.fundingCents + out.adjustmentsCents;
    /*
     * PAYMENTS ARE SUMMED OVER THE SAME ROWS, so the balance cannot drift from the ledger beneath it.
     * A payment against a row this scope excludes — another child, another period — is another
     * scope's payment, and is not counted twice by being counted here.
     */
    for (const row of rows) {
        if (row.periodKey !== periodKey) continue;
        if (!OWED_STATUSES.has(row.status)) continue;
        out.paymentsCents += appliedByChargeId.get(row.chargeId) ?? 0;
    }
    out.balanceCents = out.responsibilityCents - out.paymentsCents;
    return out;
}

/**
 * Past due over owed rows whose due date has passed and which are STILL OWED.
 *
 * A REVERSED CHARGE IS NOT PAST DUE, and neither is the reversal that undid it. A correction copies
 * the source's `due_date`, so the pair would otherwise both qualify and report an overdue balance of
 * zero — announcing a collections problem for money nobody owes. Credits and replacements are kept:
 * they are partial and legitimately reduce what is still overdue.
 *
 * ── PAST DUE IS THE RESIDUAL, NOT THE FACE AMOUNT ──
 *
 * A charge that has been paid is not overdue, and one that has been HALF paid is overdue for the
 * half. Subtracting what was applied is why `charges.status` is never advanced to `partially_paid` /
 * `paid` when money is applied: a stored status would be a second answer to "how much is left", and
 * the first time an application was reversed the two would disagree. The applications are the
 * record; how much is outstanding is read from them.
 */
export function pastDueFor(
    rows: readonly AccountChargeLedgerRow[],
    today: string,
    appliedByChargeId: ReadonlyMap<string, number> = new Map(),
): FinancialsPastDue | null {
    const outstanding = (r: AccountChargeLedgerRow): number =>
        r.amountCents - (appliedByChargeId.get(r.chargeId) ?? 0);
    const overdue = rows.filter(
        (r) =>
            OWED_STATUSES.has(r.status)
            && r.status !== "paid"
            && r.lifecycleStatus !== "reversed"
            && r.correctionKind !== "reversal"
            && r.dueDate != null
            && r.dueDate < today
            /*
             * A POSITIVE obligation that has been paid in full is no longer overdue. A NEGATIVE row
             * — a credit — is kept whatever its outstanding reads, because it is what reduces the
             * overdue total rather than something that can itself be settled. Dropping it would put
             * the credit's own amount back onto what the family owes.
             */
            && !(r.amountCents > 0 && outstanding(r) <= 0),
    );
    if (overdue.length === 0) return null;
    const oldest = overdue.reduce((acc, r) => ((r.dueDate ?? "") < (acc.dueDate ?? "") ? r : acc));
    const oldestDueDate = oldest.dueDate as string;
    return {
        amountCents: overdue.reduce((sum, r) => sum + outstanding(r), 0),
        oldestDueDate,
        agingDays: Math.max(
            0,
            Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${oldestDueDate}T00:00:00Z`)) / 86_400_000),
        ),
    };
}
