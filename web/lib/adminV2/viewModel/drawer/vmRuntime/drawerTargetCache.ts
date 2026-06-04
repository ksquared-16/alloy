import type { OpenDrawerParams } from "@/contexts/AdminDrawerContext";
import {
    buildPrepareParamsFromOpenDrawer,
    peekDrawerViewModelPreloadSync,
} from "@/lib/adminV2/viewModel/drawer/drawerShellPinnedModelSwap";
import { logDrawerVmRuntimeDiagnostic } from "@/lib/adminV2/viewModel/drawer/drawerVmRuntimeDiagnostics";
import type { DrawerLinkPendingActions } from "@/lib/adminV2/viewModel/drawer/vmRuntime/drawerLinkPending";

/** True when VM session cache can satisfy an instant drawer swap for these open params. */
export function isDrawerTargetWarm(params: OpenDrawerParams): boolean {
    return peekDrawerViewModelPreloadSync(buildPrepareParamsFromOpenDrawer(params)) != null;
}

export function logDrawerTargetCachePeek(
    params: OpenDrawerParams,
    surface: "drawer_link" | "queue_row_open" | "model_swap"
): boolean {
    const warm = isDrawerTargetWarm(params);
    logDrawerVmRuntimeDiagnostic(warm ? "drawer_target_cache_hit" : "drawer_target_cache_miss", {
        entity_type: params.type,
        entity_id: params.id,
        open_source: params.source ?? null,
        surface,
    });
    return warm;
}

/** Begin inline link pending only when target VM is not warm; ignore duplicate pending key. */
export function beginDrawerLinkPendingIfCold(
    actions: DrawerLinkPendingActions | undefined,
    pendingKey: string,
    params: OpenDrawerParams
): boolean {
    if (!actions) return false;
    if (isDrawerTargetWarm(params)) return false;
    if (actions.isPending(pendingKey)) return true;
    actions.begin(pendingKey);
    return true;
}
