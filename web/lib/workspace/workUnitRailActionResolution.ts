import type { ResolvedActionForClient, ResolvedActionsBySlot } from "@/lib/admin/actions/types";
import { rightRailResolvedFromActionsPayload } from "@/lib/workspace/rightRailResolvedFromActionsPayload";

/** Physical placement consumed by the Work Unit top-right Actions rail. */
export const WORK_UNIT_RAIL_PLACEMENT = {
    surface: "work_unit",
    slots: ["primary", "right_rail", "secondary"] as const,
} as const;

/** Physical placement consumed by Focus Panel Manage (record header overflow). */
export const FOCUS_PANEL_MANAGE_PLACEMENT = {
    surface: "record_header",
    slots: ["overflow", "primary", "secondary", "header"] as const,
} as const;

export type PageCommandRailPlacementSurface = "work_unit" | "department" | "company";

export function isPageCommandRailPlacementSurface(
    value: string | null | undefined
): value is PageCommandRailPlacementSurface {
    return value === "work_unit" || value === "department" || value === "company";
}

/**
 * Drawer Focus Panel actions must not replace page-owned command rail placements.
 * Suggested/selected record context is execution-only — never placement availability.
 */
export function shouldDrawerReplaceCommandRailActions(input: {
    pagePlacementSurface: string | null | undefined;
    drawerRegistrationPresent: boolean;
}): boolean {
    if (!input.drawerRegistrationPresent) return false;
    return !isPageCommandRailPlacementSurface(input.pagePlacementSurface);
}

export type WorkUnitRailResolutionDebug = {
    requestedSurfaces: string[];
    requestedSlots: readonly string[];
    resolvedActionKeys: string[];
    invocationSurface: string;
    pagePlacementSurface: string | null;
    drawerOverrideBlocked: boolean;
};

/** Dev/test helper — inspect Work Unit rail resolution without production logging. */
export function describeWorkUnitRailResolution(input: {
    placementSurfaces: readonly string[];
    resolvedBySlot: ResolvedActionsBySlot;
    pagePlacementSurface?: string | null;
    drawerRegistrationPresent?: boolean;
}): WorkUnitRailResolutionDebug {
    const flat = rightRailResolvedFromActionsPayload(input.resolvedBySlot);
    const pagePlacementSurface = input.pagePlacementSurface ?? null;
    return {
        requestedSurfaces: [...input.placementSurfaces],
        requestedSlots: WORK_UNIT_RAIL_PLACEMENT.slots,
        resolvedActionKeys: flat.map((a) => a.key),
        invocationSurface: WORK_UNIT_RAIL_PLACEMENT.surface,
        pagePlacementSurface,
        drawerOverrideBlocked: isPageCommandRailPlacementSurface(pagePlacementSurface),
    };
}

export function flattenFocusPanelManageActions(
    actions: ResolvedActionsBySlot | undefined
): ResolvedActionForClient[] {
    if (!actions) return [];
    const seen = new Set<string>();
    const out: ResolvedActionForClient[] = [];
    for (const slot of FOCUS_PANEL_MANAGE_PLACEMENT.slots) {
        for (const action of actions[slot] ?? []) {
            if (seen.has(action.key)) continue;
            seen.add(action.key);
            out.push(action);
        }
    }
    return out;
}
