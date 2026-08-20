"use client";

import { useEffect, useLayoutEffect } from "react";

import { createOperationalGeometryScheduler } from "@/lib/bos/operationalGeometryScheduler";

import { BOS_ACTION_WORKSPACE_OPEN_ATTR } from "@/lib/bos/bosRailPresentationFlags";
import { BOS_PRESENTATION_ATTR } from "@/lib/bos/bosPresentationState";
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
 * that change it: viewport resize, sidebar/BOS-rail resize, and BOS presentation state
 * (pinned reserves width; floating/closed expand full band).
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

        // One measurement per frame, and none in response to our own write. See the header.
        const scheduler = createOperationalGeometryScheduler(() =>
            measureAndApplyOperationalWorkspaceGeometry()
        );
        const remeasure = scheduler.request;

        window.addEventListener("resize", remeasure);

        const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(remeasure) : null;
        const sidebar = document.querySelector("[data-adminv2-sidebar='true']");
        const bos = document.querySelector("[data-adminv2-bos-rail-overlay='true']");
        const column = document.querySelector("[data-adminv2-workspace-command-column]");
        if (sidebar && ro) ro.observe(sidebar);
        if (bos && ro) ro.observe(bos);
        if (column && ro) ro.observe(column);

        const root = document.documentElement;
        const mo = new MutationObserver(remeasure);
        mo.observe(root, {
            attributes: true,
            attributeFilter: [BOS_ACTION_WORKSPACE_OPEN_ATTR, BOS_PRESENTATION_ATTR],
        });
        const ambient = document.querySelector("[data-adminv2-workspace-ambient-root]");
        if (ambient) {
            mo.observe(ambient, { attributes: true, attributeFilter: [BOS_PRESENTATION_ATTR] });
        }

        return () => {
            window.removeEventListener("resize", remeasure);
            ro?.disconnect();
            mo.disconnect();
            scheduler.cancel();
        };
    }, [enabled]);
}
