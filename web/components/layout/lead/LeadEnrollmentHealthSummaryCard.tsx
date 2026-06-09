"use client";

import type { LeadDrawerEnrollmentHealthSummary } from "@/lib/layout/runtime/summarizeLeadDrawerEnrollmentHealth";
import { scrollToLeadEnrollmentSection } from "@/lib/layout/runtime/summarizeLeadDrawerEnrollmentHealth";

type Props = {
    summary: LeadDrawerEnrollmentHealthSummary;
};

export default function LeadEnrollmentHealthSummaryCard({ summary }: Props) {
    return (
        <div className="flex min-h-0 flex-col gap-1.5" data-lead-enrollment-health-summary="true">
            <p className="line-clamp-2 text-[11px] font-medium leading-snug text-alloy-midnight/80">{summary.headline}</p>
            {summary.detailLine ?
                <p className="line-clamp-2 text-[10px] leading-snug text-alloy-midnight/50">{summary.detailLine}</p>
            :   null}
            {summary.childCount > 0 ?
                <button
                    type="button"
                    className="self-start text-[10px] font-medium text-alloy-juniper hover:text-alloy-juniper/80"
                    data-lead-enrollment-health-view-link="true"
                    onClick={scrollToLeadEnrollmentSection}
                >
                    View enrollment
                </button>
            :   null}
        </div>
    );
}
