import type { MouseEvent, PointerEvent } from "react";

export type LayoutRuntimeIsolatableClickEvent = Pick<
    MouseEvent,
    "preventDefault" | "stopPropagation"
>;

/** Stop a linked control click from bubbling to queue row / card open handlers. */
export function isolateLayoutRuntimeLinkClick(
    event: LayoutRuntimeIsolatableClickEvent | MouseEvent | PointerEvent,
): void {
    event.preventDefault();
    event.stopPropagation();
}
