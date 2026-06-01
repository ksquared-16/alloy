"use client";

import { useLayoutEffect, useRef } from "react";

import MessagingThreadMessageBubble from "@/components/adminV2/messaging/MessagingThreadMessageBubble";
import type { InboxThreadMessagesCacheEntry } from "@/lib/adminV2/messaging/inboxThreadMessagesCache";

function InboxThreadMessageSkeleton({ rows = 4 }: { rows?: number }) {
    return (
        <div className="space-y-3 py-1" aria-hidden data-adminv2-inbox-thread-skeleton="true">
            {Array.from({ length: rows }, (_, i) => (
                <div key={i} className={`flex ${i % 2 === 0 ? "justify-start" : "justify-end"}`}>
                    <div
                        className={`animate-pulse rounded-xl bg-alloy-stone/12 ${
                            i % 2 === 0 ? "h-14 w-[72%]" : "h-12 w-[58%]"
                        }`}
                    />
                </div>
            ))}
        </div>
    );
}

type InboxThreadMessageHistoryProps = {
    threadId: string;
    cacheEntry: InboxThreadMessagesCacheEntry | undefined;
    scrollToLatestKey?: string | number;
};

export default function InboxThreadMessageHistory({
    threadId,
    cacheEntry,
    scrollToLatestKey,
}: InboxThreadMessageHistoryProps) {
    const latestRef = useRef<HTMLDivElement | null>(null);

    useLayoutEffect(() => {
        if (!cacheEntry || cacheEntry.loading || cacheEntry.messages.length === 0) return;
        latestRef.current?.scrollIntoView({ block: "end", behavior: "auto" });
    }, [threadId, scrollToLatestKey, cacheEntry?.loading, cacheEntry?.messages.length, cacheEntry?.fetchedAt]);

    if (!cacheEntry || cacheEntry.loading) {
        return <InboxThreadMessageSkeleton />;
    }

    if (cacheEntry.error) {
        return (
            <p className="text-[11px] text-red-700/90" data-adminv2-inbox-thread-messages-error="true">
                {cacheEntry.error}
            </p>
        );
    }

    if (cacheEntry.messages.length === 0) {
        return (
            <p className="text-[11px] text-alloy-midnight/50" data-adminv2-inbox-thread-messages-empty="true">
                No messages in this thread yet.
            </p>
        );
    }

    return (
        <div
            className="flex flex-col gap-2.5"
            data-adminv2-inbox-thread-messages="true"
            data-thread-id={threadId}
            data-adminv2-inbox-thread-scroll-latest="true"
        >
            {cacheEntry.messages.map((m) => (
                <MessagingThreadMessageBubble key={m.id} message={m} />
            ))}
            <div ref={latestRef} aria-hidden className="h-px w-full shrink-0" />
        </div>
    );
}
