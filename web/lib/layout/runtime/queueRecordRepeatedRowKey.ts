/**
 * Stable React keys for repeated related-record queue row segments.
 * Never returns an empty string.
 */

import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

function nonEmpty(value: unknown): string | null {
    if (value == null) return null;
    const s = String(value).trim();
    return s.length > 0 ? s : null;
}

/** Resolve a stable non-empty key for a repeated related row. */
export function resolveQueueRecordRepeatedRowKey(
    relationshipKey: string,
    row: ProofRuntimeRecord,
    index: number,
): string {
    const rowId = nonEmpty(row.id);
    if (rowId) return `${relationshipKey}:${rowId}`;

    const childId = nonEmpty(row["child.id"]);
    if (childId) return `${relationshipKey}:child:${childId}`;

    const personId = nonEmpty(row["person.id"] ?? row.person_id);
    if (personId) return `${relationshipKey}:person:${personId}`;

    const relatedId = nonEmpty(row[`${relationshipKey}.id`]);
    if (relatedId) return `${relationshipKey}:${relatedId}`;

    const displayName = nonEmpty(
        row["child.name"] ?? row["person.primary_contact_name"] ?? row["person.name"] ?? row.name,
    );
    if (displayName) return `${relationshipKey}:name:${displayName}`;

    return `${relationshipKey}:index:${index}`;
}
