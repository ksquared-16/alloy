/**
 * Infer related_list column definitions from repeater row shape when the layout
 * doc omits columns (published queue docs sometimes carry an empty related_list).
 */

import type { LayoutCollectionColumn } from "../layoutV2";
import { enrichInferredChildRepeaterColumns } from "./layoutRuntimeLinkHarness";
import type { ProofRuntimeRecord } from "./proofRecordContext";

const PREFERRED_CHILD_REF_KEYS = [
    "child.name",
    "child.display_name",
    "child.first_name",
    "child.last_name",
    "child.dob_age",
    "child.date_of_birth",
    "child.age_band",
    "child.program",
    "child.status",
    "child.location",
] as const;

function rowHasValue(row: ProofRuntimeRecord, key: string): boolean {
    const v = row[key];
    return v !== undefined && v !== null && v !== "";
}

/** Build column config from keys present on repeater rows (child.* / inquiry_child.*). */
export function inferLayoutRepeaterColumnsFromRows(
    rows: ProofRuntimeRecord[],
): LayoutCollectionColumn[] {
    if (rows.length === 0) return [];

    const keys = new Set<string>();
    for (const row of rows) {
        for (const key of Object.keys(row)) {
            if (!key.startsWith("child.") && !key.startsWith("inquiry_child.")) continue;
            if (rowHasValue(row, key)) keys.add(key);
        }
    }

    const ordered: string[] = [];
    for (const pref of PREFERRED_CHILD_REF_KEYS) {
        if (keys.has(pref)) ordered.push(pref);
    }
    for (const key of [...keys].sort()) {
        if (!ordered.includes(key)) ordered.push(key);
    }

    return enrichInferredChildRepeaterColumns(
        ordered.map((refKey) => ({
            refKey,
            label: refKey,
            width: "flexible" as const,
            renderHint: "text" as const,
        })),
    );
}
