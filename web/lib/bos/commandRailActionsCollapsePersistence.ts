const ACTIONS_EXPANDED_KEY = "alloy-adminv2-command-rail-actions-expanded";

export function loadCommandRailActionsExpanded(): boolean {
    if (typeof window === "undefined") return false;
    try {
        return sessionStorage.getItem(ACTIONS_EXPANDED_KEY) === "true";
    } catch {
        return false;
    }
}

export function persistCommandRailActionsExpanded(expanded: boolean): void {
    if (typeof window === "undefined") return;
    try {
        sessionStorage.setItem(ACTIONS_EXPANDED_KEY, expanded ? "true" : "false");
    } catch {
        /* ignore */
    }
}
