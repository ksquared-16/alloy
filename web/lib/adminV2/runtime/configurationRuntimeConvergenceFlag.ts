/**
 * Configuration Runtime Phase 3A — convergence gate.
 *
 * When enabled, operator runtime consumes Business Process `perspectives_v1`
 * metadata (operational views) for navigation labels, ordering, visibility,
 * and runtime perspective mission/label merge.
 *
 * Default: OFF. Set `NEXT_PUBLIC_CONFIGURATION_RUNTIME_PHASE_3A=1`.
 */

export const CONFIGURATION_RUNTIME_PHASE_3A_ENABLED =
    process.env.NEXT_PUBLIC_CONFIGURATION_RUNTIME_PHASE_3A === "1";

/** Operator Work View / perspectives rail — always enabled (Alloy OS runtime is unconditionally on). */
export function operatorOperationalPerspectivesEnabled(): boolean {
    return true;
}

export const WORK_VIEW_PILL_SECTION_LABEL = "Work View";
