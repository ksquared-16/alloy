import { isDrawerViewModelPreload } from "@/lib/adminV2/viewModel/drawer/drawerViewModelPreloadTypes";
import type { ChildDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/child/types";

export type ChildDrawerOpenPreload = {
    personId: string;
    openPath: "view_model" | "legacy";
    viewModel?: ChildDrawerViewModel;
    primaryEntity: Record<string, unknown>;
    first_paint_settled: boolean;
};

export function isChildDrawerViewModelPreload(
    preload: ChildDrawerOpenPreload | null | undefined
): preload is ChildDrawerOpenPreload & { openPath: "view_model"; viewModel: ChildDrawerViewModel } {
    return isDrawerViewModelPreload(preload) && preload.openPath === "view_model";
}

export function buildChildDrawerOpenPreloadFromViewModel(
    viewModel: ChildDrawerViewModel
): ChildDrawerOpenPreload {
    const paintRecord: Record<string, unknown> = {
        ...viewModel.record,
        id: viewModel.entity.id,
        _record_surface: "full",
        _drawer_presentation_emphasis: "child_lifecycle",
    };
    return {
        personId: viewModel.entity.id,
        openPath: "view_model",
        viewModel,
        primaryEntity: paintRecord,
        first_paint_settled: viewModel.first_paint.settled,
    };
}
