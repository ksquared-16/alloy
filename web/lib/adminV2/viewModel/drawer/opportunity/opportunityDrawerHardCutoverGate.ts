/** Emergency code rollback — set true to force legacy opportunity drawer everywhere. */
export const FORCE_LEGACY_OPPORTUNITY_DRAWER = false;

function envFlagTrue(name: string): boolean {
    if (typeof process === "undefined") return false;
    const v = process.env[name]?.trim().toLowerCase();
    return v === "1" || v === "true";
}

/** True when opportunity VM must not run (kill switch or code constant). */
export function opportunityDrawerVmKillSwitchActive(): boolean {
    if (FORCE_LEGACY_OPPORTUNITY_DRAWER) return true;
    return envFlagTrue("NEXT_PUBLIC_ADMINV2_DRAWER_VM_KILL_SWITCH");
}

/**
 * True when AdminV2 opportunity drawer uses VM runtime (default on).
 * Does not read NEXT_PUBLIC_ADMINV2_DRAWER_VM — use kill switch to roll back.
 */
export function opportunityDrawerHardCutoverEnabled(): boolean {
    return !opportunityDrawerVmKillSwitchActive();
}
