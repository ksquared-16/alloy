/** Targets that must not dismiss an open Admin V2 entity drawer on outside mousedown. */
export const ADMINV2_DRAWER_OUTSIDE_CLICK_IGNORE_SELECTORS = [
    '[data-adminv2-drawer="true"]',
    "[data-adminv2-ai-command-bar]",
    "[data-adminv2-ai-command-surface]",
] as const;

/**
 * Returns true when a mousedown target is outside the drawer panel and outside the bottom command bar.
 */
export function shouldCloseAdminV2DrawerOnOutsideTarget(target: EventTarget | null): boolean {
    if (target == null || typeof target !== "object") return false;
    const el = target as { closest?: (selector: string) => Element | null };
    if (typeof el.closest !== "function") return false;
    for (const selector of ADMINV2_DRAWER_OUTSIDE_CLICK_IGNORE_SELECTORS) {
        if (el.closest(selector)) return false;
    }
    return true;
}
