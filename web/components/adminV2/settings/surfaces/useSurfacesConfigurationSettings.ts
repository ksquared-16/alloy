"use client";

import { useCallback, useMemo, useState } from "react";

import { sectionLabel } from "@/lib/adminV2/settings/surfaces/surfacesNavigationModel";

/**
 * Surfaces configuration state (Context → left nav → workspace).
 *
 * Left navigation is the primary organizational model — no Surface Library landing.
 * Workspaces list configured business processes directly; each opens the Process Summary builder.
 */

export type SurfaceConfigSectionKey =
    | "focus-panels"
    | "queue-rows"
    | "workspaces"
    | "work-units"
    | "operational-intelligence";

export type SurfaceConfigSection = {
    key: SurfaceConfigSectionKey;
    label: string;
};

/** Editor kinds the workspace knows how to render. */
export type SurfaceEditorKind =
    | "focus-panel-summary"
    | "operational-intelligence"
    | "workspace-header"
    | "workspace-processes"
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
    /** Operational grain — displayed as a label on queue row items. */
    grain?: "case" | "child" | "candidate";
    /** Entity type stored in entity_layouts — displayed alongside grain for queue rows. */
    entityType?: string;
    /** Business process key when this surface is a Workspace Process Summary. */
    businessProcess?: string;
    /** Lifecycle catalog id (`departmentId:processId`) — authoritative process binding. */
    catalogId?: string;
    processKey?: string;
    departmentId?: string;
    processId?: string;
};

/** Fixed Workspace Header entry — always first under Workspaces. */
export const WORKSPACE_HEADER_SURFACE_OBJECT: SurfaceConfigObject = {
    id: "workspace-header",
    title: "Workspace Header",
    subtitle: "Title, subtitle, and org-level KPIs",
    editor: "workspace-header",
    liveHref: "/workspace",
};

/** Dev-only preview of the Analytics / Dashboard surface composition + Metric Card language. */
const ANALYTICS_SURFACE_PREVIEW_HREF = "/dev/analytics-surface-mocks";

export const SURFACE_CONFIG_SECTIONS: readonly SurfaceConfigSection[] = [
    { key: "focus-panels", label: "Focus Panels" },
    { key: "queue-rows", label: "Queue Rows" },
    { key: "workspaces", label: "Workspaces" },
    { key: "work-units", label: "Work Units" },
    { key: "operational-intelligence", label: "Operational Intelligence" },
];

export const SURFACE_OBJECTS: Record<Exclude<SurfaceConfigSectionKey, "workspaces">, SurfaceConfigObject[]> = {
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
            grain: "case",
            entityType: "opportunities",
        },
        {
            id: "waitlist-queue-row",
            title: "Waitlist Queue Row",
            subtitle: "Placement candidate waitlist row",
            editor: "queue-row-builder",
            grain: "candidate",
            entityType: "placement_candidate",
        },
    ],
    "work-units": [
        {
            id: "work-unit-header",
            title: "Work Unit Header",
            subtitle: "Metrics atop a work unit",
            editor: "work-unit-header",
            liveHref: "/workspace",
        },
    ],
    "operational-intelligence": [
        {
            id: "operational-intelligence",
            title: "Operational Intelligence",
            subtitle: "Today: pulse, attention, bottlenecks",
            previewHref: ANALYTICS_SURFACE_PREVIEW_HREF,
            liveHref: "/workspace?workspaceModal=analytics",
            editor: "operational-intelligence",
        },
        {
            id: "executive-performance",
            title: "Executive Performance",
            subtitle: "Org health, growth, financial, forecast",
            previewHref: ANALYTICS_SURFACE_PREVIEW_HREF,
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

export function useSurfacesConfigurationSettings(workspaceSurfaces: SurfaceConfigObject[] = []) {
    const [section, setSectionState] = useState<SurfaceConfigSectionKey>("focus-panels");
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const listItems = useMemo((): SurfaceConfigObject[] => {
        if (section === "workspaces") {
            return [WORKSPACE_HEADER_SURFACE_OBJECT, ...workspaceSurfaces];
        }
        return SURFACE_OBJECTS[section] ?? [];
    }, [section, workspaceSurfaces]);

    const setSection = useCallback((next: SurfaceConfigSectionKey) => {
        setSectionState(next);
        setSelectedId(null);
    }, []);

    const openSurface = useCallback(
        (id: string) => {
            if (id === WORKSPACE_HEADER_SURFACE_OBJECT.id || workspaceSurfaces.some((o) => o.id === id)) {
                setSectionState("workspaces");
            } else {
                for (const [key, objs] of Object.entries(SURFACE_OBJECTS) as [
                    Exclude<SurfaceConfigSectionKey, "workspaces">,
                    SurfaceConfigObject[],
                ][]) {
                    if (objs.some((item) => item.id === id)) {
                        setSectionState(key);
                        break;
                    }
                }
            }
            setSelectedId(id);
        },
        [workspaceSurfaces],
    );

    const selectedObject = useMemo(() => {
        if (!selectedId) return null;
        if (selectedId === WORKSPACE_HEADER_SURFACE_OBJECT.id) return WORKSPACE_HEADER_SURFACE_OBJECT;
        const workspace = workspaceSurfaces.find((item) => item.id === selectedId);
        if (workspace) return workspace;
        for (const objs of Object.values(SURFACE_OBJECTS)) {
            const found = objs.find((item) => item.id === selectedId);
            if (found) return found;
        }
        return null;
    }, [selectedId, workspaceSurfaces]);

    const goHome = useCallback(() => {
        setSelectedId(null);
    }, []);

    return {
        section,
        setSection,
        selectedId,
        setSelectedId,
        openSurface,
        goHome,
        sections: SURFACE_CONFIG_SECTIONS,
        listItems,
        selectedObject,
    };
}
