"use client";

import { useEffect, useState } from "react";

import {
    WORKSPACE_PRESENTATION_ATTR,
    adaptiveMetricDensity,
    type AdaptiveMetricDensity,
    type AdaptiveWorkspacePresentation,
} from "@/lib/presentation/adaptiveWorkspacePresentation";

function readPresentation(): AdaptiveWorkspacePresentation {
    if (typeof document === "undefined") return "expanded";
    const ambient = document.querySelector("[data-adminv2-workspace-ambient-root]");
    const raw = ambient?.getAttribute(WORKSPACE_PRESENTATION_ATTR);
    if (raw === "compact" || raw === "constrained" || raw === "expanded") return raw;
    return "expanded";
}

/** Subscribe to ambient Adaptive Workspace Presentation for light UI consumers. */
export function useAmbientWorkspacePresentation(): AdaptiveWorkspacePresentation {
    const [presentation, setPresentation] = useState<AdaptiveWorkspacePresentation>("expanded");

    useEffect(() => {
        const ambient = document.querySelector("[data-adminv2-workspace-ambient-root]");
        if (!ambient) return;

        const sync = () => setPresentation(readPresentation());
        sync();
        const mo = new MutationObserver(sync);
        mo.observe(ambient, { attributes: true, attributeFilter: [WORKSPACE_PRESENTATION_ATTR] });
        return () => mo.disconnect();
    }, []);

    return presentation;
}

export function useAdaptiveMetricDensity(): AdaptiveMetricDensity {
    return adaptiveMetricDensity(useAmbientWorkspacePresentation());
}
