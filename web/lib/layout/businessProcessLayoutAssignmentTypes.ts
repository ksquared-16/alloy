/**
 * Business Process Layout Assignment — types and surface identity mapping.
 */

import type { SurfaceLayoutKey } from "@/lib/layout/surfaceLayoutRegistry";
import type { LayoutSurface } from "@/lib/layout/layoutV2";

export const LAYOUT_ASSIGNMENT_SURFACE_KEYS = [
    "opportunity_drawer",
    "person_drawer",
    "child_drawer",
    "queue_record",
    "waitlist_queue_record",
] as const;

export type LayoutAssignmentSurfaceKey = (typeof LAYOUT_ASSIGNMENT_SURFACE_KEYS)[number];

export type LayoutAssignmentSurfaceIdentity = {
    surfaceKey: LayoutAssignmentSurfaceKey;
    entityType: string;
    surface: LayoutSurface;
    defaultLayoutKey: string;
    label: string;
};

export const LAYOUT_ASSIGNMENT_SURFACE_IDENTITIES: Readonly<
    Record<LayoutAssignmentSurfaceKey, LayoutAssignmentSurfaceIdentity>
> = {
    opportunity_drawer: {
        surfaceKey: "opportunity_drawer",
        entityType: "opportunities",
        surface: "drawer",
        defaultLayoutKey: "default",
        label: "Opportunity Drawer",
    },
    person_drawer: {
        surfaceKey: "person_drawer",
        entityType: "person",
        surface: "drawer",
        defaultLayoutKey: "default",
        label: "Person Drawer",
    },
    child_drawer: {
        surfaceKey: "child_drawer",
        entityType: "child",
        surface: "drawer",
        defaultLayoutKey: "default",
        label: "Child Drawer",
    },
    queue_record: {
        surfaceKey: "queue_record",
        entityType: "opportunities",
        surface: "queue",
        defaultLayoutKey: "default",
        label: "Pipeline Queue Row",
    },
    waitlist_queue_record: {
        surfaceKey: "waitlist_queue_record",
        entityType: "placement_candidate",
        surface: "queue",
        defaultLayoutKey: "waitlist_candidate_card",
        label: "Waitlist Queue Row",
    },
};

export function isLayoutAssignmentSurfaceKey(v: unknown): v is LayoutAssignmentSurfaceKey {
    return typeof v === "string" && (LAYOUT_ASSIGNMENT_SURFACE_KEYS as readonly string[]).includes(v);
}

export function layoutAssignmentSurfaceIdentity(
    surfaceKey: LayoutAssignmentSurfaceKey,
): LayoutAssignmentSurfaceIdentity {
    return LAYOUT_ASSIGNMENT_SURFACE_IDENTITIES[surfaceKey];
}

export function surfaceLayoutKeyToAssignmentSurfaceKey(
    surfaceKey: SurfaceLayoutKey,
): LayoutAssignmentSurfaceKey | null {
    if (isLayoutAssignmentSurfaceKey(surfaceKey)) return surfaceKey;
    return null;
}

export type LayoutAssignmentContext = {
    businessProcessKey: string;
    stageKey?: string | null;
    statusKey?: string | null;
};

export type BusinessProcessLayoutAssignmentRecord = {
    id: string;
    orgId: string;
    businessProcessKey: string;
    stageKey: string | null;
    statusKey: string | null;
    surfaceKey: LayoutAssignmentSurfaceKey;
    entityType: string;
    surface: LayoutSurface;
    layoutKey: string;
    entityLayoutId: string | null;
    priority: number;
    isActive: boolean;
    version: number;
    metadata: Record<string, unknown> | null;
    createdBy: string | null;
    createdAt: string;
    updatedAt: string | null;
};

export type LayoutAssignmentMatchTier =
    | "process_stage_status"
    | "process_stage"
    | "process_status"
    | "process_surface_default"
    | "none";

export type LayoutAssignmentResolution = {
    assignment: BusinessProcessLayoutAssignmentRecord;
    tier: LayoutAssignmentMatchTier;
};
