"use client";

import { useCallback, useEffect, useState } from "react";

import {
    INBOX_UNREAD_REFRESH_EVENT,
    readInboxUnreadCountCache,
    writeInboxUnreadCountCache,
} from "@/lib/adminV2/inboxNavUnreadCache";
import { runWhenAdminV2PrimarySurfaceReady } from "@/lib/workspace/adminV2DeferBackgroundWork";
import { isAdminV2SidecarNetworkBlocked } from "@/lib/perf/adminV2PrimarySurfaceGate";

async function fetchInboxUnreadCount(): Promise<number | null> {
    const res = await fetch("/api/admin/communications/unread-count", { credentials: "include" });
    const json = (await res.json().catch(() => ({}))) as { unread_count?: number; error?: string };
    if (!res.ok || typeof json.unread_count !== "number") return null;
    return json.unread_count;
}

export function useInboxUnreadNavCount() {
    const [unread, setUnread] = useState<number | null>(null);

    const load = useCallback(async () => {
        if (isAdminV2SidecarNetworkBlocked()) return;
        try {
            const count = await fetchInboxUnreadCount();
            if (count != null) {
                setUnread(count);
                writeInboxUnreadCountCache(count);
            }
        } catch {
            /* non-fatal */
        }
    }, []);

    useEffect(() => {
        const cached = readInboxUnreadCountCache();
        if (cached != null) setUnread(cached);
        const cancelDefer = runWhenAdminV2PrimarySurfaceReady(() => load(), "inbox_unread_nav");
        const intervalId = window.setInterval(() => {
            if (!isAdminV2SidecarNetworkBlocked()) void load();
        }, 120_000);
        const onRefresh = () => void load();
        window.addEventListener(INBOX_UNREAD_REFRESH_EVENT, onRefresh);
        return () => {
            cancelDefer();
            window.clearInterval(intervalId);
            window.removeEventListener(INBOX_UNREAD_REFRESH_EVENT, onRefresh);
        };
    }, [load]);

    return { unread: unread ?? 0, reload: load };
}
