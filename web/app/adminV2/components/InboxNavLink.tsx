"use client";

import { MessageSquare } from "lucide-react";
import type { CSSProperties } from "react";

import { useInboxUnreadNavCount } from "@/lib/adminV2/useInboxUnreadNavCount";

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
    const { unread } = useInboxUnreadNavCount();
    const badge = unread;
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
