/**
 * Surfaces configuration — section labels only.
 * Workspace process entries are loaded from the lifecycle catalog at runtime.
 */

import type { SurfaceConfigSectionKey } from "@/components/adminV2/settings/surfaces/useSurfacesConfigurationSettings";

export function sectionLabel(key: SurfaceConfigSectionKey): string {
    const labels: Record<SurfaceConfigSectionKey, string> = {
        "focus-panels": "Focus Panels",
        "queue-rows": "Queue Rows",
        workspaces: "Workspaces",
        "work-units": "Work Units",
        "operational-intelligence": "Operational Intelligence",
    };
    return labels[key];
}
