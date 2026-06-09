/**
 * Resolve related-list repeater rows from a layout runtime record.
 *
 * Published docs may use `source: "children" | "enrollment_children"`; VM paint
 * may only carry `_inquiry_children`. This helper unifies lookup + row mapping.
 */

import type { LayoutItem } from "../layoutV2";
import {
    normalizeLayoutRuntimeChildRow,
    normalizeLayoutRuntimeChildRows,
} from "./normalizeLayoutRuntimeChildRow";
import {
    mapVmInquiryChildrenToLayoutRuntimeRows,
    resolveOpportunityLayoutRuntimeChildrenRows,
} from "./mapLayoutRuntimeChildrenRows";
import {
    enrichLayoutRuntimeChildRowIdentifiers,
    enrichLayoutRuntimeChildRowsFromAnchor,
} from "./enrichLayoutRuntimeChildRowIdentifiers";
import type { ProofRuntimeRecord } from "./proofRecordContext";

const REPEATER_COLLECTION_KEYS = [
    "children",
    "enrollment_children",
    "inquiry_children",
    "household_children",
    "_inquiry_children",
    "_household_children",
    "_children",
] as const;

function mapRawRepeaterCollection(raw: unknown[], key: string): ProofRuntimeRecord[] {
    if (!raw.length) return [];

    const normalized = normalizeLayoutRuntimeChildRows(raw);
    if (normalized.length > 0) return normalized;

    if (key === "_inquiry_children" || key === "inquiry_children") {
        return mapVmInquiryChildrenToLayoutRuntimeRows(raw);
    }
    if (key === "household_children" || key === "_household_children") {
        return resolveOpportunityLayoutRuntimeChildrenRows({ _household_children: raw });
    }
    if (key === "children" || key === "enrollment_children") {
        const fromInquiry = mapVmInquiryChildrenToLayoutRuntimeRows(raw);
        if (fromInquiry.length > 0) return fromInquiry;
    }

    return raw
        .map((row, index) => normalizeLayoutRuntimeChildRow(row, index))
        .filter((row): row is ProofRuntimeRecord => row != null);
}

/** Read repeater rows for one related_list item (drawer + queue). */
export function readLayoutRuntimeRepeaterRows(
    record: ProofRuntimeRecord,
    item: LayoutItem,
): ProofRuntimeRecord[] {
    const keys = [
        item.source ?? "",
        item.refKey,
        ...REPEATER_COLLECTION_KEYS,
    ].filter((key, index, all) => key && all.indexOf(key) === index);

    let mapped: ProofRuntimeRecord[] = [];
    let collectionKey = "";

    for (const key of keys) {
        const raw = record[key];
        if (!Array.isArray(raw) || raw.length === 0) continue;
        const next = mapRawRepeaterCollection(raw, key);
        if (next.length > 0) {
            mapped = next;
            collectionKey = key;
            break;
        }
    }

    if (mapped.length === 0) {
        mapped = resolveOpportunityLayoutRuntimeChildrenRows(record as Record<string, unknown>);
        collectionKey = "_vm_fallback";
    }

    if (mapped.length === 0) return [];

    const inquiryChildren =
        record._inquiry_children
        ?? (record.metadata && typeof record.metadata === "object"
            ? (record.metadata as Record<string, unknown>).inquiry_children
            : undefined);
    const primaryChildPersonIdRaw = record._primary_child_person_id ?? record.primary_child_person_id;
    const primaryChildPersonId =
        primaryChildPersonIdRaw != null && String(primaryChildPersonIdRaw).trim()
            ? String(primaryChildPersonIdRaw).trim()
            : null;

    return mapped.map((row, index) => {
        const enriched = enrichLayoutRuntimeChildRowIdentifiers(row, {
            index,
            inquiryChildren,
            primaryChildPersonId,
            totalChildCount: mapped.length,
        });
        return {
            ...enriched.row,
            _layout_runtime_child_collection_key: collectionKey,
            _layout_runtime_child_mapper_source: enriched.mapperSource,
        };
    });
}

/** Shared empty check for drawer stats, evidence, and empty-state gating. */
export function layoutRuntimeChildrenRepeaterIsEmpty(
    record: ProofRuntimeRecord,
    item: LayoutItem,
): boolean {
    return readLayoutRuntimeRepeaterRows(record, item).length === 0;
}
