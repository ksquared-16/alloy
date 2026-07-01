import type { KeyboardEvent, MouseEvent } from "react";

/** Stop canvas/card keyboard shortcuts from swallowing Space, Backspace, arrows, etc. */
export function stopLayoutBuilderEditableInputKeyDown(event: KeyboardEvent): void {
    event.stopPropagation();
}

export function stopLayoutBuilderEditableInputClick(event: MouseEvent): void {
    event.stopPropagation();
}

export const layoutBuilderEditableInputProps = {
    onClick: stopLayoutBuilderEditableInputClick,
    onKeyDown: stopLayoutBuilderEditableInputKeyDown,
} as const;

/** Skip card shell keyboard activation when focus is inside an editable control. */
export function isLayoutBuilderEditableKeyboardTarget(target: EventTarget | null): boolean {
    if (!target || !(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    return target.isContentEditable;
}
