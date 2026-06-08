import { adminV2PersonDrawerVmCutoverEnabled } from "@/lib/adminV2/viewModel/drawer/drawerViewModelFeatureGates";
import { buildPersonDrawerOpenPreloadFromViewModel } from "@/lib/adminV2/viewModel/drawer/person/buildPersonDrawerOpenPreloadFromViewModel";
import { fetchPersonDrawerViewModelClient } from "@/lib/adminV2/viewModel/drawer/person/fetchPersonDrawerViewModelClient";
import type { PersonDrawerVmComposeDepth } from "@/lib/adminV2/viewModel/drawer/person/personDrawerVmComposeDepth";
import type { PersonDrawerOpenPreload } from "@/lib/adminV2/viewModel/drawer/person/buildPersonDrawerOpenPreloadFromViewModel";
import { drawerViewModelFirstPaintSettled } from "@/lib/adminV2/viewModel/drawer/drawerFirstPaint";

export type LoadPersonDrawerViaViewModelResult =
    | { ok: true; preload: PersonDrawerOpenPreload; compose_ms: number }
    | {
          ok: false;
          reason: "cutover_disabled" | "fetch_failed" | "skipped" | "not_structure_settled" | "composed_not_ready";
          skip_reason?: string;
      };

export async function loadPersonDrawerViaViewModel(
    personId: string,
    opts?: {
        openSource?: string | null;
        presentationEmphasis?: string | null;
        composeDepth?: PersonDrawerVmComposeDepth;
        init?: RequestInit;
    }
): Promise<LoadPersonDrawerViaViewModelResult> {
    if (!adminV2PersonDrawerVmCutoverEnabled()) {
        return { ok: false, reason: "cutover_disabled" };
    }

    const fetchResult = await fetchPersonDrawerViewModelClient(personId, {
        openSource: opts?.openSource,
        presentationEmphasis: opts?.presentationEmphasis,
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

    const preload = buildPersonDrawerOpenPreloadFromViewModel(viewModel);
    if (!preload.first_paint_settled) {
        return { ok: false, reason: "composed_not_ready" };
    }

    return { ok: true, preload, compose_ms: viewModel.timing.compose_ms };
}
