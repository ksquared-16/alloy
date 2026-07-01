"use client";

import type { QueueNavigatorPosition } from "@/lib/admin/opportunityDrawerQueueNavigator";

type Props = {
    position: QueueNavigatorPosition;
    disabled?: boolean;
    pending?: boolean;
    onPrev: () => void;
    onNext: () => void;
};

/**
 * Compact prev/next for pipeline opportunity drawers — fixed width to avoid header layout shift.
 */
export default function OpportunityDrawerQueueNavigatorControls({
    position,
    disabled,
    pending,
    onPrev,
    onNext,
}: Props) {
    const atFirst = !position.has_prev;
    const atLast = !position.has_next;
    const label =
        position.total > 0 ? `${position.position} of ${position.total}` : null;

    return (
        <div
            className="flex shrink-0 items-center gap-1"
            data-opportunity-drawer-queue-nav="true"
            aria-label="Queue record navigation"
        >
            <button
                type="button"
                aria-label="Previous record in queue"
                disabled={disabled || pending || atFirst}
                onClick={onPrev}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-alloy-stone/50 text-sm text-alloy-midnight/85 hover:bg-alloy-stone/25 disabled:cursor-not-allowed disabled:opacity-40"
            >
                ‹
            </button>
            {label ? (
                <span
                    className="min-w-[3.25rem] text-center text-[11px] tabular-nums text-alloy-midnight/65"
                    data-opportunity-drawer-queue-position="true"
                >
                    {label}
                </span>
            ) : null}
            <button
                type="button"
                aria-label="Next record in queue"
                disabled={disabled || pending || atLast}
                onClick={onNext}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-alloy-stone/50 text-sm text-alloy-midnight/85 hover:bg-alloy-stone/25 disabled:cursor-not-allowed disabled:opacity-40"
            >
                ›
            </button>
        </div>
    );
}
