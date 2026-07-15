/**
 * Context runtime projection — Summary + Context Facts.
 *
 * Context is not a duplicate configuration layer. The shared VM composes:
 *   contextRows = summary order with Context Facts presentation winning on duplicate refs,
 *   plus incremental context-only facts appended after.
 */

import type { IdentityFieldRowVM } from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceTypes";

function fieldRefsInRows(rows: IdentityFieldRowVM[]): string[] {
    return rows.flatMap((row) => row.cells.map((cell) => cell.fieldRef));
}

/** Merge summary rows with context facts; context cell wins on duplicate refs for Context depth. */
export function composeSummaryAndContextFacts(
    summaryRows: IdentityFieldRowVM[],
    contextFactRows: IdentityFieldRowVM[],
): IdentityFieldRowVM[] {
    const contextCellByRef = new Map(
        contextFactRows.flatMap((row) => row.cells.map((cell) => [cell.fieldRef, cell] as const)),
    );
    const summaryRefs = new Set(fieldRefsInRows(summaryRows));

    const merged = summaryRows.map((row) => ({
        ...row,
        cells: row.cells.map((cell) => {
            const contextCell = contextCellByRef.get(cell.fieldRef);
            return contextCell ? { ...contextCell } : { ...cell };
        }),
    }));

    const incrementalFacts = contextFactRows
        .map((row) => ({
            ...row,
            cells: row.cells.filter((cell) => !summaryRefs.has(cell.fieldRef)),
        }))
        .filter((row) => row.cells.length > 0);

    if (incrementalFacts.length === 0) {
        return merged;
    }

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
