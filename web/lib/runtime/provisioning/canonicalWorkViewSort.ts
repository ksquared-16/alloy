/**
 * Canonical Work View row ordering.
 *
 * U-O2 requires the active lens's rows "in canonical order, bounded to one page". `sort_v1` /
 * `sorts_v1` have been defined, parsed, defaulted, stored and surfaced on the runtime context since
 * Work Views existed — and never applied. No consumer reads `WorkViewRuntimeContext.sort`; the queue
 * route reads `.filters` and `.match` only. Canonical order was therefore whatever the base query
 * happened to emit. This is the missing application.
 *
 * Deterministic by construction: the authored sort rules are applied in order, and `id` is the final
 * tiebreak so a bounded page is stable across identical requests (a page that reshuffles between two
 * evaluations would make "the same rows" unprovable, and would make the default subject — which is
 * chosen from queue order — nondeterministic).
 */
import type { WorkViewConfigV1Stored, WorkViewSortV1 } from "@/lib/lifecycle/workViewsConfigV1";
import type { OperationalProjectionRow } from "@/lib/lifecycle/operationalProjection";
import { canonicalWorkViewSortFieldKey } from "@/lib/lifecycle/workViewSortOperands";

/** The authored rules, newest schema first, with the legacy single rule mirrored. */
export function canonicalSortRules(view: WorkViewConfigV1Stored): WorkViewSortV1[] {
    if (view.sorts_v1?.length) return view.sorts_v1;
    if (view.sort_v1) return [view.sort_v1];
    return [];
}

/** Map an authored sort field onto the row field the projection actually carries. */
function readSortValue(row: OperationalProjectionRow, fieldKey: string): unknown {
    const r = row as Record<string, unknown>;
    switch (canonicalWorkViewSortFieldKey(fieldKey)) {
        case "opportunity_stage":
            return r.lifecycle_stage_key ?? r.stage_key;
        case "opportunity_status":
            return r.status_key;
        default:
            return r[fieldKey];
    }
}

/** Nulls sort last in both directions — an absent value is never "the most urgent work". */
function compareValues(a: unknown, b: unknown): number {
    const aNull = a == null || a === "";
    const bNull = b == null || b === "";
    if (aNull && bNull) return 0;
    if (aNull) return 1;
    if (bNull) return -1;
    if (typeof a === "number" && typeof b === "number") return a - b;
    const as = String(a);
    const bs = String(b);
    return as < bs ? -1 : as > bs ? 1 : 0;
}

export function applyCanonicalWorkViewSort<T extends OperationalProjectionRow>(
    rows: readonly T[],
    view: WorkViewConfigV1Stored,
): T[] {
    const rules = canonicalSortRules(view);
    const out = [...rows];
    out.sort((ra, rb) => {
        for (const rule of rules) {
            const cmp = compareValues(readSortValue(ra, rule.field_key), readSortValue(rb, rule.field_key));
            if (cmp !== 0) return rule.direction === "desc" ? -cmp : cmp;
        }
        // Final tiebreak — a bounded page must be stable across identical evaluations.
        return compareValues((ra as Record<string, unknown>).id, (rb as Record<string, unknown>).id);
    });
    return out;
}
