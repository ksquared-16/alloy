"use client";

import type { ReactNode } from "react";

import BosDrawerAssistCta from "@/components/admin/drawer/BosDrawerAssistCta";
import { DrawerHeaderAttentionBlock } from "@/components/admin/drawer/DrawerHeaderAttentionBlock";

type Props = {
    personId: string;
    overviewData: Record<string, unknown>;
    opportunitySingular?: string;
    /** Save / registry actions rendered on the top row beside Work with BOS. */
    actionsSlot?: ReactNode;
};

/** Person drawer title-rail — controls top-right; attention context below (full width, left-aligned). */
export function PersonDrawerHeaderControls({
    personId,
    overviewData,
    opportunitySingular = "Person",
    actionsSlot = null,
}: Props) {
    return (
        <div className="flex w-full min-w-0 max-w-full flex-col items-stretch gap-1" data-person-header-controls="true">
            <div
                className="flex shrink-0 flex-nowrap items-center justify-end gap-2 self-end"
                data-person-header-controls-row="actions"
            >
                <BosDrawerAssistCta
                    bare
                    entityId={personId}
                    overviewData={overviewData}
                    opportunitySingular={opportunitySingular}
                    inquiryWorkflow={false}
                />
                {actionsSlot}
            </div>
            <DrawerHeaderAttentionBlock overviewData={overviewData} />
        </div>
    );
}
