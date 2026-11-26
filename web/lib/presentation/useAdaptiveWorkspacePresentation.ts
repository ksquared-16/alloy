"use client";

import { useLayoutEffect, useState, type RefObject } from "react";

import {
    BOS_RAIL_PANEL_ATTR,
    WORKSPACE_PRESENTATION_ATTR,
    deriveAdaptiveWorkspacePresentation,
    shouldPinBosCommandRail,
    type AdaptiveWorkspacePresentation,
} from "@/lib/presentation/adaptiveWorkspacePresentation";

/**
 * Observes the operational ambient root and publishes presentation state via
 * `data-workspace-presentation` for CSS + light behavioral consumers.
 */
export function useAdaptiveWorkspacePresentation(
    ambientRef: RefObject<HTMLElement | null>,
): AdaptiveWorkspacePresentation {
    const [presentation, setPresentation] = useState<AdaptiveWorkspacePresentation>("expanded");

    useLayoutEffect(() => {
        const el = ambientRef.current;
        if (!el) return;

        const publish = (next: AdaptiveWorkspacePresentation) => {
            setPresentation((prev) => (prev === next ? prev : next));
            el.setAttribute(WORKSPACE_PRESENTATION_ATTR, next);
            if (shouldPinBosCommandRail(next)) {
                el.removeAttribute(BOS_RAIL_PANEL_ATTR);
            }
        };

        const measure = () => {
            const width = el.getBoundingClientRect().width;
            publish(deriveAdaptiveWorkspacePresentation(width));
        };

        measure();

        const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
        ro?.observe(el);
        window.addEventListener("resize", measure);

        return () => {
            ro?.disconnect();
            window.removeEventListener("resize", measure);
        };
    }, [ambientRef]);

    return presentation;
}

export function toggleBosRailPanel(ambientEl: HTMLElement | null): void {
    if (!ambientEl) return;
    const presentation = ambientEl.getAttribute(WORKSPACE_PRESENTATION_ATTR);
    if (presentation === "expanded" || !presentation) return;
    const open = ambientEl.getAttribute(BOS_RAIL_PANEL_ATTR) === "open";
    if (open) ambientEl.removeAttribute(BOS_RAIL_PANEL_ATTR);
    else ambientEl.setAttribute(BOS_RAIL_PANEL_ATTR, "open");
}

export function closeBosRailPanel(ambientEl: HTMLElement | null): void {
    ambientEl?.removeAttribute(BOS_RAIL_PANEL_ATTR);
}
