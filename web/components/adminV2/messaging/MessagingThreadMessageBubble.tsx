"use client";

import { formatMessagingDateTimeLocal } from "@/lib/adminV2/messaging/messagingLocalDateTime";
import {
    messagingMessageBubbleBodyClass,
    messagingMessageBubbleMetaClass,
    messagingMessageBubbleShellClass,
} from "@/lib/adminV2/messaging/messagingMessageBubbleClasses";
import type { InboxThreadMessageRow } from "@/lib/adminV2/messaging/inboxThreadMessagesCache";

type MessagingThreadMessageBubbleProps = {
    message: InboxThreadMessageRow;
    compact?: boolean;
};

export default function MessagingThreadMessageBubble({ message, compact = false }: MessagingThreadMessageBubbleProps) {
    const inbound = (message.direction ?? "").toLowerCase() === "inbound";
    const when = message.created_at ? formatMessagingDateTimeLocal(message.created_at) : "";
    const ch = (message.channel ?? "").toUpperCase();
    const pad = compact ? "px-2.5 py-2 text-[11px]" : "px-3.5 py-3 text-[13px]";

    return (
        <div className={`flex w-full ${inbound ? "justify-start" : "justify-end"}`}>
            <div
                className={`max-w-[min(100%,92%)] rounded-xl border leading-snug shadow-sm ${pad} ${messagingMessageBubbleShellClass(inbound)}`}
            >
                <div
                    className={`mb-1 flex flex-wrap items-center gap-x-1 text-[9px] font-semibold uppercase tracking-wide ${messagingMessageBubbleMetaClass(inbound)}`}
                >
                    <span>{ch || "MSG"}</span>
                    {when ? (
                        <>
                            <span className="opacity-50">·</span>
                            <span className="font-normal normal-case">{when}</span>
                        </>
                    ) : null}
                </div>
                <p className={`whitespace-pre-wrap break-words ${messagingMessageBubbleBodyClass(inbound)}`}>
                    {message.body?.trim() ? message.body : "—"}
                </p>
            </div>
        </div>
    );
}
