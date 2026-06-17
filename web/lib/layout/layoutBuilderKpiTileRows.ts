/**
 * Experience Builder — KPI tile row packing (presentation metadata only).
 * Uses existing section row-group + span metadata; no LayoutDoc schema changes.
 */

import { makeId, patchSection } from "@/lib/layout/builderOps";
import {
    CARD_WIDTH_FRACTIONS,
    type CardWidthFractionKey,
} from "@/lib/layout/layoutBuilderCardWidth";
import {
    LAYOUT_EDITOR_SECTION_ROW_GROUP_METADATA_KEY,
    LAYOUT_EDITOR_SECTION_ROW_SPAN_METADATA_KEY,
    readSectionRowSpan,
} from "@/lib/layout/layoutEditorSectionLayout";
import { resolveOpportunityDrawerSectionZone } from "@/lib/layout/opportunityDrawerLayoutEditorModel";
import { sectionIsKpiTile } from "@/lib/layout/layoutBuilderWidgetStrip";
import type { LayoutDoc, LayoutSection } from "@/lib/layout/layoutV2";
import type { OpportunityDrawerLayoutZone } from "@/lib/layout/surfaceLayoutRegistry";

export const LAYOUT_EDITOR_KPI_TILE_METADATA_KEY = "layoutEditorKpiTile" as const;

function makeKpiTileRowGroupId(): string {
    return `kpi_row_${makeId("grp").replace(/^grp-/, "")}`;
}

function patchSectionMetadata(
    doc: LayoutDoc,
    sectionKey: string,
    patch: (metadata: Record<string, unknown>) => Record<string, unknown>,
): LayoutDoc {
    const sIdx = doc.sections.findIndex((s) => s.key === sectionKey);
    if (sIdx < 0) return doc;
    const section = doc.sections[sIdx]!;
    const metadata = patch({ ...(section.metadata ?? {}) });
    return patchSection(doc, sIdx, { metadata });
}

function clearKpiTileRowGroup(doc: LayoutDoc, sectionKey: string): LayoutDoc {
    return patchSectionMetadata(doc, sectionKey, (metadata) => {
        const next = { ...metadata };
        delete next[LAYOUT_EDITOR_SECTION_ROW_GROUP_METADATA_KEY];
        return next;
    });
}

function clearKpiTileRowMetadata(doc: LayoutDoc, sectionKey: string): LayoutDoc {
    return patchSectionMetadata(doc, sectionKey, (metadata) => {
        const next = { ...metadata };
        delete next[LAYOUT_EDITOR_SECTION_ROW_GROUP_METADATA_KEY];
        delete next[LAYOUT_EDITOR_SECTION_ROW_SPAN_METADATA_KEY];
        return next;
    });
}

function assignKpiTileRowMetadata(
    doc: LayoutDoc,
    sectionKey: string,
    groupId: string,
    span: number,
): LayoutDoc {
    return patchSectionMetadata(doc, sectionKey, (metadata) => ({
        ...metadata,
        [LAYOUT_EDITOR_KPI_TILE_METADATA_KEY]: true,
        [LAYOUT_EDITOR_SECTION_ROW_GROUP_METADATA_KEY]: groupId,
        [LAYOUT_EDITOR_SECTION_ROW_SPAN_METADATA_KEY]: span,
    }));
}

function kpiTileSectionsInZone(doc: LayoutDoc, zone: OpportunityDrawerLayoutZone): LayoutSection[] {
    return doc.sections.filter(
        (section) =>
            resolveOpportunityDrawerSectionZone(section) === zone && sectionIsKpiTile(section),
    );
}

/** Pack adjacent KPI tiles left-to-right into shared rows when spans fit in 12 columns. */
export function packKpiTilesInZone(doc: LayoutDoc, zone: OpportunityDrawerLayoutZone): LayoutDoc {
    const tiles = kpiTileSectionsInZone(doc, zone);
    if (tiles.length === 0) return doc;

    let next = doc;
    for (const tile of tiles) {
        next = clearKpiTileRowGroup(next, tile.key);
    }

    type RowEntry = { sectionKey: string; span: number };
    let row: RowEntry[] = [];
    let rowSpan = 0;

    const flushRow = () => {
        if (row.length === 0) return;
        if (row.length === 1 && row[0]!.span >= 12) {
            row = [];
            rowSpan = 0;
            return;
        }
        const groupId = makeKpiTileRowGroupId();
        for (const entry of row) {
            next = assignKpiTileRowMetadata(next, entry.sectionKey, groupId, entry.span);
        }
        row = [];
        rowSpan = 0;
    };

    for (const tile of tiles) {
        const section = next.sections.find((s) => s.key === tile.key);
        if (!section) continue;
        const span = Math.min(12, Math.max(1, readSectionRowSpan(section)));
        if (span >= 12) {
            flushRow();
            continue;
        }
        if (rowSpan > 0 && rowSpan + span > 12) flushRow();
        row.push({ sectionKey: tile.key, span });
        rowSpan += span;
    }
    flushRow();

    return next;
}

export function markSectionAsKpiTile(doc: LayoutDoc, sectionKey: string): LayoutDoc {
    return patchSectionMetadata(doc, sectionKey, (metadata) => ({
        ...metadata,
        [LAYOUT_EDITOR_KPI_TILE_METADATA_KEY]: true,
    }));
}

export function setKpiTileSectionTitleHidden(doc: LayoutDoc, sectionKey: string): LayoutDoc {
    const sIdx = doc.sections.findIndex((s) => s.key === sectionKey);
    if (sIdx < 0) return doc;
    return patchSection(doc, sIdx, { title: "" });
}

export function applyKpiTileWidth(
    doc: LayoutDoc,
    sectionKey: string,
    widthKey: CardWidthFractionKey,
): LayoutDoc {
    const section = doc.sections.find((s) => s.key === sectionKey);
    if (!section) return doc;

    let next = markSectionAsKpiTile(doc, sectionKey);
    if (widthKey === "full") {
        next = clearKpiTileRowMetadata(next, sectionKey);
    } else {
        const span = CARD_WIDTH_FRACTIONS[widthKey].span;
        next = patchSectionMetadata(next, sectionKey, (metadata) => {
            const nextMeta = { ...metadata };
            delete nextMeta[LAYOUT_EDITOR_SECTION_ROW_GROUP_METADATA_KEY];
            nextMeta[LAYOUT_EDITOR_KPI_TILE_METADATA_KEY] = true;
            nextMeta[LAYOUT_EDITOR_SECTION_ROW_SPAN_METADATA_KEY] = span;
            return nextMeta;
        });
    }

    const zone = resolveOpportunityDrawerSectionZone(section);
    return packKpiTilesInZone(next, zone);
}

/** After reordering tiles inside a zone, re-run row packing. */
export function repackKpiTilesAfterZoneReorder(doc: LayoutDoc, sectionKey: string): LayoutDoc {
    const section = doc.sections.find((s) => s.key === sectionKey);
    if (!section || !sectionIsKpiTile(section)) return doc;
    return packKpiTilesInZone(doc, resolveOpportunityDrawerSectionZone(section));
}
