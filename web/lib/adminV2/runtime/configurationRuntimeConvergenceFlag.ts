/**
 * Configuration Runtime Phase 3A — convergence gate.
 *
 * When enabled, operator runtime consumes Business Process `perspectives_v1`
 * metadata (operational views) for navigation labels, ordering, visibility,
 * and runtime perspective mission/label merge.
 *
 * Default: OFF. Set `NEXT_PUBLIC_CONFIGURATION_RUNTIME_PHASE_3A=1`.
 */

import { ALLOY_OS_RUNTIME_ENABLED } from "@/lib/adminV2/runtime/alloyOsRuntimeFlag";

export const CONFIGURATION_RUNTIME_PHASE_3A_ENABLED =
    process.env.NEXT_PUBLIC_CONFIGURATION_RUNTIME_PHASE_3A === "1";

/** Operator Work View / perspectives rail — Phase 3A or Alloy OS runtime. */
export function operatorOperationalPerspectivesEnabled(): boolean {
    return CONFIGURATION_RUNTIME_PHASE_3A_ENABLED || ALLOY_OS_RUNTIME_ENABLED;
}

export const WORK_VIEW_PILL_SECTION_LABEL = "Work View";
