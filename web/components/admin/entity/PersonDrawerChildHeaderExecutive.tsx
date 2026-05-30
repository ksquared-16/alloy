"use client";

import type { ReactNode } from "react";
import { personDrawerRolePillClassName } from "@/components/admin/drawer/opportunityInquiryDrawerTypography";
import { resolvePersonDrawerChildSummaryModel } from "@/lib/admin/person/personDrawerChildSummaryModel";

function OperationalPill({ children }: { children: ReactNode }) {
    return <span className={personDrawerRolePillClassName}>{children}</span>;
}

/** Child drawer header context — program/location only; name/Child/age sit in title row. */
export default function PersonDrawerChildHeaderExecutive({ record }: { record: Record<string, unknown> }) {
    const executive = resolvePersonDrawerChildSummaryModel(record);

    if (!executive.program_label && !executive.location_label) {
        return null;
    }

    return (
        <div
            className="flex min-w-0 flex-wrap items-center justify-end gap-1.5 pt-0.5"
            data-person-drawer-child-header-executive="true"
        >
            {executive.program_label ? <OperationalPill>{executive.program_label}</OperationalPill> : null}
            {executive.location_label ? <OperationalPill>{executive.location_label}</OperationalPill> : null}
        </div>
    );
}
