/** VM cutover is permanent — deployment rollback replaces kill-switch rollback. */
export function childDrawerVmKillSwitchActive(): boolean {
    return false;
}

/** True when AdminV2 child drawer uses VM runtime. */
export function childDrawerHardCutoverEnabled(): boolean {
    return true;
}
