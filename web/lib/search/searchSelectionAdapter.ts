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
 * Derivation rule: the record reference is the HOST record named by the subject's
 * PRIMARY destination — the record whose Focus Panel renders that subject. The
 * platform already decided that binding, so nothing new is invented here.
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

function firstHostOfType(result: SearchResult, entityType: string): string | null {
    for (const destination of result.destinations) {
        if (destination.host_entity_type !== entityType) continue;
        const id = (destination.host_entity_id ?? "").trim();
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

    // An OPERATIONAL destination is a Focus Panel target, so the flat record reference is the HOST
    // record that renders the subject's panel — not a drawer address.
    if (primary?.target === "focus_panel") {
        const type = (primary.host_entity_type ?? "").trim();
        const id = (primary.host_entity_id ?? "").trim();
        if (id && isSelectionEntityType(type)) {
            entityType = type;
            entityId = id;
        }
    }

    // A RECORD destination names the subject itself and carries no host at all — that is the point
    // of it. These consumers still want a flat record reference, so it is resolved from the subject.
    //
    // This branch is not cosmetic. When the primary destination became `durable_record`, a picker
    // that only understood `focus_panel` would have found no entity on any person or child result
    // and filtered EVERY one of them away — silently, with an empty list rather than an error. That
    // is exactly the regression this module was written after, arriving from the other direction.
    if (!entityType && primary?.target === "durable_record") {
        const subjectType = (primary.subject_type ?? "").trim();
        const subjectId = (primary.subject_id ?? "").trim();
        if (subjectId) {
            if (subjectType === "person") {
                entityType = "persons";
                entityId = subjectId;
            } else if (subjectType === "child") {
                // A child's flat reference is its PERSON when it has one — these consumers pick
                // records in the drawer vocabulary, which has no child grain. A child with a null
                // `person_id` (ordinary: the column is nullable) therefore yields no reference, and
                // dropping it is the honest outcome rather than inventing an entity type.
                const childPersonId = (result.subject.person_id ?? "").trim();
                if (childPersonId) {
                    entityType = "persons";
                    entityId = childPersonId;
                }
            }
        }
    }

    // …and a record destination still knows the case behind the subject through its OPERATIONAL
    // siblings, which is where `opportunity_id` below is resolved from.

    // A campus opens a settings route rather than a drawer, so its record
    // reference is the subject itself.
    if (!entityType && result.subject.kind === "location") {
        entityType = "locations";
        entityId = result.subject.id;
    }

    if (!entityType || !entityId) return null;

    const opportunityId =
        entityType === "opportunities" ? entityId : firstHostOfType(result, "opportunities");

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
