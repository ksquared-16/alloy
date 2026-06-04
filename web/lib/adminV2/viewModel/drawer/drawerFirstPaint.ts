import type { DrawerFirstPaintContract, DrawerFirstPaintDependencyState } from "@/lib/adminV2/viewModel/drawer/firstPaintTypes";

export function drawerFirstPaintDependenciesSettled<TKey extends string>(
    deps: DrawerFirstPaintDependencyState<TKey>[]
): boolean {
    return deps.every((d) => {
        if (d.disposition !== "first_paint_required") return true;
        return d.status === "ready" || d.status === "empty";
    });
}

export function drawerFirstPaintDependencySettled<TKey extends string>(
    contract: Pick<DrawerFirstPaintContract<TKey>, "settled" | "dependencies"> | null | undefined,
    key: TKey
): boolean {
    if (!contract?.settled) return false;
    const dep = contract.dependencies.find((d) => d.key === key);
    if (!dep) return false;
    return dep.status === "ready" || dep.status === "empty";
}

export function drawerFirstPaintDependencyData<TKey extends string, T>(
    data: Partial<Record<TKey, unknown>>,
    key: TKey
): T | undefined {
    return data[key] as T | undefined;
}

export function drawerViewModelFirstPaintSettled<TKey extends string, TSlot extends string>(
    vm: { first_paint?: DrawerFirstPaintContract<TKey, TSlot> } | null | undefined
): boolean {
    return vm?.first_paint?.settled === true;
}
