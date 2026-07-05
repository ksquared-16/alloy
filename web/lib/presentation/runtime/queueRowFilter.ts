/**
 * Queue record filtering — the known-good WorkUnitQueueRecordFilterBar behavior (commit 6ac8d3a's
 * `applyWorkUnitQueueRecordFilters` + facet derivation) re-homed onto the canonical PRV2 model.
 * Client-side over the LOADED queue rows (the same scope the old bar filtered), operating on
 * QueueRowContext instead of the retired record shape. Pure — the presentation layer owns state.
 *
 * Server owns row ORDER/membership: the default sort preserves the server order and an inactive
 * filter returns the rows untouched, so this only ever narrows/reorders what the runtime resolved.
 */

import type { QueueRowModel } from "@/lib/presentation/runtime/types";

export type QueueRowSort = "default" | "subject_az" | "attention_first" | "status_az";

export type QueueRowFilterState = {
    search: string;
    statusKey: string;
    siteLabel: string;
    programLabel: string;
    /** "" = any · "__needs__" = needs-attention only · else a specific attention reason label. */
    attentionReason: string;
    sort: QueueRowSort;
};

export const EMPTY_QUEUE_ROW_FILTER: QueueRowFilterState = {
    search: "",
    statusKey: "",
    siteLabel: "",
    programLabel: "",
    attentionReason: "",
    sort: "default", // server order preserved until the operator chooses a sort
};

export type QueueRowFilterOption = { value: string; label: string };
export type QueueRowFilterFacets = {
    statusOptions: QueueRowFilterOption[];
    siteOptions: QueueRowFilterOption[];
    programOptions: QueueRowFilterOption[];
    attentionReasonOptions: QueueRowFilterOption[];
};

/** True when any narrowing filter is set (sort alone is not "active" — it never hides rows). */
export function queueRowFilterIsActive(f: QueueRowFilterState): boolean {
    return Boolean(
        f.search.trim() ||
            f.statusKey.trim() ||
            f.siteLabel.trim() ||
            f.programLabel.trim() ||
            f.attentionReason.trim(),
    );
}

/** Count of active advanced (non-search) filters — drives the "Filters" toggle badge. */
export function queueRowFilterAdvancedActiveCount(f: QueueRowFilterState): number {
    let n = 0;
    if (f.statusKey.trim()) n++;
    if (f.siteLabel.trim()) n++;
    if (f.programLabel.trim()) n++;
    if (f.attentionReason.trim()) n++;
    if (f.sort !== "default") n++;
    return n;
}

function pushOption(map: Map<string, string>, value: string | null | undefined, label: string | null | undefined) {
    const v = value?.trim();
    if (!v) return;
    if (!map.has(v)) map.set(v, label?.trim() || v);
}
function optionsFrom(map: Map<string, string>): QueueRowFilterOption[] {
    return Array.from(map, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
}

/** Derive the advanced-filter option lists from the loaded rows' contexts (distinct values only). */
export function deriveQueueRowFilterFacets(rows: readonly QueueRowModel[]): QueueRowFilterFacets {
    const status = new Map<string, string>();
    const site = new Map<string, string>();
    const program = new Map<string, string>();
    const attention = new Map<string, string>();
    for (const row of rows) {
        const ctx = row.context;
        if (!ctx) continue;
        pushOption(status, ctx.row_status_key, ctx.row_status_label);
        pushOption(site, ctx.placement_context?.location_label, ctx.placement_context?.location_label);
        pushOption(program, ctx.placement_context?.program_label, ctx.placement_context?.program_label);
        const reason = ctx.attention_summary?.primary_reason_label;
        pushOption(attention, reason, reason);
    }
    return {
        statusOptions: optionsFrom(status),
        siteOptions: optionsFrom(site),
        programOptions: optionsFrom(program),
        attentionReasonOptions: optionsFrom(attention),
    };
}

function rowHaystack(row: QueueRowModel): string {
    const ctx = row.context;
    if (!ctx) return "";
    return [
        ctx.row_subject?.display_name,
        ctx.case_context?.display_name,
        ctx.primary_contact?.display_name,
        ctx.row_status_label,
        ctx.row_stage,
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
}

function rowMatches(row: QueueRowModel, f: QueueRowFilterState): boolean {
    const ctx = row.context;
    const search = f.search.trim().toLowerCase();
    if (search && !rowHaystack(row).includes(search)) return false;
    if (f.statusKey.trim() && ctx?.row_status_key !== f.statusKey) return false;
    if (f.siteLabel.trim() && ctx?.placement_context?.location_label !== f.siteLabel) return false;
    if (f.programLabel.trim() && ctx?.placement_context?.program_label !== f.programLabel) return false;
    if (f.attentionReason.trim()) {
        if (f.attentionReason === "__needs__") {
            if (!ctx?.attention_summary?.needs_attention) return false;
        } else if (ctx?.attention_summary?.primary_reason_label !== f.attentionReason) {
            return false;
        }
    }
    return true;
}

function subjectName(row: QueueRowModel): string {
    return (row.context?.row_subject?.display_name ?? "").toLowerCase();
}

/** Filter + sort the loaded rows. Inactive filter + default sort → the input rows, order untouched. */
export function applyQueueRowFilters(
    rows: readonly QueueRowModel[],
    f: QueueRowFilterState,
): QueueRowModel[] {
    const active = queueRowFilterIsActive(f);
    if (!active && f.sort === "default") return rows.slice();

    const filtered = active ? rows.filter((r) => rowMatches(r, f)) : rows.slice();
    if (f.sort === "default") return filtered;

    const indexed = filtered.map((row, index) => ({ row, index }));
    indexed.sort((a, b) => {
        if (f.sort === "subject_az") {
            const c = subjectName(a.row).localeCompare(subjectName(b.row));
            return c !== 0 ? c : a.index - b.index;
        }
        if (f.sort === "status_az") {
            const c = (a.row.context?.row_status_label ?? "").localeCompare(b.row.context?.row_status_label ?? "");
            return c !== 0 ? c : a.index - b.index;
        }
        // attention_first
        const aa = a.row.context?.attention_summary?.needs_attention ? 1 : 0;
        const bb = b.row.context?.attention_summary?.needs_attention ? 1 : 0;
        if (aa !== bb) return bb - aa;
        const c = subjectName(a.row).localeCompare(subjectName(b.row));
        return c !== 0 ? c : a.index - b.index;
    });
    return indexed.map((e) => e.row);
}
