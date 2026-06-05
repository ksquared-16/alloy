"use client";

import {
    oppInqEyebrow,
    oppInqInnerCardCompact,
    oppInqLeadSummaryShellClassName,
} from "@/components/admin/drawer/opportunityInquiryDrawerTypography";
import {
    buildPersonEnrollmentActivityEntries,
    type PersonEnrollmentActivityEntry,
} from "@/lib/admin/person/buildPersonEnrollmentActivityEntries";
import { personDrawerCrmDisplayLabel } from "@/lib/admin/person/personDrawerChildIdentity";
import type {
    PersonEnrollmentMirrorRow,
    PersonEnrollmentOpportunityRow,
} from "@/lib/admin/person/personDrawerVisibilityTypes";
import { useMemo } from "react";

type OpenDrawer = (type: string, id: string) => void;

export type { PersonEnrollmentActivityEntry };
export { buildPersonEnrollmentActivityEntries };

export default function PersonDrawerEnrollmentActivity({
    mirrorRows,
    opportunityRows,
    onOpenDrawer,
    leadSummaryShell = false,
}: {
    mirrorRows: PersonEnrollmentMirrorRow[];
    opportunityRows: PersonEnrollmentOpportunityRow[];
    onOpenDrawer: OpenDrawer;
    /** Pine-accent shell — single primary home for enrollment on child drawer. */
    leadSummaryShell?: boolean;
}) {
    const entries = useMemo(
        () => buildPersonEnrollmentActivityEntries(mirrorRows, opportunityRows),
        [mirrorRows, opportunityRows]
    );

    if (entries.length === 0) return null;

    const cards = (
        <div className="space-y-2" data-person-drawer-enrollment-activity="true">
            {entries.map((entry) => (
                <div key={entry.opportunity_id} className={leadSummaryShell ? "px-0.5 py-0.5" : oppInqInnerCardCompact}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                        <button
                            type="button"
                            onClick={() => onOpenDrawer("opportunities", entry.opportunity_id)}
                            className="text-left text-[13px] font-semibold text-alloy-blue hover:underline"
                        >
                            {personDrawerCrmDisplayLabel(entry.opportunity_name) ?? entry.opportunity_name}
                        </button>
                        {entry.status_label ? (
                            <span className="text-[10px] font-medium tracking-wide text-alloy-midnight/45">
                                {personDrawerCrmDisplayLabel(entry.status_label)}
                            </span>
                        ) : null}
                    </div>
                    {(entry.role_label || entry.program_label || entry.location_label || entry.room_label) && (
                        <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
                            {entry.role_label ? (
                                <div>
                                    <dt className={oppInqEyebrow}>Role</dt>
                                    <dd className="text-[12px] text-alloy-midnight/80">{entry.role_label}</dd>
                                </div>
                            ) : null}
                            {entry.program_label ? (
                                <div>
                                    <dt className={oppInqEyebrow}>Program</dt>
                                    <dd className="text-[12px] text-alloy-midnight/80">{entry.program_label}</dd>
                                </div>
                            ) : null}
                            {entry.location_label ? (
                                <div>
                                    <dt className={oppInqEyebrow}>Location</dt>
                                    <dd className="text-[12px] text-alloy-midnight/80">{entry.location_label}</dd>
                                </div>
                            ) : null}
                            {entry.room_label ? (
                                <div>
                                    <dt className={oppInqEyebrow}>Room</dt>
                                    <dd className="text-[12px] text-alloy-midnight/80">{entry.room_label}</dd>
                                </div>
                            ) : null}
                        </dl>
                    )}
                </div>
            ))}
        </div>
    );

    if (leadSummaryShell) {
        return (
            <div className={oppInqLeadSummaryShellClassName} data-person-drawer-enrollment-lead-shell="true">
                {cards}
            </div>
        );
    }

    return cards;
}
