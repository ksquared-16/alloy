import { isDrawerViewModelPreload } from "@/lib/adminV2/viewModel/drawer/drawerViewModelPreloadTypes";
import type { PersonDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/person/types";

export type PersonDrawerOpenPreload = {
    personId: string;
    openPath: "view_model" | "legacy";
    viewModel?: PersonDrawerViewModel;
    primaryEntity: Record<string, unknown>;
    first_paint_settled: boolean;
};

export function isPersonDrawerViewModelPreload(
    preload: PersonDrawerOpenPreload | null | undefined
): preload is PersonDrawerOpenPreload & { openPath: "view_model"; viewModel: PersonDrawerViewModel } {
    return isDrawerViewModelPreload(preload) && preload.openPath === "view_model";
}

export function buildPersonDrawerOpenPreloadFromViewModel(
    viewModel: PersonDrawerViewModel
): PersonDrawerOpenPreload {
    const paintRecord: Record<string, unknown> = {
        ...viewModel.record,
        id: viewModel.entity.id,
        _record_surface: "full",
    };
    return {
        personId: viewModel.entity.id,
        openPath: "view_model",
        viewModel,
        primaryEntity: paintRecord,
        first_paint_settled: viewModel.first_paint.settled,
    };
}
