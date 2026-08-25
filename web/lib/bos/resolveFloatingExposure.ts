/**
 * WHETHER AN AUTOMATICALLY PLACED FLOATING BOS RAIL MAY BE SHOWN.
 *
 * The rail is a portaled fixed overlay that parks itself away from the page's obstacles. On a cold
 * direct boot the first park runs before the Work Unit has revealed, so it measures a page whose
 * content does not exist yet and lands 495 px from where it settles — measured as rail-attributed
 * CLS 0.1743, 97% of the page's total, a horizontal jump seconds after load.
 *
 * Placement arithmetic is not the problem and is untouched. What was missing is a rule for when a
 * placement is trustworthy enough to SHOW. Two things make it so, and neither is a timer:
 *
 *   - the canvas has been measured, so the geometry has been clamped to a real viewport;
 *   - a park has committed for the current reveal epoch while that epoch was terminal.
 *
 * Two placements are never provisional and must never be withheld:
 *
 *   - a non-floating mode, which the shell lays out rather than collision measurement;
 *   - a geometry the operator positioned themselves, which is their decision, not a guess.
 *
 * And the gate is scoped to the canvases where the defect is proven. Measured rail CLS on a cold
 * direct boot: expanded 0.1743, compact 0.00885, constrained ZERO. Gating `constrained` is not free
 * — holding that rail back exposed a different, mobile-only geometry change the early-visible rail
 * had already settled through. A gate applied where there is no defect can create one.
 */

export type AdaptiveCanvas = "expanded" | "compact" | "constrained";

export type FloatingExposureInput = {
    /** Resolved presentation mode; only `floating` is automatically placed. */
    effective: string | undefined;
    canvas: AdaptiveCanvas;
    /** The operator dragged/sized the window themselves. */
    operatorPositioned: boolean;
    /** The ambient measurement has clamped geometry to a real viewport at least once. */
    ambientMeasured: boolean;
    /** Reveal epoch whose park has committed, or null when no trustworthy park exists yet. */
    parkedRevealEpoch: number | null;
};

export function resolveFloatingExposure(input: FloatingExposureInput): boolean {
    if (input.effective !== "floating") return true;
    if (input.operatorPositioned) return true;
    if (input.canvas === "constrained") return true;
    return input.ambientMeasured && input.parkedRevealEpoch !== null;
}
