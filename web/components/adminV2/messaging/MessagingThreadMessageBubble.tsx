"use client";

import { memo } from "react";
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

/**
 * Field-level equality so the memo is effective even when callers pass a freshly
 * built `message` object each render (e.g. the drawer constructs it inline in `.map`).
 * Covers the full {@link InboxThreadMessageRow} surface + `compact`, so no output-affecting
 * prop change is ever skipped.
 */
function messageBubblePropsAreEqual(
    prev: MessagingThreadMessageBubbleProps,
    next: MessagingThreadMessageBubbleProps,
): boolean {
    if (prev.compact !== next.compact) return false;
    const a = prev.message;
    const b = next.message;
    return (
        a.id === b.id &&
        a.direction === b.direction &&
        a.channel === b.channel &&
        a.body === b.body &&
        a.created_at === b.created_at
    );
}

function MessagingThreadMessageBubble({ message, compact = false }: MessagingThreadMessageBubbleProps) {
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

export default memo(MessagingThreadMessageBubble, messageBubblePropsAreEqual);
