/**
 * Deterministic merge precedence for form bootstrap payloads.
 *
 * Precedence (highest wins for overlapping keys):
 *   1. Saved respondent / submission values
 *   2. Packet session shared_values (scalars only — applied upstream)
 *   3. Canonical record prefill (scalar + collection)
 *   4. Schema minimum repeat placeholders
 *
 * Collection groups merge by stable identity — never by array index.
 */

import type { FormSchemaV1 } from "@/lib/forms/schema";
import type { FormPayload, FormPayloadGroupRow } from "@/lib/forms/validateSubmission";
import { payloadWithMinimumRepeatingGroups } from "@/components/forms/engine/formEnginePayload";
import { groupFieldHasCollectionBinding } from "@/lib/fields/formsCollectionRepeatBinding";

export type FormPrefillMergeInput = {
    schema: FormSchemaV1;
    /** Client or saved submission payload (may include partial groups). */
    saved?: FormPayload | null;
    /** Scalar values from canonical + relationship prefill. */
    scalarPrefill?: Record<string, string | number | boolean>;
    /** Collection-bound group rows from canonical resolver. */
    collectionPrefill?: Record<string, FormPayloadGroupRow[]>;
};

function collectionItemKey(row: FormPayloadGroupRow): string | null {
    const itemId = row.collection?.item_id?.trim();
    if (itemId) return `item:${itemId}`;
    const ik = row.instance_key?.trim();
    if (ik) return `instance:${ik}`;
    return null;
}

function mergeGroupRows(
    schemaMin: FormPayloadGroupRow[],
    canonical: FormPayloadGroupRow[],
    saved: FormPayloadGroupRow[],
): FormPayloadGroupRow[] {
    const byKey = new Map<string, FormPayloadGroupRow>();

    for (const row of canonical) {
        const key = collectionItemKey(row) ?? `canonical:${row.instance_key}`;
        byKey.set(key, row);
    }

    for (const row of saved) {
        const key = collectionItemKey(row) ?? `saved:${row.instance_key}`;
        const existing = byKey.get(key);
        if (existing) {
            byKey.set(key, {
                ...existing,
                ...row,
                instance_key: existing.instance_key || row.instance_key,
                values: { ...existing.values, ...row.values },
                collection: row.collection ?? existing.collection,
                signatures: row.signatures ?? existing.signatures,
                groups: row.groups ?? existing.groups,
            });
        } else {
            byKey.set(key, row);
        }
    }

    if (byKey.size === 0) return schemaMin;

    const merged = [...byKey.values()];
    const seenItemIds = new Set<string>();
    const deduped: FormPayloadGroupRow[] = [];
    for (const row of merged) {
        const itemId = row.collection?.item_id?.trim();
        if (itemId) {
            if (seenItemIds.has(itemId)) continue;
            seenItemIds.add(itemId);
        }
        deduped.push(row);
    }

    if (deduped.length >= schemaMin.length) return deduped;

    const usedKeys = new Set(deduped.map((r) => r.instance_key));
    for (const minRow of schemaMin) {
        if (deduped.length >= schemaMin.length) break;
        if (!usedKeys.has(minRow.instance_key)) {
            deduped.push(minRow);
            usedKeys.add(minRow.instance_key);
        }
    }
    return deduped;
}

/**
 * Merge scalar + collection prefill into a bootstrap payload honoring saved respondent data.
 */
export function mergeFormPrefillPayload(input: FormPrefillMergeInput): FormPayload {
    const schemaBase = payloadWithMinimumRepeatingGroups(input.schema);
    const saved = input.saved ?? { values: {}, groups: {} };

    const mergedValues: Record<string, unknown> = {
        ...(input.scalarPrefill ?? {}),
        ...(saved.values ?? {}),
    };

    const mergedGroups: Record<string, FormPayloadGroupRow[]> = { ...(schemaBase.groups ?? {}) };

    for (const groupField of input.schema.fields) {
        if (groupField.type !== "group") continue;
        const groupId = groupField.id;
        const schemaMin = schemaBase.groups?.[groupId] ?? [];
        const canonical = input.collectionPrefill?.[groupId] ?? [];
        const savedRows = saved.groups?.[groupId] ?? [];

        if (groupFieldHasCollectionBinding(groupField)) {
            mergedGroups[groupId] = mergeGroupRows(schemaMin, canonical, savedRows);
        } else if (savedRows.length > 0) {
            mergedGroups[groupId] = savedRows;
        } else if (schemaMin.length > 0) {
            mergedGroups[groupId] = schemaMin;
        }
    }

    for (const [gid, rows] of Object.entries(input.collectionPrefill ?? {})) {
        if (!mergedGroups[gid]?.length && rows.length > 0) {
            mergedGroups[gid] = rows;
        }
    }

    return {
        values: mergedValues,
        groups: Object.keys(mergedGroups).length ? mergedGroups : undefined,
        meta: saved.meta ?? {},
    };
}
