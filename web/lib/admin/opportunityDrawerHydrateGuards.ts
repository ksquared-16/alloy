/**
 * Per-opportunity drawer entity hydrate guards — ensures primary/full GET each run once per open.
 * Reset via `resetOpportunityDrawerHydrateGuards` when drawer entity identity changes.
 */

export type OpportunityDrawerHydratePhase = "primary" | "full";

const primaryInflight = new Set<string>();
const fullInflight = new Set<string>();
const primaryDone = new Set<string>();
const fullDone = new Set<string>();
const fullScheduled = new Set<string>();

export function resetOpportunityDrawerHydrateGuards(opportunityId: string): void {
    primaryInflight.delete(opportunityId);
    fullInflight.delete(opportunityId);
    primaryDone.delete(opportunityId);
    fullDone.delete(opportunityId);
    fullScheduled.delete(opportunityId);
}

/** @returns false when this phase already completed or is in flight for this opportunity id */
export function tryBeginOpportunityDrawerHydrate(
    opportunityId: string,
    phase: OpportunityDrawerHydratePhase
): boolean {
    const id = opportunityId.trim();
    if (!id) return false;
    const done = phase === "primary" ? primaryDone : fullDone;
    const inflight = phase === "primary" ? primaryInflight : fullInflight;
    if (done.has(id) || inflight.has(id)) return false;
    inflight.add(id);
    return true;
}

export function finishOpportunityDrawerHydrate(
    opportunityId: string,
    phase: OpportunityDrawerHydratePhase,
    outcome: "success" | "abort" | "fail"
): void {
    const id = opportunityId.trim();
    if (!id) return;
    const inflight = phase === "primary" ? primaryInflight : fullInflight;
    const done = phase === "primary" ? primaryDone : fullDone;
    inflight.delete(id);
    if (outcome === "success") done.add(id);
    if (outcome === "fail") done.add(id);
}

/** Background full hydrate scheduling — one idle schedule per open. */
export function tryScheduleOpportunityDrawerBackgroundFull(opportunityId: string): boolean {
    const id = opportunityId.trim();
    if (!id) return false;
    if (fullDone.has(id) || fullInflight.has(id) || fullScheduled.has(id)) return false;
    fullScheduled.add(id);
    return true;
}

export function clearOpportunityDrawerBackgroundFullSchedule(opportunityId: string): void {
    fullScheduled.delete(opportunityId.trim());
}

/** User/refetch-driven refresh — allows one new `surface=full` for this open. */
export function allowOpportunityDrawerFullRefetch(opportunityId: string): void {
    const id = opportunityId.trim();
    if (!id) return;
    fullDone.delete(id);
    fullInflight.delete(id);
    fullScheduled.delete(id);
}
