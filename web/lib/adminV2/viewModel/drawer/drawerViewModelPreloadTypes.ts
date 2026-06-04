/** Shared preload conventions for drawer VM open paths. */

export type DrawerViewModelOpenPath = "view_model" | "legacy";

export type DrawerViewModelPreloadBase<TViewModel> = {
    openPath: DrawerViewModelOpenPath;
    viewModel?: TViewModel;
    primaryEntity: Record<string, unknown>;
};

export function isDrawerViewModelPreload<TViewModel>(
    preload: { openPath?: string | null; viewModel?: TViewModel | null } | null | undefined
): preload is DrawerViewModelPreloadBase<TViewModel> & { openPath: "view_model"; viewModel: TViewModel } {
    return preload?.openPath === "view_model" && preload.viewModel != null;
}
