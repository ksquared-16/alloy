/**
 * Opportunity drawer visual editor — section row groups, section types, deletion (Phase 5.14A).
 *
 * Uses section metadata only — no LayoutDoc hierarchy changes.
 */

import { makeId, patchSection, removeSection } from "@/lib/layout/builderOps";
import { addCustomOpportunityDrawerSection } from "@/lib/layout/layoutEditorGeneratedKeys";
import {
    defaultRelatedListConfigForSurface,
    readLayoutEditorRelatedListConfig,
    relatedListEntityTypeRuntimeSupported,
    syncRelatedListSectionToItem,
    writeLayoutEditorRelatedListConfig,
} from "@/lib/layout/layoutEditorRelatedListConfig";
import type { DrawerLayoutEditorSurfaceKey } from "@/lib/layout/drawerLayoutEditorSurfaceConfig";
import { resolveDrawerLayoutEditorSurfaceKeyFromDoc } from "@/lib/layout/drawerLayoutEditorSurfaceConfig";
import { resolveDrawerSectionZone } from "@/lib/layout/drawerLayoutEditorModel";
import type { LayoutDoc, LayoutSection } from "@/lib/layout/layoutV2";
import type { DrawerSurfaceLayoutZone } from "@/lib/layout/surfaceLayoutRegistry";

export const LAYOUT_EDITOR_SECTION_ROW_GROUP_METADATA_KEY = "layoutEditorSectionRowGroup" as const;
export const LAYOUT_EDITOR_SECTION_ROW_SPAN_METADATA_KEY = "layoutEditorSectionRowSpan" as const;
export const LAYOUT_EDITOR_SECTION_ROW_STACK_ROLE_METADATA_KEY = "layoutEditorSectionRowStackRole" as const;
export const LAYOUT_EDITOR_SECTION_TYPE_METADATA_KEY = "layoutEditorSectionType" as const;

export const LAYOUT_EDITOR_SECTION_ROW_STACK_ROLES = ["primary", "stack"] as const;
export type LayoutEditorSectionRowStackRole = (typeof LAYOUT_EDITOR_SECTION_ROW_STACK_ROLES)[number];

export const LAYOUT_EDITOR_SECTION_TYPES = ["content", "widget", "related_list"] as const;
export type LayoutEditorSectionType = (typeof LAYOUT_EDITOR_SECTION_TYPES)[number];

export const SECTION_ROW_WIDTH_PRESET_KEYS = [
    "full_width",
    "full",
    "half_half",
    "50_50",
    "third_two_thirds",
    "33_66",
    "two_thirds_third",
    "25_75",
    "25_25_50",
    "equal_3",
    "equal_4",
    "stacked_right_2x2",
    "stacked_left_2x2",
    "half_stacked_right",
    "half_stacked_left",
] as const;

export type SectionRowWidthPresetKey = (typeof SECTION_ROW_WIDTH_PRESET_KEYS)[number];

export const SECTION_ROW_WIDTH_PRESETS: Record<
    SectionRowWidthPresetKey,
    { label: string; spans: number[]; stackLayout?: "stacked_right" | "stacked_left" | "stacked_right_equal" | "stacked_left_equal" }
> = {
    full_width: { label: "Full width", spans: [12] },
    full: { label: "Full", spans: [12] },
    half_half: { label: "2 columns (50 / 50)", spans: [6, 6] },
    "50_50": { label: "50 / 50", spans: [6, 6] },
    third_two_thirds: { label: "1/3 · 2/3", spans: [4, 8] },
    "33_66": { label: "33 / 66", spans: [4, 8] },
    two_thirds_third: { label: "2/3 · 1/3", spans: [8, 4] },
    "25_75": { label: "25 / 75", spans: [3, 9] },
    "25_25_50": { label: "25 / 25 / 50", spans: [3, 3, 6] },
    equal_3: { label: "Equal (3)", spans: [4, 4, 4] },
    equal_4: { label: "Equal (4)", spans: [3, 3, 3, 3] },
    stacked_right_2x2: { label: "Wide left · stacked right (2/3 + 1/3×2)", spans: [8, 4, 4], stackLayout: "stacked_right" },
    stacked_left_2x2: { label: "Stacked left · wide right (1/3×2 + 2/3)", spans: [4, 4, 8], stackLayout: "stacked_left" },
    half_stacked_right: { label: "Left full · right stacked (½ + ½×2)", spans: [6, 6, 6], stackLayout: "stacked_right_equal" },
    half_stacked_left: { label: "Left stacked · right full (½×2 + ½)", spans: [6, 6, 6], stackLayout: "stacked_left_equal" },
};

export type SectionLayoutSegment =
    | { kind: "stack"; section: LayoutSection }
    | { kind: "row"; groupId: string; sections: LayoutSection[]; spans: number[] }
    | {
          kind: "stacked_row";
          groupId: string;
          layout: "stacked_right" | "stacked_left" | "stacked_right_equal" | "stacked_left_equal";
          primary: LayoutSection;
          stacked: LayoutSection[];
      };

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

export function readSectionRowStackRole(section: LayoutSection): LayoutEditorSectionRowStackRole | null {
    const raw = section.metadata?.[LAYOUT_EDITOR_SECTION_ROW_STACK_ROLE_METADATA_KEY];
    if (raw === "primary" || raw === "stack") return raw;
    return null;
}

/** Curated presets for Builder section row layout — obvious 2-column and stacked options. */
export const BUILDER_SECTION_ROW_LAYOUT_PRESET_KEYS = [
    "full_width",
    "half_half",
    "half_stacked_right",
    "half_stacked_left",
    "third_two_thirds",
    "two_thirds_third",
] as const satisfies readonly SectionRowWidthPresetKey[];

export type BuilderSectionRowLayoutPresetKey = (typeof BUILDER_SECTION_ROW_LAYOUT_PRESET_KEYS)[number];

/** Infer preset from row-group members when span/stack patterns are non-standard. */
function readSectionRowLayoutPresetKeyFromMembers(members: LayoutSection[]): SectionRowWidthPresetKey {
    if (members.length === 2) {
        const spans = members.map((s) => readSectionRowSpan(s));
        if (spans[0] === 3 && spans[1] === 9) return "25_75";
    }
    if (members.length === 3) {
        const spans = members.map((s) => readSectionRowSpan(s));
        if (spans[0] === 3 && spans[1] === 3 && spans[2] === 6) return "25_25_50";
        if (spans.every((span) => span === 4)) return "equal_3";
    }
    if (members.length === 4 && members.every((s) => readSectionRowSpan(s) === 3)) {
        return "equal_4";
    }
    return "full_width";
}

/** Read preset from a section and its row-group siblings (accurate for stacked layouts). */
export function readSectionRowLayoutPresetKeyForDoc(doc: LayoutDoc, sectionKey: string): SectionRowWidthPresetKey {
    const section = doc.sections.find((s) => s.key === sectionKey);
    if (!section) return "full_width";
    const groupId = readSectionRowGroup(section);
    if (!groupId) return "full_width";

    const members = doc.sections.filter((s) => readSectionRowGroup(s) === groupId);
    if (members.length === 1) return "full_width";

    const hasStackRoles = members.some((s) => readSectionRowStackRole(s) != null);
    if (hasStackRoles) {
        const primary = members.find((s) => readSectionRowStackRole(s) === "primary");
        const primaryIndex = primary ? members.indexOf(primary) : -1;
        const equalSpans = members.every((s) => readSectionRowSpan(s) === readSectionRowSpan(members[0]!));
        if (equalSpans && members.length === 3 && readSectionRowSpan(primary!) === 6) {
            return primaryIndex === 0 ? "half_stacked_right" : "half_stacked_left";
        }
        if (members.length === 3 && readSectionRowSpan(primary!) === 8) {
            return primaryIndex === 0 ? "stacked_right_2x2" : "stacked_left_2x2";
        }
    }

    if (members.length === 2) {
        const spans = members.map((s) => readSectionRowSpan(s));
        if (spans[0] === 6 && spans[1] === 6) return "half_half";
        if (spans[0] === 4 && spans[1] === 8) return "third_two_thirds";
        if (spans[0] === 8 && spans[1] === 4) return "two_thirds_third";
    }

    return readSectionRowLayoutPresetKeyFromMembers(members);
}

function sectionGroupHasStackRole(sections: LayoutSection[]): boolean {
    return sections.some((section) => readSectionRowStackRole(section) != null);
}

function resolveStackedRowLayout(
    sections: LayoutSection[],
): "stacked_right" | "stacked_left" | "stacked_right_equal" | "stacked_left_equal" | null {
    const primaryIndex = sections.findIndex((section) => readSectionRowStackRole(section) === "primary");
    if (primaryIndex < 0) return null;
    const spans = sections.map((section) => readSectionRowSpan(section));
    const equalColumns = spans.length >= 3 && spans.every((span) => span === spans[0]);
    if (primaryIndex === 0) return equalColumns ? "stacked_right_equal" : "stacked_right";
    return equalColumns ? "stacked_left_equal" : "stacked_left";
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

        if (sectionGroupHasStackRole(grouped)) {
            const layout = resolveStackedRowLayout(grouped);
            const primary = grouped.find((member) => readSectionRowStackRole(member) === "primary");
            const stacked = grouped.filter((member) => readSectionRowStackRole(member) === "stack");
            if (layout && primary && stacked.length >= 2) {
                out.push({ kind: "stacked_row", groupId, layout, primary, stacked: stacked.slice(0, 2) });
                i = j;
                continue;
            }
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

export function sectionStackedRowGroupGridStyle(
    layout: "stacked_right" | "stacked_left" | "stacked_right_equal" | "stacked_left_equal",
): { display: "grid"; gridTemplateColumns: string; gridTemplateRows: string; gap: string } {
    const columns =
        layout === "stacked_right" ? "2fr 1fr"
        : layout === "stacked_left" ? "1fr 2fr"
        : "1fr 1fr";
    return {
        display: "grid",
        gridTemplateColumns: columns,
        gridTemplateRows: "1fr 1fr",
        gap: "0.75rem",
    };
}

export function sectionStackedRowPrimaryStyle(layout: "stacked_right" | "stacked_left" | "stacked_right_equal" | "stacked_left_equal"): {
    gridColumn: string;
    gridRow: string;
} {
    return layout === "stacked_right" || layout === "stacked_right_equal" ?
            { gridColumn: "1", gridRow: "1 / span 2" }
        :   { gridColumn: "2", gridRow: "1 / span 2" };
}

export function sectionStackedRowCellStyle(
    layout: "stacked_right" | "stacked_left" | "stacked_right_equal" | "stacked_left_equal",
    stackIndex: 0 | 1,
): { gridColumn: string; gridRow: string } {
    const column = layout === "stacked_right" || layout === "stacked_right_equal" ? "2" : "1";
    return { gridColumn: column, gridRow: String(stackIndex + 1) };
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
        delete metadata[LAYOUT_EDITOR_SECTION_ROW_STACK_ROLE_METADATA_KEY];
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

function resolveSectionZoneForRowLayout(
    section: LayoutSection,
    surfaceKey: DrawerLayoutEditorSurfaceKey,
): DrawerSurfaceLayoutZone {
    return resolveDrawerSectionZone(section, surfaceKey);
}

function sectionsInZoneOrdered(
    doc: LayoutDoc,
    zone: DrawerSurfaceLayoutZone,
    surfaceKey: DrawerLayoutEditorSurfaceKey,
): LayoutSection[] {
    return doc.sections.filter((section) => resolveSectionZoneForRowLayout(section, surfaceKey) === zone);
}

export type SectionRowLayoutApplyResult =
    | { ok: true; doc: LayoutDoc }
    | { ok: false; doc: LayoutDoc; reason: string };

export type SectionRowLayoutPresetApplyState = {
    canApply: boolean;
    reason?: string;
    followingSectionCount: number;
    requiredSectionCount: number;
};

/** Whether a row-layout preset can be applied from this anchor in the current doc. */
export function readSectionRowLayoutPresetApplyState(
    doc: LayoutDoc,
    anchorSectionKey: string,
    presetKey: SectionRowWidthPresetKey,
    surfaceKey?: DrawerLayoutEditorSurfaceKey,
): SectionRowLayoutPresetApplyState {
    const preset = SECTION_ROW_WIDTH_PRESETS[presetKey];
    const resolvedSurfaceKey = surfaceKey ?? resolveDrawerLayoutEditorSurfaceKeyFromDoc(doc) ?? "opportunity_drawer";
    const anchor = doc.sections.find((s) => s.key === anchorSectionKey);
    if (!anchor) {
        return {
            canApply: false,
            reason: "Section not found.",
            followingSectionCount: 0,
            requiredSectionCount: preset.spans.length,
        };
    }

    if (presetKey === "full_width" || presetKey === "full") {
        return { canApply: true, followingSectionCount: 0, requiredSectionCount: 0 };
    }

    const zone = resolveSectionZoneForRowLayout(anchor, resolvedSurfaceKey);
    const zoneSections = sectionsInZoneOrdered(doc, zone, resolvedSurfaceKey);
    const anchorPos = zoneSections.findIndex((s) => s.key === anchorSectionKey);
    if (anchorPos < 0) {
        return {
            canApply: false,
            reason: "Section zone could not be resolved.",
            followingSectionCount: 0,
            requiredSectionCount: preset.spans.length,
        };
    }

    const slice = zoneSections.slice(anchorPos, anchorPos + preset.spans.length);
    const required = preset.spans.length;
    if (slice.length < required) {
        const missing = required - slice.length;
        return {
            canApply: false,
            reason: `Add ${missing} more card${missing === 1 ? "" : "s"} after "${anchor.title}" in the same zone, then select this row layout again.`,
            followingSectionCount: slice.length,
            requiredSectionCount: required,
        };
    }

    return {
        canApply: true,
        followingSectionCount: slice.length,
        requiredSectionCount: required,
    };
}

export function applySectionRowLayoutWithResult(
    doc: LayoutDoc,
    anchorSectionKey: string,
    presetKey: SectionRowWidthPresetKey,
    options?: { surfaceKey?: DrawerLayoutEditorSurfaceKey },
): SectionRowLayoutApplyResult {
    const applyState = readSectionRowLayoutPresetApplyState(
        doc,
        anchorSectionKey,
        presetKey,
        options?.surfaceKey,
    );
    if (!applyState.canApply) {
        return { ok: false, doc, reason: applyState.reason ?? "Cannot apply row layout." };
    }

    const preset = SECTION_ROW_WIDTH_PRESETS[presetKey];
    const resolvedSurfaceKey = options?.surfaceKey ?? resolveDrawerLayoutEditorSurfaceKeyFromDoc(doc) ?? "opportunity_drawer";
    const anchor = doc.sections.find((s) => s.key === anchorSectionKey);
    if (!anchor) return { ok: false, doc, reason: "Section not found." };

    const zone = resolveSectionZoneForRowLayout(anchor, resolvedSurfaceKey);
    const zoneSections = sectionsInZoneOrdered(doc, zone, resolvedSurfaceKey);
    const anchorPos = zoneSections.findIndex((s) => s.key === anchorSectionKey);
    if (anchorPos < 0) return { ok: false, doc, reason: "Section zone could not be resolved." };

    let next = doc;
    const existingGroup = readSectionRowGroup(anchor);
    if (existingGroup) next = clearSectionRowGroup(next, existingGroup);

    if (presetKey === "full_width" || presetKey === "full") {
        return { ok: true, doc: clearSectionRowGroupMetadata(next, anchorSectionKey) };
    }

    const slice = zoneSections.slice(anchorPos, anchorPos + preset.spans.length);
    const groupId = makeSectionRowGroupId();

    if (preset.stackLayout) {
        const roles: LayoutEditorSectionRowStackRole[] =
            preset.stackLayout === "stacked_right" || preset.stackLayout === "stacked_right_equal" ?
                ["primary", "stack", "stack"]
            :   ["stack", "stack", "primary"];
        for (let i = 0; i < slice.length; i += 1) {
            const sectionKey = slice[i]!.key;
            const span = preset.spans[i]!;
            next = patchSectionMetadata(next, sectionKey, (metadata) => ({
                ...metadata,
                [LAYOUT_EDITOR_SECTION_ROW_GROUP_METADATA_KEY]: groupId,
                [LAYOUT_EDITOR_SECTION_ROW_SPAN_METADATA_KEY]: span,
                [LAYOUT_EDITOR_SECTION_ROW_STACK_ROLE_METADATA_KEY]: roles[i] ?? "stack",
            }));
        }
        return { ok: true, doc: next };
    }

    for (let i = 0; i < slice.length; i += 1) {
        const sectionKey = slice[i]!.key;
        const span = preset.spans[i]!;
        next = patchSectionMetadata(next, sectionKey, (metadata) => {
            const nextMetadata: Record<string, unknown> = {
                ...metadata,
                [LAYOUT_EDITOR_SECTION_ROW_GROUP_METADATA_KEY]: groupId,
                [LAYOUT_EDITOR_SECTION_ROW_SPAN_METADATA_KEY]: span,
            };
            delete nextMetadata[LAYOUT_EDITOR_SECTION_ROW_STACK_ROLE_METADATA_KEY];
            return nextMetadata;
        });
    }
    return { ok: true, doc: next };
}

export function applySectionRowLayout(
    doc: LayoutDoc,
    anchorSectionKey: string,
    presetKey: SectionRowWidthPresetKey,
    options?: { surfaceKey?: DrawerLayoutEditorSurfaceKey },
): LayoutDoc {
    return applySectionRowLayoutWithResult(doc, anchorSectionKey, presetKey, options).doc;
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
        next = patchSectionMetadata(next, member.key, (metadata) => {
            const nextMetadata: Record<string, unknown> = {
                ...metadata,
                [LAYOUT_EDITOR_SECTION_ROW_GROUP_METADATA_KEY]: groupId,
                [LAYOUT_EDITOR_SECTION_ROW_SPAN_METADATA_KEY]: equalSpan,
            };
            delete nextMetadata[LAYOUT_EDITOR_SECTION_ROW_STACK_ROLE_METADATA_KEY];
            return nextMetadata;
        });
    }
    return next;
}

export function addWidgetOpportunityDrawerSection(
    doc: LayoutDoc,
    input?: { title?: string; zone?: DrawerSurfaceLayoutZone },
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
    input?: { title?: string; zone?: DrawerSurfaceLayoutZone; surfaceKey?: DrawerLayoutEditorSurfaceKey },
): LayoutDoc {
    const surfaceKey = input?.surfaceKey ?? "opportunity_drawer";
    let next = addCustomOpportunityDrawerSection(doc, {
        title: input?.title ?? "Related list",
        zone: input?.zone ?? "main",
    });
    const sIdx = next.sections.length - 1;
    const sectionKey = next.sections[sIdx]!.key;
    next = setSectionType(next, sectionKey, "related_list");
    next = patchSection(next, sIdx, {
        metadata: writeLayoutEditorRelatedListConfig(
            next.sections[sIdx]!.metadata,
            defaultRelatedListConfigForSurface(surfaceKey, "children"),
        ),
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
