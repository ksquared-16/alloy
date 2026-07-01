import type { CSSProperties } from "react";

import { BOS_OVERLAY_EFFECTIVE_WIDTH_CSS_VAR } from "@/lib/bos/drawerWorkspaceGeometry";

/** Bottom breathing room — browser edge, dock, and safe area. */
export const BOS_RAIL_OVERLAY_BOTTOM_INSET = "max(32px, env(safe-area-inset-bottom, 0px))";

export function isWorkspaceCommandRailBosHost(el: HTMLElement | null): boolean {
    return Boolean(el?.closest("[data-adminv2-workspace-command-column]"));
}

function readEffectiveBosOverlayWidthPx(): number | null {
    if (typeof document === "undefined") return null;
    const raw = document.documentElement.style.getPropertyValue(BOS_OVERLAY_EFFECTIVE_WIDTH_CSS_VAR).trim();
    const match = raw.match(/^(\d+(?:\.\d+)?)px$/);
    return match ? Math.round(Number(match[1])) : null;
}

export function measureBosRailOverlayAnchorStyle(anchorEl: HTMLElement): CSSProperties {
    const rect = anchorEl.getBoundingClientRect();
    const right = Math.max(0, Math.round(window.innerWidth - rect.right));
    const top = Math.max(0, Math.round(rect.top));
    const naturalWidth = Math.max(0, Math.round(rect.width));
    const effectiveCap = readEffectiveBosOverlayWidthPx();
    const width =
        effectiveCap != null ? Math.max(0, Math.min(naturalWidth, effectiveCap)) : naturalWidth;

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
