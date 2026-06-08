import { adminV2ChildDrawerVmCutoverEnabled } from "@/lib/adminV2/viewModel/drawer/drawerViewModelFeatureGates";
import { buildChildDrawerOpenPreloadFromViewModel } from "@/lib/adminV2/viewModel/drawer/child/buildChildDrawerOpenPreloadFromViewModel";
import { fetchChildDrawerViewModelClient } from "@/lib/adminV2/viewModel/drawer/child/fetchChildDrawerViewModelClient";
import type { PersonDrawerVmComposeDepth } from "@/lib/adminV2/viewModel/drawer/person/personDrawerVmComposeDepth";
import type { ChildDrawerOpenPreload } from "@/lib/adminV2/viewModel/drawer/child/buildChildDrawerOpenPreloadFromViewModel";
import { drawerViewModelFirstPaintSettled } from "@/lib/adminV2/viewModel/drawer/drawerFirstPaint";

export type LoadChildDrawerViaViewModelResult =
    | { ok: true; preload: ChildDrawerOpenPreload; compose_ms: number }
    | {
          ok: false;
          reason: "cutover_disabled" | "fetch_failed" | "skipped" | "not_structure_settled" | "composed_not_ready";
          skip_reason?: string;
      };

export async function loadChildDrawerViaViewModel(
    personId: string,
    opts?: { composeDepth?: PersonDrawerVmComposeDepth; init?: RequestInit }
): Promise<LoadChildDrawerViaViewModelResult> {
    if (!adminV2ChildDrawerVmCutoverEnabled()) {
        return { ok: false, reason: "cutover_disabled" };
    }

    const fetchResult = await fetchChildDrawerViewModelClient(personId, {
        composeDepth: opts?.composeDepth ?? "first_paint",
        init: opts?.init,
    });
    if (!fetchResult.ok) {
        if ("skipped" in fetchResult && fetchResult.skipped) {
            return { ok: false, reason: "skipped", skip_reason: fetchResult.skipped.reason };
        }
        return { ok: false, reason: "fetch_failed" };
    }

    const { viewModel } = fetchResult;
    if (!viewModel.structureSettled || !drawerViewModelFirstPaintSettled({ first_paint: viewModel.first_paint })) {
        return { ok: false, reason: "not_structure_settled" };
    }

    const preload = buildChildDrawerOpenPreloadFromViewModel(viewModel);
    if (!preload.first_paint_settled) {
        return { ok: false, reason: "composed_not_ready" };
    }

    return { ok: true, preload, compose_ms: viewModel.timing.compose_ms };
}
