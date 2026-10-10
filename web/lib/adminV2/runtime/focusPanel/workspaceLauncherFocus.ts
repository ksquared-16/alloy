/**
 * E2E-11 — the Current Work workspace returns focus to what launched it.
 *
 * Owned by the workspace host (`OpportunityFocusPanelModeGrid`), which every launch and every close
 * passes through. The launcher is recorded with a selector from its own data attribute, because the
 * summary card re-renders its buttons while the workspace is open; a Manage item's menu is gone by
 * close, so it maps to the Manage trigger.
 */

export type WorkspaceLauncher = { node: HTMLElement | null; selector: string | null };

const MANAGE_TRIGGER = '[data-focus-panel-manage-trigger="true"]';
const MANAGE_MENU = "[data-record-drawer-manage-menu], [data-record-drawer-manage-menu-portal]";
const LAUNCHER_ATTRS = ["data-process-action", "data-children-action", "data-household-action", "data-work-action"] as const;

/** A stable address for a launcher that survives the summary card re-rendering it. */
export function workspaceLauncherSelector(node: HTMLElement): string | null {
    if (node.closest(MANAGE_MENU)) return MANAGE_TRIGGER;
    for (const attr of LAUNCHER_ATTRS) {
        const owner = node.closest(`[${attr}]`);
        const value = owner?.getAttribute(attr);
        if (value) return `[${attr}="${typeof CSS !== "undefined" && CSS.escape ? CSS.escape(value) : value}"]`;
    }
    return null;
}

/** Record the launcher as the workspace opens. `fromManage`: the intent was carried in from Manage. */
export function captureWorkspaceLauncher(doc: Document, fromManage: boolean): WorkspaceLauncher | null {
    const active = doc.activeElement;
    if (active instanceof HTMLElement && active !== doc.body) {
        return { node: active, selector: workspaceLauncherSelector(active) };
    }
    // Manage's menu can close before the workspace opens — the trigger is what launched it.
    return fromManage ? { node: null, selector: MANAGE_TRIGGER } : null;
}

/** Focus the launcher once the workspace has closed: the same node if it survived, else its address. */
export function restoreWorkspaceLauncher(doc: Document, launcher: WorkspaceLauncher | null): HTMLElement | null {
    if (!launcher) return null;
    const target =
        launcher.node?.isConnected && !launcher.node.closest(MANAGE_MENU) ?
            launcher.node
        : launcher.selector ? doc.querySelector<HTMLElement>(launcher.selector)
        : null;
    target?.focus();
    return target ?? null;
}
