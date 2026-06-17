/**
 * Experience Builder — simplified card creation flow (Sprint 5.18).
 * Uses existing section/item mutations; no LayoutDoc schema changes.
 */

import { addSectionRow, addSectionTextItem, addSectionWidgetItem } from "@/lib/layout/layoutEditorSectionComposition";
import { addCustomOpportunityDrawerSection } from "@/lib/layout/layoutEditorGeneratedKeys";
import {
    addRelatedListOpportunityDrawerSection,
    addWidgetOpportunityDrawerSection,
} from "@/lib/layout/layoutEditorSectionLayout";
import { setCardWidthFraction, type CardWidthFractionKey } from "@/lib/layout/layoutBuilderCardWidth";
import type { LayoutDoc } from "@/lib/layout/layoutV2";
import type { OpportunityDrawerLayoutZone } from "@/lib/layout/surfaceLayoutRegistry";

export const EXPERIENCE_BUILDER_CARD_TYPES = [
    "fields",
    "widget",
    "related_list",
    "text",
    "custom",
] as const;

export type ExperienceBuilderCardType = (typeof EXPERIENCE_BUILDER_CARD_TYPES)[number];

export const EXPERIENCE_BUILDER_CARD_TYPE_LABELS: Record<ExperienceBuilderCardType, string> = {
    fields: "Fields",
    widget: "KPI tile",
    related_list: "Related list",
    text: "Text / Notes",
    custom: "Custom",
};

export type CreateExperienceBuilderCardInput = {
    title: string;
    widthKey: CardWidthFractionKey;
    cardType: ExperienceBuilderCardType;
    widgetKey?: string;
    zone?: OpportunityDrawerLayoutZone;
};

export type CreateExperienceBuilderCardResult = {
    doc: LayoutDoc;
    sectionKey: string;
    itemId?: string;
};

function defaultZoneForCardType(cardType: ExperienceBuilderCardType): OpportunityDrawerLayoutZone {
    if (cardType === "widget") return "summary_strip";
    return "main";
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
    const title = input.title.trim() || "New card";
    const zone = input.zone ?? defaultZoneForCardType(input.cardType);

    let next: LayoutDoc;
    if (input.cardType === "widget") {
        next = addWidgetOpportunityDrawerSection(doc, { title, zone });
    } else if (input.cardType === "related_list") {
        next = addRelatedListOpportunityDrawerSection(doc, { title, zone });
    } else {
        next = addCustomOpportunityDrawerSection(doc, { title, zone });
    }

    const sectionKey = next.sections[next.sections.length - 1]!.key;
    next = setCardWidthFraction(next, sectionKey, input.widthKey);
    next = ensureFirstRow(next, sectionKey);

    let itemId: string | undefined;
    if (input.cardType === "widget") {
        const widgetKey = input.widgetKey ?? "tasks";
        const added = addSectionWidgetItem(next, sectionKey, 0, 0, widgetKey);
        if (added.ok && added.doc) {
            next = added.doc;
            itemId = added.itemId;
        }
    } else if (input.cardType === "text") {
        const added = addSectionTextItem(next, sectionKey, 0, 0);
        if (added.ok && added.doc) {
            next = added.doc;
            itemId = added.itemId;
        }
    }

    return { doc: next, sectionKey, itemId };
}
