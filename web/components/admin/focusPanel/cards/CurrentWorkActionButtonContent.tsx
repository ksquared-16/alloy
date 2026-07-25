"use client";

import type { CurrentWorkActionVM } from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkSurfaceTypes";
import { resolveCurrentWorkActionIcon } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolveCurrentWorkActionIcon";

type Props = {
    action: Pick<CurrentWorkActionVM, "key" | "label" | "icon" | "handlerKey" | "actionRef">;
};

/**
 * Label + optional Lucide icon for What's Next action buttons (never icon-only).
 */
export default function CurrentWorkActionButtonContent({ action }: Props) {
    const Icon = resolveCurrentWorkActionIcon(action);
    return (
        <>
            {Icon ?
                <Icon className="alloy-os-currentwork__action-icon" size={14} strokeWidth={2} aria-hidden />
            :   null}
            <span className="alloy-os-currentwork__action-label">{action.label}</span>
        </>
    );
}
