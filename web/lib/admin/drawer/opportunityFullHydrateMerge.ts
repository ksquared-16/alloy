/**
 * Opportunity `surface=full` merge staging — above-fold layout lock must not reshape on background hydrate.
 *
 * Option labels (`batchOptionItemLabelsForOrg`) are deferred off the full-hydrate critical path in
 * `opportunityEntityRecord.ts`; inquiry rows use item-key fallbacks until edit/below-fold enrich.
 */

import type { OpportunityDrawerPaintRecord } from "@/lib/admin/drawer/opportunityDrawerFirstPaintContract";

/** Keys merged only after below-fold unlock — change section content/height below the fold. */
export const OPPORTUNITY_FULL_HYDRATE_DEFERRED_RECORD_KEYS = new Set<string>([
    "_inquiry_children",
    "_field_definitions",
    "_opportunity_persons",
    "_operational_attention",
    "_identity",
    "_relationship_displays",
    "_activity_signal",
    "_debug_inquiry_children",
]);

export type OpportunityFullHydrateMergeResult = {
    merged: Record<string, unknown>;
    /** Non-empty when `aboveFoldLocked` — apply on below-fold / idle unlock. */
    deferredPatch: Record<string, unknown> | null;
};

function mergeField(
    target: Record<string, unknown>,
    key: string,
    value: unknown
): void {
    if (value === undefined) return;
    if ((value === null || value === "") && target[key] != null && target[key] !== "") return;
    target[key] = value;
}

/**
 * Record keys whose content renders ABOVE the fold (first-paint-critical) for the opportunity
 * drawer. A background/deferred merge must never MOVE these once painted — it may only fill them
 * when absent. (`metadata` is intentionally excluded: it is a mixed above/below-fold blob that
 * background enrichment legitimately extends.)
 */
export const OPPORTUNITY_ABOVE_FOLD_RECORD_KEYS: ReadonlySet<string> = new Set<string>([
    "name",
    "title",
    "status_key",
    "_status_display",
    "_pipeline_stage_name",
    "_customer_name",
    "_primary_person_name",
    "_primary_person_email",
    "_primary_person_phone",
    "_primary_contact_name",
    "_identity",
    "_opportunity_persons",
    "_inquiry_children",
    "next_follow_up_at",
    "_lifecycle_next_step",
]);

/**
 * Background-phase merge. Fills absent fields (gap completion) but NEVER overwrites a present
 * first-paint-critical (above-fold) value — enforcing the contract rule "if a patch touches
 * already-painted above-fold data, it is not background." Below-fold and absent fields merge
 * normally, so background hydration stays invisible.
 */
export function mergeOpportunityFullHydrateBackground(
    prev: Record<string, unknown>,
    full: Record<string, unknown>
): Record<string, unknown> {
    const out: Record<string, unknown> = { ...prev };
    for (const [key, value] of Object.entries(full)) {
        if (OPPORTUNITY_ABOVE_FOLD_RECORD_KEYS.has(key)) {
            const current = out[key];
            if (current != null && current !== "") continue; // already painted above-fold — do not move it
        }
        mergeField(out, key, value);
    }
    return out;
}

/** Standard merge — all full fields apply immediately. */
export function mergeOpportunityFullHydrate(
    prev: Record<string, unknown>,
    full: Record<string, unknown>
): Record<string, unknown> {
    const o: Record<string, unknown> = { ...prev };
    for (const [k, v] of Object.entries(full)) {
        mergeField(o, k, v);
    }
    return o;
}

/**
 * When above-fold is locked, merge only geometry-safe fields now; stash below-fold keys for later.
 * Always sets `_record_surface` to `full` when present so enrichment gates can proceed without visible staging.
 */
export function mergeOpportunityFullHydrateStaged(
    prev: Record<string, unknown>,
    full: Record<string, unknown>,
    opts: { aboveFoldLocked: boolean }
): OpportunityFullHydrateMergeResult {
    if (!opts.aboveFoldLocked) {
        return { merged: mergeOpportunityFullHydrate(prev, full), deferredPatch: null };
    }

    const merged: Record<string, unknown> = { ...prev };
    const deferredPatch: Record<string, unknown> = {};

    for (const [k, v] of Object.entries(full)) {
        if (OPPORTUNITY_FULL_HYDRATE_DEFERRED_RECORD_KEYS.has(k)) {
            deferredPatch[k] = v;
            continue;
        }
        mergeField(merged, k, v);
    }

    if (full._record_surface != null) {
        merged._record_surface = full._record_surface;
    }
    if (Object.keys(deferredPatch).length > 0) {
        merged._full_hydrate_deferred_pending = true;
    }

    return {
        merged,
        deferredPatch: Object.keys(deferredPatch).length > 0 ? deferredPatch : null,
    };
}

export function applyOpportunityFullHydrateDeferredPatch(
    prev: Record<string, unknown>,
    deferredPatch: Record<string, unknown>
): Record<string, unknown> {
    // Card 3B — the deferred patch carries above-fold keys (`_identity`, `_inquiry_children`, …)
    // and is applied AFTER first paint. Use the background-safe merge so it fills only below-fold /
    // absent fields and never moves already-painted above-fold content.
    const merged = mergeOpportunityFullHydrateBackground(prev, deferredPatch);
    delete merged._full_hydrate_deferred_pending;
    return merged;
}

/** Map record keys to layout sections for `[perf.drawer.layout_stability]`. */
const RECORD_KEY_TO_LAYOUT_SECTION: Record<string, string> = {
    name: "header_title",
    title: "header_title",
    status_key: "status",
    _status_display: "status",
    _pipeline_stage_name: "status",
    _customer_name: "family_contacts",
    _primary_person_name: "family_contacts",
    _primary_person_email: "family_contacts",
    _primary_person_phone: "family_contacts",
    _primary_contact_name: "family_contacts",
    _identity: "family_contacts",
    _inquiry_children: "inquiry_children",
    next_follow_up_at: "right_column",
    _lifecycle_next_step: "right_column",
    metadata: "right_column",
    _field_definitions: "field_sections",
    _opportunity_persons: "family_contacts",
    _operational_attention: "operational_attention",
    _activity_signal: "activity",
};

export type OpportunityDrawerLayoutChangeReport = {
    changed_sections: string[];
    above_fold_changed: boolean;
    geometry_changed: boolean;
    text_only_change: boolean;
};

export function classifyOpportunityDrawerLayoutChanges(
    prev: OpportunityDrawerPaintRecord,
    next: OpportunityDrawerPaintRecord,
    geometryChanged: boolean
): OpportunityDrawerLayoutChangeReport {
    const sectionSet = new Set<string>();
    for (const key of Object.keys(next)) {
        if (JSON.stringify(prev[key]) === JSON.stringify(next[key])) continue;
        sectionSet.add(RECORD_KEY_TO_LAYOUT_SECTION[key] ?? key);
    }

    const changed_sections = [...sectionSet];
    const above_fold_sections = new Set([
        "header_title",
        "status",
        "family_contacts",
        "inquiry_children",
        "right_column",
    ]);
    const above_fold_changed = changed_sections.some((s) => above_fold_sections.has(s));

    const text_only_change = above_fold_changed && !geometryChanged;

    return {
        changed_sections,
        above_fold_changed,
        geometry_changed: geometryChanged,
        text_only_change,
    };
}
