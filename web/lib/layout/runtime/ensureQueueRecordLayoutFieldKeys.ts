/**
 * Guarantee every queue_record_layout field key exists on runtime records so
 * configured fields render value-or-placeholder — never silent omission.
 */

import type { QueueRecordLayoutConfigV3 } from "@/lib/layout/queueRecordLayoutV3";
import { collectQueueRecordLayoutFieldKeys } from "@/lib/layout/runtime/collectQueueRecordLayoutFieldKeys";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

function ensureKeysOnRecord(record: ProofRuntimeRecord, keys: string[]): ProofRuntimeRecord {
    const mutable = record as Record<string, unknown>;
    for (const key of keys) {
        if (mutable[key] === undefined) mutable[key] = "";
    }
    return record;
}

/** Apply queue layout field keys to anchor record and each child repeater row. */
export function ensureQueueRecordLayoutFieldKeys(
    record: ProofRuntimeRecord,
    config: QueueRecordLayoutConfigV3 | null | undefined,
): ProofRuntimeRecord {
    const keys = collectQueueRecordLayoutFieldKeys(config);
    if (!keys.length) return record;

    ensureKeysOnRecord(record, keys);

    const childKeys = keys.filter((k) => k.startsWith("child.") || k.startsWith("inquiry_child."));
    if (!childKeys.length) return record;

    const patchChildren = (rows: unknown): unknown => {
        if (!Array.isArray(rows)) return rows;
        return rows.map((row) => {
            if (!row || typeof row !== "object") return row;
            const next = { ...(row as Record<string, unknown>) };
            for (const key of childKeys) {
                if (next[key] === undefined) next[key] = "";
            }
            return next;
        });
    };

    const mutable = record as Record<string, unknown>;
    for (const collectionKey of ["children", "enrollment_children", "_inquiry_children"] as const) {
        if (Array.isArray(mutable[collectionKey])) {
            mutable[collectionKey] = patchChildren(mutable[collectionKey]);
        }
    }

    return record;
}
