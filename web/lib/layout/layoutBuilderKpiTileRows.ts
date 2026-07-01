/**
 * Experience Builder — KPI tile metadata helpers (presentation only).
 */

import { patchSection } from "@/lib/layout/builderOps";
import {
    CARD_WIDTH_FRACTIONS,
    type CardWidthFractionKey,
} from "@/lib/layout/layoutBuilderCardWidth";
import {
    LAYOUT_EDITOR_SECTION_ROW_GROUP_METADATA_KEY,
    LAYOUT_EDITOR_SECTION_ROW_SPAN_METADATA_KEY,
} from "@/lib/layout/layoutEditorSectionLayout";
import {
    packPeerCardsInZone,
    repackPeerCardsAfterZoneReorder,
} from "@/lib/layout/layoutBuilderPeerCardRows";
import { resolveOpportunityDrawerSectionZone } from "@/lib/layout/opportunityDrawerLayoutEditorModel";
import { sectionIsKpiTile } from "@/lib/layout/layoutBuilderWidgetStrip";
import type { LayoutDoc } from "@/lib/layout/layoutV2";
import type { OpportunityDrawerLayoutZone } from "@/lib/layout/surfaceLayoutRegistry";

export const LAYOUT_EDITOR_KPI_TILE_METADATA_KEY = "layoutEditorKpiTile" as const;

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

function clearKpiTileRowMetadata(doc: LayoutDoc, sectionKey: string): LayoutDoc {
    return patchSectionMetadata(doc, sectionKey, (metadata) => {
        const next = { ...metadata };
        delete next[LAYOUT_EDITOR_SECTION_ROW_GROUP_METADATA_KEY];
        delete next[LAYOUT_EDITOR_SECTION_ROW_SPAN_METADATA_KEY];
        return next;
    });
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

    return packPeerCardsInZone(next, resolveOpportunityDrawerSectionZone(section));
}

export function packKpiTilesInZone(doc: LayoutDoc, zone: OpportunityDrawerLayoutZone): LayoutDoc {
    return packPeerCardsInZone(doc, zone);
}

export function repackKpiTilesAfterZoneReorder(doc: LayoutDoc, sectionKey: string): LayoutDoc {
    const section = doc.sections.find((s) => s.key === sectionKey);
    if (!section || !sectionIsKpiTile(section)) return doc;
    return repackPeerCardsAfterZoneReorder(doc, sectionKey);
}
