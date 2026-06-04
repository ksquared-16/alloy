/** Emergency code rollback — set true to force legacy child drawer everywhere. */
export const FORCE_LEGACY_CHILD_DRAWER = false;

function envFlagTrue(name: string): boolean {
    if (typeof process === "undefined") return false;
    const v = process.env[name]?.trim().toLowerCase();
    return v === "1" || v === "true";
}

/** True when child VM must not run (kill switch or code constant). */
export function childDrawerVmKillSwitchActive(): boolean {
    if (FORCE_LEGACY_CHILD_DRAWER) return true;
    return envFlagTrue("NEXT_PUBLIC_ADMINV2_CHILD_DRAWER_VM_KILL_SWITCH");
}

/**
 * True when AdminV2 child drawer uses VM runtime (default on).
 * Does not require NEXT_PUBLIC_ADMINV2_CHILD_DRAWER_VM — use kill switch to roll back.
 */
export function childDrawerHardCutoverEnabled(): boolean {
    return !childDrawerVmKillSwitchActive();
}
