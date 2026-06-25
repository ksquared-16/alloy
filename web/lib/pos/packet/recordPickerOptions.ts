/**
 * POS Packet — record picker view-model.
 *
 * Maps results from the existing admin global search (`GET /api/admin/global-search`)
 * into operator-friendly options that populate a packet's `launch_from_entity`. Lets the
 * operator pick by name instead of pasting a UUID.
 *
 * Pure, deterministic, no I/O. Reuses the launch entity-type vocabulary from
 * `launchFromEntity.ts`.
 */

import type { LaunchEntityType } from "./launchFromEntity";

/** Minimal shape of a global-search hit (subset of GlobalRecordSearchHit we rely on). */
export interface GlobalSearchHitLike {
    entity_type: string; // "opportunities" | "persons" | "customer_members" | "customers" | "locations"
    entity_id: string;
    name: string;
    type_label?: string | null;
    household_name?: string | null;
    lead_short_label?: string | null;
    status_label?: string | null;
    location_label?: string | null;
    age_label?: string | null;
    customer_id?: string | null;
}

export interface RecordPickerOption {
    entity_type: LaunchEntityType;
    entity_id: string;
    label: string;
    sublabel: string | null;
}

/** Global-search result grain → launch entity type (locations are not launchable). */
const RESULT_TYPE_TO_LAUNCH: Record<string, LaunchEntityType | undefined> = {
    opportunities: "opportunity",
    persons: "person",
    customer_members: "customer_member",
    customers: "customer",
};

function joinMeta(parts: Array<string | null | undefined>): string | null {
    const cleaned = parts.map((p) => (p ?? "").trim()).filter((p) => p.length > 0);
    return cleaned.length > 0 ? cleaned.join(" · ") : null;
}

function optionForHit(hit: GlobalSearchHitLike, launchType: LaunchEntityType): RecordPickerOption {
    switch (launchType) {
        case "opportunity":
            return {
                entity_type: "opportunity",
                entity_id: hit.entity_id,
                label: (hit.name || hit.lead_short_label || "Lead").trim(),
                sublabel: joinMeta(["Lead", hit.status_label, hit.location_label, hit.household_name]),
            };
        case "person":
            return {
                entity_type: "person",
                entity_id: hit.entity_id,
                label: (hit.name || "Person").trim(),
                sublabel: joinMeta([hit.type_label || "Parent", hit.household_name]),
            };
        case "customer_member":
            return {
                entity_type: "customer_member",
                entity_id: hit.entity_id,
                label: joinMeta([hit.name || "Child", hit.age_label]) ?? "Child",
                sublabel: joinMeta(["Child", hit.household_name]),
            };
        case "customer":
            return {
                entity_type: "customer",
                entity_id: hit.entity_id,
                label: (hit.household_name || hit.name || "Household").trim(),
                sublabel: "Household",
            };
    }
}

/**
 * Build deduped picker options from global-search hits.
 *
 * Each hit yields an option for its own entity (locations skipped). Hits that carry a
 * `customer_id` + `household_name` also yield a derived "customer" (household) option, so
 * a household is always selectable even when no standalone customer row was returned.
 * Order follows first appearance; duplicates (same launch type + id) are collapsed.
 */
export function buildRecordPickerOptions(hits: GlobalSearchHitLike[]): RecordPickerOption[] {
    const seen = new Set<string>();
    const out: RecordPickerOption[] = [];

    const push = (opt: RecordPickerOption) => {
        if (!opt.entity_id) return;
        const key = `${opt.entity_type}:${opt.entity_id}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push(opt);
    };

    for (const hit of hits) {
        const launchType = RESULT_TYPE_TO_LAUNCH[hit.entity_type];
        if (launchType) push(optionForHit(hit, launchType));

        // Derived household option (only when the hit isn't itself the customer row).
        if (launchType !== "customer" && hit.customer_id && (hit.household_name ?? "").trim()) {
            push({
                entity_type: "customer",
                entity_id: hit.customer_id,
                label: (hit.household_name as string).trim(),
                sublabel: "Household",
            });
        }
    }

    return out;
}
