import { resolveGlobalSearchOpenFromHit } from "@/lib/admin/globalSearch/globalRecordSearchOpenResolution";
import type { GlobalRecordSearchHit } from "@/lib/admin/globalSearch/globalRecordSearchTypes";
import { prefetchOpportunityDrawerOnRowIntent } from "@/lib/admin/opportunityDrawerIntentPrefetch";
import { prefetchPersonDrawerSnapshot } from "@/lib/admin/prefetchPersonDrawerSnapshot";
import { PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS } from "@/lib/admin/person/personDrawerChildChrome";
import { opportunityDrawerHardCutoverEnabled } from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerHardCutoverGate";
import { childDrawerHardCutoverEnabled } from "@/lib/adminV2/viewModel/drawer/child/childDrawerHardCutoverGate";
import { prepareDrawerViewModelDeduped } from "@/lib/adminV2/viewModel/drawer/drawerModelSwapNavigation";
import { personDrawerHardCutoverEnabled } from "@/lib/adminV2/viewModel/drawer/person/personDrawerHardCutoverGate";
import { GLOBAL_SEARCH_DRAWER_OPEN_SOURCE } from "@/lib/adminV2/globalRecordSearchOpen";

/**
 * Hover/focus warm for global search hits — drawer VM or legacy snapshot before click.
 */
export function warmGlobalSearchHitDrawerIntent(hit: GlobalRecordSearchHit): void {
    if (typeof window === "undefined") return;
    const resolution = resolveGlobalSearchOpenFromHit(hit);
    if (!resolution.supported || !resolution.detail) return;
    warmDrawerIntent(
        resolution.detail.open_entity_type,
        resolution.detail.open_entity_id,
        resolution.detail.personDrawerOpenSeed?.presentation_emphasis ?? null
    );
}

/**
 * Search Platform V2 — warm the drawer behind an already-resolved destination.
 *
 * V2 destinations are resolved server-side, so there is no hit to re-resolve:
 * the entity type and id are authoritative. A child subject opens as its person
 * identity, so the child presentation emphasis is passed through to keep
 * first-paint chrome identical to a click from any other surface.
 */
export function warmSearchDestinationDrawerIntent(destination: {
    target: string;
    entity_type?: string | null;
    entity_id?: string | null;
    subject_kind?: string | null;
}): void {
    if (typeof window === "undefined") return;
    if (destination.target !== "open_drawer") return;
    warmDrawerIntent(
        (destination.entity_type ?? "").trim(),
        (destination.entity_id ?? "").trim(),
        destination.subject_kind === "child" ? PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS : null
    );
}

function warmDrawerIntent(
    open_entity_type: string,
    open_entity_id: string,
    emphasis: string | null
): void {
    const entityId = open_entity_id.trim();
    if (!entityId) return;

    if (open_entity_type === "opportunities") {
        prefetchOpportunityDrawerOnRowIntent(entityId);
        return;
    }

    if (open_entity_type === "persons") {
        const isChild = emphasis === PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS;
        if (
            (isChild && childDrawerHardCutoverEnabled()) ||
            (!isChild && personDrawerHardCutoverEnabled())
        ) {
            void prepareDrawerViewModelDeduped({
                entityType: "persons",
                entityId,
                openSource: GLOBAL_SEARCH_DRAWER_OPEN_SOURCE,
                presentationEmphasis: emphasis,
            }).catch(() => {
                /* non-fatal */
            });
            return;
        }
        prefetchPersonDrawerSnapshot(entityId);
    }
}
