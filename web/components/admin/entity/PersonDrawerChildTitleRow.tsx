"use client";

import type { ReactNode } from "react";
import { personDrawerRolePillClassName } from "@/components/admin/drawer/opportunityInquiryDrawerTypography";
import { resolvePersonDrawerChildSummaryModel } from "@/lib/admin/person/personDrawerChildSummaryModel";
import { personDrawerChildAgeLabel } from "@/lib/admin/person/personDrawerChildIdentity";

function RolePill({ children }: { children: ReactNode }) {
    return <span className={personDrawerRolePillClassName}>{children}</span>;
}

/** Child name + role/age pills on the same row as the drawer title. */
export default function PersonDrawerChildTitleRow({ record }: { record: Record<string, unknown> }) {
    const summary = resolvePersonDrawerChildSummaryModel(record);
    const ageLabel = personDrawerChildAgeLabel(record);

    return (
        <div
            className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1"
            data-person-drawer-child-title-row="true"
        >
            <span className="truncate text-lg font-semibold leading-tight text-alloy-midnight">
                {summary.display_name}
            </span>
            <RolePill>Child</RolePill>
            {ageLabel ? <RolePill>{ageLabel}</RolePill> : null}
        </div>
    );
}
