import type { ChildDrawerOpenPreload } from "@/lib/adminV2/viewModel/drawer/child/buildChildDrawerOpenPreloadFromViewModel";
import type { PersonDrawerOpenPreload } from "@/lib/adminV2/viewModel/drawer/person/buildPersonDrawerOpenPreloadFromViewModel";

export type PersonOrChildDrawerOpenPreload = PersonDrawerOpenPreload | ChildDrawerOpenPreload;

export function personDrawerPreloadSurface(
    preload: PersonOrChildDrawerOpenPreload | null | undefined
): string | null {
    return preload?.viewModel?.surface ?? null;
}
