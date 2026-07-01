/**
 * Drawer Performance Contract (Card 3) — the reusable, registry-driven first-paint + hydration
 * model that all entity drawers (and, later, config-driven layouts) inherit automatically.
 *
 * PRODUCT INVARIANTS (every drawer/section must satisfy these — enforced by the generic engine,
 * not re-implemented per type):
 *   1. Initial open is stable and complete: first-paint-critical content paints together.
 *   2. Repeat open reuses cached/snapshot data (no cold reload).
 *   3. Drawer-to-drawer never feels cold.
 *   4. Above-fold content never lazy-loads section-by-section.
 *   5. Background hydration is INVISIBLE only: no layout shift, no pop-in, no section reorder,
 *      no re-reveal flicker. "Needs background hydrate" must NOT block reuse or paint.
 *   6. New drawer sections / config layout sections inherit this model automatically.
 *
 * HOW A NEW DRAWER TYPE INHERITS (zero new performance logic — see Card 3 acceptance #10):
 *   A future Customer / Associate / Agent drawer only calls `registerDrawerTypeContract({...})`
 *   with its first-paint contract (`aboveFoldComplete`) and section classifications (`sections`).
 *   It then inherits instant warm reopen, monotonic snapshots, and invisible background hydration
 *   WITHOUT editing the coordinator, the snapshot cache, or the AdminEntityDrawer restore logic.
 *   Unregistered types fall back to current behavior and are never made worse (fallback rule).
 */

import { drawerSurfaceRank, isFullDrawerSurface } from "@/lib/admin/drawer/drawerSurfaceRank";
import { opportunityDrawerComposedAboveFoldReady } from "@/lib/admin/drawer/drawerAboveFoldCoordinatedReveal";
import {
    parentDrawerSummaryCoordinatedReady,
    childDrawerSummaryCoordinatedReady,
} from "@/lib/admin/drawer/drawerAboveFoldCoordinatedReveal";
import { snapshotNeedsFullRevalidate } from "@/lib/admin/drawer/opportunityDrawerRecordNeedsRevalidate";
import { OPPORTUNITY_ABOVE_FOLD_RECORD_KEYS } from "@/lib/admin/drawer/opportunityFullHydrateMerge";

export type DrawerSnapshotRecord = Record<string, unknown>;

/** Whether a section must be present at first paint or may hydrate invisibly afterward. */
export type DrawerSectionPaintClass = "first_paint_critical" | "background_only";

/** Per-section classification a drawer/layout declares; drives first-paint vs invisible-hydrate. */
export interface DrawerSectionContract {
    key: string;
    paintClass: DrawerSectionPaintClass;
    /** Above the fold = visible on open; must never pop in after paint when first_paint_critical. */
    aboveFold: boolean;
}

/** The only thing a new drawer type provides: first-paint contract + section classifications. */
export interface DrawerTypeContract {
    type: string;
    /** True when every first-paint-critical / above-fold section can render with final data. */
    aboveFoldComplete: (record: DrawerSnapshotRecord, drawerId: string | null | undefined) => boolean;
    /** True when below-fold/background data is still pending (filled invisibly; never blocks reuse). */
    backgroundHydratePending?: (record: DrawerSnapshotRecord) => boolean;
    /**
     * Record keys that render above the fold (first-paint-critical). Background/deferred merges
     * must never MOVE these once painted — runtime patch-safety enforces this.
     */
    firstPaintCriticalRecordKeys?: ReadonlySet<string>;
    /** Section classifications (consumed by future config-layout hydration; documented now). */
    sections?: DrawerSectionContract[];
}

const registry = new Map<string, DrawerTypeContract>();

export function registerDrawerTypeContract(contract: DrawerTypeContract): void {
    registry.set(contract.type, contract);
}

export function getDrawerTypeContract(type: string | null | undefined): DrawerTypeContract | null {
    if (!type) return null;
    return registry.get(type) ?? null;
}

/* ----------------------------- Generic predicates ----------------------------- */

/** Reuse/paint eligibility: above-fold sections have final data. Unregistered types → false. */
export function drawerSnapshotAboveFoldComplete(
    type: string,
    record: DrawerSnapshotRecord | null | undefined,
    drawerId: string | null | undefined
): boolean {
    const contract = getDrawerTypeContract(type);
    if (!contract || !record || typeof record !== "object") return false;
    return contract.aboveFoldComplete(record, drawerId);
}

/** Invisible background work still pending. Drives the targeted overlay, NOT reuse/paint. */
export function drawerSnapshotBackgroundHydratePending(
    type: string,
    record: DrawerSnapshotRecord | null | undefined
): boolean {
    const contract = getDrawerTypeContract(type);
    if (!contract || !record || typeof record !== "object" || !contract.backgroundHydratePending) {
        return false;
    }
    return contract.backgroundHydratePending(record);
}

/**
 * Strong reuse: a `full` snapshot whose above-fold is complete — reuse it for instant paint even
 * if below-fold/background (e.g. member graph) is still pending. Unregistered/non-full → false.
 */
export function drawerSnapshotReuseEligible(
    type: string,
    record: DrawerSnapshotRecord | null | undefined,
    drawerId: string | null | undefined
): boolean {
    if (!record || typeof record !== "object") return false;
    if (String((record as { id?: unknown }).id ?? "").trim() !== String(drawerId ?? "").trim()) return false;
    if (!isFullDrawerSurface(record)) return false;
    return drawerSnapshotAboveFoldComplete(type, record, drawerId);
}

/** Re-export so consumers can rank/keep monotonic snapshots through one contract surface. */
export { drawerSurfaceRank, isFullDrawerSurface };

/* ------------------------------ Built-in adapters ------------------------------ */
/* Adapters delegate to EXISTING readiness/predicate logic — no new readiness rules are invented. */

registerDrawerTypeContract({
    type: "opportunities",
    aboveFoldComplete: (record, drawerId) =>
        opportunityDrawerComposedAboveFoldReady({
            primaryEntity: record,
            opportunityId: String(drawerId ?? ""),
            inquiryChildrenSectionVisible: true,
        }),
    backgroundHydratePending: (record) => snapshotNeedsFullRevalidate(record),
    firstPaintCriticalRecordKeys: OPPORTUNITY_ABOVE_FOLD_RECORD_KEYS,
    // Representative classifications; the full registry-driven merge is a later layout-config card.
    sections: [
        { key: "header_title", paintClass: "first_paint_critical", aboveFold: true },
        { key: "status", paintClass: "first_paint_critical", aboveFold: true },
        { key: "family_contacts", paintClass: "first_paint_critical", aboveFold: true },
        { key: "inquiry_children", paintClass: "first_paint_critical", aboveFold: true },
        { key: "relationship_member_persons", paintClass: "background_only", aboveFold: false },
        { key: "operational_attention", paintClass: "background_only", aboveFold: false },
        { key: "activity", paintClass: "background_only", aboveFold: false },
    ],
});

registerDrawerTypeContract({
    type: "persons",
    // Parent/child summary readiness reuse the existing coordinated-reveal predicates.
    aboveFoldComplete: (record) =>
        parentDrawerSummaryCoordinatedReady(record) || childDrawerSummaryCoordinatedReady(record),
    // Persons have no member-graph-style deferred background on the snapshot path today.
    sections: [
        { key: "summary", paintClass: "first_paint_critical", aboveFold: true },
        { key: "household", paintClass: "first_paint_critical", aboveFold: true },
    ],
});
