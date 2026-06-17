/**
 * Layout editor — runtime inspect metadata for preview transparency.
 */

import type { LayoutEditorFieldNode, LayoutEditorBlockNode } from "@/lib/layout/layoutEditorCompositionModel";
import { LAYOUT_LINK_BEHAVIOR_LABELS } from "@/lib/layout/layoutEditorDisplayConfig";
import { LAYOUT_EDITOR_VISIBILITY_PRESETS } from "@/lib/layout/layoutEditorVisibilityRules";

export type LayoutEditorInspectInfo = {
    blockTitle: string;
    fieldTitle: string;
    refKey: string;
    displayType: string;
    visibilityLabel: string;
    sourceLabel: string;
    serializedPath: string;
};

export function buildLayoutEditorInspectInfo(
    block: LayoutEditorBlockNode,
    field: LayoutEditorFieldNode,
): LayoutEditorInspectInfo {
    const visibilityPreset = LAYOUT_EDITOR_VISIBILITY_PRESETS.find((p) => p.key === field.visibilityRule);
    const linkBehavior = field.displayConfig.linkBehavior;
    const displayType = field.displayConfig.displayType ?? "text";

    return {
        blockTitle: block.title,
        fieldTitle: field.title,
        refKey: field.refKey,
        displayType: linkBehavior && linkBehavior !== "none" ?
            LAYOUT_LINK_BEHAVIOR_LABELS[linkBehavior]
        :   displayType,
        visibilityLabel: visibilityPreset?.label ?? field.visibilityRule.replace(/_/g, " "),
        sourceLabel: field.refKey.split(".").slice(-1)[0]?.replace(/_/g, " ") ?? field.refKey,
        serializedPath: field.path.kind === "field" ?
            `field:${field.path.sectionKey}:${field.path.itemId}`
        :   field.path.kind === "group_field" ?
            `group:${field.path.sectionKey}:${field.path.blockItemId}:${field.path.gr}:${field.path.gc}:${field.path.fieldId}`
        :   `column:${field.path.sectionKey}:${field.path.blockItemId}:${field.path.colIdx}`,
    };
}

export function buildLayoutEditorItemIdPathIndex(
    sectionKey: string,
    blocks: LayoutEditorBlockNode[],
): {
    byItemId: Map<string, LayoutEditorInspectInfo>;
    byRefKey: Map<string, LayoutEditorInspectInfo>;
} {
    const byItemId = new Map<string, LayoutEditorInspectInfo>();
    const byRefKey = new Map<string, LayoutEditorInspectInfo>();
    for (const block of blocks) {
        if (block.kind === "widget" && block.itemId) {
            const info: LayoutEditorInspectInfo = {
                blockTitle: block.title,
                fieldTitle: block.title,
                refKey: block.title,
                displayType: "widget",
                visibilityLabel: "Always show",
                sourceLabel: "widget",
                serializedPath: `field:${sectionKey}:${block.itemId}`,
            };
            byItemId.set(block.itemId, info);
            continue;
        }
        for (const field of block.children) {
            const info = buildLayoutEditorInspectInfo(block, field);
            if (field.path.kind === "field") {
                byItemId.set(field.path.itemId, info);
            } else if (field.path.kind === "group_field") {
                byItemId.set(field.path.fieldId, info);
            } else {
                byItemId.set(`${field.path.blockItemId}:${field.path.colIdx}`, info);
            }
            byRefKey.set(field.refKey, info);
        }
    }
    return { byItemId, byRefKey };
}
