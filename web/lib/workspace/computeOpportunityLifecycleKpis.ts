import type { StatusDefinitionRow } from "@/lib/admin/statusDefinitionsResolve";
import {
    opportunityQuoteTotalForLifecycle,
    resolveEffectiveOpportunityLifecycleStage,
} from "@/lib/admin/opportunityLifecyclePresentation";
import type { OpportunityLifecycleStage } from "@/lib/admin/statusDefinitionLifecycle";

export type OpportunityLifecycleKpiCounts = {
    total: number;
    intake: number;
    qualification: number;
    execution: number;
    decision: number;
    success: number;
    failure: number;
    /** Effective lifecycle could not be resolved (missing/unknown status mapping). */
    unclassified: number;
};

export type OpportunityLifecycleKpiValues = {
    /** Sum of quote_total for opportunities not in terminal success/failure (still “in play”). */
    openPipeline: number;
    /** Subset of open pipeline where quote_total is positive (priced motion). */
    pricedInMotion: number;
};

export type OpportunityLifecycleKpiSnapshot = {
    counts: OpportunityLifecycleKpiCounts;
    values: OpportunityLifecycleKpiValues;
    /**
     * Positive `quote_total` sums for **non-terminal** opportunities only, keyed by lowercase `status_key`.
     * Same row scope as `counts` / `values` (department KPI query — not queue preview lists).
     */
    positiveQuoteSumByNonTerminalStatus: Record<string, number>;
    /** Ordered by configured status definition order; counts computed from rows. */
    statusBreakdown?: Array<{
        status_key: string;
        status_label: string;
        lifecycle_stage: string | null;
        count: number;
    }>;
};

type OppRow = {
    status_key: string | null;
    quote_total: number | string | null;
};

function bumpStage(
    counts: OpportunityLifecycleKpiCounts,
    stage: OpportunityLifecycleStage | null
): void {
    if (stage === null) {
        counts.unclassified++;
        return;
    }
    switch (stage) {
        case "intake":
            counts.intake++;
            break;
        case "qualification":
            counts.qualification++;
            break;
        case "execution":
            counts.execution++;
            break;
        case "decision":
            counts.decision++;
            break;
        case "success":
            counts.success++;
            break;
        case "failure":
            counts.failure++;
            break;
        default:
            counts.unclassified++;
    }
}

/**
 * Aggregate opportunity rows using the same effective lifecycle rules as queue/list presentation.
 * Suitable for org-scoped KPI banners (Growth / Enrollment departments).
 */
export function computeOpportunityLifecycleKpis(
    rows: OppRow[],
    defs: StatusDefinitionRow[]
): OpportunityLifecycleKpiSnapshot {
    const counts: OpportunityLifecycleKpiCounts = {
        total: rows.length,
        intake: 0,
        qualification: 0,
        execution: 0,
        decision: 0,
        success: 0,
        failure: 0,
        unclassified: 0,
    };

    let openPipeline = 0;
    let pricedInMotion = 0;
    const positiveQuoteSumByNonTerminalStatus: Record<string, number> = {};

    for (const row of rows) {
        const quoteNum = opportunityQuoteTotalForLifecycle(row);
        const stage = resolveEffectiveOpportunityLifecycleStage({
            statusKey: row.status_key,
            quoteTotalDollars: quoteNum,
            defs,
        });

        bumpStage(counts, stage);

        const terminal = stage === "success" || stage === "failure";
        if (!terminal) {
            const q = quoteNum ?? 0;
            openPipeline += q;
            if (quoteNum != null && quoteNum > 0) {
                pricedInMotion += quoteNum;
                const sk = String(row.status_key ?? "").trim().toLowerCase();
                if (sk) {
                    positiveQuoteSumByNonTerminalStatus[sk] =
                        (positiveQuoteSumByNonTerminalStatus[sk] ?? 0) + quoteNum;
                }
            }
        }
    }

    return {
        counts,
        values: { openPipeline, pricedInMotion },
        positiveQuoteSumByNonTerminalStatus,
    };
}
