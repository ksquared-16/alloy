"use client";

import PersonEmployeePlacementSection, {
    type PersonEmployeePlacementSectionProps,
} from "@/components/admin/entity/PersonEmployeePlacementSection";
import {
    oppInqEyebrow,
    oppInqInnerCardCompact,
    oppInqLeadSummaryShellClassName,
} from "@/components/admin/drawer/opportunityInquiryDrawerTypography";

/** Employee status on parent/person drawer — premium card shell. */
export default function PersonDrawerEmployeeStatusSection(props: PersonEmployeePlacementSectionProps) {
    return (
        <section
            className={`${oppInqLeadSummaryShellClassName} mb-2`}
            data-person-drawer-employee-status="true"
            aria-label="Employee status"
        >
            <p className={`${oppInqEyebrow} px-0.5`}>Employee status</p>
            <div className={`${oppInqInnerCardCompact} mt-2 px-0.5 pb-1`}>
                <PersonEmployeePlacementSection {...props} />
            </div>
        </section>
    );
}
