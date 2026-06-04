/**
 * Client cutover gate — opportunity drawer renders from settled VM when enabled.
 * Default off; legacy composed-open path remains authoritative when disabled.
 */
export function adminV2DrawerViewModelCutoverEnabled(): boolean {
    if (typeof process === "undefined") return false;
    const v = process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM?.trim().toLowerCase();
    return v === "1" || v === "true";
}
