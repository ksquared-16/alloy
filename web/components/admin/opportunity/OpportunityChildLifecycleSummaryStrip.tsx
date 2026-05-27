"use client";

import type { OpportunityChildLifecycleSummary } from "@/lib/opportunities/buildOpportunityChildLifecycleSummary";

type Props = {
    summary: OpportunityChildLifecycleSummary | null | undefined;
    /** When true, show the case vs children clarifier (drawer header). */
    showCaseNote?: boolean;
    className?: string;
};

/** Read-only child lifecycle rollup strip — secondary to case/opportunity status (Card 11). */
export function OpportunityChildLifecycleSummaryStrip({ summary, showCaseNote = false, className }: Props) {
    if (!summary?.has_children || !summary.headline_label?.trim()) return null;

    return (
        <div
            className={className}
            data-opportunity-child-lifecycle-summary="true"
            data-child-lifecycle-mixed={summary.is_mixed ? "true" : "false"}
        >
            <p className="text-[11px] leading-snug font-medium text-alloy-midnight/78">{summary.headline_label}</p>
            {summary.display_summary && summary.display_summary !== summary.headline_label ? (
                <p className="text-[10px] leading-snug text-alloy-midnight/55">{summary.display_summary}</p>
            ) : null}
            {showCaseNote ? (
                <p className="mt-0.5 text-[10px] leading-snug text-alloy-midnight/45">{summary.case_status_secondary_note}</p>
            ) : null}
        </div>
    );
}
