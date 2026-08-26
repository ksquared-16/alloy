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
 * ── WHAT IS DELIBERATELY ABSENT ──
 *
 * `payments.job_id` is NOT NULL and payments were never generalized to `billable_source_*` — only
 * `charges` and `ledger_transactions` were. So a childcare payment has no canonical seam today, and
 * this model reports that as an explicit unavailability rather than rendering a zero that would read
 * as "nothing has been paid". Autopay exists only in card-lab fixtures and the concept catalog, so it
 * is likewise reported absent rather than invented. Payer SPLITS belong to Processing and are not
 * modelled here at all.
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
    /** `scheduled` when a draft's billable date has not arrived — derived, never a stored status. */
    lifecycleStatus: "scheduled" | "draft" | "posted" | "void";
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
    chargeTemplates: FinancialsChargeTemplateOption[];
    unavailable: FinancialsUnavailable[];
    /** Absent when the subject has no attendable/billable enrolment — the card renders no controls. */
    unavailableReason: string | null;
};

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
        subjects: [],
        rows: [],
        reconciliation: emptyReconciliation(),
        reconciliationBySubject: {},
        pastDue: null,
        pastDueBySubject: {},
        ledgerPeriods: [],
        chargeTemplates: [],
        unavailable: [],
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
            fact: "payments",
            reason:
                "payments.job_id is NOT NULL and payments were never generalized to billable_source_*, "
                + "so a childcare payment has no canonical seam yet",
        },
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
    if (agreements.length === 0) {
        return { ...vm, unavailableReason: "No enrollment agreement, so there is nothing billable yet." };
    }

    const resolvedCustomerId = customerId ?? (t(agreements[0]!.customer_id) || null);
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
    vm.subjects = agreements.map((a) => ({
        customerMemberId: a.customer_member_id,
        agreementId: a.id,
        displayName: nameByMember.get(a.customer_member_id) ?? "Child",
        agreementStatus: a.status,
    }));

    const memberByAgreement = new Map(agreements.map((a) => [a.id, a.customer_member_id]));
    const agreementIds = agreements.map((a) => a.id);

    // ── CHARGES, GL CONFIGURATION AND TEMPLATES, in one pass ─────────────────────────────────────
    const [chargeResult, glMappingResult, glAccountResult, templateResult] = await Promise.all([
        supabase
            .from("charges")
            .select(
                "id, billable_source_id, charge_category, charge_type, status, amount_cents, currency_code, charge_template_id, "
                + "service_date, occurs_on, billable_on, due_date, posted_at, voided_at, description, metadata, created_at",
            )
            .eq("org_id", args.orgId)
            .eq("billable_source_type", "enrollment_agreement")
            .in("billable_source_id", agreementIds),
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
                      ? "posted"
                      : billableOn && billableOn > today
                        ? "scheduled"
                        : "draft",
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
    vm.reconciliation = reconcileRows(rows, period.key, today);
    vm.reconciliationBySubject = Object.fromEntries(
        vm.subjects.map((s) => [
            s.customerMemberId,
            reconcileRows(
                rows.filter((r) => r.subjectMemberId === s.customerMemberId),
                period.key,
                today,
            ),
        ]),
    );

    // ── PAST DUE: real due-date semantics, over owed rows only ───────────────────────────────────
    vm.pastDue = pastDueFor(rows, today);
    vm.pastDueBySubject = Object.fromEntries(
        vm.subjects.map((s) => [
            s.customerMemberId,
            pastDueFor(rows.filter((r) => r.subjectMemberId === s.customerMemberId), today),
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
            totalCents: periodRows
                .filter((r) => r.lifecycleStatus === "posted")
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


/** THE reconciliation rule, in one place so no scope can compute it differently. */
export function reconcileRows(
    rows: readonly FinancialsLedgerRow[],
    periodKey: string,
    _today: string,
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
        if (!OWED_STATUSES.has(row.status)) continue;
        if (FUNDING_CATEGORIES.has(row.categoryKey)) out.fundingCents += row.amountCents;
        else if (REDUCTION_CATEGORIES.has(row.categoryKey)) out.discountsCents += row.amountCents;
        else if (ADJUSTMENT_CATEGORIES.has(row.categoryKey)) out.adjustmentsCents += row.amountCents;
        else out.grossCents += row.amountCents;
    }
    // Responsibility is the SUM OF EVERY OWED LINE, so it cannot drift from the rows beneath it.
    out.responsibilityCents =
        out.grossCents + out.discountsCents + out.fundingCents + out.adjustmentsCents;
    out.paymentsCents = 0;
    out.balanceCents = out.responsibilityCents - out.paymentsCents;
    return out;
}

/** Past due over owed, unpaid rows whose due date has passed. */
export function pastDueFor(rows: readonly FinancialsLedgerRow[], today: string): FinancialsPastDue | null {
    const overdue = rows.filter(
        (r) => OWED_STATUSES.has(r.status) && r.status !== "paid" && r.dueDate != null && r.dueDate < today,
    );
    if (overdue.length === 0) return null;
    const oldest = overdue.reduce((acc, r) => ((r.dueDate ?? "") < (acc.dueDate ?? "") ? r : acc));
    const oldestDueDate = oldest.dueDate as string;
    return {
        amountCents: overdue.reduce((sum, r) => sum + r.amountCents, 0),
        oldestDueDate,
        agingDays: Math.max(
            0,
            Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${oldestDueDate}T00:00:00Z`)) / 86_400_000),
        ),
    };
}
