/**
 * Nested surface definition model — runtime-shaped drill-in surfaces.
 *
 * Each nested surface is a real surface definition (not an expansion label):
 * fixed structural regions + configurable regions + optional drill-in children.
 *
 * @see docs/platform/experience/surface-composer.md
 */

import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";

/** Surface role within a Focus Panel drill-in hierarchy. */
export type NestedSurfaceRole =
    | "summary_card"
    | "detail_surface"
    | "contact_surface"
    | "child_surface"
    | "line_items_surface";

/** How a field behaves in a nested surface. */
export type NestedSurfaceFieldMode = {
    /** When false the field is omitted from the operator view. Default true. */
    displayed?: boolean;
    /** When false the field is read-only even when the card supports edit. Default true for contact fields. */
    editable?: boolean;
};

/** Group-level display options for household / children drill-in surfaces. */
export type NestedSurfaceGroupDisplayOptions = {
    /** When false the entire group is hidden. Default true when data exists. */
    visible?: boolean;
    showPhone?: boolean;
    showEmail?: boolean;
    showDob?: boolean;
    showAge?: boolean;
};

export type NestedSurfaceDefinition = {
    surfaceId: string;
    label: string;
    role: NestedSurfaceRole;
    /** Focus Panel card that opens this surface (when applicable). */
    parentCardKey?: FocusPanelCardKey;
    /** Fixed regions the platform owns — not removable in composer. */
    fixedRegions: readonly string[];
    /** Configurable evidence groups / sections. */
    configurableGroups: readonly string[];
    /** Child surfaces reachable from this surface in composer drill-in. */
    drillInSurfaceIds?: readonly string[];
};

export const HOUSEHOLD_SURFACE_ID = "household_surface" as const;
export const HOUSEHOLD_CONTACT_SURFACE_ID = "household_contact_surface" as const;
export const CHILD_SURFACE_ID = "child_surface" as const;

/** Registry of known nested surface definitions (authoring + runtime parity). */
export const NESTED_SURFACE_DEFINITIONS: Record<string, NestedSurfaceDefinition> = {
    [HOUSEHOLD_SURFACE_ID]: {
        surfaceId: HOUSEHOLD_SURFACE_ID,
        label: "Household Detail",
        role: "detail_surface",
        parentCardKey: "household",
        fixedRegions: ["household_identity", "back_affordance", "grouped_people_structure"],
        configurableGroups: [
            "primary_contact",
            "other_parent_guardian",
            "household_members",
            "emergency_contacts",
            "authorized_pickups",
            "children",
            "address",
            "billing_contact",
        ],
        drillInSurfaceIds: [HOUSEHOLD_CONTACT_SURFACE_ID, "children_surface"],
    },
    [HOUSEHOLD_CONTACT_SURFACE_ID]: {
        surfaceId: HOUSEHOLD_CONTACT_SURFACE_ID,
        label: "Contact Detail",
        role: "contact_surface",
        parentCardKey: "household",
        fixedRegions: ["contact_identity", "back_affordance"],
        configurableGroups: ["contact_fields"],
    },
    children_surface: {
        surfaceId: "children_surface",
        label: "Children",
        role: "detail_surface",
        parentCardKey: "children",
        fixedRegions: ["roster_structure", "back_affordance"],
        configurableGroups: ["identity", "placement", "readiness"],
        drillInSurfaceIds: [CHILD_SURFACE_ID],
    },
    [CHILD_SURFACE_ID]: {
        surfaceId: CHILD_SURFACE_ID,
        label: "Child Detail",
        role: "child_surface",
        parentCardKey: "children",
        fixedRegions: ["child_identity_header", "back_affordance"],
        configurableGroups: ["identity", "placement", "readiness"],
        drillInSurfaceIds: [],
    },
    financial_configuration_surface: {
        surfaceId: "financial_configuration_surface",
        label: "Financial Configuration",
        role: "detail_surface",
        parentCardKey: "billing_preview",
        fixedRegions: ["billing_checklist", "placement_tuition", "back_affordance"],
        configurableGroups: ["current_configuration", "configuration_history", "configuration_actions"],
        drillInSurfaceIds: [],
    },
};

export function nestedSurfaceDefinition(surfaceId: string): NestedSurfaceDefinition | null {
    return NESTED_SURFACE_DEFINITIONS[surfaceId] ?? null;
}
