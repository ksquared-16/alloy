import type { OpenDrawerParams } from "@/contexts/AdminDrawerContext";
import { putDrawerEntitySnapshot } from "@/lib/admin/drawerEntitySnapshotCache";
import { logPersonDrawerOpen } from "@/lib/admin/drawer/personDrawerPerfLogs";
import {
    applyPersonDrawerOpenSeed,
    cachePersonDrawerChildOpenSeed,
    cachePersonDrawerParentOpenSeed,
    PERSON_DRAWER_CHILD_OPEN_SOURCE,
    type PersonDrawerOpenSeed,
} from "@/lib/admin/drawer/personDrawerOpenSeed";
import { PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS } from "@/lib/admin/person/personDrawerParentChrome";
import {
    isPersonDrawerSnapshotWarm,
    prefetchPersonDrawerSnapshot,
} from "@/lib/admin/prefetchPersonDrawerSnapshot";
import { childDrawerHardCutoverEnabled } from "@/lib/adminV2/viewModel/drawer/child/childDrawerHardCutoverGate";
import { buildPrepareParamsFromOpenDrawer } from "@/lib/adminV2/viewModel/drawer/drawerShellPinnedModelSwap";
import { prepareDrawerViewModelDeduped } from "@/lib/adminV2/viewModel/drawer/drawerModelSwapNavigation";
import { personDrawerHardCutoverEnabled } from "@/lib/adminV2/viewModel/drawer/person/personDrawerHardCutoverGate";
import { isDrawerTargetWarm } from "@/lib/adminV2/viewModel/drawer/vmRuntime/drawerTargetCache";
import {
    drawerLinkPendingKeyForChildFromOpportunity,
    drawerLinkPendingKeyForInquiryChildRow,
    drawerLinkPendingKeyForPersonFromOpportunity,
    type DrawerLinkPendingActions,
} from "@/lib/adminV2/viewModel/drawer/vmRuntime/drawerLinkPending";
import { logDrawerHardTrace } from "@/lib/adminV2/drawer/drawerHardTrace";

export type OpenDrawerFromOpportunityFn = (params: OpenDrawerParams) => void;

function linkedDrawerVmCutoverEnabled(openSource: string): boolean {
    return openSource === PERSON_DRAWER_CHILD_OPEN_SOURCE ?
            childDrawerHardCutoverEnabled()
        :   personDrawerHardCutoverEnabled();
}

/** Direct View Person open from opportunity host — cache-first when snapshot is warm. */
export function openViewPersonFromOpportunity(args: {
    openDrawer: OpenDrawerFromOpportunityFn;
    personId: string;
    opportunityId: string;
    source?: string;
    openSeed?: PersonDrawerOpenSeed | null;
    opportunityWorkspaceContext?: { work_unit_id: string; department_id: string } | null;
    linkPending?: DrawerLinkPendingActions;
}): boolean {
    const personId = args.personId.trim();
    const opportunityId = args.opportunityId.trim();
    if (!personId) return false;

    const openSource = args.source ?? "opportunity_primary_contact";
    const pendingKey =
        openSource === PERSON_DRAWER_CHILD_OPEN_SOURCE ?
            drawerLinkPendingKeyForChildFromOpportunity({
                personId,
                opportunityId,
                openSeed: args.openSeed ?? null,
                opportunityWorkspaceContext: args.opportunityWorkspaceContext ?? null,
            })
        :   drawerLinkPendingKeyForPersonFromOpportunity({
                personId,
                opportunityId,
                source: openSource,
                openSeed: args.openSeed ?? null,
                opportunityWorkspaceContext: args.opportunityWorkspaceContext ?? null,
            });
    const openParams = {
        type: "persons" as const,
        id: personId,
        source: openSource,
        parent: opportunityId ? { type: "opportunities" as const, id: opportunityId } : undefined,
        personDrawerOpenSeed: args.openSeed ?? null,
        opportunityWorkspaceContext: args.opportunityWorkspaceContext ?? null,
    };
    logDrawerHardTrace("child_open_view_person", "lib/admin/drawer/openViewPersonFromOpportunity.ts", {
        person_id: personId,
        opportunity_id: opportunityId,
        open_source: openSource,
        presentation_emphasis: args.openSeed?.presentation_emphasis ?? null,
        pending_key: pendingKey,
    });
    // Model swap path owns cold pending — do not begin here (avoids key drift vs commit clear).
    const childOpen = openSource === PERSON_DRAWER_CHILD_OPEN_SOURCE;
    const vmCutover = linkedDrawerVmCutoverEnabled(openSource);
    const openStartedAt = typeof performance !== "undefined" ? performance.now() : Date.now();

    if (childOpen && args.openSeed) {
        cachePersonDrawerChildOpenSeed(personId, args.openSeed);
    } else if (
        args.openSeed?.presentation_emphasis === PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS
    ) {
        cachePersonDrawerParentOpenSeed(personId, args.openSeed);
    } else if (!vmCutover && !isPersonDrawerSnapshotWarm(personId) && args.openSeed) {
        const seedRecord = applyPersonDrawerOpenSeed(personId, args.openSeed);
        if (seedRecord) {
            putDrawerEntitySnapshot("persons", personId, seedRecord);
        }
    }

    args.openDrawer(openParams);

    const cacheHit =
        vmCutover ?
            isDrawerTargetWarm(openParams)
        :   isPersonDrawerSnapshotWarm(personId);

    const timeToVisibleMs = Math.round(
        (typeof performance !== "undefined" ? performance.now() : Date.now()) - openStartedAt
    );
    logPersonDrawerOpen({
        personId,
        cacheHit,
        timeToVisibleMs,
        source: openSource,
    });

    if (!cacheHit && !vmCutover) {
        try {
            prefetchPersonDrawerSnapshot(personId, { source: "click", openSeed: args.openSeed ?? undefined });
        } catch {
            /* prefetch must not block open */
        }
    }

    return true;
}

/** Optional hover warm — never blocks click open. */
export function prefetchViewPersonOnHover(
    personId: string,
    opts?: Parameters<typeof prefetchViewPersonOnPointerDown>[1]
): void {
    prefetchViewPersonOnPointerDown(personId, opts);
}

function prefetchPersonDrawerVmCache(args: {
    personId: string;
    openSource?: string;
    openSeed?: PersonDrawerOpenSeed | null;
    opportunityWorkspaceContext?: { work_unit_id: string; department_id: string } | null;
}): void {
    const id = args.personId.trim();
    if (!id) return;
    const openSource = args.openSource ?? "opportunity_primary_contact";
    if (!linkedDrawerVmCutoverEnabled(openSource)) return;
    void prepareDrawerViewModelDeduped({
        ...buildPrepareParamsFromOpenDrawer({
            type: "persons",
            id,
            source: openSource,
            personDrawerOpenSeed: args.openSeed ?? null,
            opportunityWorkspaceContext: args.opportunityWorkspaceContext ?? null,
        }),
        linkedPerfPhase: "prefetch",
    }).catch(() => {
        /* VM warm must not block UI */
    });
}

/** Pointer/mousedown warm — runs before click handler for faster open. */
export function prefetchViewPersonOnPointerDown(
    personId: string,
    opts?: {
        openSource?: string;
        openSeed?: PersonDrawerOpenSeed | null;
        opportunityWorkspaceContext?: { work_unit_id: string; department_id: string } | null;
    }
): void {
    const id = personId.trim();
    if (!id) return;
    const openSource = opts?.openSource ?? "opportunity_primary_contact";
    const vmCutover = linkedDrawerVmCutoverEnabled(openSource);
    if (!vmCutover) {
        try {
            prefetchPersonDrawerSnapshot(id, { source: "hover", openSeed: opts?.openSeed ?? undefined });
        } catch {
            /* ignore */
        }
    }
    prefetchPersonDrawerVmCache({
        personId: id,
        openSource: opts?.openSource,
        openSeed: opts?.openSeed ?? null,
        opportunityWorkspaceContext: opts?.opportunityWorkspaceContext ?? null,
    });
}
