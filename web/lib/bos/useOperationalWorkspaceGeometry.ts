"use client";

import { useEffect, useLayoutEffect } from "react";

import { BOS_ACTION_WORKSPACE_OPEN_ATTR } from "@/lib/bos/bosRailPresentationFlags";
import {
    clearOperationalWorkspaceGeometryVars,
    measureAndApplyOperationalWorkspaceGeometry,
} from "@/lib/bos/operationalWorkspaceGeometry";

/**
 * Shared consumption point for Operational Workspace Geometry.
 *
 * Any Operational Workspace surface (current or future) opts into the platform geometry by
 * rendering with the operational marker class/attribute and calling this hook with its open
 * state. The hook measures the live workspace band on open and re-measures on the inputs
 * that change it: viewport resize, sidebar/BOS-rail resize, and BOS action-workspace flag
 * toggles. No feature-specific logic lives here — it is purely the geometry lifecycle.
 *
 * It never touches entity drawer, Focus Panel, queue, split-runtime, or BOS-rail anchoring
 * geometry; it only publishes the operational band CSS variables.
 */
export function useOperationalWorkspaceGeometry(enabled: boolean): void {
    useLayoutEffect(() => {
        if (!enabled) return;
        measureAndApplyOperationalWorkspaceGeometry();
        const raf = requestAnimationFrame(() => measureAndApplyOperationalWorkspaceGeometry());
        return () => {
            cancelAnimationFrame(raf);
            clearOperationalWorkspaceGeometryVars();
        };
    }, [enabled]);

    useEffect(() => {
        if (!enabled || typeof window === "undefined") return;

        const remeasure = () => measureAndApplyOperationalWorkspaceGeometry();

        window.addEventListener("resize", remeasure);

        const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(remeasure) : null;
        const sidebar = document.querySelector("[data-adminv2-sidebar='true']");
        const bos = document.querySelector("[data-adminv2-bos-rail-overlay='true']");
        if (sidebar && ro) ro.observe(sidebar);
        if (bos && ro) ro.observe(bos);

        const root = document.documentElement;
        const mo = new MutationObserver(remeasure);
        mo.observe(root, { attributes: true, attributeFilter: [BOS_ACTION_WORKSPACE_OPEN_ATTR] });

        return () => {
            window.removeEventListener("resize", remeasure);
            ro?.disconnect();
            mo.disconnect();
        };
    }, [enabled]);
}
