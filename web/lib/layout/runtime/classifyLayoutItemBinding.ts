/**
 * Classify LayoutItem → value binding plan (Phase 1).
 *
 * Pure classification for runtime plans and tests. Uses explicit metadata when
 * present; otherwise infers from item kind + namespaced refKey.
 */

import { parseRefKey } from "../fieldCatalog";
import type { LayoutItem, LayoutItemKind } from "../layoutV2";
import {
    LAYOUT_BINDING_METADATA_KEY,
    readItemBindingMetadata,
    type LayoutContractBlockKind,
    type LayoutItemBindingMetadata,
    type LayoutValueBindingClass,
} from "./valueBinding";

export type LayoutItemBindingPlan = {
    itemId: string;
    itemKind: LayoutItemKind;
    refKey: string;
    bindingClass: LayoutValueBindingClass;
    contractBlockKind: LayoutContractBlockKind;
    relationKey?: string;
    locationRole?: string;
    computeKey?: string;
    sourceEntity: string;
    fieldKey: string;
    /** True when refKey entity ≠ layout anchor (opportunity) — relationship/reference read. */
    isCrossEntity: boolean;
};

function contractBlockForItemKind(kind: LayoutItemKind, bindingClass: LayoutValueBindingClass): LayoutContractBlockKind {
    if (kind === "widget_placeholder" || bindingClass === "widget") return "widget";
    if (kind === "related_list" || bindingClass === "repeater") return "repeater";
    if (bindingClass === "relationship_field" || bindingClass === "reference_field") return "relationship_section";
    return "section";
}

function inferBindingClass(
    item: LayoutItem,
    anchorEntity: string,
    parsed: { entityKey: string; fieldKey: string },
    explicit: LayoutItemBindingMetadata | null,
): LayoutValueBindingClass {
    if (explicit?.bindingClass) return explicit.bindingClass;
    if (item.kind === "widget_placeholder") return "widget";
    if (item.kind === "related_list") return "repeater";
    if (explicit?.computeKey) return "computed_projection";
    if (explicit?.locationRole || explicit?.relationKey?.includes("location") || explicit?.relationKey?.includes("address")) {
        return "reference_field";
    }
    if (parsed.entityKey !== anchorEntity && parsed.entityKey !== "opportunity") {
        return "relationship_field";
    }
    if (parsed.entityKey === "child_inquiry") {
        return "relationship_field";
    }
    return "base_field";
}

/** Classify one layout item for runtime binding plan. */
export function classifyLayoutItemBinding(item: LayoutItem, anchorEntity: string): LayoutItemBindingPlan {
    const explicit = readItemBindingMetadata(item);
    const parsed = parseRefKey(item.refKey);
    const sourceEntity = explicit?.sourceEntity ?? item.sourceEntity ?? parsed.entityKey;
    const fieldKey = explicit?.fieldKey ?? parsed.fieldKey;
    const bindingClass = inferBindingClass(item, anchorEntity, { entityKey: sourceEntity, fieldKey }, explicit);
    const contractBlockKind = explicit?.contractBlockKind ?? contractBlockForItemKind(item.kind, bindingClass);
    const isCrossEntity = sourceEntity !== anchorEntity && sourceEntity !== "opportunity";

    return {
        itemId: item.id,
        itemKind: item.kind,
        refKey: item.refKey,
        bindingClass,
        contractBlockKind,
        relationKey: explicit?.relationKey,
        locationRole: explicit?.locationRole,
        computeKey: explicit?.computeKey,
        sourceEntity,
        fieldKey,
        isCrossEntity,
    };
}

/** Attach binding metadata to an item (returns new item — immutable). */
export function withItemBinding(item: LayoutItem, binding: LayoutItemBindingMetadata): LayoutItem {
    return {
        ...item,
        metadata: {
            ...(item.metadata ?? {}),
            [LAYOUT_BINDING_METADATA_KEY]: binding,
        },
    };
}

/** Walk all items in a layout doc (sections → rows → columns → items). */
export function collectLayoutItems(doc: { sections: Array<{ rows: Array<{ columns: Array<{ items: LayoutItem[] }> }> }> }): LayoutItem[] {
    const out: LayoutItem[] = [];
    for (const section of doc.sections) {
        for (const row of section.rows) {
            for (const col of row.columns) {
                for (const item of col.items) {
                    out.push(item);
                    if (item.items?.length) out.push(...item.items);
                    if (item.rows?.length) {
                        for (const subRow of item.rows) {
                            for (const subCol of subRow.columns) {
                                out.push(...subCol.items);
                            }
                        }
                    }
                }
            }
        }
    }
    return out;
}
