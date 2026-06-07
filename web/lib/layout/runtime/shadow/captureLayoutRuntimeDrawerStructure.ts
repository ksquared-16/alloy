/**
 * Capture layout runtime opportunity drawer structure for shadow parity (Phase 3).
 */

import type { LayoutDoc, LayoutItem } from "@/lib/layout/layoutV2";
import { buildLayoutRuntimePlan, type LayoutRuntimePlan } from "../layoutRuntimePlan";
import { classifyLayoutItemBinding } from "../classifyLayoutItemBinding";
import { collectLayoutItems } from "../classifyLayoutItemBinding";
import type { DrawerStructureNode, DrawerStructureSnapshot } from "./drawerStructureSnapshot";
import type { LayoutValueBindingClass } from "../valueBinding";

function nodeKindForBinding(
    itemKind: LayoutItem["kind"],
    bindingClass: LayoutValueBindingClass,
): DrawerStructureNode["kind"] {
    if (itemKind === "widget_placeholder" || bindingClass === "widget") return "widget";
    if (itemKind === "related_list" || bindingClass === "repeater") return "repeater";
    if (bindingClass === "relationship_field" || bindingClass === "reference_field") return "relationship_section";
    if (itemKind === "field_group") return "field_group";
    return "field";
}

function captureItem(
    nodes: DrawerStructureNode[],
    item: LayoutItem,
    sectionKey: string,
    anchorEntity: string,
    bindingPlan?: ReturnType<typeof classifyLayoutItemBinding>,
): void {
    const binding = bindingPlan ?? classifyLayoutItemBinding(item, anchorEntity);
    const kind = nodeKindForBinding(item.kind, binding.bindingClass);
    const path = `overview.${sectionKey}.${item.refKey}`;

    pushNode(nodes, {
        kind,
        key: item.refKey,
        refKey: item.refKey,
        label: item.label,
        path,
        bindingClass: binding.bindingClass,
    });

    if (item.kind === "field_group") {
        for (const child of item.items ?? []) {
            captureItem(nodes, child, sectionKey, anchorEntity);
        }
        if (item.rows?.length) {
            for (const row of item.rows) {
                for (const col of row.columns) {
                    for (const child of col.items) {
                        captureItem(nodes, child, sectionKey, anchorEntity);
                    }
                }
            }
        }
    }

    if (item.kind === "related_list" && item.columns?.length) {
        for (const col of item.columns) {
            pushNode(nodes, {
                kind: "field",
                key: col.refKey,
                refKey: col.refKey,
                label: col.label,
                path: `${path}.column.${col.refKey}`,
                bindingClass: binding.bindingClass,
            });
        }
    }
}

function pushNode(nodes: DrawerStructureNode[], node: DrawerStructureNode): void {
    nodes.push(node);
}

export type CaptureLayoutRuntimeInput = {
    doc: LayoutDoc;
    plan?: LayoutRuntimePlan;
    recordId?: string;
};

/** Capture comparable structure from resolved layout doc + runtime plan. */
export function captureLayoutRuntimeDrawerStructure(input: CaptureLayoutRuntimeInput): DrawerStructureSnapshot {
    const { doc, recordId } = input;
    const plan = input.plan ?? buildLayoutRuntimePlan(doc);
    const nodes: DrawerStructureNode[] = [];
    const anchorEntity = doc.entityType;

    pushNode(nodes, { kind: "tab", key: "overview", path: "tabs.overview" });

    for (const section of doc.sections) {
        pushNode(nodes, {
            kind: "section",
            key: section.key,
            label: section.title,
            path: `overview.${section.key}`,
        });
    }

    for (const item of collectLayoutItems(doc)) {
        const sectionKey =
            doc.sections.find((s) =>
                s.rows.some((r) => r.columns.some((c) => c.items.some((i) => i.id === item.id))),
            )?.key ?? "unknown";
        captureItem(nodes, item, sectionKey, anchorEntity);
    }

    return {
        source: "layout_runtime",
        entityType: "opportunities",
        recordId,
        tabs: ["overview"],
        defaultTab: "overview",
        nodes,
        scopeNote: "Layout runtime models overview body; VM tabs are compared separately.",
    };
}
