"use client";

import type { FocusEventHandler, MouseEventHandler } from "react";

import {
    relatedRecordDrawerA11yCopy,
    relatedRecordDrawerDefaultTestId,
    resolveRelatedRecordDrawerIcon,
    type RelatedRecordDrawerKind,
} from "@/lib/admin/drawer/relatedRecordDrawerIconKinds";

export type RelatedRecordDrawerIconButtonProps = {
    /** Drawer target id — person id, child person id, or other record id. */
    personId: string;
    displayName: string;
    onClick: MouseEventHandler<HTMLButtonElement>;
    onMouseEnter?: () => void;
    onFocus?: FocusEventHandler<HTMLButtonElement>;
    onPointerDown?: MouseEventHandler<HTMLButtonElement>;
    recordKind?: RelatedRecordDrawerKind;
    testId?: string;
    className?: string;
    extraAttrs?: Record<string, string>;
};

const ICON_BUTTON_CLASS =
    "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-alloy-stone/25 text-alloy-blue hover:border-alloy-blue/35 hover:bg-alloy-blue/5";

/** Compact related-record drawer affordance — distinct glyph per record kind, shared chrome. */
export default function RelatedRecordDrawerIconButton({
    personId,
    displayName,
    onClick,
    onMouseEnter,
    onFocus,
    onPointerDown,
    recordKind = "person",
    testId,
    className = "",
    extraAttrs,
}: RelatedRecordDrawerIconButtonProps) {
    const pid = personId.trim();
    if (!pid) return null;

    const Icon = resolveRelatedRecordDrawerIcon(recordKind);
    const { title, ariaLabel } = relatedRecordDrawerA11yCopy(recordKind, displayName);
    const resolvedTestId = testId ?? relatedRecordDrawerDefaultTestId(recordKind);

    return (
        <button
            type="button"
            title={title}
            aria-label={ariaLabel}
            data-testid={resolvedTestId}
            data-view-person-target-id={pid}
            data-view-person-record-kind={recordKind}
            data-related-record-drawer-icon-kind={recordKind}
            onMouseEnter={onMouseEnter}
            onFocus={onFocus}
            onPointerDown={onPointerDown}
            onClick={onClick}
            {...extraAttrs}
            className={[ICON_BUTTON_CLASS, className].filter(Boolean).join(" ")}
        >
            <Icon className="h-3 w-3" aria-hidden data-related-record-drawer-icon-glyph="true" />
        </button>
    );
}
