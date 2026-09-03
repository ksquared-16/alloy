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

import type { SupabaseClient } from "@supabase/supabase-js";

import { CHARGE_CATEGORY_GL_MAPPING_KEY, chargeCategoryLabel } from "@/lib/financials/chargeCategories";
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

/** Statuses that count toward what is owed. `draft` is not yet owed; `void` never was. */
const OWED_STATUSES = new Set(["posted", "partially_paid", "paid"]);

/** One payment on the account, as the card reads it. */
export type FinancialsPaymentRow = {
    paymentId: string;
    /** inbound = money received; outbound = a refund. */
    direction: "inbound" | "outbound";
    /** The receipt this refund reverses, when it is one. */
    refundsPaymentId: string | null;
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
    reference: string | null;
    notes: string | null;
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
    dueDate: string | null;
    /** Operator-facing GL code, or null when nothing maps it. Never silently blank. */
    glCode: string | null;
    glAccountName: string | null;
    /** Where the row came from — template key, or the manual service. */
    source: string | null;
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
     */
    paymentSetup: string | null;
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
    /** Absent when the subject has no attendable/billable enrolment — the card renders no controls. */
    unavailableReason: string | null;
};

/** No id can equal this, so an empty source list selects nothing rather than everything. */
const NO_SOURCE_SENTINEL = "00000000-0000-0000-0000-000000000000";

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
        subjects: [],
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
            fact: "autopay",
            reason: "no canonical autopay truth exists — the concept appears only in design fixtures",
        },
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
async function readAccountPayers(
    supabase: SupabaseClient,
    orgId: string,
    customerId: string,
): Promise<FinancialsCardVM["payers"]> {
    const { data: links, error } = await supabase
        .from("customer_persons")
        .select("person_id, role_type, is_primary")
        .eq("org_id", orgId)
        .eq("customer_id", customerId);
    // A payer read that fails is an absence of payers on the card, never a reason to fail the account.
    if (error) return [];

    const rows = ((links ?? []) as Array<Record<string, unknown>>).filter(
        (r) => t(r.role_type).toLowerCase() === "payer",
    );
    if (rows.length === 0) return [];

    const personIds = [...new Set(rows.map((r) => t(r.person_id)).filter(Boolean))];
    if (personIds.length === 0) return [];

    const { data: people } = await supabase
        .from("persons")
        .select("id, first_name, last_name, display_name")
        .eq("org_id", orgId)
        .in("id", personIds);

    const nameById = new Map(
        ((people ?? []) as Array<Record<string, unknown>>).map((p) => [
            t(p.id),
            t(p.display_name) || [t(p.first_name), t(p.last_name)].filter(Boolean).join(" ") || "Payer",
        ]),
    );

    return personIds.map((id) => ({
        personId: id,
        name: nameById.get(id) ?? "Payer",
        // No allocation store, and no per-payer method store either. Both stay null rather than
        // being filled with a plausible-looking default.
        share: null,
        method: null,
    }));
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
        chargeIds.length
            ? supabase
                  .from("payment_allocations")
                  .select("id, payment_id, charge_id, allocated_amount_cents, status")
                  .eq("org_id", orgId)
                  .eq("status", "active")
                  .in("charge_id", [...chargeIds])
            : Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null }),
        supabase
            .from("payments")
            .select(
                "id, direction, refunds_payment_id, amount_cents, currency, status, payment_method, "
                + "processor, received_at, posted_at, reference_number, notes",
            )
            .eq("org_id", orgId)
            .in("billable_source_id", sourceIds)
            .order("received_at", { ascending: false }),
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
    if (allocResult.error) {
        throw new Error(allocResult.error.message);
    }

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
        const { data: extra } = await supabase
            .from("payments")
            .select("id, status")
            .eq("org_id", orgId)
            .in("id", unknownPaymentIds);
        for (const r of (extra ?? []) as unknown as Array<Record<string, unknown>>) {
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
            amountCents: Number(raw.amount_cents) || 0,
            currencyCode: t(raw.currency) || "USD",
            status: t(raw.status).toLowerCase(),
            method: t(raw.payment_method),
            processor: t(raw.processor) || null,
            receivedAt: t(raw.received_at) || null,
            postedAt: t(raw.posted_at) || null,
            appliedCents: appliedByPaymentId.get(id) ?? 0,
            reference: t(raw.reference_number) || null,
            notes: t(raw.notes) || null,
        };
    });

    return { payments, appliedByChargeId };
}

export async function buildFinancialsCardVM(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        /** The household whose children's agreements make up the account. */
        customerId?: string | null;
        /** Narrow the whole model to ONE child. The card's subject filter uses this. */
        customerMemberId?: string | null;
        /** Operating day; defaults to today. Certification pins it. */
        today?: string | null;
    },
): Promise<FinancialsCardVM> {
    const today = t(args.today) || ymdToday();
    const period = billingPeriodForDate(today);
    const vm = baseVm(period);
    vm.unavailable = platformUnavailabilities();

    const customerId = t(args.customerId) || null;
    const memberId = t(args.customerMemberId) || null;
    if (!customerId && !memberId) {
        return { ...vm, unavailableReason: "No household or child in scope." };
    }

    // ── SUBJECTS: the agreements that ARE the billable sources ────────────────────────────────────
    let agreementQuery = supabase
        .from("child_enrollment_agreements")
        .select("id, customer_member_id, customer_id, status")
        .eq("org_id", args.orgId);
    agreementQuery = memberId
        ? agreementQuery.eq("customer_member_id", memberId)
        : agreementQuery.eq("customer_id", customerId as string);
    const { data: agreementRows, error: agreementError } = await agreementQuery;
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
    const { data: memberRows } = await supabase
        .from("customer_members")
        .select("id, first_name, last_name, display_name")
        .eq("org_id", args.orgId)
        .in("id", memberIds);
    const nameByMember = new Map(
        ((memberRows ?? []) as unknown as Array<Record<string, unknown>>).map((m) => [
            t(m.id),
            t(m.display_name) || [t(m.first_name), t(m.last_name)].filter(Boolean).join(" ") || "Child",
        ]),
    );

    vm.account = { customerId: resolvedCustomerId, label: null };
    vm.payers = resolvedCustomerId ? await readAccountPayers(supabase, args.orgId, resolvedCustomerId) : [];
    // A household with no enrolment still HAS an account. Financials answers for it.
    vm.subjects = agreements.map((a) => ({
        customerMemberId: a.customer_member_id,
        agreementId: a.id,
        displayName: nameByMember.get(a.customer_member_id) ?? "Child",
        agreementStatus: a.status,
    }));

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

    // ── CHARGES, GL CONFIGURATION AND TEMPLATES, in one pass ─────────────────────────────────────
    const [chargeResult, glMappingResult, glAccountResult, templateResult] = await Promise.all([
        /*
         * BOTH SOURCES, in one read. A household's account is the union of what its enrolments owe
         * and what the household itself owes — the pre-enrolment fees that have no agreement to hang
         * off. `billable_source_type` already carries the distinction; nothing new is invented here.
         */
        supabase
            .from("charges")
            .select(
                "id, billable_source_type, billable_source_id, source_charge_id, charge_category, charge_type, status, amount_cents, currency_code, charge_template_id, "
                + "service_date, occurs_on, billable_on, due_date, posted_at, voided_at, description, metadata, created_at",
            )
            .eq("org_id", args.orgId)
            .in("billable_source_id", billableSourceIds.length ? billableSourceIds : [NO_SOURCE_SENTINEL]),
        supabase.from("gl_account_mappings").select("key, gl_account_id, is_active").eq("org_id", args.orgId),
        supabase.from("gl_accounts").select("id, code, name, is_active").eq("org_id", args.orgId),
        supabase
            .from("financial_charge_templates")
            .select(
                "id, label, charge_category, amount_strategy, amount_cents, currency_code, "
                + "occurs_on_strategy, billable_on_strategy, trigger_type, is_active, effective_start, effective_end",
            )
            .eq("org_id", args.orgId)
            .eq("is_active", true)
            .order("label", { ascending: true }),
    ]);

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
    const reversalBySource = new Map<string, string>();
    for (const c of charges) {
        const sourceId = t(c.source_charge_id);
        const kind = t(((c.metadata ?? {}) as Record<string, unknown>).correction_kind);
        if (sourceId && kind === "reversal" && t(c.status) !== "void") {
            reversalBySource.set(sourceId, t(c.id));
        }
    }

    const rows: FinancialsLedgerRow[] = charges.map((c) => {
        const categoryKey = t(c.charge_category) || t(c.charge_type) || "one_time";
        const metadata = (c.metadata ?? {}) as Record<string, unknown>;
        const mappingKey =
            t(metadata.gl_mapping_key)
            || CHARGE_CATEGORY_GL_MAPPING_KEY[categoryKey as keyof typeof CHARGE_CATEGORY_GL_MAPPING_KEY]
            || "";
        const account = mappingKey ? accountByMappingKey.get(mappingKey) ?? null : null;
        const placement = placeInBillingPeriod(c);
        const status = t(c.status);
        const billableOn = t(c.billable_on) || null;
        const agreementId = t(c.billable_source_id);
        const subjectMemberId = memberByAgreement.get(agreementId) ?? null;
        const correctsChargeId = t(c.source_charge_id) || null;
        const correctionKind = t(metadata.correction_kind) || null;
        const reversedByChargeId = reversalBySource.get(t(c.id)) ?? null;
        return {
            chargeId: t(c.id),
            date: billableOn ?? t(c.occurs_on) ?? t(c.service_date) ?? null,
            periodKey: placement.key,
            periodBasis: placement.basis,
            subjectMemberId,
            subjectName: subjectMemberId ? nameByMember.get(subjectMemberId) ?? null : null,
            categoryKey,
            categoryLabel: chargeCategoryLabel(categoryKey),
            description: labelByTemplateId.get(t(c.charge_template_id)) || t(c.description) || null,
            amountCents: Number(c.amount_cents ?? 0),
            currencyCode: t(c.currency_code) || "USD",
            status,
            lifecycleStatus:
                status === "void"
                    ? "void"
                    : status !== "draft"
                      ? reversedByChargeId
                          ? "reversed"
                          : "posted"
                      : billableOn && billableOn > today
                        ? "scheduled"
                        : "draft",
            correctsChargeId,
            correctionKind,
            reversedByChargeId,
            offersReverse: offersReverseTransition({ status, reversedByChargeId, correctsChargeId }),
            dueDate: t(c.due_date) || null,
            glCode: account?.code ?? null,
            glAccountName: account?.name ?? null,
            /*
             * PROVENANCE, not a key. `metadata.charge_template_key` is `field_trip`; the operator
             * configured that template and already sees its LABEL in the description, so this column
             * says HOW the row came to exist rather than repeating an identifier.
             */
            source: t(metadata.source) === "charge_template" ? "Template" : t(metadata.source) ? "Import" : "Manual",
        };
    });
    // Newest first inside a period; the ledger reads downward through time.
    rows.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || a.chargeId.localeCompare(b.chargeId));
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
    try {
        const received = await readAccountPayments(
            supabase,
            args.orgId,
            billableSourceIds,
            rows.map((r) => r.chargeId),
        );
        vm.payments = received.payments;
        appliedByChargeId = received.appliedByChargeId;
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
        }));

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
    rows: readonly FinancialsLedgerRow[],
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
    rows: readonly FinancialsLedgerRow[],
    today: string,
    appliedByChargeId: ReadonlyMap<string, number> = new Map(),
): FinancialsPastDue | null {
    const outstanding = (r: FinancialsLedgerRow): number =>
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
