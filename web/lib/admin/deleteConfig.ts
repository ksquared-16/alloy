/**
 * Admin delete configuration: which entity types support hard delete (admin/super-user only).
 * Used by UI to show/hide delete and by API to enforce.
 * Tier A: config / lower-risk records — hard delete allowed.
 * Tier B: operational records — use archive/deactivate; no hard delete in this pass.
 * Tier C: financial/posted — no delete.
 */

import type { AdminDrawerEntityType } from "@/contexts/AdminDrawerContext";

/** Entity types that support hard delete from the admin UI (admin role only). Tier A config records only. */
export const ADMIN_HARD_DELETE_ENTITY_TYPES: AdminDrawerEntityType[] = [
    "service_offerings",
    "service_plan_templates",
    "addons",
];

/** Map drawer entity type to API path segment for DELETE (e.g. service_offerings -> service-offerings). */
export const ENTITY_TYPE_TO_DELETE_API_PATH: Record<string, string> = {
    pricing_modes: "pricing-modes",
    pricing_dimensions: "pricing-dimensions",
    pricing_dimension_values: "pricing-dimension-values",
    service_offerings: "service-offerings",
    service_plan_templates: "service-plan-templates",
    addons: "addons",
    discounts: "discounts",
    // entity_labels: DELETE is on route with ?entity_type=, not [id]; handled separately in UI
};

/** Entity types that have a standard [id] DELETE endpoint (excluding entity_labels). */
export function getDeleteApiPath(type: AdminDrawerEntityType, id: string): string | null {
    const path = ENTITY_TYPE_TO_DELETE_API_PATH[type];
    if (!path) return null;
    return `/api/admin/${path}/${id}`;
}

export function canHardDeleteEntityType(type: AdminDrawerEntityType): boolean {
    return ADMIN_HARD_DELETE_ENTITY_TYPES.includes(type);
}
