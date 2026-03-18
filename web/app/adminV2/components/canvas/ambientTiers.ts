/**
 * Ambient intensity hierarchy (adminV2 canvas only).
 * company < department (~+30% vs prior dept steady) < manager (~+50% vs company target).
 */

/** Chamber node data.intensity (drives root opacity floor in ChamberAmbientNode). */
export const AMBIENT_CHAMBER_INTENSITY = 1;

/** Focus ambient after department activation (brief peak). */
export const AMBIENT_FOCUS_DEPARTMENT_ENTER = 1.02;

/**
 * Steady department focus (~0.74 * 1.3). Capped in AmbientFocusNode for department tier.
 */
export const AMBIENT_FOCUS_DEPARTMENT_STEADY = 0.962;

/** Manager-selected focus — strongest tier (~1.5× prior company-equivalent ~0.74). */
export const AMBIENT_FOCUS_MANAGER_STEADY = 1.12;

export const AMBIENT_FOCUS_MAX_DEPARTMENT = 1.14;
export const AMBIENT_FOCUS_MAX_MANAGER = 1.22;

/** Initial focus ambient before activation (scaled with new dept baseline). */
export const AMBIENT_FOCUS_INITIAL = 0.72;

/** Activation pulse while tile is activating. */
export const AMBIENT_FOCUS_ACTIVATING = 1.04;

export function isManagerAmbientNodeId(nodeId: string | null): boolean {
  return nodeId != null && nodeId.startsWith("mgr-");
}
