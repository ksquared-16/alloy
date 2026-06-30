"use client";

import { useCallback, useMemo, useState } from "react";

/**
 * Surfaces configuration state (Context → Queue → Workspace).
 *
 * Mirrors the frozen Configuration Runtime V1 page/hook split (see Locations).
 * Sections are Design Surface categories; objects are the surfaces within a
 * category. Only the Enrollment Focus Panel Summary has a live editor today;
 * other categories are catalogued but not yet authorable.
 */

export type SurfaceConfigSectionKey = "focus-panels" | "queue-rows" | "workspaces" | "headers" | "dashboards";

export type SurfaceConfigSection = {
    key: SurfaceConfigSectionKey;
    label: string;
};

/** Editor kinds the workspace knows how to render. */
export type SurfaceEditorKind =
    | "focus-panel-summary"
    | "operational-intelligence"
    | "workspace-header"
    | "work-unit-header"
    | "queue-row-builder";

export type SurfaceConfigObject = {
    id: string;
    title: string;
    subtitle?: string;
    /** When set, selecting the object opens this editor; otherwise it is catalogued only. */
    editor?: SurfaceEditorKind;
    /** Catalogued (non-editor) surfaces may link to a read-only preview of the composition. */
    previewHref?: string;
    /** When the surface has a live production route, link operators straight to it. */
    liveHref?: string;
    /** Primary configuration target (the real metric/placement builder) when one exists. */
    configureHref?: string;
};

/** Dev-only preview of the Analytics / Dashboard surface composition + Metric Card language. */
const ANALYTICS_SURFACE_PREVIEW_HREF = "/dev/analytics-surface-mocks";

export const SURFACE_CONFIG_SECTIONS: readonly SurfaceConfigSection[] = [
    { key: "focus-panels", label: "Focus Panels" },
    { key: "queue-rows", label: "Queue Rows" },
    { key: "workspaces", label: "Workspaces" },
    { key: "headers", label: "Headers" },
    { key: "dashboards", label: "Dashboards & Analytics" },
];

export const SURFACE_OBJECTS: Record<SurfaceConfigSectionKey, SurfaceConfigObject[]> = {
    "focus-panels": [
        {
            id: "enrollment-focus-panel-summary",
            title: "Enrollment Focus Panel",
            subtitle: "Operator focus panel",
            editor: "focus-panel-summary",
        },
    ],
    "queue-rows": [
        {
            id: "pipeline-queue-row",
            title: "Pipeline Queue Row",
            subtitle: "Opportunity pipeline work-unit row",
            editor: "queue-row-builder",
        },
        {
            id: "waitlist-queue-row",
            title: "Waitlist Queue Row",
            subtitle: "Placement candidate waitlist row",
            editor: "queue-row-builder",
        },
    ],
    workspaces: [],
    // Header surfaces — the metric strip atop the workspace and each work unit.
    // Same SurfaceBuilder, compact density. Preview persistence for now.
    headers: [
        {
            id: "workspace-header",
            title: "Workspace Header",
            subtitle: "Metrics atop /workspace",
            editor: "workspace-header",
            liveHref: "/workspace",
        },
        {
            id: "work-unit-header",
            title: "Work Unit Header",
            subtitle: "Metrics atop a work unit",
            editor: "work-unit-header",
            liveHref: "/workspace",
        },
    ],
    // Dashboard / Analytics Design Surfaces. Catalogued from the Analytics OIP
    // surface inventory; composition is previewable (dev) ahead of an in-place
    // editor. Each reuses the Metric archetype + shared Renderer catalog — there
    // is no separate dashboard configuration model.
    dashboards: [
        {
            id: "executive-performance",
            title: "Executive Performance",
            subtitle: "Org health, growth, financial, forecast",
            previewHref: ANALYTICS_SURFACE_PREVIEW_HREF,
        },
        {
            id: "operational-intelligence",
            title: "Operational Intelligence",
            subtitle: "Today: pulse, attention, bottlenecks",
            previewHref: ANALYTICS_SURFACE_PREVIEW_HREF,
            // Runtime lives in the Workspace → Operational Intelligence modal. This
            // deep-link lands on the canonical operator workspace (`/workspace`) where
            // TopNavBar reads the param and opens the modal.
            liveHref: "/workspace?workspaceModal=analytics",
            // Configure opens the platform SurfaceBuilder inline (the one builder), not a
            // standalone Analytics config page. Operational Intelligence is just a
            // Surface Definition handed to SurfaceBuilder.
            editor: "operational-intelligence",
        },
        {
            id: "enrollment-intelligence",
            title: "Enrollment Intelligence",
            subtitle: "Funnel, conversion, capacity",
            previewHref: ANALYTICS_SURFACE_PREVIEW_HREF,
        },
        {
            id: "financial-performance",
            title: "Financial Performance",
            subtitle: "Revenue, AR, margin",
            previewHref: ANALYTICS_SURFACE_PREVIEW_HREF,
        },
    ],
};

/** Section that owns a given surface id (for global resolution from the Surface Library). */
const SECTION_BY_OBJECT_ID: Record<string, SurfaceConfigSectionKey> = Object.fromEntries(
    (Object.entries(SURFACE_OBJECTS) as [SurfaceConfigSectionKey, SurfaceConfigObject[]][]).flatMap(([key, objs]) =>
        objs.map((o) => [o.id, key] as const),
    ),
);

export function useSurfacesConfigurationSettings() {
    const [section, setSectionState] = useState<SurfaceConfigSectionKey>("focus-panels");
    // Start unselected so the Configuration shell (Context → Section → Workspace)
    // is visible; selecting a surface collapses navigation and opens the editor.
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const listItems = useMemo(() => SURFACE_OBJECTS[section] ?? [], [section]);

    const setSection = useCallback((next: SurfaceConfigSectionKey) => {
        setSectionState(next);
        // Changing category returns to browsing (collapse editor, show the shell).
        setSelectedId(null);
    }, []);

    /** Open a surface by id from anywhere (e.g. the Surface Library) — switches section too. */
    const openSurface = useCallback((id: string) => {
        const owner = SECTION_BY_OBJECT_ID[id];
        if (owner) setSectionState(owner);
        setSelectedId(id);
    }, []);

    // Resolve the selected object GLOBALLY (not just within the active section), so a
    // surface opened from the Library always mounts its editor.
    const selectedObject = useMemo(() => {
        if (!selectedId) return null;
        for (const objs of Object.values(SURFACE_OBJECTS)) {
            const found = objs.find((item) => item.id === selectedId);
            if (found) return found;
        }
        return null;
    }, [selectedId]);

    return {
        section,
        setSection,
        selectedId,
        setSelectedId,
        openSurface,
        sections: SURFACE_CONFIG_SECTIONS,
        listItems,
        selectedObject,
    };
}
