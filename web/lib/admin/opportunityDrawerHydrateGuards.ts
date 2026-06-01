/**
 * Per-opportunity drawer entity hydrate guards — ensures primary/full GET each run once per open.
 * Reset via `resetOpportunityDrawerHydrateGuards` when drawer entity identity changes.
 */

export type OpportunityDrawerHydratePhase = "primary" | "full";

function normalizeOpportunityHydrateId(opportunityId: string | null | undefined): string {
    return (opportunityId ?? "").trim();
}

/** Resolved open opportunity id for hydrate guards (excludes `new` and null drawer state). */
export function resolveOpportunityHydrateId(
    entityType: string | null | undefined,
    entityId: string | null | undefined
): string | null {
    if (entityType !== "opportunities") return null;
    const id = normalizeOpportunityHydrateId(entityId);
    if (!id || id === "new") return null;
    return id;
}

const primaryInflight = new Set<string>();
const fullInflight = new Set<string>();
const primaryDone = new Set<string>();
const fullDone = new Set<string>();
const fullScheduled = new Set<string>();

export function resetOpportunityDrawerHydrateGuards(opportunityId: string | null | undefined): void {
    const id = normalizeOpportunityHydrateId(opportunityId);
    if (!id) return;
    primaryInflight.delete(id);
    fullInflight.delete(id);
    primaryDone.delete(id);
    fullDone.delete(id);
    fullScheduled.delete(id);
}

/** @returns false when this phase already completed or is in flight for this opportunity id */
export function tryBeginOpportunityDrawerHydrate(
    opportunityId: string | null | undefined,
    phase: OpportunityDrawerHydratePhase
): boolean {
    const id = normalizeOpportunityHydrateId(opportunityId);
    if (!id) return false;
    const done = phase === "primary" ? primaryDone : fullDone;
    const inflight = phase === "primary" ? primaryInflight : fullInflight;
    if (done.has(id) || inflight.has(id)) return false;
    inflight.add(id);
    return true;
}

export function finishOpportunityDrawerHydrate(
    opportunityId: string | null | undefined,
    phase: OpportunityDrawerHydratePhase,
    outcome: "success" | "abort" | "fail"
): void {
    const id = normalizeOpportunityHydrateId(opportunityId);
    if (!id) return;
    const inflight = phase === "primary" ? primaryInflight : fullInflight;
    const done = phase === "primary" ? primaryDone : fullDone;
    inflight.delete(id);
    if (outcome === "success") {
        done.add(id);
    }
    // "fail" is treated as "abort" for the full-surface phase so that a transient network
    // error does not permanently prevent the full hydrate from retrying on the next open.
    // The primary phase still marks done on fail (primary failure shows an error state).
    if (outcome === "fail" && phase === "primary") {
        done.add(id);
    }
    // For full-phase failures: inflight is already cleared above; done is NOT set, allowing
    // tryBeginOpportunityDrawerHydrate to succeed on the next attempt.
}

/** Background full hydrate scheduling — one idle schedule per open. */
export function tryScheduleOpportunityDrawerBackgroundFull(opportunityId: string | null | undefined): boolean {
    const id = normalizeOpportunityHydrateId(opportunityId);
    if (!id) return false;
    if (fullDone.has(id) || fullInflight.has(id) || fullScheduled.has(id)) return false;
    fullScheduled.add(id);
    return true;
}

export function clearOpportunityDrawerBackgroundFullSchedule(opportunityId: string | null | undefined): void {
    const id = normalizeOpportunityHydrateId(opportunityId);
    if (!id) return;
    fullScheduled.delete(id);
}

/** Pre-open coordinator finished primary — skip duplicate GET on drawer mount. */
export function markOpportunityDrawerHydrateDone(
    opportunityId: string | null | undefined,
    phase: OpportunityDrawerHydratePhase
): void {
    const id = normalizeOpportunityHydrateId(opportunityId);
    if (!id) return;
    const inflight = phase === "primary" ? primaryInflight : fullInflight;
    const done = phase === "primary" ? primaryDone : fullDone;
    inflight.delete(id);
    done.add(id);
}

/** User/refetch-driven refresh — allows one new `surface=full` for this open. */
export function allowOpportunityDrawerFullRefetch(opportunityId: string | null | undefined): void {
    const id = normalizeOpportunityHydrateId(opportunityId);
    if (!id) return;
    fullDone.delete(id);
    fullInflight.delete(id);
    fullScheduled.delete(id);
}
