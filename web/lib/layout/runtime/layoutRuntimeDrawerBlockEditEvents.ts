/** Notify layout-runtime block edit providers when drawer save/revert completes. */

export const LAYOUT_RUNTIME_DRAWER_SAVED_EVENT = "layout-runtime-drawer-saved";
export const LAYOUT_RUNTIME_DRAWER_REVERTED_EVENT = "layout-runtime-drawer-reverted";

export function dispatchLayoutRuntimeDrawerSaved(): void {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(LAYOUT_RUNTIME_DRAWER_SAVED_EVENT));
}

export function dispatchLayoutRuntimeDrawerReverted(): void {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(LAYOUT_RUNTIME_DRAWER_REVERTED_EVENT));
}
