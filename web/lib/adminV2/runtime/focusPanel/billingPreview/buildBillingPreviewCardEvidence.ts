/**
 * Billing Preview card evidence (Status archetype).
 *
 * Operational question: "Is billing configured and ready for this enrollment?"
 *
 * Pure derivation over `context.truth` — never fabricates financial values.
 * Sources: truth keys populated by the billing configuration runtime
 * (`billing_contact_name`, `billing_contact_email`, `tuition_rate_label`,
 * `fee_balance_cents`, `billing_configured`). Cards observe what is present
 * in the composed record; they do NOT call billing APIs.
 *
 * @see docs/platform/operator/universal-card-archetypes.md (Status)
 */

import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

export type BillingPreviewReadinessItem = {
    label: string;
    met: boolean;
    detail: string | null;
};

export type BillingPreviewCardEvidence = {
    /** True when billing contact + tuition config are both present. */
    isConfigured: boolean;
    billingContactName: string | null;
    tuitionRateLabel: string | null;
    /** Formatted balance label: "$1,200.00 due" or null when not applicable. */
    balanceLabel: string | null;
    readinessItems: BillingPreviewReadinessItem[];
    /** Primary answer line: "Billing configured" | "Billing not configured" */
    answerLine: string;
    supportingLine: string | null;
    statusChip: string | null;
    statusTone: "ready" | "blocked" | "neutral";
    isEmpty: boolean;
};

function trimOrNull(value: unknown): string | null {
    if (value == null) return null;
    const text = String(value).trim();
    return text.length > 0 ? text : null;
}

function formatBalanceLabel(cents: unknown): string | null {
    if (typeof cents !== "number" || cents <= 0) return null;
    const dollars = cents / 100;
    return `$${dollars.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} due`;
}

/** Build billing preview evidence from the Operational Context (pure derivation, no fetch). */
export function buildBillingPreviewCardEvidence(context: OperationalContext): BillingPreviewCardEvidence {
    const { billingConfigured, billingContactName, billingContactEmail, tuitionRateLabel, feeBalanceCents } =
        context.signals.billing;

    const billingConfiguredFlag = billingConfigured;
    void billingContactEmail; // available for readinessItems detail; kept for future use

    const balanceLabel = formatBalanceLabel(feeBalanceCents);

    const readinessItems: BillingPreviewReadinessItem[] = [
        {
            label: "Billing contact",
            met: billingContactName != null,
            detail: billingContactName,
        },
        {
            label: "Tuition rate",
            met: tuitionRateLabel != null,
            detail: tuitionRateLabel,
        },
    ];

    const isConfigured = billingConfiguredFlag || (billingContactName != null && tuitionRateLabel != null);
    const unmetCount = readinessItems.filter((i) => !i.met).length;

    let answerLine: string;
    let supportingLine: string | null;
    let statusChip: string | null;
    let statusTone: BillingPreviewCardEvidence["statusTone"];

    if (isConfigured) {
        answerLine = "Billing configured";
        supportingLine = tuitionRateLabel ?? "Tuition rate on file";
        statusChip = "Configured";
        statusTone = "ready";
    } else if (unmetCount > 0) {
        answerLine = `${unmetCount} item${unmetCount === 1 ? "" : "s"} missing`;
        supportingLine = "Billing contact or tuition rate not yet configured";
        statusChip = `${unmetCount} missing`;
        statusTone = "blocked";
    } else {
        answerLine = "Billing not configured";
        supportingLine = "Set up billing contact and tuition rate to proceed";
        statusChip = null;
        statusTone = "neutral";
    }

    return {
        isConfigured,
        billingContactName,
        tuitionRateLabel,
        balanceLabel,
        readinessItems,
        answerLine,
        supportingLine,
        statusChip,
        statusTone,
        isEmpty: !isConfigured && unmetCount === 0,
    };
}
