/**
 * Staffing sufficiency — the ONLY place demand and supply are compared.
 *
 *   sufficient  scheduled supply meets or exceeds required demand
 *   short       demand is known and supply does not meet it
 *   idle        no demand and no supply — the room is not operating
 *   unknown     the platform cannot truthfully answer
 *
 * `unknown` is a first-class answer, not a failure mode. Required staff is null
 * whenever the room·day has no resolvable ratio configuration, and a roster that
 * renders green because the backend could not compute is worse than one that
 * says so. This replaces a hardcoded `staffReady: true`.
 *
 * This function compares; it does not decide policy. Ratio tiers, age bands and
 * capacity all live in the configured ratio/capacity model that produced
 * `requiredStaff`. Nothing here invents a qualification rule.
 */

export type StaffingSufficiency = "sufficient" | "short" | "unknown" | "idle";

/**
 * Interpret the ratio engine's answer as a DEMAND, or null when it could not
 * resolve one.
 *
 * `requiredStaffForChildren` returns `{ requiredStaff: 0, exceedsDefinedTiers: true }`
 * when a room has children but NO ratio tier applies. Taken at face value that is
 * a demand of zero — and zero demand is satisfied by any supply, so an entirely
 * unconfigured room would render as fully staffed. That is the exact fake-green
 * failure the sufficiency contract exists to prevent.
 *
 * The three cases the engine actually expresses:
 *   childCount === 0                          → demand really is 0
 *   0 children-covering tiers, children > 0   → demand UNRESOLVABLE → null
 *   over the highest tier                     → demand known (top tier) and breached
 */
export function resolveRequiredStaffDemand(input: {
    requiredStaff: number | null | undefined;
    exceedsDefinedTiers: boolean;
    childCount: number;
}): number | null {
    const { requiredStaff, exceedsDefinedTiers, childCount } = input;
    if (requiredStaff == null) return null;
    if (childCount <= 0) return requiredStaff;
    // Children present, zero required, and no tier covered them: not configured.
    if (requiredStaff === 0 && exceedsDefinedTiers) return null;
    return requiredStaff;
}

export type ResolveStaffingSufficiencyInput = {
    /** Demand from the ratio model. Null when it could not be resolved. */
    requiredStaff: number | null;
    /** Supply from committed staff assignments. Null when supply was not evaluated. */
    scheduledStaffCount: number | null;
};

export function resolveStaffingSufficiency(input: ResolveStaffingSufficiencyInput): StaffingSufficiency {
    const { requiredStaff, scheduledStaffCount } = input;
    if (requiredStaff == null) return "unknown";
    if (scheduledStaffCount == null) return "unknown";
    // No demand AND no supply: the room is not operating. Mathematically this is
    // "satisfied", but rendering an idle or unconfigured room green makes a
    // closed campus look uniformly healthy and hides the rooms that matter.
    // Idle is a distinct, visually neutral state — not a flavour of sufficient.
    if (requiredStaff === 0 && scheduledStaffCount === 0) return "idle";
    return scheduledStaffCount >= requiredStaff ? "sufficient" : "short";
}

/**
 * Roll a set of cell verdicts into one summary.
 *
 * Deliberately pessimistic in a specific order: any `short` makes the whole
 * summary `short`; otherwise any `unknown` makes it `unknown`. A summary is only
 * `sufficient` when every cell was evaluated and every cell was met — so partial
 * knowledge can never read as staffed.
 */
export function rollUpStaffingSufficiency(
    verdicts: readonly StaffingSufficiency[]
): StaffingSufficiency {
    if (verdicts.length === 0) return "unknown";
    if (verdicts.includes("short")) return "short";
    if (verdicts.includes("unknown")) return "unknown";
    // A site where every room is idle is idle, not staffed.
    if (verdicts.every((v) => v === "idle")) return "idle";
    return "sufficient";
}
