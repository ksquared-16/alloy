/**
 * Resolve the queue card children repeater item from a layout doc.
 *
 * Published queue layouts may use:
 * - related_list in body.children (default lead doc), or
 * - scalar child.* fields in body.children (published v9+) without a related_list.
 *
 * When only scalar child fields exist, synthesize a virtual related_list so the
 * queue card can render one row per child with configured column refKeys.
 */

import type { LayoutCollectionColumn, LayoutItem } from "../layoutV2";
import { enrichInferredChildRepeaterColumns } from "./layoutRuntimeLinkHarness";
import { inferLayoutRepeaterColumnsFromRows } from "./inferLayoutRepeaterColumnsFromRows";
import type { ProofRuntimeRecord } from "./proofRecordContext";
import { readLayoutRuntimeRepeaterRows } from "./readLayoutRuntimeRepeaterRows";

const CHILD_FIELD_PREFIX = "child.";
const INQUIRY_CHILD_FIELD_PREFIX = "inquiry_child.";

export function isChildZoneScalarField(item: LayoutItem): boolean {
    return (
        item.kind === "field" &&
        (item.refKey.startsWith(CHILD_FIELD_PREFIX) || item.refKey.startsWith(INQUIRY_CHILD_FIELD_PREFIX))
    );
}

function scalarFieldToColumn(item: LayoutItem): LayoutCollectionColumn {
    return {
        refKey: item.refKey,
        label: item.label ?? item.refKey,
        renderHint: item.renderHint,
        adornment: item.adornment,
        template: item.template,
        width: "flexible",
    };
}

/** Collect configured children zone items (body.children + body.child). */
export function queueBodyChildrenZoneItems(fieldsByZone: Record<string, LayoutItem[]>): LayoutItem[] {
    return [
        ...(fieldsByZone["body.children"] ?? []),
        ...(fieldsByZone["body.child"] ?? []),
    ];
}

function resolveRepeaterColumns(
    item: LayoutItem,
    zoneItems: LayoutItem[],
    record: ProofRuntimeRecord,
): LayoutCollectionColumn[] {
    const existing = item.columns ?? [];
    if (existing.length > 0) return existing;

    const fromScalars = zoneItems.filter(isChildZoneScalarField).map(scalarFieldToColumn);
    if (fromScalars.length > 0) return fromScalars;

    const rows = readLayoutRuntimeRepeaterRows(record, item);
    return inferLayoutRepeaterColumnsFromRows(rows);
}

function withResolvedRepeaterColumns(
    item: LayoutItem,
    zoneItems: LayoutItem[],
    record: ProofRuntimeRecord,
): LayoutItem {
    const columns = enrichInferredChildRepeaterColumns(resolveRepeaterColumns(item, zoneItems, record));
    if (columns.length === 0 || columns === item.columns) return item;
    return { ...item, columns };
}

/**
 * Prefer explicit related_list; otherwise synthesize one from scalar child.* fields
 * when the runtime record carries repeater rows.
 */
export function resolveQueueCardChildrenRepeaterItem(
    zoneItems: LayoutItem[],
    record: ProofRuntimeRecord,
): LayoutItem | null {
    const related = zoneItems.find((item) => item.kind === "related_list");
    if (related) {
        const resolved = withResolvedRepeaterColumns(related, zoneItems, record);
        const rows = readLayoutRuntimeRepeaterRows(record, resolved);
        return rows.length > 0 && (resolved.columns?.length ?? 0) > 0 ? resolved : null;
    }

    const scalarChildFields = zoneItems.filter(isChildZoneScalarField);
    if (scalarChildFields.length === 0) return null;

    const synthetic: LayoutItem = {
        id: "queue-synthetic-children-repeater",
        kind: "related_list",
        refKey: "children",
        source: "children",
        displayMode: "rows",
        related: { entityType: "child" },
        columns: scalarChildFields.map(scalarFieldToColumn),
    };

    const rows = readLayoutRuntimeRepeaterRows(record, synthetic);
    return rows.length > 0 ? synthetic : null;
}

/** Scalar child fields that should not duplicate repeater row output. */
export function queueBodyChildrenScalarFieldsExcludingRepeater(
    zoneItems: LayoutItem[],
    repeaterItem: LayoutItem | null,
): LayoutItem[] {
    if (!repeaterItem) {
        return zoneItems.filter((item) => item.kind !== "related_list");
    }

    const repeaterRefKeys = new Set((repeaterItem.columns ?? []).map((col) => col.refKey));
    return zoneItems.filter((item) => {
        if (item.kind === "related_list") return false;
        if (isChildZoneScalarField(item) && repeaterRefKeys.has(item.refKey)) return false;
        return true;
    });
}
