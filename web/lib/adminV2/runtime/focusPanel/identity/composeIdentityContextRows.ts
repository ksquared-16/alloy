/**
 * Context runtime projection — Summary + Context Facts.
 *
 * Context is not a duplicate configuration layer. The shared VM composes:
 *   contextRows = summaryRows + incremental contextFactRows (deduped; summary wins).
 */

import type { IdentityFieldRowVM } from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceTypes";

function fieldRefsInRows(rows: IdentityFieldRowVM[]): string[] {
    return rows.flatMap((row) => row.cells.map((cell) => cell.fieldRef));
}

/** Merge summary rows with incremental context facts; summary placement wins on duplicate refs. */
export function composeSummaryAndContextFacts(
    summaryRows: IdentityFieldRowVM[],
    contextFactRows: IdentityFieldRowVM[],
): IdentityFieldRowVM[] {
    const summaryRefs = new Set(fieldRefsInRows(summaryRows));
    const incrementalFacts = contextFactRows
        .map((row) => ({
            ...row,
            cells: row.cells.filter((cell) => !summaryRefs.has(cell.fieldRef)),
        }))
        .filter((row) => row.cells.length > 0);

    if (incrementalFacts.length === 0) {
        return summaryRows.map((row) => ({ ...row, cells: row.cells.map((cell) => ({ ...cell })) }));
    }

    const merged = summaryRows.map((row) => ({ ...row, cells: row.cells.map((cell) => ({ ...cell })) }));
    let nextRow = merged.length > 0 ? Math.max(...merged.map((row) => row.row)) + 1 : 1;

    for (const factRow of incrementalFacts) {
        merged.push({
            row: nextRow,
            cells: factRow.cells.map((cell) => ({ ...cell })),
        });
        nextRow += 1;
    }

    return merged;
}

/** Strip summary duplicates from persisted context fact keys (compatibility adapter). */
export function sanitizeContextFactKeys(summaryKeys: readonly string[], contextFactKeys: readonly string[]): string[] {
    const summary = new Set(summaryKeys);
    return contextFactKeys.filter((fieldRef) => !summary.has(fieldRef));
}
