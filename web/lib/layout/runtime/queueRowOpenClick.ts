import type { MouseEvent } from "react";

/** Targets that must not trigger opportunity row open. */
export function shouldIgnoreQueueRowOpenClick(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return true;
    return Boolean(
        target.closest('[data-queue-row-interactive="true"]')
        || target.closest('[data-layout-runtime-adornment-link="true"]')
        || target.closest(".queue-row-linked-field")
        || target.closest(".queue-record-field--link")
        || target.closest('[data-queue-tasks-widget="true"]')
        || target.closest('[data-queue-attention-widget="true"]')
        || target.closest(".queue-record-widget")
        || target.closest(".queue-record-widget--tasks")
        || target.closest(".queue-record-widget--attention")
        || target.closest('[data-layout-runtime-task-detail-popover="true"]')
        || target.closest('[data-queue-attention-detail-popover="true"]')
        || target.closest(".queue-record-field--tasks")
        || target.closest(".queue-record-field--attention")
        || target.closest(".operational-queue-row__collapse-toggle")
        || target.closest(".operational-queue-row__fixed-controls"),
    );
}

export function handleQueueRowContentOpenClick(event: MouseEvent, onOpen?: () => void): void {
    if (!onOpen || shouldIgnoreQueueRowOpenClick(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    onOpen();
}
