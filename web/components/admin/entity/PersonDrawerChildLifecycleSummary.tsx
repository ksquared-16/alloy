"use client";

import RecordDrawerContextPanel from "@/components/admin/drawer/record/RecordDrawerContextPanel";
import { resolvePersonDrawerProfileFromRecord } from "@/components/admin/entity/PersonDrawerProfileBadges";
import { buildPersonDrawerRelationshipGroups } from "@/lib/admin/person/buildPersonDrawerRelationshipGroups";
import { personDrawerRelationshipInputFromRecord } from "@/lib/admin/person/personDrawerRelationshipInput";
import {
    personDrawerShowsChildLifecycleSurface,
    primaryEnrollmentHint,
    primaryHouseholdLabel,
    resolveChildLifecycleSlotStates,
    type ChildLifecycleSlotState,
} from "@/lib/admin/person/personDrawerChildLifecycleSlots";
import {
    oppInqEyebrow,
    oppInqLeadSummaryShellClassName,
} from "@/components/admin/drawer/opportunityInquiryDrawerTypography";

type OpenDrawer = (type: string, id: string) => void;

function LifecyclePhasePill({ slot }: { slot: ChildLifecycleSlotState }) {
    if (slot.phase === "active") {
        return (
            <span
                className="inline-flex items-center rounded-full border border-[rgb(0,162,131)]/35 bg-[rgb(0,162,131)]/8 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-[rgb(0,100,80)]"
                data-child-lifecycle-slot={slot.key}
                data-child-lifecycle-phase="active"
            >
                {slot.label}
            </span>
        );
    }
    if (slot.phase === "idle") {
        return (
            <span
                className="inline-flex items-center rounded-full border border-alloy-stone/25 bg-white/80 px-2 py-0.5 text-[10px] font-medium text-alloy-midnight/45"
                data-child-lifecycle-slot={slot.key}
                data-child-lifecycle-phase="idle"
                title="No enrollment activity yet"
            >
                {slot.label}
            </span>
        );
    }
    return (
        <span
            className="inline-flex items-center rounded-full border border-dashed border-alloy-stone/20 px-2 py-0.5 text-[10px] font-medium text-alloy-midnight/30"
            data-child-lifecycle-slot={slot.key}
            data-child-lifecycle-phase="future"
            title="Coming later"
        >
            {slot.label}
        </span>
    );
}

/** Child profile overview — household, guardians, enrollment hint, lifecycle roadmap. No duplicate name/DOB (header). */
export default function PersonDrawerChildLifecycleSummary({
    record,
    onOpenDrawer,
}: {
    record: Record<string, unknown>;
    onOpenDrawer: OpenDrawer;
}) {
    const profile = resolvePersonDrawerProfileFromRecord(record);
    if (!personDrawerShowsChildLifecycleSurface(profile)) {
        return null;
    }

    const household = primaryHouseholdLabel(record);
    const enrollment = primaryEnrollmentHint(record);
    const groups = buildPersonDrawerRelationshipGroups(personDrawerRelationshipInputFromRecord(record));
    const adultCount = groups.parents.length + groups.guardians.length;
    const adultPreview = [...groups.parents, ...groups.guardians]
        .map((r) => r.display_name?.trim())
        .filter(Boolean)
        .slice(0, 2)
        .join(", ");
    const slots = resolveChildLifecycleSlotStates(record);

    return (
        <RecordDrawerContextPanel
            data-record-drawer-context="person-child-lifecycle"
            variant="lead-summary"
            className={oppInqLeadSummaryShellClassName}
        >
            <div className="space-y-2" data-person-drawer-child-lifecycle-summary="true">
                <div className="flex flex-wrap items-end justify-between gap-x-2 gap-y-0.5 border-b border-alloy-stone/12 pb-1">
                    <span className={oppInqEyebrow}>Child profile</span>
                    {enrollment?.status ? (
                        <span className="text-[10px] font-medium tracking-wide text-alloy-midnight/45">
                            {enrollment.status}
                        </span>
                    ) : null}
                </div>
                <dl className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 text-[12px] leading-snug text-alloy-midnight/80">
                    {household ? (
                        <div>
                            <dt className={oppInqEyebrow}>Household</dt>
                            <dd className="font-medium text-alloy-midnight/85">{household}</dd>
                        </div>
                    ) : null}
                    {adultCount > 0 ? (
                        <div>
                            <dt className={oppInqEyebrow}>Guardians</dt>
                            <dd>
                                {adultPreview || `${adultCount} on file`}
                                {adultCount > 2 ? ` +${adultCount - 2}` : null}
                            </dd>
                        </div>
                    ) : null}
                    {enrollment ? (
                        <div className={household && adultCount > 0 ? "sm:col-span-2" : undefined}>
                            <dt className={oppInqEyebrow}>Enrollment</dt>
                            <dd>
                                <button
                                    type="button"
                                    onClick={() => onOpenDrawer("opportunities", enrollment.opportunity_id)}
                                    className="font-semibold text-alloy-blue hover:underline text-left"
                                >
                                    {enrollment.label}
                                </button>
                            </dd>
                        </div>
                    ) : null}
                </dl>
                <div className="pt-0.5" data-person-drawer-child-lifecycle-roadmap="true">
                    <p className={oppInqEyebrow}>Lifecycle</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {slots.map((slot) => (
                            <LifecyclePhasePill key={slot.key} slot={slot} />
                        ))}
                    </div>
                </div>
            </div>
        </RecordDrawerContextPanel>
    );
}
