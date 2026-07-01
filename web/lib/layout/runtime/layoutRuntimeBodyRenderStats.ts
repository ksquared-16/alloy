/**
 * Layout runtime body render diagnostics — staging + empty-body fallback.
 */

import type { LayoutDoc } from "../layoutV2";
import { collectLayoutItems } from "./classifyLayoutItemBinding";
import { classifyLayoutItemBinding } from "./classifyLayoutItemBinding";
import { readLayoutRuntimeRepeaterRows } from "./readLayoutRuntimeRepeaterRows";
import { isLayoutItemSupportedForProduction } from "./isLayoutItemSupportedForProduction";
import { resolveProofBindingValue, shouldRenderProofItem } from "./resolveProofBindingValue";
import type { ProofRuntimeRecord } from "./proofRecordContext";

export type LayoutRuntimeBodyRenderStats = {
    sectionCount: number;
    totalItemCount: number;
    productionSupportedCount: number;
    renderableItemCount: number;
    itemsWithValueCount: number;
    fallbackReason: string | null;
};

function widgetWouldRender(record: ProofRuntimeRecord, refKey: string): boolean {
    const raw = record[refKey];
    return Array.isArray(raw) && raw.length > 0;
}

function itemHasOperatorValue(
    record: ProofRuntimeRecord,
    item: ReturnType<typeof collectLayoutItems>[number],
    anchorEntity: string,
): boolean {
    if (item.kind === "widget_placeholder") {
        if (item.refKey === "tasks" || item.refKey === "reminders") {
            return widgetWouldRender(record, item.refKey);
        }
        return false;
    }

    if (item.kind === "related_list") {
        const rows = readLayoutRuntimeRepeaterRows(record, item);
        if (rows.length > 0) return true;
        return item.displayMode === "table";
    }

    if (item.kind === "field_group") {
        const nested = [...(item.items ?? [])];
        if (item.rows?.length) {
            for (const row of item.rows) {
                for (const col of row.columns) {
                    nested.push(...col.items);
                }
            }
        }
        return nested.some((child) => itemHasOperatorValue(record, child, anchorEntity));
    }

    const binding = classifyLayoutItemBinding(item, anchorEntity);
    const resolved = resolveProofBindingValue(record, item, anchorEntity, binding);
    return !resolved.isPlaceholder && !resolved.omitted;
}

/** Count production-safe items that would produce visible drawer body content. */
export function computeLayoutRuntimeBodyRenderStats(
    doc: LayoutDoc | null | undefined,
    record: ProofRuntimeRecord | null | undefined,
): LayoutRuntimeBodyRenderStats {
    const empty: LayoutRuntimeBodyRenderStats = {
        sectionCount: 0,
        totalItemCount: 0,
        productionSupportedCount: 0,
        renderableItemCount: 0,
        itemsWithValueCount: 0,
        fallbackReason: "missing_doc_or_record",
    };

    if (!doc?.sections?.length || !record) return empty;

    const anchorEntity = doc.entityType ?? "opportunities";
    const allItems = collectLayoutItems(doc);
    const supported = allItems.filter(
        (item) => shouldRenderProofItem(item) && isLayoutItemSupportedForProduction(item),
    );

    let itemsWithValueCount = 0;

    for (const item of supported) {
        if (itemHasOperatorValue(record, item, anchorEntity)) itemsWithValueCount += 1;
    }

    // Configured production-safe items always render structure (labels + placeholders).
    const renderableItemCount = supported.length;

    let fallbackReason: string | null = null;
    if (supported.length === 0) fallbackReason = "no_production_supported_items";

    return {
        sectionCount: doc.sections.length,
        totalItemCount: allItems.length,
        productionSupportedCount: supported.length,
        renderableItemCount,
        itemsWithValueCount,
        fallbackReason,
    };
}
