"use client";

import BosDrawerAssistCta from "@/components/admin/drawer/BosDrawerAssistCta";
import {
    INQUIRY_RIGHT_COLUMN_GROUP_LABEL_CLASS,
    INQUIRY_SUMMARY_RIGHT_COLUMN_ROOT_CLASS,
} from "@/lib/admin/drawer/opportunityInquiryRightColumnGeometry";
import { oppInqEyebrow } from "@/components/admin/drawer/opportunityInquiryDrawerTypography";

/** Lightweight BOS assist slot for child summary — aligned with opportunity right column. */
export default function PersonDrawerChildSummaryBosPanel({
    personId,
    overviewData,
}: {
    personId: string;
    overviewData: Record<string, unknown>;
}) {
    return (
        <aside
            className={`${INQUIRY_SUMMARY_RIGHT_COLUMN_ROOT_CLASS} h-full min-h-[12rem] rounded-lg border border-alloy-stone/10 bg-alloy-stone/[0.02] px-2.5 py-2`}
            data-person-drawer-child-bos="true"
            aria-label="Child assist"
        >
            <p className={INQUIRY_RIGHT_COLUMN_GROUP_LABEL_CLASS}>Assist</p>
            <p className="mt-1.5 text-[11px] leading-snug text-alloy-midnight/50" data-review-assist-calm="true">
                No urgent action flagged.
            </p>
            <ul className="mt-2 space-y-1 text-[10px] leading-snug text-alloy-midnight/40">
                <li>Missing documents — coming soon</li>
                <li>Stale communication — coming soon</li>
                <li>Enrollment blocker — coming soon</li>
            </ul>
            <div className="mt-2 border-t border-alloy-stone/10 pt-2">
                <BosDrawerAssistCta entityId={personId} overviewData={overviewData} opportunitySingular="Child" />
            </div>
        </aside>
    );
}
