/**
 * Effective opportunity lifecycle for UI — driven by status_definitions.metadata.lifecycle_stage
 * plus a derived "decision" stage when the effective quote in dollars is positive
 * (see {@link effectiveOpportunityQuoteDollars}, matching `_quote_total_display`).
 * No vertical-specific branching; status keys remain configurable in the database.
 */

import type { StatusDefinitionRow } from "@/lib/admin/statusDefinitionsResolve";
import {
    type OpportunityLifecycleStage,
    parseLifecycleStageFromMetadata,
} from "@/lib/admin/statusDefinitionLifecycle";

export type OpportunityLifecycleNextStep = {
    title: string;
    lines: string[];
};

export type OpportunityLifecycleFields = {
    _effective_lifecycle_stage: OpportunityLifecycleStage | null;
    _lifecycle_stage_title: string;
    _lifecycle_stage_meaning: string;
    _lifecycle_next_step: OpportunityLifecycleNextStep;
};

/** Row slice used for `_quote_total_display` and lifecycle “priced” evaluation. */
export type OpportunityQuoteSourceRow = {
    quote_total?: unknown;
    estimated_price_cents?: unknown;
    monetary_value_cents?: unknown;
};

/**
 * Effective quote in dollars for display and lifecycle — same fallback order as `_quote_total_display`
 * on `GET /api/admin/entity/opportunities/:id`.
 */
export function effectiveOpportunityQuoteDollars(opp: OpportunityQuoteSourceRow): number | null {
    if (opp.quote_total != null && !Number.isNaN(Number(opp.quote_total))) {
        return Number(opp.quote_total);
    }
    if (opp.estimated_price_cents != null && !Number.isNaN(Number(opp.estimated_price_cents))) {
        return Number(opp.estimated_price_cents) / 100;
    }
    if (opp.monetary_value_cents != null && !Number.isNaN(Number(opp.monetary_value_cents))) {
        return Number(opp.monetary_value_cents) / 100;
    }
    return null;
}

/**
 * Positive effective quote dollars only (for KPI sums / “priced” aggregates where null means not priced).
 * For lifecycle stage resolution, pass {@link effectiveOpportunityQuoteDollars} so zero stays explicit.
 */
export function opportunityQuoteTotalForLifecycle(opp: OpportunityQuoteSourceRow): number | null {
    const d = effectiveOpportunityQuoteDollars(opp);
    return d != null && d > 0 ? d : null;
}

/**
 * 1) If configured lifecycle for current status is success or failure → use that.
 * 2) Else if effective quote dollars > 0 → decision (derived).
 * 3) Else → configured lifecycle from status_definitions.metadata.lifecycle_stage.
 */
export function resolveEffectiveOpportunityLifecycleStage(input: {
    statusKey: string | null | undefined;
    quoteTotalDollars: number | null | undefined;
    defs: StatusDefinitionRow[];
}): OpportunityLifecycleStage | null {
    const sk = input.statusKey?.trim() || null;
    const def = sk
        ? input.defs.find((d) => d.status_key.toLowerCase() === sk.toLowerCase())
        : undefined;
    const fromStatus = parseLifecycleStageFromMetadata(def?.metadata);

    if (fromStatus === "success" || fromStatus === "failure") {
        return fromStatus;
    }

    const q = input.quoteTotalDollars;
    if (q != null && Number.isFinite(q) && q > 0) {
        return "decision";
    }

    return fromStatus ?? null;
}

function lifecycleStageTitle(stage: OpportunityLifecycleStage | null): string {
    switch (stage) {
        case "intake":
            return "Intake";
        case "qualification":
            return "Qualification";
        case "execution":
            return "Execution";
        case "decision":
            return "Decision";
        case "success":
            return "Success";
        case "failure":
            return "Closed";
        default:
            return "Pipeline";
    }
}

function lifecycleStageMeaning(stage: OpportunityLifecycleStage | null): string {
    switch (stage) {
        case "intake":
            return "New demand is captured; initial triage and routing.";
        case "qualification":
            return "Fit and priority are being confirmed before solution work.";
        case "execution":
            return "Pricing and scope work is in progress.";
        case "decision":
            return "A price exists; waiting on customer commitment or next step.";
        case "success":
            return "This opportunity reached a successful closed outcome.";
        case "failure":
            return "This opportunity was closed without a win.";
        default:
            return "Track this record using your configured opportunity statuses.";
    }
}

function lifecycleNextStep(stage: OpportunityLifecycleStage | null): OpportunityLifecycleNextStep {
    switch (stage) {
        case "intake":
            return {
                title: "Suggested next step",
                lines: ["Confirm fit, then qualify the opportunity when you are ready to move forward."],
            };
        case "qualification":
            return {
                title: "Suggested next step",
                lines: ["Start or continue quoting so a price can be produced for the customer."],
            };
        case "execution":
            return {
                title: "Suggested next step",
                lines: ["Complete pricing inputs and settle the quote so a decision can be made."],
            };
        case "decision":
            return {
                title: "Suggested next step",
                lines: [
                    "Follow up on the priced offer: book or convert when the customer is ready, or mark lost if they decline.",
                ],
            };
        case "success":
            return {
                title: "What’s next",
                lines: ["Operational follow-up happens on the job or booking tied to this opportunity."],
            };
        case "failure":
            return {
                title: "What’s next",
                lines: ["Review notes and source for learnings; reopen only if policy allows."],
            };
        default:
            return {
                title: "Suggested next step",
                lines: ["Set the opportunity status so the team can see where it sits in your pipeline."],
            };
    }
}

export function buildOpportunityLifecycleFields(input: {
    statusKey: string | null | undefined;
    quoteTotalDollars: number | null | undefined;
    defs: StatusDefinitionRow[];
}): OpportunityLifecycleFields {
    const effective = resolveEffectiveOpportunityLifecycleStage({
        statusKey: input.statusKey,
        quoteTotalDollars: input.quoteTotalDollars,
        defs: input.defs,
    });
    return {
        _effective_lifecycle_stage: effective,
        _lifecycle_stage_title: lifecycleStageTitle(effective),
        _lifecycle_stage_meaning: lifecycleStageMeaning(effective),
        _lifecycle_next_step: lifecycleNextStep(effective),
    };
}
