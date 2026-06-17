/**
 * Experience Builder — peer-level block authoring (Sprint 5.18A).
 * Uses existing section/item mutations; no LayoutDoc schema changes.
 */

import {
    addSectionRow,
    addSectionTextItem,
    addSectionWidgetItem,
    patchSectionItem,
} from "@/lib/layout/layoutEditorSectionComposition";
import { addCustomOpportunityDrawerSection } from "@/lib/layout/layoutEditorGeneratedKeys";
import {
    addRelatedListOpportunityDrawerSection,
    addWidgetOpportunityDrawerSection,
} from "@/lib/layout/layoutEditorSectionLayout";
import {
    applyKpiTileWidth,
    markSectionAsKpiTile,
    setKpiTileSectionTitleHidden,
} from "@/lib/layout/layoutBuilderKpiTileRows";
import { applyPeerCardWidth, packPeerCardsInZone } from "@/lib/layout/layoutBuilderPeerCardRows";
import type { CardWidthFractionKey } from "@/lib/layout/layoutBuilderCardWidth";
import type { LayoutDoc } from "@/lib/layout/layoutV2";
import type { OpportunityDrawerLayoutZone } from "@/lib/layout/surfaceLayoutRegistry";

/** Operator-facing peer blocks — no generic placeholder card. */
export const EXPERIENCE_BUILDER_PEER_BLOCK_TYPES = [
    "fields",
    "widget",
    "related_list",
    "text",
] as const;

export type ExperienceBuilderPeerBlockType = (typeof EXPERIENCE_BUILDER_PEER_BLOCK_TYPES)[number];

/** @deprecated use ExperienceBuilderPeerBlockType */
export type ExperienceBuilderCardType = ExperienceBuilderPeerBlockType | "custom";

export const EXPERIENCE_BUILDER_PEER_BLOCK_LABELS: Record<ExperienceBuilderPeerBlockType, string> = {
    fields: "Fields card",
    widget: "KPI tile",
    related_list: "Related list",
    text: "Text block",
};

/** @deprecated */
export const EXPERIENCE_BUILDER_CARD_TYPE_LABELS = EXPERIENCE_BUILDER_PEER_BLOCK_LABELS;

export type CreateExperienceBuilderCardInput = {
    title: string;
    widthKey: CardWidthFractionKey;
    cardType: ExperienceBuilderPeerBlockType;
    widgetKey?: string;
    zone?: OpportunityDrawerLayoutZone;
};

export type CreateExperienceBuilderCardResult = {
    doc: LayoutDoc;
    sectionKey: string;
    itemId?: string;
};

function defaultZoneForBlockType(cardType: ExperienceBuilderPeerBlockType): OpportunityDrawerLayoutZone {
    if (cardType === "widget") return "summary_strip";
    return "main";
}

function defaultWidthForBlockType(cardType: ExperienceBuilderPeerBlockType): CardWidthFractionKey {
    if (cardType === "widget") return "third";
    return "full";
}

function ensureFirstRow(doc: LayoutDoc, sectionKey: string): LayoutDoc {
    const section = doc.sections.find((s) => s.key === sectionKey);
    if (!section || section.rows.length > 0) return doc;
    return addSectionRow(doc, sectionKey, 1);
}

export function createExperienceBuilderCard(
    doc: LayoutDoc,
    input: CreateExperienceBuilderCardInput,
): CreateExperienceBuilderCardResult {
    const title = input.title.trim();
    const zone = input.zone ?? defaultZoneForBlockType(input.cardType);
    const widthKey = input.widthKey ?? defaultWidthForBlockType(input.cardType);

    let next: LayoutDoc;
    if (input.cardType === "widget") {
        next = addWidgetOpportunityDrawerSection(doc, { title: "", zone });
    } else if (input.cardType === "related_list") {
        next = addRelatedListOpportunityDrawerSection(doc, {
            title: title || "Related list",
            zone,
        });
    } else if (input.cardType === "text") {
        next = addCustomOpportunityDrawerSection(doc, { title: title || "Text block", zone });
    } else {
        next = addCustomOpportunityDrawerSection(doc, { title: title || "Fields card", zone });
    }

    const sectionKey = next.sections[next.sections.length - 1]!.key;
    next = ensureFirstRow(next, sectionKey);

    let itemId: string | undefined;
    if (input.cardType === "widget") {
        next = markSectionAsKpiTile(next, sectionKey);
        next = setKpiTileSectionTitleHidden(next, sectionKey);
        const widgetKey = input.widgetKey ?? "tasks";
        const added = addSectionWidgetItem(next, sectionKey, 0, 0, widgetKey);
        if (added.ok && added.doc) {
            next = added.doc;
            itemId = added.itemId;
            if (title && itemId) {
                next = patchSectionItem(next, sectionKey, itemId, { label: title });
            }
        }
        next = applyKpiTileWidth(next, sectionKey, widthKey);
    } else {
        next = applyPeerCardWidth(next, sectionKey, widthKey);
        if (input.cardType === "text") {
            const added = addSectionTextItem(next, sectionKey, 0, 0);
            if (added.ok && added.doc) {
                next = added.doc;
                itemId = added.itemId;
            }
        }
    }

    if (input.cardType !== "widget") {
        next = packPeerCardsInZone(next, zone);
    }

    return { doc: next, sectionKey, itemId };
}
