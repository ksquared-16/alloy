import type { GlobalRecordSearchOpenDetail } from "@/lib/adminV2/globalRecordSearchOpen";
import { resolveGlobalSearchDrawerOpenTarget } from "@/lib/admin/globalSearch/globalRecordSearchDrawerTarget";
import { personDrawerOpenSeedFromGlobalSearchHit } from "@/lib/admin/globalSearch/personDrawerOpenSeedFromGlobalSearchHit";
import type { GlobalRecordSearchHit } from "@/lib/admin/globalSearch/globalRecordSearchTypes";

export type GlobalRecordSearchOpenResolution = {
    supported: boolean;
    detail: GlobalRecordSearchOpenDetail | null;
};

/** Resolve AdminV2 drawer target — never legacy customer_members/contact drawers. */
export function resolveGlobalSearchOpenFromHit(hit: GlobalRecordSearchHit): GlobalRecordSearchOpenResolution {
    const target = resolveGlobalSearchDrawerOpenTarget(hit);
    if (!target) return { supported: false, detail: null };
    const personDrawerOpenSeed =
        target.entity_type === "persons" ? personDrawerOpenSeedFromGlobalSearchHit(hit) : null;

    return {
        supported: true,
        detail: {
            open_entity_type: target.entity_type,
            open_entity_id: target.entity_id,
            personDrawerOpenSeed,
        },
    };
}
