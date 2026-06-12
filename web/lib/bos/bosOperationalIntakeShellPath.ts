/**
 * Production Operational Intake shell — horizontal stadium with restrained top-center swell.
 * 90% stadium · 10% cloud influence (geometry only, not illustrated cloud art).
 *
 * @see docs/system/bos-operational-intake-shell-doctrine.md
 */

/** Top-center swell as a fraction of panel height — keep subtle (~1%). */
export const BOS_OPERATIONAL_INTAKE_SHELL_SWELL_RATIO = 0.01;

/** Horizontal spread of top swell as a fraction of panel width. */
export const BOS_OPERATIONAL_INTAKE_SHELL_SWELL_SPREAD = 0.2;

/** Bend Pine perimeter stroke — noticeable only on second look. */
export const BOS_OPERATIONAL_INTAKE_SHELL_STROKE = "rgba(0, 162, 131, 0.38)";

/** Outer atmospheric haze — outside perimeter, non-directional fog. */
export const BOS_SHELL_OUTER_HAZE_STYLE = {
    background:
        "radial-gradient(ellipse 92% 78% at 50% 46%, rgba(0, 162, 131, 0.055), rgba(0, 162, 131, 0.018) 42%, transparent 72%)",
    filter: "blur(22px)",
    opacity: 0.65,
} as const;

/**
 * SVG path for the locked operational intake shell.
 * Rectangular interior safe area; only the outer perimeter follows this curve.
 */
export function buildOperationalIntakeShellPath(
    width: number,
    height: number,
    options?: { swellRatio?: number; swellSpread?: number },
): string {
    if (width <= 1 || height <= 1) return "";

    const swellRatio = options?.swellRatio ?? BOS_OPERATIONAL_INTAKE_SHELL_SWELL_RATIO;
    const swellSpread = options?.swellSpread ?? BOS_OPERATIONAL_INTAKE_SHELL_SWELL_SPREAD;

    const r = Math.min(height / 2, width * 0.42);
    const cx = width / 2;
    const swell = height * swellRatio;
    const topBase = swell * 0.42;
    const spread = width * swellSpread;
    const peakY = Math.max(0, topBase - swell);

    const left = r;
    const right = width - r;
    const bottom = height - topBase;

    return [
        `M ${left} ${topBase}`,
        `L ${cx - spread} ${topBase}`,
        `Q ${cx} ${peakY} ${cx + spread} ${topBase}`,
        `L ${right} ${topBase}`,
        `A ${r} ${r} 0 0 1 ${right} ${bottom}`,
        `L ${left} ${bottom}`,
        `A ${r} ${r} 0 0 1 ${left} ${topBase}`,
        "Z",
    ].join(" ");
}
