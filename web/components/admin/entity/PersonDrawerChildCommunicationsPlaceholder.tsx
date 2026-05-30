"use client";

import { oppInqEyebrow, oppInqInnerCardCompact } from "@/components/admin/drawer/opportunityInquiryDrawerTypography";

/** Person-native communications tab — placeholder until child comms surface ships. */
export default function PersonDrawerChildCommunicationsPlaceholder() {
    return (
        <div
            className={`${oppInqInnerCardCompact} space-y-2`}
            data-person-drawer-child-comms-placeholder="true"
        >
            <p className={oppInqEyebrow}>Communications</p>
            <p className="text-[13px] leading-snug text-alloy-midnight/70">
                Person-scoped communication history for this child is coming soon.
            </p>
            <p className="text-[11px] leading-snug text-alloy-midnight/45">
                For now, use the linked family lead on the Opportunity drawer for inquiry messaging.
            </p>
        </div>
    );
}
