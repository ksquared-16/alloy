/**
 * Alloy Search Platform V2 — the selection projection.
 *
 * Global search has THREE consumers, not one:
 *   1. the global search control (renders subjects, recognition, destinations)
 *   2. the POS packet record picker (wants "which record did the operator pick?")
 *   3. the Experience Builder preview record selector (wants an opportunity id)
 *
 * (2) and (3) do not want a subject with contexts and destinations — they want a
 * flat, pickable record reference. Before V2 they read the V1 hit shape directly
 * off the endpoint; when the endpoint became subject-centred they silently
 * filtered to zero results, because a `SearchResult` has no `entity_type`,
 * `entity_id` or `group`.
 *
 * This module is the ONE place that flattens a subject back to a record
 * reference. It exists so the fix is not "each caller re-derives it", and so the
 * endpoint keeps a single response model rather than growing a compatibility
 * payload — a second payload would be the second search data model the doctrine
 * forbids.
 *
 * Derivation rule: the record reference is the subject's PRIMARY destination,
 * because that destination already names the canonical surface the platform
 * considers authoritative for that subject. Nothing new is invented here.
 */

import type { SearchResult } from "@/lib/search/searchContracts";

/** Record grains a selection can name. Mirrors the AdminV2 drawer vocabulary. */
export type SearchSelectionEntityType = "opportunities" | "persons" | "customers" | "locations";

/**
 * A flat, pickable reference to one record.
 *
 * Field names deliberately match the legacy hit shape these consumers already
 * expect, so adopting this is a mapping change at the fetch site rather than a
 * rewrite of their view models.
 */
export type SearchSelection = {
    entity_type: SearchSelectionEntityType;
    entity_id: string;
    name: string;
    type_label?: string | null;
    household_name?: string | null;
    location_label?: string | null;
    age_label?: string | null;
    customer_id?: string | null;
    /**
     * Opportunity behind this subject when one exists — either because the
     * subject IS an opportunity, or because its participation runs in one.
     * The Experience Builder preview selects on exactly this.
     */
    opportunity_id?: string | null;
};

function firstDestination(result: SearchResult, entityType: string): string | null {
    for (const destination of result.destinations) {
        if (destination.target !== "open_drawer") continue;
        if (destination.entity_type !== entityType) continue;
        const id = (destination.entity_id ?? "").trim();
        if (id) return id;
    }
    return null;
}

function isSelectionEntityType(value: string): value is SearchSelectionEntityType {
    return value === "opportunities" || value === "persons" || value === "customers" || value === "locations";
}

/**
 * Flatten one subject to a record reference, or null when it has no canonical
 * record surface (which is a legitimate outcome, not an error).
 */
export function searchSelectionFromResult(result: SearchResult): SearchSelection | null {
    const primary = result.destinations.find((d) => d.primary) ?? null;

    let entityType: SearchSelectionEntityType | null = null;
    let entityId: string | null = null;

    if (primary?.target === "open_drawer") {
        const type = (primary.entity_type ?? "").trim();
        const id = (primary.entity_id ?? "").trim();
        if (id && isSelectionEntityType(type)) {
            entityType = type;
            entityId = id;
        }
    }

    // A campus opens a settings route rather than a drawer, so its record
    // reference is the subject itself.
    if (!entityType && result.subject.kind === "location") {
        entityType = "locations";
        entityId = result.subject.id;
    }

    if (!entityType || !entityId) return null;

    const opportunityId =
        entityType === "opportunities" ? entityId : firstDestination(result, "opportunities");

    return {
        entity_type: entityType,
        entity_id: entityId,
        name: result.subject.display_name,
        type_label: result.recognition.type_label ?? null,
        household_name: result.recognition.household_name ?? null,
        location_label: result.recognition.location_label ?? null,
        age_label: result.recognition.age_label ?? null,
        customer_id: result.subject.household_id ?? null,
        opportunity_id: opportunityId,
    };
}

/** Flatten a result set, dropping subjects with no canonical record surface. */
export function searchSelectionsFromResults(results: readonly SearchResult[]): SearchSelection[] {
    const out: SearchSelection[] = [];
    for (const result of results) {
        const selection = searchSelectionFromResult(result);
        if (selection) out.push(selection);
    }
    return out;
}
