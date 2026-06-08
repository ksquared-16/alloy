/** Emergency code rollback — set true to force legacy person drawer everywhere. */
export const FORCE_LEGACY_PERSON_DRAWER = false;

function envFlagTrue(name: string): boolean {
    if (typeof process === "undefined") return false;
    const v = process.env[name]?.trim().toLowerCase();
    return v === "1" || v === "true";
}

/** True when person VM must not run (kill switch or code constant). */
export function personDrawerVmKillSwitchActive(): boolean {
    if (FORCE_LEGACY_PERSON_DRAWER) return true;
    return envFlagTrue("NEXT_PUBLIC_ADMINV2_PERSON_DRAWER_VM_KILL_SWITCH");
}

/**
 * True when AdminV2 person drawer uses VM runtime (default on).
 * Does not require NEXT_PUBLIC_ADMINV2_PERSON_DRAWER_VM — use kill switch to roll back.
 */
export function personDrawerHardCutoverEnabled(): boolean {
    return !personDrawerVmKillSwitchActive();
}
