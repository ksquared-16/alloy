import type { AdminDrawerState } from "@/contexts/AdminDrawerContext";
import { isChildDrawerVmOpen } from "@/lib/adminV2/viewModel/drawer/child/childDrawerFirstViewportContract";
import { isChildDrawerViewModelPreload } from "@/lib/adminV2/viewModel/drawer/child/buildChildDrawerOpenPreloadFromViewModel";
import {
    buildPrepareParamsFromOpenDrawer,
    peekDrawerViewModelPreloadSync,
} from "@/lib/adminV2/viewModel/drawer/drawerShellPinnedModelSwap";
import { isOpportunityDrawerViewModelPreload } from "@/lib/adminV2/viewModel/drawer/opportunity/buildOpportunityDrawerOpenPreloadFromViewModel";
import { isPersonDrawerViewModelPreload } from "@/lib/adminV2/viewModel/drawer/person/buildPersonDrawerOpenPreloadFromViewModel";
import type { OpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/types";
import type { ChildDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/child/types";
import type { PersonDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/person/types";

export type PersonsDrawerDisplayVm = PersonDrawerViewModel | ChildDrawerViewModel;

export function peekPersonsDrawerDisplayVm(drawer: AdminDrawerState): PersonsDrawerDisplayVm | null {
    if (drawer.type !== "persons" || !drawer.id || drawer.id === "new") return null;
    const isChildSurface = isChildDrawerVmOpen({
        openSource: drawer.openSource ?? null,
        presentationEmphasis: drawer.personDrawerOpenSeed?.presentation_emphasis ?? null,
    });
    const sync = peekDrawerViewModelPreloadSync(
        buildPrepareParamsFromOpenDrawer({
            type: "persons",
            id: drawer.id,
            opportunityWorkspaceContext: drawer.opportunityWorkspaceContext ?? null,
            source: drawer.openSource ?? undefined,
            personDrawerOpenSeed: drawer.personDrawerOpenSeed ?? null,
        })
    );
    if (!sync || sync.entityType !== "persons") return null;
    if (isChildSurface && isChildDrawerViewModelPreload(sync.preload)) {
        return sync.preload.viewModel;
    }
    if (!isChildSurface && isPersonDrawerViewModelPreload(sync.preload)) {
        return sync.preload.viewModel;
    }
    return null;
}

export function peekOpportunityDrawerDisplayVm(drawer: AdminDrawerState): OpportunityDrawerViewModel | null {
    if (drawer.type !== "opportunities" || !drawer.id || drawer.id === "new") return null;
    const sync = peekDrawerViewModelPreloadSync(
        buildPrepareParamsFromOpenDrawer({
            type: "opportunities",
            id: drawer.id,
            opportunityWorkspaceContext: drawer.opportunityWorkspaceContext ?? null,
            source: drawer.openSource ?? undefined,
        })
    );
    if (sync?.entityType === "opportunities" && isOpportunityDrawerViewModelPreload(sync.preload)) {
        return sync.preload.viewModel;
    }
    return null;
}
