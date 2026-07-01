/**
 * Financial Configuration card evidence (Status archetype).
 *
 * Operational question: "Is billing configured and ready for this enrollment?"
 * (Active phase: "What is the current financial state of care?")
 *
 * Pure derivation over `context.signals.billing` and `context.truth` placement facts.
 * Never fabricates financial values. Follows the Operational Configuration Card Pattern:
 *
 *   Placement facts → Configuration → Readiness → Activity/History
 *
 * Sources:
 *   - context.signals.billing  (billing_configured, billing_contact_name, tuition_rate_label, fee_balance_cents)
 *   - context.truth._inquiry_children  (program, room, schedule — shared with Children card)
 *
 * Both this card and the Children card read _inquiry_children independently.
 * This card does NOT derive from the Children card evidence.
 *
 * @see docs/platform/operator/operational-configuration-card-pattern.md
 * @see docs/platform/operator/operational-grain-doctrine.md §7
 */

import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

export type BillingPreviewReadinessItem = {
    label: string;
    met: boolean;
    detail: string | null;
};

/** Placement facts shared with the Children card, surfaced for billing context. */
export type BillingPlacementFact = {
    childLabel: string;
    programLabel: string | null;
    roomLabel: string | null;
    scheduleLabel: string | null;
};

export type BillingPreviewCardEvidence = {
    /** True when billing contact + tuition config are both present. */
    isConfigured: boolean;
    billingContactName: string | null;
    billingContactEmail: string | null;
    tuitionRateLabel: string | null;
    /** Formatted balance label: "$1,200.00 due" or null when not applicable. */
    balanceLabel: string | null;
    readinessItems: BillingPreviewReadinessItem[];
    /**
     * Placement facts from _inquiry_children — same source as Children card.
     * Empty array when no children are present.
     */
    placementFacts: BillingPlacementFact[];
    /**
     * True when payer/responsibility records exist in the composed truth.
     * False (missing-state) until the billing responsibility write path is built.
     */
    responsibilityConfigured: boolean;
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

/** Project placement facts from _inquiry_children. Same source as Children card; no derivation from it. */
function buildPlacementFacts(truth: Record<string, unknown>): BillingPlacementFact[] {
    const rows = (truth["_inquiry_children"] as unknown[]) ?? [];
    return rows
        .filter((row): row is Record<string, unknown> => row != null && typeof row === "object")
        .map((row) => ({
            childLabel: trimOrNull(row["display_name"]) ?? "Child",
            programLabel: trimOrNull(row["desired_program_label"]),
            roomLabel: trimOrNull(row["program_room_cohort_label"]) ?? trimOrNull(row["location_label"]),
            scheduleLabel: trimOrNull(row["desired_schedule_label"]),
        }));
}

/** Build financial configuration evidence from the Operational Context (pure derivation, no fetch). */
export function buildBillingPreviewCardEvidence(context: OperationalContext): BillingPreviewCardEvidence {
    const { billingConfigured, billingContactName, billingContactEmail, tuitionRateLabel, feeBalanceCents } =
        context.signals.billing;

    const balanceLabel = formatBalanceLabel(feeBalanceCents);
    const placementFacts = buildPlacementFacts(context.truth);

    // Payer/responsibility: not yet projected into truth — missing-state until write path built.
    const responsibilityConfigured = Boolean(context.truth["billing_responsibility_configured"]);

    const readinessItems: BillingPreviewReadinessItem[] = [
        {
            label: "Billing contact",
            met: billingContactName != null,
            detail: billingContactName ?? billingContactEmail,
        },
        {
            label: "Tuition rate",
            met: tuitionRateLabel != null,
            detail: tuitionRateLabel,
        },
    ];

    const isConfigured = billingConfigured || (billingContactName != null && tuitionRateLabel != null);
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
        billingContactEmail,
        tuitionRateLabel,
        balanceLabel,
        readinessItems,
        placementFacts,
        responsibilityConfigured,
        answerLine,
        supportingLine,
        statusChip,
        statusTone,
        isEmpty: !isConfigured && unmetCount === 0,
    };
}
