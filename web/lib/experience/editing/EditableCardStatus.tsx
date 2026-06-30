"use client";

import { editableCardStatusLabel, type EditableCardState } from "./editableCardRuntime";

/**
 * The single shared acknowledgement element for editable cards — `Saving…` / `Saved` /
 * `Unsaved changes` / a legible error. Every editable card renders this instead of a bespoke
 * flash, so acknowledgement is identical everywhere (Interaction Runtime owns the vocabulary;
 * Card Runtime owns the state it reads).
 */
export function EditableCardStatus({
    state,
    className = "text-[10px] text-alloy-midnight/50",
}: {
    state: EditableCardState;
    className?: string;
}) {
    const label = editableCardStatusLabel(state);
    if (!label) return null;
    const text =
        label === "error"
            ? state.error ?? "Save failed"
            : label === "saving"
              ? "Saving…"
              : label === "saved"
                ? "Saved"
                : "Unsaved changes";
    return (
        <p
            className={className}
            data-editable-card-status={label}
            aria-live="polite"
            role={label === "error" ? "alert" : undefined}
        >
            {text}
        </p>
    );
}
