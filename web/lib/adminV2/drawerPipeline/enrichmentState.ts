import type { DrawerEnrichmentState, DrawerRecordSurface } from "@/lib/adminV2/drawerPipeline/types";

export type BuildDrawerEnrichmentStateInput = {
    record: Record<string, unknown> | null | undefined;
    drawer_id: string | null | undefined;
    background_full_failed: boolean;
    enrichment_held_until_interaction?: boolean;
};

function recordSurface(record: Record<string, unknown> | null | undefined): DrawerRecordSurface {
    return String(record?._record_surface ?? "").trim() || "unknown";
}

/**
 * Derive enrichment phases from record surface + explicit background-full failure flag.
 * Primary fast-path omissions (empty field defs) are not failures.
 */
export function buildDrawerEnrichmentState(input: BuildDrawerEnrichmentStateInput): DrawerEnrichmentState {
    const record = input.record;
    const drawerId = input.drawer_id;
    if (!record || !drawerId || drawerId === "new") {
        return {
            record_surface: "unknown",
            primary_loaded: false,
            full_pending: false,
            full_complete: false,
            background_full_failed: false,
            enrichment_held_until_interaction: false,
        };
    }
    if (String(record.id ?? "").trim() !== String(drawerId).trim()) {
        return {
            record_surface: "unknown",
            primary_loaded: false,
            full_pending: false,
            full_complete: false,
            background_full_failed: false,
            enrichment_held_until_interaction: false,
        };
    }

    const surface = recordSurface(record);
    const primary_loaded =
        surface === "drawer_primary" || surface === "drawer_initial" || surface === "full";
    const full_complete = surface === "full";
    const full_pending =
        !input.background_full_failed &&
        (surface === "drawer_primary" || surface === "drawer_initial");

    return {
        record_surface: surface,
        primary_loaded,
        full_pending,
        full_complete,
        background_full_failed: input.background_full_failed,
        enrichment_held_until_interaction: input.enrichment_held_until_interaction === true,
    };
}

/** Warnings for incomplete relationships belong only here — never on pending full. */
export function drawerRelationshipsFullHydrateFailed(enrichment: DrawerEnrichmentState): boolean {
    return enrichment.background_full_failed;
}

export function drawerRecordHydrationPending(enrichment: DrawerEnrichmentState): boolean {
    const s = enrichment.record_surface;
    return s === "drawer_visible" || s === "drawer_primary" || s === "drawer_initial";
}
