/**
 * Surface Library — the command center for all Surface authoring.
 *
 * One declarative registry of every configurable surface in Alloy. The Surface Library
 * landing renders this; selecting an entry opens the ONE platform SurfaceBuilder.
 * Introducing a new surface type means adding an entry here — no new builder, no new
 * landing. Operational Intelligence is just one row.
 *
 * UX/product-flow only: no persistence, runtime, metric, OIP, or API coupling.
 */

import type { SurfaceEditorKind } from "@/components/adminV2/settings/surfaces/useSurfacesConfigurationSettings";

export type SurfaceLibraryStatus = "published" | "draft" | "planned";

export type SurfaceLibraryCategory =
    | "Operator surfaces"
    | "Dashboards & analytics"
    | "Headers"
    | "Reports";

export type SurfaceLibraryEntry = {
    /** Links to a SURFACE_OBJECTS id when the surface is openable in the builder. */
    id: string;
    title: string;
    subtitle: string;
    category: SurfaceLibraryCategory;
    status: SurfaceLibraryStatus;
    /** Where this surface appears at runtime (operator-facing). */
    appearsIn: readonly string[];
    /** Builder editor kind; when present, the entry opens the SurfaceBuilder. */
    editor?: SurfaceEditorKind;
};

/**
 * Every surface in the platform. Status reflects the surface's runtime presence;
 * `editor` reflects whether it is authorable in the SurfaceBuilder yet.
 */
export const SURFACE_LIBRARY: readonly SurfaceLibraryEntry[] = [
    {
        id: "enrollment-focus-panel-summary",
        title: "Focus Panel",
        subtitle: "The operator's record focus panel",
        category: "Operator surfaces",
        status: "published",
        appearsIn: ["Record drawers", "Focus Panel"],
        editor: "focus-panel-summary",
    },
    {
        id: "queue-row-catalog",
        title: "Queue Row (per Business Process)",
        subtitle: "One configurable queue row surface per process — variants for Tour, Waitlist, Enrolling",
        category: "Operator surfaces",
        status: "published",
        appearsIn: ["Work unit queue", "Surfaces → Queue Rows"],
        editor: "queue-row-builder",
    },
    {
        id: "operational-intelligence",
        title: "Operational Intelligence",
        subtitle: "Today's pulse, attention, bottlenecks",
        category: "Dashboards & analytics",
        status: "published",
        appearsIn: ["Workspace → Analytics modal"],
        editor: "operational-intelligence",
    },
    {
        id: "executive-performance",
        title: "Executive Performance",
        subtitle: "Org health, growth, financial, forecast",
        category: "Dashboards & analytics",
        status: "planned",
        appearsIn: ["Executive dashboard"],
    },
    {
        id: "enrollment-intelligence",
        title: "Enrollment Intelligence",
        subtitle: "Funnel, conversion, capacity",
        category: "Dashboards & analytics",
        status: "planned",
        appearsIn: ["Enrollment workspace"],
    },
    {
        id: "financial-performance",
        title: "Financial Performance",
        subtitle: "Revenue, AR, margin",
        category: "Dashboards & analytics",
        status: "planned",
        appearsIn: ["Finance workspace"],
    },
    {
        id: "workspace-processes",
        title: "Workspace Processes",
        subtitle: "The process cards on a workspace",
        category: "Headers",
        status: "published",
        appearsIn: ["Workspace processes"],
        editor: "workspace-processes",
    },
    {
        id: "work-unit-header",
        title: "Work Unit Header",
        subtitle: "The metrics atop a work unit",
        category: "Headers",
        status: "published",
        appearsIn: ["Work unit header"],
        editor: "work-unit-header",
    },
    {
        id: "reports",
        title: "Reports",
        subtitle: "Period output and board packets",
        category: "Reports",
        status: "planned",
        appearsIn: ["Reports"],
    },
];

export function listSurfaceLibrary(): readonly SurfaceLibraryEntry[] {
    return SURFACE_LIBRARY;
}

/** Entries the SurfaceBuilder can open today (have an editor). */
export function authorableSurfaces(): SurfaceLibraryEntry[] {
    return SURFACE_LIBRARY.filter((s) => Boolean(s.editor));
}

export const SURFACE_LIBRARY_CATEGORY_ORDER: readonly SurfaceLibraryCategory[] = [
    "Dashboards & analytics",
    "Operator surfaces",
    "Headers",
    "Reports",
];

/** Group the library by category, in display order, omitting empty groups. */
export function surfaceLibraryByCategory(): { category: SurfaceLibraryCategory; entries: SurfaceLibraryEntry[] }[] {
    return SURFACE_LIBRARY_CATEGORY_ORDER.map((category) => ({
        category,
        entries: SURFACE_LIBRARY.filter((s) => s.category === category),
    })).filter((g) => g.entries.length > 0);
}
