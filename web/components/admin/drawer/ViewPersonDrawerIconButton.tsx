"use client";

import { User } from "lucide-react";
import type { MouseEventHandler } from "react";

type Props = {
    personId: string;
    displayName: string;
    onClick: MouseEventHandler<HTMLButtonElement>;
    onMouseEnter?: () => void;
    onPointerDown?: () => void;
    testId?: string;
    className?: string;
    extraAttrs?: Record<string, string>;
};

/** Compact person icon — opens person drawer (matches inquiry Children section). */
export default function ViewPersonDrawerIconButton({
    personId,
    displayName,
    onClick,
    onMouseEnter,
    onPointerDown,
    testId = "view-person-drawer-open",
    className = "",
    extraAttrs,
}: Props) {
    const pid = personId.trim();
    if (!pid) return null;

    return (
        <button
            type="button"
            title="View person"
            aria-label={`View person for ${displayName}`}
            data-testid={testId}
            data-view-person-target-id={pid}
            onMouseEnter={onMouseEnter}
            onPointerDown={onPointerDown}
            onClick={onClick}
            {...extraAttrs}
            className={[
                "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-alloy-stone/25 text-alloy-blue hover:border-alloy-blue/35 hover:bg-alloy-blue/5",
                className,
            ]
                .filter(Boolean)
                .join(" ")}
        >
            <User className="h-3 w-3" aria-hidden />
        </button>
    );
}
