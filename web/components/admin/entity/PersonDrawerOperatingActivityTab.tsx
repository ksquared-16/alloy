"use client";

import { oppInqInnerCardCompact, oppInqMutedEmpty } from "@/components/admin/drawer/opportunityInquiryDrawerTypography";

/** Parent/child Activity tab — timeline deferred; polished empty state (no legacy relationships). */
export default function PersonDrawerOperatingActivityTab({
    variant,
}: {
    variant: "parent" | "child";
}) {
    return (
        <div
            className="pt-2"
            data-person-drawer-operating-activity="true"
            data-person-drawer-operating-activity-variant={variant}
        >
            <div className={`${oppInqInnerCardCompact} px-4 py-8 text-center`}>
                <p className="text-sm font-medium text-alloy-midnight/80">No activity yet</p>
                <p className={`mt-1 ${oppInqMutedEmpty}`}>
                    {variant === "child"
                        ? "Enrollment and workflow activity for this child will appear here when events are recorded."
                        : "Communications and workflow activity for this guardian will appear here when events are recorded."}
                </p>
            </div>
        </div>
    );
}
