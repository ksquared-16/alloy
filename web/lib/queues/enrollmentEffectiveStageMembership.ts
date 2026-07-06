/**
 * Effective-stage queue membership — the SAME rule the engine/metrics use, applied to the queue so
 * they cannot diverge. A child's lane is decided by its EFFECTIVE stage, never by status_key or OCM:
 *
 *   effective_stage = process_instances.stage_key ?? opportunity.stage_key
 *
 * So a freshly-created child (PI.stage_key = null) riding the family track appears in the lane of
 * its household's stage (e.g. Lead), and a branched child (PI.stage_key = waitlist) appears in the
 * Waitlist lane — with no reliance on the OCM disposition. Pure; unit-tested.
 */

export function piEffectiveStageKey(
    piStageKey: string | null | undefined,
    contextStageKey: string | null | undefined,
): string | null {
    const pi = typeof piStageKey === "string" ? piStageKey.trim() : "";
    if (pi) return pi;
    const ctx = typeof contextStageKey === "string" ? contextStageKey.trim() : "";
    return ctx || null;
}

/** True when a process instance belongs to a lane by effective stage (PI stage ?? context stage). */
export function processInstanceBelongsToLane(args: {
    piStageKey: string | null | undefined;
    contextStageKey: string | null | undefined;
    laneStageKey: string;
}): boolean {
    const lane = args.laneStageKey.trim();
    if (!lane) return false;
    return piEffectiveStageKey(args.piStageKey, args.contextStageKey) === lane;
}
