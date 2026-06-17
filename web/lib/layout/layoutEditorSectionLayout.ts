/**
 * Opportunity drawer visual editor — section row groups, section types, deletion (Phase 5.14A).
 *
 * Uses section metadata only — no LayoutDoc hierarchy changes.
 */

import { makeId, patchSection, removeSection } from "@/lib/layout/builderOps";
import { addCustomOpportunityDrawerSection } from "@/lib/layout/layoutEditorGeneratedKeys";
import {
    DEFAULT_CHILDREN_RELATED_LIST_CONFIG,
    readLayoutEditorRelatedListConfig,
    relatedListEntityTypeRuntimeSupported,
    syncRelatedListSectionToItem,
    writeLayoutEditorRelatedListConfig,
} from "@/lib/layout/layoutEditorRelatedListConfig";
import type { LayoutDoc, LayoutSection } from "@/lib/layout/layoutV2";
import type { OpportunityDrawerLayoutZone } from "@/lib/layout/surfaceLayoutRegistry";
import { resolveOpportunityDrawerSectionZone } from "@/lib/layout/opportunityDrawerLayoutEditorModel";

export const LAYOUT_EDITOR_SECTION_ROW_GROUP_METADATA_KEY = "layoutEditorSectionRowGroup" as const;
export const LAYOUT_EDITOR_SECTION_ROW_SPAN_METADATA_KEY = "layoutEditorSectionRowSpan" as const;
export const LAYOUT_EDITOR_SECTION_TYPE_METADATA_KEY = "layoutEditorSectionType" as const;

export const LAYOUT_EDITOR_SECTION_TYPES = ["content", "widget", "related_list"] as const;
export type LayoutEditorSectionType = (typeof LAYOUT_EDITOR_SECTION_TYPES)[number];

export const SECTION_ROW_WIDTH_PRESET_KEYS = [
    "full_width",
    "50_50",
    "25_75",
    "33_66",
    "25_25_50",
    "equal_3",
    "equal_4",
] as const;

export type SectionRowWidthPresetKey = (typeof SECTION_ROW_WIDTH_PRESET_KEYS)[number];

export const SECTION_ROW_WIDTH_PRESETS: Record<
    SectionRowWidthPresetKey,
    { label: string; spans: number[] }
> = {
    full_width: { label: "Full width", spans: [12] },
    "50_50": { label: "50 / 50", spans: [6, 6] },
    "25_75": { label: "25 / 75", spans: [3, 9] },
    "33_66": { label: "33 / 66", spans: [4, 8] },
    "25_25_50": { label: "25 / 25 / 50", spans: [3, 3, 6] },
    equal_3: { label: "Equal (3)", spans: [4, 4, 4] },
    equal_4: { label: "Equal (4)", spans: [3, 3, 3, 3] },
};

export type SectionLayoutSegment =
    | { kind: "stack"; section: LayoutSection }
    | { kind: "row"; groupId: string; sections: LayoutSection[]; spans: number[] };

export const LAYOUT_EDITOR_SECTION_TYPE_LABELS: Record<LayoutEditorSectionType, string> = {
    content: "Content",
    widget: "Widget",
    related_list: "Related list",
};

function cloneDoc(doc: LayoutDoc): LayoutDoc {
    return JSON.parse(JSON.stringify(doc)) as LayoutDoc;
}

function makeSectionRowGroupId(): string {
    return `section_row_${makeId("grp").replace(/^grp-/, "")}`;
}

export function readSectionRowGroup(section: LayoutSection): string | null {
    const raw = section.metadata?.[LAYOUT_EDITOR_SECTION_ROW_GROUP_METADATA_KEY];
    return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

export function readSectionRowSpan(section: LayoutSection): number {
    const raw = section.metadata?.[LAYOUT_EDITOR_SECTION_ROW_SPAN_METADATA_KEY];
    if (typeof raw === "number" && raw >= 1 && raw <= 12) return Math.round(raw);
    return 12;
}

export function readSectionType(section: LayoutSection): LayoutEditorSectionType {
    const raw = section.metadata?.[LAYOUT_EDITOR_SECTION_TYPE_METADATA_KEY];
    if (typeof raw === "string" && (LAYOUT_EDITOR_SECTION_TYPES as readonly string[]).includes(raw)) {
        return raw as LayoutEditorSectionType;
    }
    return "content";
}

export function sectionHasWidgetItems(section: LayoutSection): boolean {
    for (const row of section.rows) {
        for (const col of row.columns) {
            for (const item of col.items) {
                if (item.kind === "widget_placeholder") return true;
            }
        }
    }
    return false;
}

export function sectionHasRelatedListItem(section: LayoutSection): boolean {
    for (const row of section.rows) {
        for (const col of row.columns) {
            for (const item of col.items) {
                if (item.kind === "related_list") return true;
            }
        }
    }
    return false;
}

export function segmentSectionsForRowLayout(sections: LayoutSection[]): SectionLayoutSegment[] {
    const out: SectionLayoutSegment[] = [];
    let i = 0;
    while (i < sections.length) {
        const section = sections[i]!;
        const groupId = readSectionRowGroup(section);
        if (!groupId) {
            out.push({ kind: "stack", section });
            i += 1;
            continue;
        }

        const grouped: LayoutSection[] = [section];
        const spans = [readSectionRowSpan(section)];
        let j = i + 1;
        while (j < sections.length && readSectionRowGroup(sections[j]!) === groupId) {
            grouped.push(sections[j]!);
            spans.push(readSectionRowSpan(sections[j]!));
            j += 1;
        }
        out.push({ kind: "row", groupId, sections: grouped, spans });
        i = j;
    }
    return out;
}

export function sectionRowGroupGridStyle(spans: number[]): { display: "grid"; gridTemplateColumns: string; gap: string } {
    return {
        display: "grid",
        gridTemplateColumns: spans.map((span) => `${span}fr`).join(" "),
        gap: "0.75rem",
    };
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

function clearSectionRowGroupMetadata(doc: LayoutDoc, sectionKey: string): LayoutDoc {
    return patchSectionMetadata(doc, sectionKey, (metadata) => {
        delete metadata[LAYOUT_EDITOR_SECTION_ROW_GROUP_METADATA_KEY];
        delete metadata[LAYOUT_EDITOR_SECTION_ROW_SPAN_METADATA_KEY];
        return metadata;
    });
}

export function clearSectionRowGroup(doc: LayoutDoc, groupId: string): LayoutDoc {
    let next = doc;
    for (const section of doc.sections) {
        if (readSectionRowGroup(section) === groupId) {
            next = clearSectionRowGroupMetadata(next, section.key);
        }
    }
    return next;
}

function sectionsInZoneOrdered(doc: LayoutDoc, zone: ReturnType<typeof resolveOpportunityDrawerSectionZone>): LayoutSection[] {
    return doc.sections.filter((section) => resolveOpportunityDrawerSectionZone(section) === zone);
}

export function applySectionRowLayout(
    doc: LayoutDoc,
    anchorSectionKey: string,
    presetKey: SectionRowWidthPresetKey,
): LayoutDoc {
    const preset = SECTION_ROW_WIDTH_PRESETS[presetKey];
    const anchor = doc.sections.find((s) => s.key === anchorSectionKey);
    if (!anchor) return doc;

    const zone = resolveOpportunityDrawerSectionZone(anchor);
    const zoneSections = sectionsInZoneOrdered(doc, zone);
    const anchorPos = zoneSections.findIndex((s) => s.key === anchorSectionKey);
    if (anchorPos < 0) return doc;

    let next = doc;
    const existingGroup = readSectionRowGroup(anchor);
    if (existingGroup) next = clearSectionRowGroup(next, existingGroup);

    if (presetKey === "full_width") {
        return clearSectionRowGroupMetadata(next, anchorSectionKey);
    }

    const slice = zoneSections.slice(anchorPos, anchorPos + preset.spans.length);
    if (slice.length < preset.spans.length) return doc;

    const groupId = makeSectionRowGroupId();
    for (let i = 0; i < slice.length; i += 1) {
        const sectionKey = slice[i]!.key;
        const span = preset.spans[i]!;
        next = patchSectionMetadata(next, sectionKey, (metadata) => ({
            ...metadata,
            [LAYOUT_EDITOR_SECTION_ROW_GROUP_METADATA_KEY]: groupId,
            [LAYOUT_EDITOR_SECTION_ROW_SPAN_METADATA_KEY]: span,
        }));
    }
    return next;
}

export function setSectionType(doc: LayoutDoc, sectionKey: string, sectionType: LayoutEditorSectionType): LayoutDoc {
    return patchSectionMetadata(doc, sectionKey, (metadata) => ({
        ...metadata,
        [LAYOUT_EDITOR_SECTION_TYPE_METADATA_KEY]: sectionType,
    }));
}

export function canDeleteOpportunityDrawerSection(_section: LayoutSection): { ok: true } | { ok: false; reason: string } {
    return { ok: true };
}

export function deleteOpportunityDrawerSection(doc: LayoutDoc, sectionKey: string): LayoutDoc {
    const section = doc.sections.find((s) => s.key === sectionKey);
    if (!section) return doc;
    const gate = canDeleteOpportunityDrawerSection(section);
    if (!gate.ok) return doc;

    const groupId = readSectionRowGroup(section);
    const sIdx = doc.sections.findIndex((s) => s.key === sectionKey);
    let next = removeSection(doc, sIdx);
    if (groupId) next = rebalanceSectionRowGroup(next, groupId);
    return next;
}

function rebalanceSectionRowGroup(doc: LayoutDoc, groupId: string): LayoutDoc {
    const members = doc.sections.filter((s) => readSectionRowGroup(s) === groupId);
    if (members.length === 0) return doc;
    if (members.length === 1) return clearSectionRowGroupMetadata(doc, members[0]!.key);

    const equalSpan = Math.floor(12 / members.length);
    let next = doc;
    for (const member of members) {
        next = patchSectionMetadata(next, member.key, (metadata) => ({
            ...metadata,
            [LAYOUT_EDITOR_SECTION_ROW_GROUP_METADATA_KEY]: groupId,
            [LAYOUT_EDITOR_SECTION_ROW_SPAN_METADATA_KEY]: equalSpan,
        }));
    }
    return next;
}

export function addWidgetOpportunityDrawerSection(
    doc: LayoutDoc,
    input?: { title?: string; zone?: OpportunityDrawerLayoutZone },
): LayoutDoc {
    let next = addCustomOpportunityDrawerSection(doc, {
        title: input?.title ?? "Widget section",
        zone: input?.zone ?? "summary_strip",
    });
    const sectionKey = next.sections[next.sections.length - 1]!.key;
    return setSectionType(next, sectionKey, "widget");
}

export function addRelatedListOpportunityDrawerSection(
    doc: LayoutDoc,
    input?: { title?: string; zone?: OpportunityDrawerLayoutZone },
): LayoutDoc {
    let next = addCustomOpportunityDrawerSection(doc, {
        title: input?.title ?? "Related list",
        zone: input?.zone ?? "main",
    });
    const sIdx = next.sections.length - 1;
    const sectionKey = next.sections[sIdx]!.key;
    next = setSectionType(next, sectionKey, "related_list");
    next = patchSection(next, sIdx, {
        metadata: writeLayoutEditorRelatedListConfig(next.sections[sIdx]!.metadata, DEFAULT_CHILDREN_RELATED_LIST_CONFIG),
    });
    return syncRelatedListSectionToItem(next, sectionKey);
}

export function validateSectionLayoutMetadata(doc: LayoutDoc): string[] {
    const errors: string[] = [];
    for (const section of doc.sections) {
        const sectionType = readSectionType(section);
        if (sectionType === "widget" && !sectionHasWidgetItems(section)) {
            errors.push(`Section "${section.key}": widget sections must contain at least one widget.`);
        }
        if (sectionType === "related_list" && !sectionHasRelatedListItem(section)) {
            const config = readLayoutEditorRelatedListConfig(section);
            if (relatedListEntityTypeRuntimeSupported(config.entityType)) {
                errors.push(`Section "${section.key}": related list sections must contain a related list.`);
            }
        }

        const groupId = readSectionRowGroup(section);
        if (groupId) {
            const span = readSectionRowSpan(section);
            if (span < 1 || span > 12) {
                errors.push(`Section "${section.key}": row span must be between 1 and 12.`);
            }
        }
    }
    return errors;
}
