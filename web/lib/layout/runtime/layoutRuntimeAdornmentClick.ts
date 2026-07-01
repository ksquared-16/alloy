/** True when event target is inside a layout-runtime adornment link button. */
export function isLayoutRuntimeAdornmentLinkTarget(target: EventTarget | null): boolean {
    return target instanceof Element && Boolean(target.closest('[data-layout-runtime-adornment-link="true"]'));
}

/** Queue row controls that must not trigger row-level record open. */
export function isQueueRowInteractiveControlTarget(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false;
    return Boolean(
        target.closest('[data-layout-runtime-adornment-link="true"]') ||
            target.closest('[data-layout-runtime-person-link="true"]') ||
            target.closest('[data-layout-runtime-child-link="true"]') ||
            target.closest('[data-queue-row-interactive="true"]') ||
            target.closest('[data-queue-row-actions-menu="true"]') ||
            target.closest('[data-queue-row-action-rail="true"]') ||
            target.closest('[data-queue-row-bos-button="true"]') ||
            target.closest('[data-queue-row-actions-dropdown="true"]') ||
            target.closest(".operational-queue-row__collapse-toggle") ||
            target.closest(".operational-queue-row__chip--clickable") ||
            target.closest(".operational-queue-row__child-link--clickable") ||
            target.closest(".operational-queue-row__household-link") ||
            target.closest(".operational-queue-row__contact-link") ||
            target.closest(".operational-queue-row__link-icon-btn") ||
            target.closest(".operational-queue-row__linked-field") ||
            target.closest(".operational-queue-row__fixed-controls") ||
            target.closest("[data-queue-row-link=\"true\"]") ||
            target.closest("[data-layout-runtime-tasks-widget=\"true\"]") ||
            target.closest("[data-layout-runtime-task-chip=\"true\"]"),
    );
}

/** True when click is on the identity/title open zone (primary record open). */
export function isQueueRowIdentityOpenTarget(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest('[data-queue-row-identity-open="true"]'));
}
