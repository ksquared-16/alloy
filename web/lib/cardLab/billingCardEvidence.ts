/**
 * Billing card evidence — "What is owed now, what period are we in, how is payment configured,
 * what recently happened, and what requires attention?"
 *
 * ── THE DECISIVE FINDING ──
 *
 * Alloy has a CHARGE SUBSTRATE and a CONFIGURATION PREVIEW. It has no family-grain posted
 * balance, no billing period, no autopay state, no payment-method health, and no subsidy model:
 *
 *   - `resolved_obligations` is stamped "Non-authoritative and recomputable; writes no
 *     ledger/invoice/payment. Posting is the only authoritative money write and is out of scope."
 *   - `payments` / `ledger_transactions` are read ONLY at job grain (cleaning-services heritage).
 *   - `customer_payment_methods` has no childcare reader or writer anywhere in the app.
 *   - Subsidy, autopay, and billing period have NO entity in the schema at all.
 *
 * Of ~28 facts a full financial card would show, FIVE have owners today.
 *
 * ── SO THE CONTRACT IS COMPLETE AND THE RENDERER IS HONEST ──
 *
 * Every GAP-3 field below is typed `string | null` and is null in every production path today.
 * That is deliberate: the shape is specified so a future substrate is a PRODUCER change with no
 * card change, and the renderer omits null rows rather than inventing money.
 *
 * ── UNRESOLVED IS NOT MISSING ──
 *
 * Carried forward verbatim from `buildBillingPreviewCardEvidence`. Reporting an unresolved
 * tuition rate as "missing" manufactured a blocked verdict out of unwired plumbing, on every
 * record, forever. Only a RESOLVED item can be missing.
 *
 * @see docs/platform/operator/operational-card-system-expansion.md §7
 */

import { type CardLabEvidenceBase, type CardLabHandoff } from "@/lib/cardLab/cardLabTypes";

export type BillingReadinessItem = {
    label: string;
    /** Has an authoritative source answered? Unresolved is HELD, never counted as missing. */
    resolved: boolean;
    /** Meaningful only when `resolved`. */
    met: boolean;
    detail: string | null;
};

export type BillingChargeRow = {
    id: string;
    label: string;
    amountLabel: string;
    status: "draft" | "posted" | "voided";
    serviceDate: string | null;
    dueDate: string | null;
    /**
     * True for `resolved_obligations` rows — recomputable preview, never posted truth.
     * The renderer MUST mark these; an unmarked preview reads as money that was charged.
     */
    isPreview: boolean;
};

export type BillingCardEvidence = CardLabEvidenceBase & {
    // ── Configuration + activity: answerable today ──────────────────────────────
    isConfigured: boolean;
    billingContactName: string | null;
    billingContactEmail: string | null;
    tuitionRateLabel: string | null;
    readinessItems: BillingReadinessItem[];
    charges: BillingChargeRow[];
    /** ONLY from `OperationalBillingSignal.feeBalanceCents`, ONLY when > 0. */
    balanceLabel: string | null;
    unmetCount: number;
    unresolvedCount: number;

    // ── Financial state: SPECIFIED, HELD. No owner exists today (GAP-3). ─────────
    periodLabel: string | null;
    amountDueLabel: string | null;
    nextChargeLabel: string | null;
    autopayLabel: string | null;
    paymentMethodLabel: string | null;
    familyResponsibilityLabel: string | null;
    subsidyLabel: string | null;

    setupHandoff: CardLabHandoff;
    billingHandoff: CardLabHandoff;
};

export type BillingEvidenceInput = {
    billingContactName: string | null;
    billingContactEmail: string | null;
    /** Null while the financial-config API has not answered — UNRESOLVED, not missing. */
    tuitionRateLabel: string | null;
    /** True once the financial-config API has answered, even if it found no rate. */
    tuitionResolved: boolean;
    billingConfigured?: boolean;
    feeBalanceCents?: number | null;
    charges?: readonly BillingChargeRow[];
    /** Everything below is GAP-3: null in every production path. */
    periodLabel?: string | null;
    amountDueLabel?: string | null;
    nextChargeLabel?: string | null;
    autopayLabel?: string | null;
    paymentMethodLabel?: string | null;
    familyResponsibilityLabel?: string | null;
    subsidyLabel?: string | null;
};

function formatBalance(cents: number | null | undefined): string | null {
    if (typeof cents !== "number" || cents <= 0) return null;
    const dollars = cents / 100;
    return `$${dollars.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} due`;
}

export function buildBillingCardEvidence(input: BillingEvidenceInput): BillingCardEvidence {
    const readinessItems: BillingReadinessItem[] = [
        {
            label: "Billing contact",
            // Resolves from `person.billing_contact_*`, a real configurable field ref — so its
            // absence is a genuine answer, unlike tuition.
            resolved: true,
            met: input.billingContactName != null,
            detail: input.billingContactName ?? input.billingContactEmail,
        },
        {
            label: "Tuition rate",
            resolved: input.tuitionResolved,
            met: input.tuitionResolved && input.tuitionRateLabel != null,
            detail: input.tuitionRateLabel,
        },
    ];

    const unmetCount = readinessItems.filter((i) => i.resolved && !i.met).length;
    const unresolvedCount = readinessItems.filter((i) => !i.resolved).length;
    const isConfigured =
        Boolean(input.billingConfigured)
        || (input.billingContactName != null && input.tuitionResolved && input.tuitionRateLabel != null);

    const balanceLabel = formatBalance(input.feeBalanceCents);
    const charges = [...(input.charges ?? [])];
    const amountDueLabel = input.amountDueLabel ?? null;

    let answerLine: string;
    let supportingLine: string | null;
    let statusChip: string | null;
    let statusTone: BillingCardEvidence["statusTone"];

    if (amountDueLabel) {
        // Only reachable once a posted-balance projection exists (GAP-3).
        answerLine = amountDueLabel;
        supportingLine = input.periodLabel ?? null;
        statusChip = "Due";
        statusTone = "due";
    } else if (isConfigured) {
        answerLine = balanceLabel ?? "Billing configured";
        supportingLine = input.tuitionRateLabel ?? "Tuition rate on file";
        statusChip = balanceLabel ? "Balance" : "Configured";
        statusTone = balanceLabel ? "due" : "ready";
    } else if (unresolvedCount > 0) {
        // HOLD — no verdict. State only what an authoritative source actually answered.
        answerLine = input.billingContactName ?? "";
        supportingLine = input.billingContactName != null ? "Billing contact" : null;
        statusChip = null;
        statusTone = "neutral";
    } else if (unmetCount > 0) {
        answerLine = "Setup incomplete";
        supportingLine = readinessItems
            .filter((i) => i.resolved && !i.met)
            .map((i) => i.label)
            .join(" · ");
        statusChip = `${unmetCount} missing`;
        statusTone = "blocked";
    } else {
        answerLine = "Billing not configured";
        supportingLine = "Set up billing contact and tuition rate to proceed";
        statusChip = null;
        statusTone = "neutral";
    }

    const resolution =
        unresolvedCount > 0 && !isConfigured
            ? "unresolved"
            : !isConfigured && unmetCount === 0 && charges.length === 0
              ? "empty"
              : "settled";

    return {
        isConfigured,
        billingContactName: input.billingContactName,
        billingContactEmail: input.billingContactEmail,
        tuitionRateLabel: input.tuitionRateLabel,
        readinessItems,
        charges,
        balanceLabel,
        unmetCount,
        unresolvedCount,
        periodLabel: input.periodLabel ?? null,
        amountDueLabel,
        nextChargeLabel: input.nextChargeLabel ?? null,
        autopayLabel: input.autopayLabel ?? null,
        paymentMethodLabel: input.paymentMethodLabel ?? null,
        familyResponsibilityLabel: input.familyResponsibilityLabel ?? null,
        subsidyLabel: input.subsidyLabel ?? null,
        setupHandoff: "billing_setup",
        billingHandoff: "billing_surface",
        answerLine,
        supportingLine,
        statusChip,
        statusTone,
        resolution,
    };
}
