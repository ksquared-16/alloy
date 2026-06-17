/**
 * Experience Builder related-list presentation — runtime resolution from item metadata.
 */

import {
    LAYOUT_EDITOR_RELATED_LIST_CONFIG_METADATA_KEY,
    type LayoutEditorRelatedListConfig,
    type LayoutEditorRelatedListPresentationMode,
} from "@/lib/layout/layoutEditorRelatedListConfig";
import type { LayoutItem } from "@/lib/layout/layoutV2";

const PRESENTATION_MODES = new Set<string>(["table", "cards", "compact"]);

function isPresentationMode(v: string): v is LayoutEditorRelatedListPresentationMode {
    return PRESENTATION_MODES.has(v);
}

export function readLayoutEditorRelatedListConfigFromItem(item: LayoutItem): LayoutEditorRelatedListConfig | null {
    const raw = item.metadata?.[LAYOUT_EDITOR_RELATED_LIST_CONFIG_METADATA_KEY];
    if (!raw || typeof raw !== "object") return null;
    const bag = raw as Record<string, unknown>;
    const entityType = bag.entityType;
    if (typeof entityType !== "string") return null;

    const normalizeRow = (rowRaw: unknown) => {
        if (!rowRaw || typeof rowRaw !== "object") return undefined;
        const fields = (rowRaw as { fields?: unknown }).fields;
        if (!Array.isArray(fields)) return undefined;
        const normalized = fields.filter((f): f is string => typeof f === "string" && f.trim().length > 0);
        return normalized.length > 0 ? { fields: normalized } : undefined;
    };

    const presentationMode =
        typeof bag.presentationMode === "string" && isPresentationMode(bag.presentationMode) ?
            bag.presentationMode
        :   "table";

    return {
        entityType: entityType as LayoutEditorRelatedListConfig["entityType"],
        presentationMode,
        primaryRow: normalizeRow(bag.primaryRow) ?? { fields: [] },
        secondaryRow: normalizeRow(bag.secondaryRow),
        tertiaryRow: normalizeRow(bag.tertiaryRow),
    };
}

export function hasEditorRelatedListConfig(item: LayoutItem): boolean {
    return readLayoutEditorRelatedListConfigFromItem(item) != null;
}

export function resolveRelatedListPresentationMode(
    item: LayoutItem,
): LayoutEditorRelatedListPresentationMode {
    return readLayoutEditorRelatedListConfigFromItem(item)?.presentationMode ?? "table";
}

export function relatedListPresentationToDisplayMode(
    mode: LayoutEditorRelatedListPresentationMode | undefined,
): "table" | "rows" | "list" {
    if (mode === "cards") return "rows";
    if (mode === "compact") return "list";
    return "table";
}
