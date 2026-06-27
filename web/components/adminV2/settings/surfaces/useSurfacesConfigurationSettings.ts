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

export type SurfaceConfigSectionKey = "focus-panels" | "queue-rows" | "workspaces" | "dashboards";

export type SurfaceConfigSection = {
    key: SurfaceConfigSectionKey;
    label: string;
};

/** Editor kinds the workspace knows how to render. */
export type SurfaceEditorKind = "focus-panel-summary";

export type SurfaceConfigObject = {
    id: string;
    title: string;
    subtitle?: string;
    /** When set, selecting the object opens this editor; otherwise it is catalogued only. */
    editor?: SurfaceEditorKind;
};

export const SURFACE_CONFIG_SECTIONS: readonly SurfaceConfigSection[] = [
    { key: "focus-panels", label: "Focus Panels" },
    { key: "queue-rows", label: "Queue Rows" },
    { key: "workspaces", label: "Workspaces" },
    { key: "dashboards", label: "Dashboards & Analytics" },
];

const SURFACE_OBJECTS: Record<SurfaceConfigSectionKey, SurfaceConfigObject[]> = {
    "focus-panels": [
        {
            id: "enrollment-focus-panel-summary",
            title: "Enrollment Focus Panel",
            subtitle: "Operator focus panel",
            editor: "focus-panel-summary",
        },
    ],
    "queue-rows": [],
    workspaces: [],
    dashboards: [],
};

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

    const selectedObject = useMemo(
        () => listItems.find((item) => item.id === selectedId) ?? null,
        [listItems, selectedId],
    );

    return {
        section,
        setSection,
        selectedId,
        setSelectedId,
        sections: SURFACE_CONFIG_SECTIONS,
        listItems,
        selectedObject,
    };
}
