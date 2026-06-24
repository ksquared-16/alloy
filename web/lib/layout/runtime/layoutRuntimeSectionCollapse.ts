/**
 * Drawer section collapse — read config from LayoutSection + optional session persistence.
 *
 * Presentation-only: never mutates published LayoutDoc.
 */

import type { LayoutDoc, LayoutSection } from "@/lib/layout/layoutV2";
import { patchSection } from "@/lib/layout/builderOps";

export const LAYOUT_SECTION_PERSIST_COLLAPSE_STATE_METADATA_KEY = "persistCollapseState" as const;
export const LAYOUT_SECTION_COLLAPSED_SUMMARY_METADATA_KEY = "collapsedSummary" as const;
export const LAYOUT_RUNTIME_SECTION_COLLAPSE_STORAGE_PREFIX = "layout-runtime-section-collapse" as const;

export type LayoutRuntimeSectionCollapseConfig = {
    collapsible: boolean;
    defaultExpanded: boolean;
    persistCollapseState: boolean;
    collapsedSummary: string | null;
};

export function readLayoutRuntimeSectionCollapseConfig(section: LayoutSection): LayoutRuntimeSectionCollapseConfig {
    const metadata = section.metadata ?? {};
    const collapsedSummaryRaw = metadata[LAYOUT_SECTION_COLLAPSED_SUMMARY_METADATA_KEY];
    const collapsedSummary =
        typeof collapsedSummaryRaw === "string" && collapsedSummaryRaw.trim() ?
            collapsedSummaryRaw.trim()
        :   null;

    return {
        collapsible: section.collapsible === true,
        defaultExpanded: section.defaultExpanded !== false,
        persistCollapseState: metadata[LAYOUT_SECTION_PERSIST_COLLAPSE_STATE_METADATA_KEY] === true,
        collapsedSummary,
    };
}

export function layoutRuntimeSectionCollapseStorageKey(input: {
    anchorEntity: string;
    entityId: string;
    sectionKey: string;
}): string {
    const anchor = input.anchorEntity.trim().toLowerCase() || "unknown";
    const entityId = input.entityId.trim() || "unknown";
    const sectionKey = input.sectionKey.trim() || "section";
    return `${LAYOUT_RUNTIME_SECTION_COLLAPSE_STORAGE_PREFIX}:${anchor}:${entityId}:${sectionKey}`;
}

export function readPersistedLayoutRuntimeSectionExpanded(storageKey: string): boolean | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = window.sessionStorage.getItem(storageKey);
        if (raw === "expanded") return true;
        if (raw === "collapsed") return false;
    } catch {
        return null;
    }
    return null;
}

export function writePersistedLayoutRuntimeSectionExpanded(storageKey: string, expanded: boolean): void {
    if (typeof window === "undefined") return;
    try {
        window.sessionStorage.setItem(storageKey, expanded ? "expanded" : "collapsed");
    } catch {
        // ignore quota / privacy mode
    }
}

export function patchLayoutSectionCollapseMetadata(
    section: LayoutSection,
    patch: Partial<{
        collapsible: boolean;
        defaultExpanded: boolean;
        persistCollapseState: boolean;
        collapsedSummary: string | null;
    }>,
): LayoutSection {
    const metadata: Record<string, unknown> = { ...(section.metadata ?? {}) };

    if (patch.persistCollapseState != null) {
        if (patch.persistCollapseState) {
            metadata[LAYOUT_SECTION_PERSIST_COLLAPSE_STATE_METADATA_KEY] = true;
        } else {
            delete metadata[LAYOUT_SECTION_PERSIST_COLLAPSE_STATE_METADATA_KEY];
        }
    }

    if (patch.collapsedSummary !== undefined) {
        if (patch.collapsedSummary && patch.collapsedSummary.trim()) {
            metadata[LAYOUT_SECTION_COLLAPSED_SUMMARY_METADATA_KEY] = patch.collapsedSummary.trim();
        } else {
            delete metadata[LAYOUT_SECTION_COLLAPSED_SUMMARY_METADATA_KEY];
        }
    }

    return {
        ...section,
        ...(patch.collapsible != null ? { collapsible: patch.collapsible } : {}),
        ...(patch.defaultExpanded != null ? { defaultExpanded: patch.defaultExpanded } : {}),
        metadata,
    };
}

export function patchLayoutDocSectionCollapse(
    doc: LayoutDoc,
    sectionKey: string,
    patch: Partial<{
        collapsible: boolean;
        defaultExpanded: boolean;
        persistCollapseState: boolean;
        collapsedSummary: string | null;
    }>,
): LayoutDoc {
    const sIdx = doc.sections.findIndex((s) => s.key === sectionKey);
    if (sIdx < 0) return doc;
    return patchSection(doc, sIdx, patchLayoutSectionCollapseMetadata(doc.sections[sIdx]!, patch));
}
