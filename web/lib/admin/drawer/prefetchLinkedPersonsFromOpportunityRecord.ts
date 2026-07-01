import { collectLinkedPersonIdsFromOpportunityRecord } from "@/lib/admin/drawer/collectLinkedPersonIdsFromOpportunityRecord";
import {
    cachePersonDrawerChildOpenSeed,
    cachePersonDrawerParentOpenSeed,
    personDrawerSeedFromOpportunityRecord,
} from "@/lib/admin/drawer/personDrawerOpenSeed";
import { PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS } from "@/lib/admin/person/personDrawerChildChrome";
import { PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS } from "@/lib/admin/person/personDrawerParentChrome";
import { isCanonicalDrawerHostPath } from "@/lib/admin/canonicalAdminRoutes";
import { opportunityDrawerHardCutoverEnabled } from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerHardCutoverGate";
import { warmLinkedPersonDrawerVmsFromOpportunityRecord } from "@/lib/adminV2/viewModel/drawer/vmRuntime/warmLinkedPersonDrawerVmsFromOpportunityRecord";
import {
    prefetchPersonDrawerSnapshot,
    type PersonPrefetchSource,
} from "@/lib/admin/prefetchPersonDrawerSnapshot";

/** Warm linked person drawer snapshots after opportunity content is stable. */
export function prefetchLinkedPersonsFromOpportunityRecord(
    record: Record<string, unknown>,
    opts?: {
        source?: PersonPrefetchSource;
        opportunityWorkspaceContext?: { work_unit_id: string; department_id: string } | null;
    },
): string[] {
    const onCanonicalHost =
        typeof window !== "undefined" && isCanonicalDrawerHostPath(window.location.pathname);
    if (onCanonicalHost && opportunityDrawerHardCutoverEnabled()) {
        return warmLinkedPersonDrawerVmsFromOpportunityRecord(record, {
            source: opts?.source,
            opportunityWorkspaceContext: opts?.opportunityWorkspaceContext ?? null,
        });
    }

    const source = opts?.source ?? "opportunity_drawer_idle";
    const ids = collectLinkedPersonIdsFromOpportunityRecord(record);
    for (const personId of ids) {
        const seed = personDrawerSeedFromOpportunityRecord(record, personId);
        if (seed?.presentation_emphasis === PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS) {
            cachePersonDrawerChildOpenSeed(personId, seed);
        } else if (seed?.presentation_emphasis === PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS) {
            cachePersonDrawerParentOpenSeed(personId, seed);
        }
        prefetchPersonDrawerSnapshot(personId, { source, openSeed: seed ?? undefined });
    }
    return ids;
}
