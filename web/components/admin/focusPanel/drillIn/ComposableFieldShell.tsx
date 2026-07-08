"use client";

import { GripVertical } from "lucide-react";
import type { ReactNode } from "react";

import { useFocusPanelComposer } from "@/lib/adminV2/settings/surfaces/focusPanelComposerContext";

type Props = {
    surfaceId: string;
    groupKey: string;
    fieldKey: string;
    children: ReactNode;
    className?: string;
};

/** Wraps one runtime field value with subtle composer selection + drag handle. */
export default function ComposableFieldShell({
    surfaceId,
    groupKey,
    fieldKey,
    children,
    className = "",
}: Props) {
    const composer = useFocusPanelComposer();
    const composing = composer?.isComposingSurface(surfaceId) ?? false;
    const selected =
        composer?.selection?.kind === "field" &&
        composer.selection.surfaceId === surfaceId &&
        composer.selection.groupKey === groupKey &&
        composer.selection.fieldKey === fieldKey;

    if (!composing) {
        return <span className={className}>{children}</span>;
    }

    return (
        <span
            className={["fp-composable-field", selected ? "is-selected" : "", className].filter(Boolean).join(" ")}
            data-canvas-field={fieldKey}
            data-canvas-field-selected={selected ? "true" : undefined}
            onClick={(e) => {
                e.stopPropagation();
                composer?.select({ kind: "field", surfaceId, groupKey, fieldKey });
            }}
        >
            <GripVertical className="fp-composable-field__grip h-3 w-3" aria-hidden />
            {children}
        </span>
    );
}
