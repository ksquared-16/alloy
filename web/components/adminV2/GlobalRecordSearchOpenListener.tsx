"use client";

import { useEffect } from "react";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import {
    ADMINV2_GLOBAL_SEARCH_OPEN_RECORD_EVENT,
    clearGlobalRecordSearchOpenIntent,
    readGlobalRecordSearchOpenIntent,
    type GlobalRecordSearchOpenDetail,
} from "@/lib/adminV2/globalRecordSearchOpen";

/** Opens entity drawer from global search without coupling TopNavBar to AdminDrawerProvider. */
export default function GlobalRecordSearchOpenListener() {
    const { openDrawer } = useAdminDrawer();

    useEffect(() => {
        const pending = readGlobalRecordSearchOpenIntent();
        if (pending) {
            clearGlobalRecordSearchOpenIntent();
            openDrawer({ type: pending.entity_type, id: pending.entity_id, source: "global_search" });
        }
    }, [openDrawer]);

    useEffect(() => {
        const onOpen = (ev: Event) => {
            const detail = (ev as CustomEvent<GlobalRecordSearchOpenDetail>).detail;
            const id = detail?.entity_id?.trim();
            const type = detail?.entity_type;
            if (!id || !type) return;
            openDrawer({ type, id, source: "global_search" });
        };
        window.addEventListener(ADMINV2_GLOBAL_SEARCH_OPEN_RECORD_EVENT, onOpen);
        return () => window.removeEventListener(ADMINV2_GLOBAL_SEARCH_OPEN_RECORD_EVENT, onOpen);
    }, [openDrawer]);

    return null;
}
