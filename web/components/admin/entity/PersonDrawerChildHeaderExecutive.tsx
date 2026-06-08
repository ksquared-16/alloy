"use client";

import type { ReactNode } from "react";
import { personDrawerRolePillClassName } from "@/components/admin/drawer/opportunityInquiryDrawerTypography";
import { personDrawerChildChromeActive } from "@/lib/admin/person/personDrawerChildChrome";
import type { PersonDrawerChildChromeHint } from "@/lib/admin/person/personDrawerChildChrome";
import { personDrawerChildLeadPillLabel } from "@/lib/admin/person/personDrawerChildLeadPill";
import {
    PERSON_DRAWER_EDIT_PLACEMENT_ON_LEAD_LABEL,
    personDrawerChildCanEditPlacementOnLead,
    resolvePersonDrawerChildPlacementFromRecord,
} from "@/lib/admin/person/personDrawerChildPlacementContext";

function OperationalPill({ children }: { children: ReactNode }) {
    return <span className={personDrawerRolePillClassName}>{children}</span>;
}

/** Child drawer header context — program/classroom and lead pills (not in overview body). */
export default function PersonDrawerChildHeaderExecutive({
    record,
    chromeHint,
    onOpenLeadOpportunity,
}: {
    record: Record<string, unknown>;
    chromeHint?: PersonDrawerChildChromeHint | null;
    onOpenLeadOpportunity?: (opportunityId: string) => void;
}) {
    if (!personDrawerChildChromeActive(record, chromeHint)) {
        return null;
    }

    const placement = resolvePersonDrawerChildPlacementFromRecord(record);
    const opportunityId = placement.primary_opportunity_id;
    const mirror = (record._enrollment_mirror as { opportunity_name?: string | null }[] | undefined)?.[0];
    const opportunityName = mirror?.opportunity_name?.trim() || null;
    const hasLeadLink = Boolean(opportunityId && onOpenLeadOpportunity);
    const leadPillLabel = personDrawerChildLeadPillLabel(placement.status_label, opportunityName);

    const hasPlacementPills = Boolean(placement.program_label || placement.location_label);
    const hasLeadPill = Boolean(hasLeadLink && (placement.status_label || opportunityName));
    const canEditPlacement =
        personDrawerChildCanEditPlacementOnLead(placement) && hasLeadLink;

    if (!hasPlacementPills && !hasLeadPill && !canEditPlacement) {
        return null;
    }

    return (
        <div
            className="flex min-w-0 flex-wrap items-center justify-end gap-1.5 pt-0.5"
            data-person-drawer-child-header-executive="true"
        >
            {placement.program_label ? (
                <OperationalPill>
                    <span data-person-drawer-child-header-program={placement.program_label}>
                        {placement.program_label}
                    </span>
                </OperationalPill>
            ) : null}
            {placement.location_label ? (
                <OperationalPill>
                    <span data-person-drawer-child-header-location={placement.location_label}>
                        {placement.location_label}
                    </span>
                </OperationalPill>
            ) : null}
            {hasLeadPill ? (
                <button
                    type="button"
                    onClick={() => onOpenLeadOpportunity!(opportunityId!)}
                    className={`${personDrawerRolePillClassName} cursor-pointer hover:border-alloy-blue/45 hover:bg-alloy-blue/[0.12]`}
                    data-person-drawer-child-lead-pill="true"
                >
                    {leadPillLabel}
                </button>
            ) : null}
            {canEditPlacement && opportunityId ? (
                <button
                    type="button"
                    onClick={() => onOpenLeadOpportunity!(opportunityId)}
                    className="text-[11px] font-medium text-alloy-blue hover:underline"
                    data-person-drawer-edit-placement-on-lead="true"
                >
                    {PERSON_DRAWER_EDIT_PLACEMENT_ON_LEAD_LABEL}
                </button>
            ) : null}
        </div>
    );
}
