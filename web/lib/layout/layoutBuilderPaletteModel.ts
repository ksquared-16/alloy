/**
 * Layout builder palette — business-friendly labels for operator-facing add menus.
 * Presentation only; mutations still go through builderOps wrappers.
 */

import { GLOBAL_WIDGET_CATALOG } from "@/lib/layout/fieldCatalog";
import { LAYOUT_EDITOR_BLOCK_TEMPLATE_CATALOG } from "@/lib/layout/layoutEditorBlockRegistry";
import { OPPORTUNITY_DRAWER_STARTER_TEMPLATES } from "@/lib/layout/layoutEditorOpportunityDrawerStarterTemplates";
import {
    isAllowedChildDrawerWidgetKey,
    isAllowedOpportunityDrawerWidgetKey,
    isAllowedPersonDrawerWidgetKey,
} from "@/lib/layout/surfaceLayoutRegistry";
import type { DrawerLayoutEditorSurfaceKey } from "@/lib/layout/drawerLayoutEditorSurfaceConfig";

export type LayoutBuilderPaletteGroupKey =
    | "starter_templates"
    | "sections"
    | "fields"
    | "widgets"
    | "related_lists"
    | "blocks"
    | "text";

export type LayoutBuilderPaletteGroup = {
    key: LayoutBuilderPaletteGroupKey;
    label: string;
    description: string;
};

export const LAYOUT_BUILDER_PALETTE_GROUPS: LayoutBuilderPaletteGroup[] = [
    {
        key: "starter_templates",
        label: "Starter templates",
        description: "Production-ready drawer patterns.",
    },
    {
        key: "sections",
        label: "Cards",
        description: "Add a new card or content region to the drawer.",
    },
    {
        key: "fields",
        label: "Fields",
        description: "Add a data field to the selected card.",
    },
    {
        key: "widgets",
        label: "Widgets",
        description: "KPI tiles for the top summary strip.",
    },
    {
        key: "related_lists",
        label: "Related lists",
        description: "Contact, children, and household lists.",
    },
    {
        key: "blocks",
        label: "Blocks",
        description: "Household cards, contact cards, and row templates.",
    },
    {
        key: "text",
        label: "Text",
        description: "Headings and helper copy inside a card.",
    },
];

export const LAYOUT_BUILDER_SECTION_ADD_OPTIONS = [
    { key: "custom", label: "Content card", description: "A flexible card for fields and blocks." },
    { key: "widget", label: "KPI widget strip", description: "Summary widgets across the top of the drawer." },
    { key: "related_list", label: "Related list", description: "Repeating contacts, children, or relationships." },
] as const;

export const LAYOUT_BUILDER_STARTER_TEMPLATES = OPPORTUNITY_DRAWER_STARTER_TEMPLATES;

export function isAllowedDrawerLayoutWidgetKey(
    surfaceKey: DrawerLayoutEditorSurfaceKey,
    widgetKey: string,
): boolean {
    const trimmed = widgetKey.trim();
    if (!trimmed) return false;
    if (surfaceKey === "person_drawer") return isAllowedPersonDrawerWidgetKey(trimmed);
    if (surfaceKey === "child_drawer") return isAllowedChildDrawerWidgetKey(trimmed);
    return isAllowedOpportunityDrawerWidgetKey(trimmed);
}

export function layoutBuilderWidgetOptionsForSurface(
    surfaceKey: DrawerLayoutEditorSurfaceKey = "opportunity_drawer",
) {
    return GLOBAL_WIDGET_CATALOG.filter(
        (w) =>
            isAllowedDrawerLayoutWidgetKey(surfaceKey, w.widgetKey)
            && (!w.relevantSurfaces?.length || w.relevantSurfaces.includes("drawer")),
    ).map((w) => ({
        key: w.widgetKey,
        label: w.label,
        description: w.description,
    }));
}

export const LAYOUT_BUILDER_WIDGET_OPTIONS = layoutBuilderWidgetOptionsForSurface("opportunity_drawer");

export const LAYOUT_BUILDER_BLOCK_OPTIONS = LAYOUT_EDITOR_BLOCK_TEMPLATE_CATALOG.map((t) => ({
    key: t.key,
    label: t.label.replace(/\s*\(starter\)\s*/i, ""),
    description: t.description,
    runtimeEffective: t.runtimeEffective,
}));

/** Friendly section key labels for registered add buttons. */
export function layoutBuilderFriendlySectionKeyLabel(key: string): string {
    return key
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .replace(/Kpi/g, "KPI");
}
