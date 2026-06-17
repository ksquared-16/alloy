/**
 * Experience Builder — peer card row packing (presentation metadata only).
 * Packs fractional-width cards left-to-right within a layout zone.
 */

import { makeId, patchSection } from "@/lib/layout/builderOps";
import {
    CARD_WIDTH_FRACTIONS,
    setCardWidthFraction,
    type CardWidthFractionKey,
} from "@/lib/layout/layoutBuilderCardWidth";
import {
    LAYOUT_EDITOR_SECTION_ROW_GROUP_METADATA_KEY,
    LAYOUT_EDITOR_SECTION_ROW_SPAN_METADATA_KEY,
    readSectionRowSpan,
} from "@/lib/layout/layoutEditorSectionLayout";
import { resolveOpportunityDrawerSectionZone } from "@/lib/layout/opportunityDrawerLayoutEditorModel";
import { sectionIsWidgetStrip } from "@/lib/layout/layoutBuilderWidgetStrip";
import type { LayoutDoc, LayoutSection } from "@/lib/layout/layoutV2";
import type { OpportunityDrawerLayoutZone } from "@/lib/layout/surfaceLayoutRegistry";

export const LAYOUT_EDITOR_KPI_TILE_METADATA_KEY = "layoutEditorKpiTile" as const;

function makePeerCardRowGroupId(): string {
    return `peer_row_${makeId("grp").replace(/^grp-/, "")}`;
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

function clearPeerCardRowGroup(doc: LayoutDoc, sectionKey: string): LayoutDoc {
    return patchSectionMetadata(doc, sectionKey, (metadata) => {
        const next = { ...metadata };
        delete next[LAYOUT_EDITOR_SECTION_ROW_GROUP_METADATA_KEY];
        return next;
    });
}

function clearPeerCardRowSpan(doc: LayoutDoc, sectionKey: string): LayoutDoc {
    return patchSectionMetadata(doc, sectionKey, (metadata) => {
        const next = { ...metadata };
        delete next[LAYOUT_EDITOR_SECTION_ROW_GROUP_METADATA_KEY];
        delete next[LAYOUT_EDITOR_SECTION_ROW_SPAN_METADATA_KEY];
        return next;
    });
}

function assignPeerCardRowMetadata(
    doc: LayoutDoc,
    sectionKey: string,
    groupId: string,
    span: number,
): LayoutDoc {
    return patchSectionMetadata(doc, sectionKey, (metadata) => ({
        ...metadata,
        [LAYOUT_EDITOR_SECTION_ROW_GROUP_METADATA_KEY]: groupId,
        [LAYOUT_EDITOR_SECTION_ROW_SPAN_METADATA_KEY]: span,
    }));
}

/** True when a section participates in automatic row packing (fractional width, not a legacy widget strip). */
export function sectionIsPackablePeerCard(section: LayoutSection): boolean {
    if (sectionIsWidgetStrip(section)) return false;
    return readSectionRowSpan(section) < 12;
}

function packablePeerSectionsInZone(doc: LayoutDoc, zone: OpportunityDrawerLayoutZone): LayoutSection[] {
    return doc.sections.filter(
        (section) =>
            resolveOpportunityDrawerSectionZone(section) === zone && sectionIsPackablePeerCard(section),
    );
}

/** Pack adjacent fractional-width peer cards left-to-right when spans fit in 12 columns. */
export function packPeerCardsInZone(doc: LayoutDoc, zone: OpportunityDrawerLayoutZone): LayoutDoc {
    const packable = packablePeerSectionsInZone(doc, zone);
    if (packable.length === 0) return doc;

    let next = doc;
    for (const section of packable) {
        next = clearPeerCardRowGroup(next, section.key);
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
        const groupId = makePeerCardRowGroupId();
        for (const entry of row) {
            next = assignPeerCardRowMetadata(next, entry.sectionKey, groupId, entry.span);
        }
        row = [];
        rowSpan = 0;
    };

    for (const section of packable) {
        const current = next.sections.find((s) => s.key === section.key);
        if (!current) continue;
        const span = Math.min(12, Math.max(1, readSectionRowSpan(current)));
        if (span >= 12) {
            flushRow();
            continue;
        }
        if (rowSpan > 0 && rowSpan + span > 12) flushRow();
        row.push({ sectionKey: section.key, span });
        rowSpan += span;
    }
    flushRow();

    return next;
}

export function applyPeerCardWidth(
    doc: LayoutDoc,
    sectionKey: string,
    widthKey: CardWidthFractionKey,
): LayoutDoc {
    const section = doc.sections.find((s) => s.key === sectionKey);
    if (!section) return doc;

    let next =
        widthKey === "full" ? clearPeerCardRowSpan(doc, sectionKey) : setCardWidthFraction(doc, sectionKey, widthKey);

    const zone = resolveOpportunityDrawerSectionZone(section);
    return packPeerCardsInZone(next, zone);
}

/** After reordering cards inside a zone, re-run row packing. */
export function repackPeerCardsAfterZoneReorder(doc: LayoutDoc, sectionKey: string): LayoutDoc {
    const section = doc.sections.find((s) => s.key === sectionKey);
    if (!section) return doc;
    return packPeerCardsInZone(doc, resolveOpportunityDrawerSectionZone(section));
}

/** @deprecated use packPeerCardsInZone */
export function packKpiTilesInZone(doc: LayoutDoc, zone: OpportunityDrawerLayoutZone): LayoutDoc {
    return packPeerCardsInZone(doc, zone);
}

/** @deprecated use repackPeerCardsAfterZoneReorder */
export function repackKpiTilesAfterZoneReorder(doc: LayoutDoc, sectionKey: string): LayoutDoc {
    return repackPeerCardsAfterZoneReorder(doc, sectionKey);
}
