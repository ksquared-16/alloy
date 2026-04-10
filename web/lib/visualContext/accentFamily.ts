/**
 * Lane-level micro-bias on layer strength (not a separate color system).
 * Applied in `contextStyle.ts` after operational context resolution.
 */
export function laneKeyToVisualBias(laneKey: string | null | undefined): number {
    if (!laneKey) return 0;
    switch (laneKey) {
        case "scheduled_today":
            return 0.12;
        case "needs_attention":
            return 0.08;
        case "unassigned":
            return 0.04;
        default:
            return 0;
    }
}
