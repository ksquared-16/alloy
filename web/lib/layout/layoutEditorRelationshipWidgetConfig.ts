/**
 * Experience Builder — relationship widget config (child-scoped contacts).
 */

import type { LayoutItem } from "@/lib/layout/layoutV2";
import type { SurfaceLayoutKey } from "@/lib/layout/surfaceLayoutRegistry";
import {
    defaultRelationshipWidgetConfig,
    isRelationshipWidgetKey,
    LAYOUT_EDITOR_RELATIONSHIP_WIDGET_CONFIG_METADATA_KEY,
    type LayoutRuntimeRelationshipWidgetConfig,
    type RelationshipWidgetKey,
} from "@/lib/layout/runtime/layoutRuntimeScopedRelationshipContacts";

export function readLayoutEditorRelationshipWidgetConfig(
    item: Pick<LayoutItem, "refKey" | "metadata">,
): LayoutRuntimeRelationshipWidgetConfig | null {
    const widgetKey = String(item.refKey ?? "").trim();
    if (!isRelationshipWidgetKey(widgetKey)) return null;
    const raw = item.metadata?.[LAYOUT_EDITOR_RELATIONSHIP_WIDGET_CONFIG_METADATA_KEY];
    if (!raw || typeof raw !== "object") {
        return defaultRelationshipWidgetConfig(widgetKey);
    }
    return {
        ...defaultRelationshipWidgetConfig(widgetKey),
        ...(raw as Partial<LayoutRuntimeRelationshipWidgetConfig>),
    };
}

export function writeLayoutEditorRelationshipWidgetConfig(
    metadata: Record<string, unknown> | undefined,
    config: LayoutRuntimeRelationshipWidgetConfig,
): Record<string, unknown> {
    return {
        ...(metadata ?? {}),
        [LAYOUT_EDITOR_RELATIONSHIP_WIDGET_CONFIG_METADATA_KEY]: config,
    };
}

export function defaultRelationshipWidgetConfigForSurface(
    widgetKey: RelationshipWidgetKey,
    surfaceKey: SurfaceLayoutKey,
): LayoutRuntimeRelationshipWidgetConfig {
    const base = defaultRelationshipWidgetConfig(widgetKey);
    if (surfaceKey === "child_drawer") {
        return { ...base, scope: "child", includeHouseholdFallback: true, excludeActiveRecord: true };
    }
    if (surfaceKey === "person_drawer" && widgetKey === "related_children_for_person") {
        return { ...base, scope: "person", displayMode: "grouped_by_child" };
    }
    if (surfaceKey === "opportunity_drawer") {
        return { ...base, scope: "opportunity", displayMode: "grouped_by_child", includeHouseholdFallback: false };
    }
    return base;
}
