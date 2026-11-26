/**
 * Focus Panel Surface Definition — library catalog for the Surface Composer.
 *
 * Contributes pickable components only. Search, grouping, and library UI live in
 * the shared Surface Composer.
 */

import {
    FOCUS_PANEL_CARD_EVIDENCE_GROUPS,
    type CompositionEvidenceGroupDef,
} from "@/lib/adminV2/settings/surfaces/compositionEvidenceGroupRegistry";
import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import {
    SURFACE_HEADER_RENDERER_KEYS,
    SURFACE_HEADER_RENDERER_LABELS,
    type SurfaceHeaderRendererKey,
} from "@/lib/adminV2/settings/surfaces/surfaceHeaderSummaryModel";
import {
    groupSurfaceComposerLibrary,
    type SurfaceComposerLibraryCategory,
} from "@/lib/adminV2/settings/surfaces/surfaceComposerLibraryModel";

export type FocusPanelLibraryCategoryKey =
    | "identity"
    | "enrollment"
    | "work"
    | "related"
    | "documents"
    | "communication"
    | "nested";

export type FocusPanelLibraryFieldItem = {
    kind: "field";
    cardKey: FocusPanelCardKey;
    groupKey: string;
    groupLabel: string;
    concept: string;
    label: string;
    category: FocusPanelLibraryCategoryKey;
};

export type FocusPanelLibraryHeaderItem = {
    kind: "header_renderer";
    rendererKey: SurfaceHeaderRendererKey;
    label: string;
    category: "identity";
};

export type FocusPanelLibraryItem = FocusPanelLibraryFieldItem | FocusPanelLibraryHeaderItem;

const CATEGORY_LABELS: Record<FocusPanelLibraryCategoryKey, string> = {
    identity: "Identity",
    enrollment: "Enrollment",
    work: "Work",
    related: "Related",
    documents: "Documents",
    communication: "Communication",
    nested: "Nested",
};

const CATEGORY_ORDER: FocusPanelLibraryCategoryKey[] = [
    "identity",
    "enrollment",
    "work",
    "related",
    "documents",
    "communication",
    "nested",
];

function categoryForGroup(cardKey: FocusPanelCardKey, group: CompositionEvidenceGroupDef): FocusPanelLibraryCategoryKey {
    if (cardKey === "household" || cardKey === "children") return "identity";
    if (cardKey === "current_work" || cardKey === "readiness_kpi") return "work";
    if (cardKey === "communications" || cardKey === "timeline") return "communication";
    if (group.key.includes("document")) return "documents";
    if (group.key.includes("placement") || group.key.includes("readiness")) return "enrollment";
    return "related";
}

function labelForConcept(concept: string): string {
    const parts = concept.split("→").map((p) => p.trim());
    return parts[parts.length - 1] ?? concept;
}

export function buildFocusPanelLibraryForCard(cardKey: FocusPanelCardKey): FocusPanelLibraryFieldItem[] {
    const groups = FOCUS_PANEL_CARD_EVIDENCE_GROUPS[cardKey] ?? [];
    const items: FocusPanelLibraryFieldItem[] = [];
    for (const group of groups) {
        for (const fieldKey of group.defaultFieldKeys) {
            items.push({
                kind: "field",
                cardKey,
                groupKey: group.key,
                groupLabel: group.label,
                concept: fieldKey,
                label: labelForConcept(fieldKey),
                category: categoryForGroup(cardKey, group),
            });
        }
    }
    return items;
}

export function buildFocusPanelHeaderLibrary(): FocusPanelLibraryHeaderItem[] {
    return SURFACE_HEADER_RENDERER_KEYS.map((rendererKey) => ({
        kind: "header_renderer" as const,
        rendererKey,
        label: SURFACE_HEADER_RENDERER_LABELS[rendererKey],
        category: "identity" as const,
    }));
}

/** @deprecated Use buildFocusPanelHeaderLibrary */
export const buildFocusPanelIdentityLibrary = buildFocusPanelHeaderLibrary;

export function focusPanelLibraryCategories(
    items: readonly FocusPanelLibraryItem[],
): SurfaceComposerLibraryCategory<FocusPanelLibraryItem>[] {
    return groupSurfaceComposerLibrary(
        items,
        CATEGORY_ORDER,
        (key) => CATEGORY_LABELS[key as FocusPanelLibraryCategoryKey] ?? key,
        (item) => item.category,
    );
}

/** @deprecated Use focusPanelLibraryCategories */
export function libraryItemsByCategory(items: readonly FocusPanelLibraryItem[]) {
    return focusPanelLibraryCategories(items);
}

/** @deprecated Use SurfaceItemLibraryPanel built-in search */
export function filterFocusPanelLibrary(items: readonly FocusPanelLibraryItem[], search: string): FocusPanelLibraryItem[] {
    const q = search.trim().toLowerCase();
    if (!q) return [...items];
    return items.filter((item) => {
        if (item.kind === "header_renderer") return item.label.toLowerCase().includes(q);
        return (
            item.label.toLowerCase().includes(q) ||
            item.concept.toLowerCase().includes(q) ||
            item.groupLabel.toLowerCase().includes(q)
        );
    });
}
