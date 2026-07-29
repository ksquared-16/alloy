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
import type { FinancialConfigEnrollment } from "@/lib/adminV2/runtime/focusPanel/financialConfig/financialConfigTypes";

export type BillingPreviewReadinessItem = {
    label: string;
    /**
     * Has an AUTHORITATIVE SOURCE answered for this item? `false` means unresolved — the platform
     * has not been told, which is NOT the same as "the operator has not configured it". An
     * unresolved item never counts as missing and never contributes a blocked verdict.
     */
    resolved: boolean;
    /** Only meaningful when `resolved`. */
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
     * Per-child tuition rate resolutions from the financial-config API.
     * Null until the API response is available (lazy-loaded in expanded mode).
     * Each entry correlates to a placement fact by ocmId.
     */
    enrollments: FinancialConfigEnrollment[] | null;
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

/**
 * Build financial configuration evidence from the Operational Context (pure derivation, no fetch).
 * Pass `enrollments` from `useFinancialConfig` when the expanded overlay is open.
 */
export function buildBillingPreviewCardEvidence(
    context: OperationalContext,
    enrollments: FinancialConfigEnrollment[] | null = null,
): BillingPreviewCardEvidence {
    const { billingConfigured, billingContactName, billingContactEmail, tuitionRateLabel, feeBalanceCents } =
        context.signals.billing;

    const balanceLabel = formatBalanceLabel(feeBalanceCents);
    const placementFacts = buildPlacementFacts(context.truth);

    // Payer/responsibility: not yet projected into truth — missing-state until write path built.
    const responsibilityConfigured = Boolean(context.truth["billing_responsibility_configured"]);

    // DEFERRED SOURCE (Runtime law: unresolved must never fabricate business truth).
    //
    // Tuition configuration has NO truth-key writer anywhere in the platform — `tuition_rate_label`
    // and `billing_configured` are read here and in `buildOperationalContext`, and written NOWHERE
    // (no migration, no composer, no adapter). Their authoritative source is the financial-config
    // API (`useFinancialConfig` -> `enrollments`), which is fetched only when the card is OPENED.
    // So while `enrollments` is null the tuition answer is UNRESOLVED, not "missing": reporting it
    // as missing manufactured a `blocked` verdict — "N items missing" — out of unwired plumbing,
    // on every record, forever. Same defect class as the Milestones fabrication (Step 1).
    //
    // The billing CONTACT is different: it resolves from `person.billing_contact_*`, a real field
    // ref the org can configure, so its absence is a genuine answer.
    const tuitionRateFromSource =
        enrollments?.find((e) => e.resolvedRate != null)?.resolvedRate?.rateLabel ?? null;
    const resolvedTuitionLabel = tuitionRateLabel ?? tuitionRateFromSource;
    // Resolved when SOME authoritative source has spoken: the financial-config API answered
    // (`enrollments` non-null, even if it found no rate), or the truth key actually carries a value.
    // Neither speaking = unresolved. (In production today only the API can ever resolve it.)
    const tuitionResolved = enrollments != null || tuitionRateLabel != null;

    const readinessItems: BillingPreviewReadinessItem[] = [
        {
            label: "Billing contact",
            resolved: true,
            met: billingContactName != null,
            detail: billingContactName ?? billingContactEmail,
        },
        {
            label: "Tuition rate",
            resolved: tuitionResolved,
            met: tuitionResolved && resolvedTuitionLabel != null,
            detail: resolvedTuitionLabel,
        },
    ];

    const isConfigured =
        billingConfigured || (billingContactName != null && tuitionResolved && resolvedTuitionLabel != null);
    // Only a RESOLVED item can be missing. Unresolved items are held, never counted.
    const unmetCount = readinessItems.filter((i) => i.resolved && !i.met).length;
    const unresolvedCount = readinessItems.filter((i) => !i.resolved).length;

    let answerLine: string;
    let supportingLine: string | null;
    let statusChip: string | null;
    let statusTone: BillingPreviewCardEvidence["statusTone"];

    if (isConfigured) {
        answerLine = "Billing configured";
        supportingLine = resolvedTuitionLabel ?? "Tuition rate on file";
        statusChip = "Configured";
        statusTone = "ready";
    } else if (unresolvedCount > 0) {
        // HOLD — no verdict. State only what an authoritative source actually answered.
        answerLine = billingContactName ?? "";
        supportingLine = billingContactName != null ? "Billing contact" : null;
        statusChip = null;
        statusTone = "neutral";
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
        tuitionRateLabel: resolvedTuitionLabel,
        balanceLabel,
        readinessItems,
        placementFacts,
        enrollments,
        responsibilityConfigured,
        answerLine,
        supportingLine,
        statusChip,
        statusTone,
        // "Empty" means resolved-and-nothing-there. An unresolved card is HELD, not empty.
        isEmpty: !isConfigured && unmetCount === 0 && unresolvedCount === 0,
    };
}
