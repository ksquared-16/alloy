"use client";

import { personDrawerRolePillClassName } from "@/components/admin/drawer/opportunityInquiryDrawerTypography";
import { personDrawerChildChromeActive } from "@/lib/admin/person/personDrawerChildChrome";
import type { PersonDrawerChildChromeHint } from "@/lib/admin/person/personDrawerChildChrome";
import { personDrawerCrmDisplayLabel } from "@/lib/admin/person/personDrawerChildIdentity";
import { resolvePersonDrawerChildSummaryModel } from "@/lib/admin/person/personDrawerChildSummaryModel";

/** Enrollment-owned context — program, location, linked family lead (not person identity). */
export default function PersonDrawerChildEnrollmentContext({
    record,
    chromeHint,
    onOpenLeadOpportunity,
}: {
    record: Record<string, unknown>;
    chromeHint?: PersonDrawerChildChromeHint | null;
    onOpenLeadOpportunity?: (opportunityId: string) => void;
}) {
    if (!personDrawerChildChromeActive(record, chromeHint)) return null;

    const summary = resolvePersonDrawerChildSummaryModel(record);
    const leadLabel = personDrawerCrmDisplayLabel(summary.status_label);
    const opportunityId = summary.primary_opportunity_id;
    const hasContext =
        summary.program_label ||
        summary.location_label ||
        (leadLabel && opportunityId) ||
        summary.primary_guardian;

    if (!hasContext) return null;

    return (
        <div
            className="mb-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 rounded-lg border border-alloy-stone/12 bg-alloy-stone/[0.03] px-3 py-2"
            data-person-drawer-enrollment-context="true"
        >
            <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-alloy-midnight/45">
                Enrollment
            </span>
            {summary.program_label ? (
                <span className={personDrawerRolePillClassName}>{summary.program_label}</span>
            ) : null}
            {summary.location_label ? (
                <span className={personDrawerRolePillClassName}>{summary.location_label}</span>
            ) : null}
            {leadLabel && opportunityId && onOpenLeadOpportunity ? (
                <button
                    type="button"
                    onClick={() => onOpenLeadOpportunity(opportunityId)}
                    className="text-[12px] font-medium text-alloy-blue hover:underline"
                    data-person-drawer-family-lead-link="true"
                >
                    {leadLabel}
                </button>
            ) : leadLabel ? (
                <span className="text-[12px] font-medium text-alloy-midnight/70">{leadLabel}</span>
            ) : null}
        </div>
    );
}
