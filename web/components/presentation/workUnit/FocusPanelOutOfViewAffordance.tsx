"use client";

/**
 * Explicit affordance when the Focus Panel record left the active Work View after a stage move.
 * Does not auto-navigate — operator chooses "Open in …".
 */

import { formatRecordMovedOutOfViewMessage } from "@/lib/lifecycle/operationalProjection";

export function FocusPanelOutOfViewAffordance(props: {
    destinationViewLabel?: string | null;
    onOpenDestination?: (() => void) | null;
}) {
    const copy = formatRecordMovedOutOfViewMessage({
        destinationViewLabel: props.destinationViewLabel,
    });

    return (
        <div
            data-focus-panel-out-of-view="true"
            className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-alloy-stone/12 bg-alloy-sand/40 px-4 py-2 text-sm text-alloy-ink"
            role="status"
        >
            <span>{copy.body}</span>
            {copy.cta && props.onOpenDestination ? (
                <button
                    type="button"
                    data-focus-panel-out-of-view-cta="true"
                    className="font-medium text-alloy-pine underline-offset-2 hover:underline"
                    onClick={props.onOpenDestination}
                >
                    {copy.cta}
                </button>
            ) : null}
        </div>
    );
}
