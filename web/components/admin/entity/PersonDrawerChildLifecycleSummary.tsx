"use client";

import RecordDrawerContextPanel from "@/components/admin/drawer/record/RecordDrawerContextPanel";
import { resolvePersonDrawerProfileFromRecord } from "@/components/admin/entity/PersonDrawerProfileBadges";
import {
    personDrawerShowsChildLifecycleSurface,
    primaryHouseholdLabel,
} from "@/lib/admin/person/personDrawerChildLifecycleSlots";
import { resolvePersonDrawerChildIdentitySummary } from "@/lib/admin/person/personDrawerChildIdentity";
import { oppInqEyebrow, oppInqInnerCardCompact } from "@/components/admin/drawer/opportunityInquiryDrawerTypography";

/** Household + primary guardian reference — identity and CRM context live in header and Enrollment. */
export default function PersonDrawerChildLifecycleSummary({ record }: { record: Record<string, unknown> }) {
    const profile = resolvePersonDrawerProfileFromRecord(record);
    if (!personDrawerShowsChildLifecycleSurface(profile)) {
        return null;
    }

    const summary = resolvePersonDrawerChildIdentitySummary(record, primaryHouseholdLabel(record));
    if (!summary.household_label && !summary.primary_guardian) {
        return null;
    }

    return (
        <RecordDrawerContextPanel
            data-record-drawer-context="person-child-lifecycle"
            variant="card"
            className={oppInqInnerCardCompact}
        >
            <div className="space-y-1.5" data-person-drawer-child-lifecycle-summary="true">
                <p className={oppInqEyebrow}>Household context</p>
                <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2 text-[12px] leading-snug text-alloy-midnight/80">
                    {summary.household_label ? (
                        <div>
                            <dt className={oppInqEyebrow}>Household</dt>
                            <dd className="font-medium text-alloy-midnight/85">{summary.household_label}</dd>
                        </div>
                    ) : null}
                    {summary.primary_guardian ? (
                        <div>
                            <dt className={oppInqEyebrow}>Primary guardian</dt>
                            <dd className="font-medium text-alloy-midnight/85">
                                {summary.primary_guardian.display_name}
                                {summary.primary_guardian.role_label ? (
                                    <span className="ml-1 text-[11px] font-normal text-alloy-midnight/45">
                                        · {summary.primary_guardian.role_label}
                                    </span>
                                ) : null}
                            </dd>
                        </div>
                    ) : null}
                </dl>
            </div>
        </RecordDrawerContextPanel>
    );
}
