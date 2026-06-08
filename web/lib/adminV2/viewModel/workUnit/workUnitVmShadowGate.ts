/**
 * WU-VM-1 shadow compose gate — no user-visible or ownership changes when disabled.
 */
export function adminV2WorkUnitViewModelShadowEnabled(): boolean {
    if (typeof process === "undefined") return false;
    const v = process.env.NEXT_PUBLIC_ADMINV2_WORK_UNIT_VM_SHADOW?.trim().toLowerCase();
    return v === "1" || v === "true";
}
