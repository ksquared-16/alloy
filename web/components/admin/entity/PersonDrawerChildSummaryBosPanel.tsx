"use client";

import BosDrawerAssistCta from "@/components/admin/drawer/BosDrawerAssistCta";
import { oppInqEyebrow } from "@/components/admin/drawer/opportunityInquiryDrawerTypography";

/** Lightweight BOS assist slot for child summary — mirrors opportunity calm state. */
export default function PersonDrawerChildSummaryBosPanel({
    personId,
    primaryOpportunityId,
    overviewData,
}: {
    personId: string;
    primaryOpportunityId: string | null;
    overviewData: Record<string, unknown>;
}) {
    const assistEntityId = primaryOpportunityId ?? personId;

    return (
        <aside
            className="min-w-[9.5rem] shrink-0 space-y-2 rounded-lg border border-alloy-stone/12 bg-alloy-stone/[0.03] px-2.5 py-2"
            data-person-drawer-child-bos="true"
            aria-label="Child assist"
        >
            <p className={oppInqEyebrow}>Assist</p>
            <p className="text-[11px] leading-snug text-alloy-midnight/50" data-review-assist-calm="true">
                No urgent action flagged.
            </p>
            <ul className="space-y-1 text-[10px] leading-snug text-alloy-midnight/40">
                <li>Missing documents — coming soon</li>
                <li>Stale communication — coming soon</li>
                <li>Enrollment blocker — coming soon</li>
            </ul>
            <BosDrawerAssistCta
                entityId={assistEntityId}
                overviewData={overviewData}
                opportunitySingular="Child"
            />
        </aside>
    );
}
