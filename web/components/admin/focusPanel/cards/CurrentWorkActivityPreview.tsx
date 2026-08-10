"use client";

import { useEffect, useRef } from "react";
import { Activity, Calendar, CheckSquare2, MessageSquare, StickyNote } from "lucide-react";

import ComposerFloatingPopover from "@/components/admin/focusPanel/drillIn/ComposerFloatingPopover";
import type { LeadActivityPreviewKind } from "@/lib/layout/runtime/resolveLeadActivityPreview";

export type CurrentWorkActivityPreviewItem = {
    label: string;
    detail?: string | null;
    category?: string | null;
    kind?: LeadActivityPreviewKind | null;
    occurredAt?: string | null;
};

type Props = {
    open: boolean;
    items: CurrentWorkActivityPreviewItem[];
    loading?: boolean;
    error?: string | null;
    onClose: () => void;
    onViewFullActivity?: () => void;
    triggerRef: React.RefObject<HTMLElement | null>;
};

function ActivityKindIcon({ kind }: { kind?: LeadActivityPreviewKind | null }) {
    switch (kind) {
        case "note":
            return <StickyNote className="h-3 w-3" aria-hidden />;
        case "communication":
            return <MessageSquare className="h-3 w-3" aria-hidden />;
        case "task":
            return <CheckSquare2 className="h-3 w-3" aria-hidden />;
        case "created":
        case "updated":
            return <Calendar className="h-3 w-3" aria-hidden />;
        default:
            return <Activity className="h-3 w-3" aria-hidden />;
    }
}

export function CurrentWorkActivityKindIcon({ kind }: { kind?: LeadActivityPreviewKind | null }) {
    return <ActivityKindIcon kind={kind} />;
}

export default function CurrentWorkActivityPreview({
    open,
    items,
    loading = false,
    error = null,
    onClose,
    onViewFullActivity,
    triggerRef,
}: Props) {
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                onClose();
                triggerRef.current?.focus();
            }
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [onClose, open, triggerRef]);

    if (!open) return null;

    return (
        <ComposerFloatingPopover open={open} anchorRef={triggerRef} onClose={onClose} className="alloy-os-currentwork__activity-preview-portal">
            <div
                ref={panelRef}
                className="alloy-os-currentwork__activity-preview"
                data-work-activity-preview="true"
                role="dialog"
                aria-label="Recent activity"
            >
                <div className="alloy-os-currentwork__activity-preview-header">
                    <p className="alloy-os-currentwork__activity-preview-title">Recent activity</p>
                    <button
                        type="button"
                        className="alloy-os-currentwork__activity-preview-close"
                        onClick={() => {
                            onClose();
                            triggerRef.current?.focus();
                        }}
                        aria-label="Close activity preview"
                    >
                        Close
                    </button>
                </div>

                {loading ?
                    <p className="alloy-os-currentwork__activity-preview-empty">Loading recent activity…</p>
                : error ?
                    <p className="alloy-os-currentwork__activity-preview-empty" data-work-activity-preview-error="true">
                        Recent activity could not be loaded.
                    </p>
                : items.length === 0 ?
                    <p className="alloy-os-currentwork__activity-preview-empty">No activity recorded yet.</p>
                :   <ul className="alloy-os-currentwork__activity-preview-list">
                        {items.map((item, index) => (
                            <li key={`${item.label}-${item.occurredAt ?? item.detail ?? index}`}>
                                <span className="alloy-os-currentwork__activity-preview-icon" aria-hidden>
                                    <ActivityKindIcon kind={item.kind} />
                                </span>
                                <span className="alloy-os-currentwork__activity-preview-body">
                                    {item.occurredAt ?
                                        <span className="alloy-os-currentwork__activity-preview-when">{item.occurredAt}</span>
                                    :   null}
                                    <span className="alloy-os-currentwork__activity-preview-label">{item.label}</span>
                                    {item.category ?
                                        <span className="alloy-os-currentwork__activity-preview-detail">{item.category}</span>
                                    : item.detail ?
                                        <span className="alloy-os-currentwork__activity-preview-detail">{item.detail}</span>
                                    :   null}
                                </span>
                            </li>
                        ))}
                    </ul>
                }

                {onViewFullActivity ?
                    <button
                        type="button"
                        className="alloy-os-currentwork__activity-preview-full-link"
                        onClick={onViewFullActivity}
                        data-work-action="view-full-activity"
                    >
                        View all activity →
                    </button>
                :   null}
            </div>
        </ComposerFloatingPopover>
    );
}
