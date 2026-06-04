import type { PersonOrChildDrawerOpenPreload } from "@/lib/adminV2/viewModel/drawer/drawerPersonOpenPreloadUnion";
import type { ChildDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/child/types";

export type ChildDrawerOpenPreload = {
    personId: string;
    openPath: "view_model" | "legacy";
    viewModel?: ChildDrawerViewModel;
    primaryEntity: Record<string, unknown>;
    first_paint_settled: boolean;
};

export function isChildDrawerViewModelPreload(
    preload: PersonOrChildDrawerOpenPreload | null | undefined
): preload is ChildDrawerOpenPreload & { openPath: "view_model"; viewModel: ChildDrawerViewModel } {
    if (!preload || preload.openPath !== "view_model" || !preload.viewModel) return false;
    return preload.viewModel.surface === "child";
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
