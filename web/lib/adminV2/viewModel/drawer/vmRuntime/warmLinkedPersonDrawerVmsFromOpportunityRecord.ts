import { collectLinkedPersonIdsFromOpportunityRecord } from "@/lib/admin/drawer/collectLinkedPersonIdsFromOpportunityRecord";
import {
    cachePersonDrawerChildOpenSeed,
    cachePersonDrawerParentOpenSeed,
    personDrawerSeedFromOpportunityRecord,
} from "@/lib/admin/drawer/personDrawerOpenSeed";
import { PERSON_DRAWER_CHILD_OPEN_SOURCE } from "@/lib/admin/drawer/personDrawerOpenSeed";
import { PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS } from "@/lib/admin/person/personDrawerChildChrome";
import { PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS } from "@/lib/admin/person/personDrawerParentChrome";
import { childDrawerHardCutoverEnabled } from "@/lib/adminV2/viewModel/drawer/child/childDrawerHardCutoverGate";
import { buildPrepareParamsFromOpenDrawer } from "@/lib/adminV2/viewModel/drawer/drawerShellPinnedModelSwap";
import { prepareDrawerViewModelDeduped } from "@/lib/adminV2/viewModel/drawer/drawerModelSwapNavigation";
import { personDrawerHardCutoverEnabled } from "@/lib/adminV2/viewModel/drawer/person/personDrawerHardCutoverGate";
import { prefetchDrawerLayoutRuntimeBody } from "@/lib/layout/runtime/drawerLayoutRuntimeBodySessionCache";
import { markDrawerLinkedPrewarmScheduled } from "@/lib/perf/workspaceContinuityPerf";
import { tracePlatformPrefetch } from "@/lib/perf/platformSurfacePerfTrace";

/**
 * VM warm for linked person/child drawers — replaces legacy snapshot prefetch on canonical surfaces.
 */
export function warmLinkedPersonDrawerVmsFromOpportunityRecord(
    record: Record<string, unknown>,
    opts?: {
        source?: string;
        opportunityWorkspaceContext?: { work_unit_id: string; department_id: string } | null;
    },
): string[] {
    const source = opts?.source ?? "opportunity_drawer_idle";
    const ws = opts?.opportunityWorkspaceContext ?? null;
    const ids = collectLinkedPersonIdsFromOpportunityRecord(record);
    for (const personId of ids) {
        const seed = personDrawerSeedFromOpportunityRecord(record, personId);
        const childOpen = seed?.presentation_emphasis === PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS;
        const openSource =
            childOpen ? PERSON_DRAWER_CHILD_OPEN_SOURCE : "opportunity_primary_contact";
        const vmCutover = childOpen ? childDrawerHardCutoverEnabled() : personDrawerHardCutoverEnabled();
        if (!vmCutover) continue;

        if (childOpen && seed) {
            cachePersonDrawerChildOpenSeed(personId, seed);
        } else if (seed?.presentation_emphasis === PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS) {
            cachePersonDrawerParentOpenSeed(personId, seed);
        }

        tracePlatformPrefetch("linked_person_vm_warm_start", {
            person_id: personId,
            source,
            open_source: openSource,
        });
        markDrawerLinkedPrewarmScheduled({
            person_id: personId,
            source,
            open_source: openSource,
        });

        void prepareDrawerViewModelDeduped({
            ...buildPrepareParamsFromOpenDrawer({
                type: "persons",
                id: personId,
                source: openSource,
                personDrawerOpenSeed: seed ?? null,
                opportunityWorkspaceContext: ws,
            }),
            linkedPerfPhase: "prefetch",
        }).catch(() => {
            /* best-effort idle warm */
        });

        const opportunityId =
            typeof record.id === "string" && record.id.trim() ? record.id.trim() : null;
        prefetchDrawerLayoutRuntimeBody({
            apiPath:
                childOpen ?
                    "/api/admin/layout-runtime/child-drawer-body"
                :   "/api/admin/layout-runtime/person-drawer-body",
            entityId: personId,
            queryParams: childOpen ? undefined : { opportunityId },
        });
    }
    return ids;
}
