"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { MessageSquare } from "lucide-react";

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

export default function InboxNavLink({
    active,
    tabStyle,
    buttonClassName,
    onOpenModal,
}: {
    active: boolean;
    tabStyle: (active: boolean) => CSSProperties;
    buttonClassName?: string;
    onOpenModal: () => void;
}) {
    const [unread, setUnread] = useState<number | null>(() => readInboxUnreadCountCache());

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

    const badge = unread ?? 0;
    const title =
        badge > 0 ? `Inbox — ${badge} unread message${badge === 1 ? "" : "s"}` : "Inbox — conversations";

    return (
        <button
            type="button"
            onClick={onOpenModal}
            className={buttonClassName ?? "inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-[15px] font-medium leading-none"}
            style={tabStyle(active)}
            title={title}
            data-adminv2-inbox-nav="true"
        >
            <MessageSquare className="h-[18px] w-[18px] shrink-0 opacity-90" aria-hidden strokeWidth={2} />
            <span className="hidden lg:inline">Inbox</span>
            {badge > 0 ? (
                <span
                    className="ml-0.5 inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-[#00A283]/95 px-1 text-[9px] font-bold text-white"
                    data-adminv2-inbox-unread-badge="true"
                >
                    {badge > 99 ? "99+" : badge}
                </span>
            ) : null}
            <span className="sr-only">{badge > 0 ? `${badge} unread` : "Open inbox"}</span>
        </button>
    );
}
