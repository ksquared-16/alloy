/**
 * Client shadow gate — VM diff runs only when explicitly enabled.
 * Default off; does not affect drawer open path latency when disabled.
 */
export function adminV2DrawerViewModelShadowEnabled(): boolean {
    if (typeof process === "undefined") return false;
    const v = process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM_SHADOW?.trim().toLowerCase();
    return v === "1" || v === "true";
}
