import type { AdminDrawerEntityType } from "@/contexts/AdminDrawerContext";
import type { GlobalRecordSearchHit } from "@/lib/admin/globalSearch/globalRecordSearchTypes";

/** AdminV2-supported drawer targets for global search — never legacy member/contact drawers. */
export type GlobalSearchAdminV2DrawerEntityType = Extract<
    AdminDrawerEntityType,
    "persons" | "customers" | "opportunities" | "locations"
>;

/** Entity types global search must never open directly. */
export const GLOBAL_SEARCH_LEGACY_DRAWER_ENTITY_TYPES = ["customer_members", "contacts"] as const;

export type GlobalSearchDrawerOpenTarget = {
    entity_type: GlobalSearchAdminV2DrawerEntityType;
    entity_id: string;
};

export function isGlobalSearchLegacyDrawerEntityType(
    type: string | null | undefined
): type is (typeof GLOBAL_SEARCH_LEGACY_DRAWER_ENTITY_TYPES)[number] {
    return (GLOBAL_SEARCH_LEGACY_DRAWER_ENTITY_TYPES as readonly string[]).includes(String(type ?? ""));
}

export function isGlobalSearchAdminV2DrawerEntityType(type: string): type is GlobalSearchAdminV2DrawerEntityType {
    return type === "persons" || type === "customers" || type === "opportunities" || type === "locations";
}

/** Resolve child member grain → canonical AdminV2 drawer (person first, then lead, then household). */
export function resolveGlobalSearchChildDrawerTarget(input: {
    person_id?: string | null;
    customer_id?: string | null;
    opportunity_id?: string | null;
}): GlobalSearchDrawerOpenTarget | null {
    const personId = String(input.person_id ?? "").trim();
    if (personId) return { entity_type: "persons", entity_id: personId };
    const oppId = String(input.opportunity_id ?? "").trim();
    if (oppId) return { entity_type: "opportunities", entity_id: oppId };
    const customerId = String(input.customer_id ?? "").trim();
    if (customerId) return { entity_type: "customers", entity_id: customerId };
    return null;
}

/** Never open legacy drawer types from global search. */
export function resolveGlobalSearchDrawerOpenTarget(hit: GlobalRecordSearchHit): GlobalSearchDrawerOpenTarget | null {
    if (hit.open_entity_type && hit.open_entity_id) {
        if (isGlobalSearchLegacyDrawerEntityType(hit.open_entity_type)) return null;
        if (isGlobalSearchAdminV2DrawerEntityType(hit.open_entity_type)) {
            return { entity_type: hit.open_entity_type, entity_id: hit.open_entity_id.trim() };
        }
        return null;
    }

    if (hit.group === "children") {
        return resolveGlobalSearchChildDrawerTarget({
            person_id: hit.person_id,
            customer_id: hit.customer_id,
            opportunity_id: hit.opportunity_id,
        });
    }

    if (isGlobalSearchLegacyDrawerEntityType(hit.entity_type)) return null;
    if (isGlobalSearchAdminV2DrawerEntityType(hit.entity_type)) {
        return { entity_type: hit.entity_type, entity_id: hit.entity_id.trim() };
    }
    return null;
}
