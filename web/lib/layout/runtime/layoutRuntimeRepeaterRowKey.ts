/**
 * Stable React keys for layout-runtime related-list rows.
 */

import type { ProofRuntimeRecord } from "./proofRecordContext";

function trim(v: unknown): string {
    if (v == null) return "";
    return String(v).trim();
}

/** True for renderer fallback ids — not valid drawer open targets. */
export function isSyntheticLayoutRuntimeRowId(value: unknown): boolean {
    const v = trim(value);
    if (!v) return true;
    if (/^(child-row|household-child|child-enrichment|child)-\d+$/i.test(v)) return true;
    if (v.startsWith("metadata_child:")) return true;
    return false;
}

/** Compose a stable unique key for one repeater row (never duplicate child-row-0). */
export function layoutRuntimeRepeaterRowReactKey(
    row: ProofRuntimeRecord,
    index: number,
    source?: string,
): string {
    const parts = [
        source?.trim(),
        trim(row.ocm_id),
        trim(row.customer_member_id),
        trim(row["child.customer_member_id"]),
        trim(row["child.id"]),
        trim(row.person_id),
        trim(row.id),
        `idx:${index}`,
    ].filter(Boolean);
    return parts.join("|");
}
