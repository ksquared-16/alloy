"use client";

import { useEffect } from "react";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import {
    ADMINV2_OPEN_OPPORTUNITY_FROM_CONTEXT_EVENT,
    type OpenOpportunityFromContextDetail,
} from "@/lib/adminV2/contextualRecordOpen";

/** Opens opportunity drawer from contextual surfaces without record search. */
export default function ContextualRecordOpenListener() {
    const { openDrawer } = useAdminDrawer();

    useEffect(() => {
        const onOpen = (ev: Event) => {
            const detail = (ev as CustomEvent<OpenOpportunityFromContextDetail>).detail;
            const id = detail?.opportunity_id?.trim();
            if (!id) return;
            openDrawer({ type: "opportunities", id });
        };
        window.addEventListener(ADMINV2_OPEN_OPPORTUNITY_FROM_CONTEXT_EVENT, onOpen);
        return () => window.removeEventListener(ADMINV2_OPEN_OPPORTUNITY_FROM_CONTEXT_EVENT, onOpen);
    }, [openDrawer]);

    return null;
}
