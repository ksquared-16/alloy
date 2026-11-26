/**
 * Command-session layout density from BOS presentation state.
 * Pinned = compact single column; floating/expanded = fuller workspace.
 */
export type BosCommandSessionLayoutDensity = "expanded" | "compact";

export function resolveBosCommandSessionLayoutDensity(
    presentationEffective: string | null | undefined
): BosCommandSessionLayoutDensity {
    return presentationEffective === "pinned" ? "compact" : "expanded";
}
