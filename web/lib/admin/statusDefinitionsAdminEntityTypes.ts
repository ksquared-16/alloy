import {
    OPERATOR_STATUS_CATEGORY_REGISTRY,
    type StatusCategoryRegistryEntry,
} from "@/lib/admin/statusCategoryRegistry";

type VisibleStatusCategoryEntry = StatusCategoryRegistryEntry & { settingsVisible: true };

function isVisibleStatusCategory(
    entry: StatusCategoryRegistryEntry
): entry is VisibleStatusCategoryEntry {
    return entry.settingsVisible;
}

/**
 * Entity types listed on the admin Statuses Settings page and used for the
 * unscoped GET /api/admin/status-definitions aggregate (effective defs per type).
 *
 * Registry-driven — see `statusCategoryRegistry.ts` for authoritative owners.
 * Legacy `customer_members` roster status is excluded (deprecated Phase 1).
 */
export const ADMIN_STATUS_DEFINITIONS_ENTITY_TYPES = OPERATOR_STATUS_CATEGORY_REGISTRY.filter(
    isVisibleStatusCategory
).map((entry) => entry.entity_type);

export type AdminStatusDefinitionsEntityType = VisibleStatusCategoryEntry["entity_type"];
