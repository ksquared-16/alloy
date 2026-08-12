import { resolveGlobalSearchDrawerOpenTarget } from "@/lib/admin/globalSearch/globalRecordSearchDrawerTarget";
import { personDrawerOpenSeedFromGlobalSearchHit } from "@/lib/admin/globalSearch/personDrawerOpenSeedFromGlobalSearchHit";
import type { GlobalRecordSearchHit } from "@/lib/admin/globalSearch/globalRecordSearchTypes";

/**
 * The resolved open target for a search hit.
 *
 * Declared here rather than imported from `globalRecordSearchOpen`: that module's event detail WAS
 * the Search → modal-drawer launch path, and Search no longer opens the drawer product — a result
 * click is an attention movement onto the inline Focus Panel. This resolver outlived that path as a
 * pure hit → target mapping (the person-drawer suites still exercise it), so it now owns the only
 * shape it still needs instead of depending on a deleted one.
 */
export type GlobalRecordSearchOpenDetail = {
    open_entity_type: string;
    open_entity_id: string;
    personDrawerOpenSeed: ReturnType<typeof personDrawerOpenSeedFromGlobalSearchHit>;
};

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
