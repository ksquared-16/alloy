"use client";

import { memo, useLayoutEffect } from "react";
import { scheduleOpportunityDrawerTabPrefetch } from "@/lib/admin/opportunityDrawerTabPrefetch";

type Props = {
    drawerId: string;
};

/** Warms documents + activity after drawer target is known (notes ship on VM record). */
function OpportunityDrawerTabBackgroundLoader({ drawerId }: Props) {
    useLayoutEffect(() => {
        const id = drawerId.trim();
        if (!id) return;
        scheduleOpportunityDrawerTabPrefetch(id);
    }, [drawerId]);

    return (
        <div className="hidden" aria-hidden data-opportunity-drawer-tab-background-loader="true" />
    );
}

export default memo(OpportunityDrawerTabBackgroundLoader);
