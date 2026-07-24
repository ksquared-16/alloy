/**
 * Surfaces configuration — section labels only.
 * Workspace process entries are loaded from the lifecycle catalog at runtime.
 */

import type {
    SurfaceConfigSectionKey,
    SurfaceEditorKind,
} from "@/components/adminV2/settings/surfaces/useSurfacesConfigurationSettings";

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

/** One-line helper per category — shown under the category rail selection in the context bar. */
export function sectionSubtitle(key: SurfaceConfigSectionKey): string {
    const subtitles: Record<SurfaceConfigSectionKey, string> = {
        "focus-panels": "The operator focus panel operators use while working a record.",
        "queue-rows": "Queue row presentation for each process's work views.",
        workspaces: "Workspace header and per-process summary cards.",
        "work-units": "Work Unit header presentation.",
        "operational-intelligence": "Operational Intelligence surface composition.",
    };
    return subtitles[key];
}

/**
 * Selected-Surface workspace tabs. Fixed set, same family as Access / Business Processes.
 * `edit` embeds the existing Surface editor inline — it never navigates to a detached builder.
 */
export type SurfaceWorkspaceTab = "overview" | "edit" | "assignments" | "versions" | "health" | "history";

export const SURFACE_WORKSPACE_TABS: readonly { key: SurfaceWorkspaceTab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "edit", label: "Edit" },
    { key: "assignments", label: "Assignments" },
    { key: "versions", label: "Versions" },
    { key: "health", label: "Health" },
    { key: "history", label: "History" },
];

/** Operator-facing label for an editor kind (Overview "Composition Summary" hint). */
export function editorKindLabel(kind: SurfaceEditorKind | undefined): string | null {
    if (!kind) return null;
    const labels: Record<SurfaceEditorKind, string> = {
        "focus-panel-summary": "Focus Panel composer",
        "operational-intelligence": "Operational Intelligence surface builder",
        "workspace-header": "Workspace Header builder",
        "workspace-processes": "Workspace Process Summary builder",
        "work-unit-header": "Work Unit Header builder",
        "queue-row-builder": "Queue Row builder",
    };
    return labels[kind];
}
