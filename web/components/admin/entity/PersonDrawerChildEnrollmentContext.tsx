"use client";

import { personDrawerRolePillClassName } from "@/components/admin/drawer/opportunityInquiryDrawerTypography";
import { personDrawerChildChromeActive } from "@/lib/admin/person/personDrawerChildChrome";
import type { PersonDrawerChildChromeHint } from "@/lib/admin/person/personDrawerChildChrome";
import { personDrawerCrmDisplayLabel } from "@/lib/admin/person/personDrawerChildIdentity";
import { resolvePersonDrawerChildSummaryModel } from "@/lib/admin/person/personDrawerChildSummaryModel";

function familyLeadPillLabel(statusLabel: string | null, opportunityName: string | null): string {
    const status = personDrawerCrmDisplayLabel(statusLabel);
    if (status) return `Family Lead: ${status}`;
    if (opportunityName?.trim()) return `Open Family Lead`;
    return "Open Family Lead";
}

/** Linked opportunity context — small pill, not child status. */
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
    const opportunityId = summary.primary_opportunity_id;
    const mirror = (record._enrollment_mirror as { opportunity_name?: string | null }[] | undefined)?.[0];
    const opportunityName = mirror?.opportunity_name?.trim() || null;

    const hasLeadLink = Boolean(opportunityId && onOpenLeadOpportunity);
    const hasProgramOrLocation = summary.program_label || summary.location_label;

    if (!hasLeadLink && !hasProgramOrLocation) return null;

    return (
        <div
            className="mb-2 flex min-w-0 flex-wrap items-center gap-1.5 px-0.5"
            data-person-drawer-enrollment-context="true"
        >
            {summary.program_label ? (
                <span className={personDrawerRolePillClassName}>{summary.program_label}</span>
            ) : null}
            {summary.location_label ? (
                <span className={personDrawerRolePillClassName}>{summary.location_label}</span>
            ) : null}
            {hasLeadLink ? (
                <button
                    type="button"
                    onClick={() => onOpenLeadOpportunity!(opportunityId!)}
                    className={`${personDrawerRolePillClassName} cursor-pointer hover:border-alloy-blue/45 hover:bg-alloy-blue/[0.12]`}
                    data-person-drawer-family-lead-link="true"
                >
                    {familyLeadPillLabel(summary.status_label, opportunityName)}
                </button>
            ) : null}
        </div>
    );
}
