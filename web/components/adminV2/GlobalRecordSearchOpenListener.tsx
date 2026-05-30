"use client";

import { useEffect } from "react";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import {
    ADMINV2_GLOBAL_SEARCH_OPEN_RECORD_EVENT,
    clearGlobalRecordSearchOpenIntent,
    readGlobalRecordSearchOpenIntent,
    type GlobalRecordSearchOpenDetail,
} from "@/lib/adminV2/globalRecordSearchOpen";
import { isGlobalSearchLegacyDrawerEntityType } from "@/lib/admin/globalSearch/globalRecordSearchDrawerTarget";

/** Opens AdminV2 entity drawer from global search — blocks legacy member/contact drawers. */
export default function GlobalRecordSearchOpenListener() {
    const { openDrawer } = useAdminDrawer();

    useEffect(() => {
        const pending = readGlobalRecordSearchOpenIntent();
        if (pending) {
            clearGlobalRecordSearchOpenIntent();
            if (!isGlobalSearchLegacyDrawerEntityType(pending.open_entity_type)) {
                openDrawer({
                    type: pending.open_entity_type,
                    id: pending.open_entity_id,
                    source: "global_search",
                });
            }
        }
    }, [openDrawer]);

    useEffect(() => {
        const onOpen = (ev: Event) => {
            const detail = (ev as CustomEvent<GlobalRecordSearchOpenDetail>).detail;
            const id = detail?.open_entity_id?.trim();
            const type = detail?.open_entity_type;
            if (!id || !type || isGlobalSearchLegacyDrawerEntityType(type)) return;
            openDrawer({ type, id, source: "global_search" });
        };
        window.addEventListener(ADMINV2_GLOBAL_SEARCH_OPEN_RECORD_EVENT, onOpen);
        return () => window.removeEventListener(ADMINV2_GLOBAL_SEARCH_OPEN_RECORD_EVENT, onOpen);
    }, [openDrawer]);

    return null;
}
