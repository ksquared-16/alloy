/**
 * Identity disclosure projections — Summary, Context Facts, and Details tiers.
 *
 * Summary does not feed Context. Context Facts are the Collection projection.
 * Details inherits Context Facts plus Detail Fields (detail tier wins duplicate refs in the detail block).
 */

import type {
    IdentityFieldRowVM,
    IdentityRecordVM,
} from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceTypes";

function fieldRefsInRows(rows: IdentityFieldRowVM[]): string[] {
    return rows.flatMap((row) => row.cells.map((cell) => cell.fieldRef));
}

function cloneIdentityFieldRows(rows: IdentityFieldRowVM[]): IdentityFieldRowVM[] {
    return rows.map((row) => ({
        ...row,
        cells: row.cells.map((cell) => ({ ...cell })),
    }));
}

/** Context collection projection — Context Facts only (no Summary merge). */
export function composeContextCollectionRows(contextFactRows: IdentityFieldRowVM[]): IdentityFieldRowVM[] {
    return cloneIdentityFieldRows(contextFactRows);
}

/** Details projection — Context Facts first; detail rows exclude refs already shown in context. */
export function composeContextFactsIntoDetails(
    contextFactRows: IdentityFieldRowVM[],
    detailRows: IdentityFieldRowVM[],
): { leadingRows: IdentityFieldRowVM[]; detailOnlyRows: IdentityFieldRowVM[] } {
    const contextRefs = new Set(fieldRefsInRows(contextFactRows));
    const detailOnlyRows = detailRows
        .map((row) => ({
            ...row,
            cells: row.cells.filter((cell) => !contextRefs.has(cell.fieldRef)),
        }))
        .filter((row) => row.cells.length > 0);
    return {
        leadingRows: cloneIdentityFieldRows(contextFactRows),
        detailOnlyRows,
    };
}

/**
 * @deprecated Summary no longer merges into Context. Returns Context Facts only.
 */
export function composeSummaryAndContextFacts(
    _summaryRows: IdentityFieldRowVM[],
    contextFactRows: IdentityFieldRowVM[],
): IdentityFieldRowVM[] {
    return composeContextCollectionRows(contextFactRows);
}

/** @deprecated Context Facts may overlap Summary keys; returns keys unchanged. */
export function sanitizeContextFactKeys(_summaryKeys: readonly string[], contextFactKeys: readonly string[]): string[] {
    return [...contextFactKeys];
}

/**
 * Children Focus Details is an identity-group surface, but Context Facts (and half-row
 * layouts / editable policies) are authored on the roster group. Merge roster context
 * (and roster details when identity details are empty) onto the focused identity record
 * so published Context Facts survive select → Details.
 */
export function mergeChildrenRosterIntoFocusedIdentityRecord(
    identity: IdentityRecordVM,
    roster: IdentityRecordVM,
): IdentityRecordVM {
    const contextFactRows =
        roster.contextFactRows.length > 0 ? cloneIdentityFieldRows(roster.contextFactRows) : identity.contextFactRows;
    const detailRows =
        identity.detailRows.length > 0
            ? identity.detailRows
            : roster.detailRows.length > 0
              ? cloneIdentityFieldRows(roster.detailRows)
              : identity.detailRows;
    const contextRows = composeContextCollectionRows(contextFactRows);
    const canShowDetails = detailRows.length > 0 || contextFactRows.length > 0;
    return {
        ...identity,
        contextFactRows,
        contextRows,
        detailRows,
        detailsRows: detailRows,
        expandedRows: detailRows,
        canShowDetails,
        canExpand: canShowDetails,
    };
}
