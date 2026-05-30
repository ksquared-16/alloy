"use client";

import type { ReactNode } from "react";
import { personDrawerRolePillClassName } from "@/components/admin/drawer/opportunityInquiryDrawerTypography";
import { resolvePersonDrawerChildSummaryModel } from "@/lib/admin/person/personDrawerChildSummaryModel";
import { personDrawerChildAgeLabel } from "@/lib/admin/person/personDrawerChildIdentity";
import { personDrawerGenderDisplayLabel } from "@/lib/admin/person/personDrawerGenderField";

function OperationalPill({ children }: { children: ReactNode }) {
    return <span className={personDrawerRolePillClassName}>{children}</span>;
}

/** Child drawer header context pills — status lives in title rail subtitle. */
export default function PersonDrawerChildHeaderExecutive({ record }: { record: Record<string, unknown> }) {
    const executive = resolvePersonDrawerChildSummaryModel(record);
    const ageLabel = personDrawerChildAgeLabel(record);
    const genderLabel = personDrawerGenderDisplayLabel(record) ?? executive.gender_label;

    return (
        <div
            className="flex min-w-0 flex-wrap items-center justify-end gap-1.5 pt-0.5"
            data-person-drawer-child-header-executive="true"
        >
            <OperationalPill>Child</OperationalPill>
            {ageLabel ? <OperationalPill>{ageLabel}</OperationalPill> : null}
            {genderLabel ? <OperationalPill>{genderLabel}</OperationalPill> : null}
            {executive.program_label ? <OperationalPill>{executive.program_label}</OperationalPill> : null}
            {executive.location_label ? <OperationalPill>{executive.location_label}</OperationalPill> : null}
        </div>
    );
}
