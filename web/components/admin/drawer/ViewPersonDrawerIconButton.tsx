"use client";

import { User } from "lucide-react";
import type { MouseEventHandler } from "react";

type Props = {
    personId: string;
    displayName: string;
    onClick: MouseEventHandler<HTMLButtonElement>;
    onMouseEnter?: () => void;
    onPointerDown?: MouseEventHandler<HTMLButtonElement>;
    /** Person (guardian/contact) vs child lifecycle drawer target — same icon, distinct a11y copy. */
    recordKind?: "person" | "child";
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
    recordKind = "person",
    testId = "view-person-drawer-open",
    className = "",
    extraAttrs,
}: Props) {
    const pid = personId.trim();
    if (!pid) return null;

    const isChild = recordKind === "child";
    const title = isChild ? "View child" : "View person";
    const ariaLabel = isChild ? `View child ${displayName}` : `View person for ${displayName}`;

    return (
        <button
            type="button"
            title={title}
            aria-label={ariaLabel}
            data-testid={testId}
            data-view-person-target-id={pid}
            data-view-person-record-kind={recordKind}
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
