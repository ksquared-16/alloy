import type { CSSProperties } from "react";

/** Bottom breathing room — browser edge, dock, and safe area. */
export const BOS_RAIL_OVERLAY_BOTTOM_INSET = "max(32px, env(safe-area-inset-bottom, 0px))";

export function isWorkspaceCommandRailBosHost(el: HTMLElement | null): boolean {
    return Boolean(el?.closest("[data-adminv2-workspace-command-column]"));
}

export function measureBosRailOverlayAnchorStyle(anchorEl: HTMLElement): CSSProperties {
    const rect = anchorEl.getBoundingClientRect();
    const right = Math.max(0, Math.round(window.innerWidth - rect.right));
    const top = Math.max(0, Math.round(rect.top));
    const width = Math.max(0, Math.round(rect.width));

    return {
        position: "fixed",
        top,
        right,
        width,
        maxWidth: width,
        bottom: BOS_RAIL_OVERLAY_BOTTOM_INSET,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        visibility: width > 0 ? "visible" : "hidden",
    };
}
