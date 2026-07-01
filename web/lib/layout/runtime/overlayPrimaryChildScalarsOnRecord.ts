/**
 * Project first child repeater row onto top-level child.* / inquiry_child.* keys.
 *
 * Some published layouts bind flat child fields (not a related_list). Those
 * refKeys must exist on the anchor record to render.
 */

import type { ProofRuntimeRecord } from "./proofRecordContext";

/** Copy scalar child fields from the first mapped child row onto the record. */
export function overlayPrimaryChildScalarsOnRecord(
    record: ProofRuntimeRecord,
    layoutChildren: ProofRuntimeRecord[],
): ProofRuntimeRecord {
    const first = layoutChildren[0];
    if (!first) return record;

    const mutable = record as Record<string, unknown>;
    for (const [key, value] of Object.entries(first)) {
        if (!key.startsWith("child.") && !key.startsWith("inquiry_child.")) continue;
        if (value == null || value === "") continue;
        if (mutable[key] === undefined || mutable[key] === null || mutable[key] === "") {
            mutable[key] = value;
        }
    }
    return record;
}
