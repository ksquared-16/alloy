import { prefetchOpportunityDrawerOnRowIntent } from "@/lib/admin/opportunityDrawerIntentPrefetch";
import { prefetchPersonDrawerSnapshot } from "@/lib/admin/prefetchPersonDrawerSnapshot";
import { PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS } from "@/lib/admin/person/personDrawerChildChrome";
import { opportunityDrawerHardCutoverEnabled } from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerHardCutoverGate";
import { childDrawerHardCutoverEnabled } from "@/lib/adminV2/viewModel/drawer/child/childDrawerHardCutoverGate";
import { prepareDrawerViewModelDeduped } from "@/lib/adminV2/viewModel/drawer/drawerModelSwapNavigation";
import { personDrawerHardCutoverEnabled } from "@/lib/adminV2/viewModel/drawer/person/personDrawerHardCutoverGate";
import { GLOBAL_SEARCH_DRAWER_OPEN_SOURCE } from "@/lib/adminV2/globalRecordSearchOpen";
import type { SearchDestination } from "@/lib/search/searchContracts";

/**
 * Warm the record behind a Search result before the operator clicks it.
 *
 * This is how Search feels instant WITHOUT violating K3. The kernel commits a
 * destination atomically on `preparation.terminal` and never reveals a surface
 * before it is Operational, so the only honest way to shorten the wait is to make
 * the terminal arrive sooner. Hover and keyboard highlight warm the payload; the
 * click then commits against a cache that is already hot.
 *
 * A NOTE ON THE `drawer` NAMES BELOW. These modules compose and cache the record
 * VIEW MODEL — the payload a Focus Panel card renders. That infrastructure is
 * still required and is deliberately untouched here; only the drawer *product*
 * (the overlay an operator could navigate to) was removed. Renaming this layer is
 * a separate, larger change and would add risk to no benefit right now.
 */
function warmRecordViewModel(entityType: string, entityId: string, emphasis: string | null): void {
    const id = entityId.trim();
    if (!id) return;

    if (entityType === "opportunities") {
        prefetchOpportunityDrawerOnRowIntent(id);
        return;
    }

    if (entityType === "persons") {
        const isChild = emphasis === PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS;
        if (
            (isChild && childDrawerHardCutoverEnabled()) ||
            (!isChild && personDrawerHardCutoverEnabled())
        ) {
            void prepareDrawerViewModelDeduped({
                entityType: "persons",
                entityId: id,
                openSource: GLOBAL_SEARCH_DRAWER_OPEN_SOURCE,
                presentationEmphasis: emphasis,
            }).catch(() => {
                /* non-fatal: this is a warm, not a load */
            });
            return;
        }
        prefetchPersonDrawerSnapshot(id);
    }
}

/**
 * Warm the host record behind a Focus Panel destination.
 *
 * Safe to call on every hover and every keyboard highlight — the underlying
 * prefetchers are deduped and TTL-cached, and a warm that is never used costs
 * nothing but a request that would have happened anyway.
 */
export function warmSearchFocusTarget(destination: SearchDestination): void {
    if (typeof window === "undefined") return;
    if (destination.target !== "focus_panel") return;

    const hostType = (destination.host_entity_type ?? "").trim();
    const hostId = (destination.host_entity_id ?? "").trim();
    if (!hostType || !hostId) return;

    // A child's card renders inside the case that hosts it; the emphasis keeps
    // first paint identical to opening that child from anywhere else.
    const emphasis =
        destination.card_key === "children" ? PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS : null;

    warmRecordViewModel(hostType, hostId, emphasis);
}
