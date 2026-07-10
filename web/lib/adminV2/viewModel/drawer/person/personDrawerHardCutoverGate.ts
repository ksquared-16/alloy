/** VM cutover is permanent — deployment rollback replaces kill-switch rollback. */
export function personDrawerVmKillSwitchActive(): boolean {
    return false;
}

/** True when AdminV2 person drawer uses VM runtime. */
export function personDrawerHardCutoverEnabled(): boolean {
    return true;
}
