/**
 * Per-item drawer body evidence — staging diagnostics for blank-body investigation.
 */

import type { LayoutDoc, LayoutSection } from "../layoutV2";
import { collectLayoutItems } from "./classifyLayoutItemBinding";
import { classifyLayoutItemBinding } from "./classifyLayoutItemBinding";
import { isLayoutItemSupportedForProduction } from "./isLayoutItemSupportedForProduction";
import { resolveProofBindingValue, shouldRenderProofItem } from "./resolveProofBindingValue";
import type { ProofRuntimeRecord } from "./proofRecordContext";

export type LayoutRuntimeBodyItemEvidence = {
    sectionId: string;
    sectionTitle: string;
    itemId: string;
    kind: string;
    refKey: string;
    label: string;
    supported: boolean;
    valueFound: boolean;
    rendered: boolean;
    omitReason: string | null;
};

function sectionForItem(doc: LayoutDoc, itemId: string): LayoutSection | null {
    for (const section of doc.sections ?? []) {
        for (const row of section.rows ?? []) {
            for (const col of row.columns ?? []) {
                const walk = (items: typeof col.items): boolean => {
                    for (const it of items) {
                        if (it.id === itemId) return true;
                        if (it.items?.length && walk(it.items)) return true;
                        if (it.rows?.length) {
                            for (const r of it.rows) {
                                for (const c of r.columns) {
                                    if (walk(c.items)) return true;
                                }
                            }
                        }
                    }
                    return false;
                };
                if (walk(col.items)) return section;
            }
        }
    }
    return null;
}

function itemHasValue(
    record: ProofRuntimeRecord,
    item: ReturnType<typeof collectLayoutItems>[number],
    anchorEntity: string,
): boolean {
    if (item.kind === "widget_placeholder") {
        const raw = record[item.refKey];
        return Array.isArray(raw) && raw.length > 0;
    }
    if (item.kind === "related_list") {
        const raw = record[item.source ?? item.refKey];
        return Array.isArray(raw) && raw.length > 0;
    }
    const binding = classifyLayoutItemBinding(item, anchorEntity);
    const resolved = resolveProofBindingValue(record, item, anchorEntity, binding);
    return !resolved.isPlaceholder && !resolved.omitted;
}

/** Build per configured item evidence for drawer body staging dumps. */
export function buildLayoutRuntimeDrawerBodyItemEvidence(
    doc: LayoutDoc | null | undefined,
    record: ProofRuntimeRecord | null | undefined,
): LayoutRuntimeBodyItemEvidence[] {
    if (!doc?.sections?.length || !record) return [];

    const anchorEntity = doc.entityType ?? "opportunities";
    const items = collectLayoutItems(doc);

    return items.map((item) => {
        const section = sectionForItem(doc, item.id);
        const supported = shouldRenderProofItem(item) && isLayoutItemSupportedForProduction(item);
        const valueFound = itemHasValue(record, item, anchorEntity);
        let omitReason: string | null = null;

        if (!shouldRenderProofItem(item)) omitReason = "hidden_by_layout_authoring";
        else if (!isLayoutItemSupportedForProduction(item)) omitReason = "unsupported_in_production";
        else if (item.kind === "related_list" && item.displayMode !== "table") omitReason = "non_table_repeater";

        const rendered = supported && omitReason == null;

        return {
            sectionId: section?.id ?? "—",
            sectionTitle: section?.title ?? "—",
            itemId: item.id,
            kind: item.kind,
            refKey: item.refKey,
            label: item.label?.trim() || item.refKey,
            supported,
            valueFound,
            rendered,
            omitReason,
        };
    });
}
