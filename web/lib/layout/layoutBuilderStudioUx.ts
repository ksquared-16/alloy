/**
 * Layout builder studio — presentation-only UX helpers (no LayoutDoc mutations).
 */

import { isValidCustomSectionKeyPattern } from "@/lib/layout/layoutEditorGeneratedKeys";
import { readSectionType } from "@/lib/layout/layoutEditorSectionLayout";
import { resolveOpportunityDrawerSectionZone } from "@/lib/layout/opportunityDrawerLayoutEditorModel";
import type { OpportunityDrawerLayoutZone } from "@/lib/layout/surfaceLayoutRegistry";
import type { LayoutDoc, LayoutSection } from "@/lib/layout/layoutV2";

export type LayoutBuilderPaletteItemKind = "field" | "widget" | "block" | "text" | "related_list";

const PLATFORM_OWNED_SECTION_KEYS = new Set<string>([]);

function sectionAcceptsWidgets(section: LayoutSection): boolean {
    if (readSectionType(section) === "widget") return true;
    if (resolveOpportunityDrawerSectionZone(section) === "summary_strip") return true;
    return section.rows.some((row) =>
        row.columns.some((col) => col.items.some((item) => item.kind === "widget_placeholder")),
    );
}

function sectionAcceptsContentItems(section: LayoutSection): boolean {
    const type = readSectionType(section);
    return type !== "widget" && type !== "related_list";
}

function sectionAcceptsRelatedList(section: LayoutSection): boolean {
    return readSectionType(section) === "related_list" || sectionAcceptsContentItems(section);
}

export function diffNewSectionKeys(before: LayoutDoc, after: LayoutDoc): string[] {
    const beforeKeys = new Set(before.sections.map((s) => s.key));
    return after.sections.filter((s) => !beforeKeys.has(s.key)).map((s) => s.key);
}

export function isPlatformOwnedDrawerSection(sectionKey: string): boolean {
    return PLATFORM_OWNED_SECTION_KEYS.has(sectionKey);
}

export function friendlyZoneLabel(zone: OpportunityDrawerLayoutZone): string {
    switch (zone) {
        case "summary_strip":
            return "top of drawer";
        case "right_rail":
            return "right side";
        case "main":
        default:
            return "main area";
    }
}

export function sectionZoneLabel(doc: LayoutDoc, sectionKey: string): string {
    const section = doc.sections.find((s) => s.key === sectionKey);
    if (!section) return "drawer";
    return friendlyZoneLabel(resolveOpportunityDrawerSectionZone(section));
}

export function resolvePaletteTargetSectionId(
    doc: LayoutDoc,
    selectedSectionId: string | null,
    itemKind: LayoutBuilderPaletteItemKind,
): { sectionId: string | null; reason?: string; createdSection?: boolean } {
    const isValidTarget = (sectionKey: string): boolean => {
        const section = doc.sections.find((s) => s.key === sectionKey);
        if (!section) return false;
        if (itemKind === "widget") return sectionAcceptsWidgets(section);
        if (itemKind === "related_list") return readSectionType(section) === "related_list";
        if (itemKind === "field" || itemKind === "block" || itemKind === "text") {
            return sectionAcceptsContentItems(section);
        }
        return true;
    };

    if (selectedSectionId && isValidTarget(selectedSectionId)) {
        return { sectionId: selectedSectionId };
    }

    if (itemKind === "widget") {
        if (selectedSectionId) {
            const section = doc.sections.find((s) => s.key === selectedSectionId);
            if (section && sectionAcceptsWidgets(section)) {
                return { sectionId: selectedSectionId };
            }
        }
        return { sectionId: null };
    }

    if (itemKind === "related_list") {
        const existing = doc.sections.find((s) => readSectionType(s) === "related_list");
        if (existing) {
            return {
                sectionId: existing.key,
                reason: `Opened "${existing.title}" — configure list rows in Properties.`,
            };
        }
        return { sectionId: null };
    }

    const contentSection =
        selectedSectionId ?
            doc.sections.find((s) => s.key === selectedSectionId && sectionAcceptsContentItems(s))
        :   doc.sections.find((s) => sectionAcceptsContentItems(s));
    if (contentSection) {
        return {
            sectionId: contentSection.key,
            reason:
                selectedSectionId ? undefined : (
                    `Placed in "${contentSection.title}" — click a card on the canvas to choose a different target.`
                ),
        };
    }

    return { sectionId: null };
}

export function buildAddSuccessMessage(input: {
    itemLabel: string;
    sectionTitle: string;
    zoneLabel?: string;
    createdSection?: boolean;
}): string {
    const where = input.zoneLabel ? ` (${input.zoneLabel})` : "";
    if (input.createdSection) {
        return `Created "${input.sectionTitle}"${where} and added ${input.itemLabel}.`;
    }
    return `Added ${input.itemLabel} to "${input.sectionTitle}"${where}.`;
}

export function countLayoutBuilderItems(doc: LayoutDoc): number {
    return doc.sections.reduce(
        (total, section) =>
            total
            + section.rows.reduce(
                (rowTotal, row) =>
                    rowTotal + row.columns.reduce((colTotal, col) => colTotal + col.items.length, 0),
                0,
            ),
        0,
    );
}

export function shouldShowLayoutBuilderStartGuide(_doc: LayoutDoc): boolean {
    return false;
}
