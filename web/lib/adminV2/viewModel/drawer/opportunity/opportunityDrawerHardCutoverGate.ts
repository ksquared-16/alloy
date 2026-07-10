/** VM cutover is permanent — deployment rollback replaces kill-switch rollback. */
export function opportunityDrawerVmKillSwitchActive(): boolean {
    return false;
}

/** True when AdminV2 opportunity drawer uses VM runtime. */
export function opportunityDrawerHardCutoverEnabled(): boolean {
    return true;
}
