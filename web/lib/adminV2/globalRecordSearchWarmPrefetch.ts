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

    const { open_entity_type, open_entity_id, personDrawerOpenSeed } = resolution.detail;
    const entityId = open_entity_id.trim();
    if (!entityId) return;

    if (open_entity_type === "opportunities") {
        prefetchOpportunityDrawerOnRowIntent(entityId);
        return;
    }

    if (open_entity_type === "persons") {
        const emphasis = personDrawerOpenSeed?.presentation_emphasis ?? null;
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
