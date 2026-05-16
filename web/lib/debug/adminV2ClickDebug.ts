/**
 * Dev-only click diagnostics for AdminV2 navigation regressions.
 * Enable in the browser console: localStorage.setItem("alloy_click_debug", "1")
 * Disable: localStorage.removeItem("alloy_click_debug")
 */

export const ADMINV2_CLICK_DEBUG_STORAGE_KEY = "alloy_click_debug";

export function isAdminV2ClickDebugEnabled(): boolean {
    if (typeof window === "undefined") return false;
    try {
        return window.localStorage.getItem(ADMINV2_CLICK_DEBUG_STORAGE_KEY) === "1";
    } catch {
        return false;
    }
}

export type AdminV2ClickDebugDrawerState = {
    open: boolean;
    type: string | null;
    id: string | null;
};

export type AdminV2ClickDebugContext = {
    getDrawerState?: () => AdminV2ClickDebugDrawerState;
};

function classifyClickSurface(el: Element | null): string {
    if (!el) return "unknown";
    if (el.closest(".adminv2-drawer-sidebar-dim")) return "drawer_dim";
    if (el.closest(".adminv2-drawer-sidebar-panel")) return "drawer_panel";
    if (el.closest("aside")) return "shell_sidebar";
    if (el.closest("header")) return "shell_header";
    if (el.closest(".adminv2-ws-wu-queue-card")) return "dept_or_queue_card";
    if (el.closest(".adminv2-ws-wu-queue-list")) return "work_unit_queue_row";
    if (el.closest(".adminv2-ws-queue-pill-scroll button")) return "work_unit_queue_tab";
    if (el.closest("[data-adminv2-drawer]")) return "drawer";
    return "workspace_other";
}

function hrefFromAnchor(anchor: HTMLAnchorElement | null): string | null {
    if (!anchor) return null;
    const h = anchor.getAttribute("href");
    return h && h.trim() ? h.trim() : null;
}

/**
 * Capture-phase listener — logs before most bubble handlers run.
 * Returns uninstall function.
 */
export function installAdminV2ClickDebug(ctx: AdminV2ClickDebugContext = {}): () => void {
    if (typeof window === "undefined" || !isAdminV2ClickDebugEnabled()) {
        return () => {};
    }

    const handler = (event: Event) => {
        if (event.type !== "click") return;
        const e = event as MouseEvent;
        const target = (e.target instanceof Element ? e.target : null) ?? null;
        const anchor =
            target?.closest("a[href]") instanceof HTMLAnchorElement
                ? (target.closest("a[href]") as HTMLAnchorElement)
                : null;
        const drawer = ctx.getDrawerState?.();
        const phase =
            event.eventPhase === Event.CAPTURING_PHASE
                ? "capture"
                : event.eventPhase === Event.AT_TARGET
                  ? "at_target"
                  : event.eventPhase === Event.BUBBLING_PHASE
                    ? "bubble"
                    : "unknown";

        console.info("[alloy_click_debug]", {
            tag: target?.tagName?.toLowerCase() ?? null,
            surface: classifyClickSurface(target),
            href: hrefFromAnchor(anchor),
            pathname: window.location.pathname,
            search: window.location.search,
            defaultPrevented: e.defaultPrevented,
            phase,
            propagationStopped: e.cancelBubble,
            drawerOpen: drawer?.open ?? null,
            drawerType: drawer?.type ?? null,
            drawerId: drawer?.id ?? null,
        });
    };

    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
}
