/**
 * Drawer layout visual editor — surface-parameterized model helpers.
 */

import { patchSection } from "@/lib/layout/builderOps";
import type { LayoutDoc, LayoutSection } from "@/lib/layout/layoutV2";
import { parseLayoutDoc } from "@/lib/layout/layoutV2Schema";
import {
    getDrawerLayoutEditorSurfaceConfig,
    resolveDrawerLayoutEditorSurfaceKeyFromDoc,
    type DrawerLayoutEditorSurfaceKey,
} from "@/lib/layout/drawerLayoutEditorSurfaceConfig";
import { validateLayoutDocForSurface } from "@/lib/layout/validateLayoutDocForSurface";
import {
    layoutDocHasRepairableGeneratedKeys,
    repairOpportunityDrawerLayoutGeneratedKeys,
} from "@/lib/layout/layoutEditorGeneratedKeys";
import {
    isDrawerSurfaceLayoutZone,
    type DrawerSurfaceLayoutZone,
} from "@/lib/layout/surfaceLayoutRegistry";
import { readLayoutSectionPresentationMetadata } from "@/lib/layout/runtime/layoutSectionPresentationMetadata";
import { partitionChildOverviewBodySections } from "@/lib/layout/runtime/childOverviewComposition";
import { partitionLeadOverviewBodySections } from "@/lib/layout/runtime/leadOverviewComposition";
import { partitionPersonOverviewBodySections } from "@/lib/layout/runtime/personOverviewComposition";
import { LAYOUT_SECTION_EDITOR_HIDDEN_METADATA_KEY } from "@/lib/layout/opportunityDrawerLayoutEditorModel";

export type DrawerZonePartition = Record<DrawerSurfaceLayoutZone, LayoutSection[]>;

function cloneDoc(doc: LayoutDoc): LayoutDoc {
    return JSON.parse(JSON.stringify(doc)) as LayoutDoc;
}

export function resolveDrawerLayoutEditorSurfaceKey(
    doc: Pick<LayoutDoc, "entityType" | "surface">,
): DrawerLayoutEditorSurfaceKey | null {
    return resolveDrawerLayoutEditorSurfaceKeyFromDoc(doc);
}

export function isDrawerLayoutDocForSurface(
    doc: Pick<LayoutDoc, "entityType" | "surface">,
    surfaceKey: DrawerLayoutEditorSurfaceKey,
): boolean {
    return resolveDrawerLayoutEditorSurfaceKeyFromDoc(doc) === surfaceKey;
}

export function resolveDrawerSectionZone(
    section: LayoutSection,
    surfaceKey: DrawerLayoutEditorSurfaceKey,
): DrawerSurfaceLayoutZone {
    const config = getDrawerLayoutEditorSurfaceConfig(surfaceKey);
    const layoutZone = section.metadata?.layoutZone;
    if (isDrawerSurfaceLayoutZone(layoutZone)) return layoutZone;

    const defaultZone = config.sectionDefaultZone[section.key];
    if (defaultZone) return defaultZone;

    const railSlot = readLayoutSectionPresentationMetadata(section).railSlot;
    if (railSlot === "right_rail") return "right_rail";
    if (railSlot === "footer") return "footer_actions";
    if (section.key.endsWith("_summary")) return "summary_strip";
    return "main";
}

export function partitionDrawerSectionsByZone(doc: LayoutDoc, surfaceKey: DrawerLayoutEditorSurfaceKey): DrawerZonePartition {
    const empty = (): DrawerZonePartition => ({
        summary_strip: [],
        main: [],
        right_rail: [],
        footer_actions: [],
    });
    const zones = empty();
    for (const section of doc.sections) {
        zones[resolveDrawerSectionZone(section, surfaceKey)].push(section);
    }
    return zones;
}

export function validateDrawerLayoutDoc(
    doc: LayoutDoc,
    surfaceKey: DrawerLayoutEditorSurfaceKey,
): { ok: boolean; errors: string[]; warnings: string[] } {
    const parsed = parseLayoutDoc(doc, { inferSurfaceKey: true });
    const surfaceValidation = validateLayoutDocForSurface(doc);
    const errors = [...parsed.errors, ...(surfaceValidation.ok ? [] : surfaceValidation.errors)];
    if (surfaceValidation.surfaceKey && surfaceValidation.surfaceKey !== surfaceKey) {
        errors.push(`Layout document surface mismatch: expected ${surfaceKey}.`);
    }
    return {
        ok: parsed.ok && errors.length === 0,
        errors,
        warnings: parsed.warnings,
    };
}

export type PrepareDrawerLayoutDocResult =
    | { ok: true; doc: LayoutDoc; surfaceKey: DrawerLayoutEditorSurfaceKey; autoRepaired: boolean; repairs: string[]; warnings: string[] }
    | { ok: false; errors: string[] };

export function prepareDrawerLayoutDocForEditor(raw: unknown): PrepareDrawerLayoutDocResult {
    const structural = parseLayoutDoc(raw);
    if (!structural.ok || !structural.doc) {
        return { ok: false, errors: structural.errors };
    }

    const surfaceKey = resolveDrawerLayoutEditorSurfaceKeyFromDoc(structural.doc);
    if (!surfaceKey) {
        return { ok: false, errors: ["Layout is not a supported drawer surface document."] };
    }

    let doc = structural.doc;
    let autoRepaired = false;
    let repairs: string[] = [];
    if (layoutDocHasRepairableGeneratedKeys(doc)) {
        const repaired = repairOpportunityDrawerLayoutGeneratedKeys(doc);
        doc = repaired.doc;
        autoRepaired = repaired.changed;
        repairs = repaired.repairs;
    }

    const validated = parseLayoutDoc(doc, { inferSurfaceKey: true });
    if (!validated.ok || !validated.doc) {
        return { ok: false, errors: validated.errors };
    }

    const surfaceValidation = validateDrawerLayoutDoc(validated.doc, surfaceKey);
    if (!surfaceValidation.ok) {
        return { ok: false, errors: surfaceValidation.errors };
    }

    return {
        ok: true,
        doc: validated.doc,
        surfaceKey,
        autoRepaired,
        repairs,
        warnings: validated.warnings,
    };
}

export function isSectionEditorHidden(section: LayoutSection): boolean {
    return section.metadata?.[LAYOUT_SECTION_EDITOR_HIDDEN_METADATA_KEY] === true;
}

export function filterHiddenSectionsForPreview(doc: LayoutDoc): LayoutDoc {
    return {
        ...doc,
        sections: doc.sections.filter((s) => !isSectionEditorHidden(s)),
    };
}

export function buildSingleSectionPreviewDoc(doc: LayoutDoc, sectionKey: string): LayoutDoc | null {
    const section = doc.sections.find((s) => s.key === sectionKey);
    if (!section) return null;
    return { ...doc, sections: [section] };
}


function sectionIndicesInZone(
    doc: LayoutDoc,
    zone: DrawerSurfaceLayoutZone,
    surfaceKey: DrawerLayoutEditorSurfaceKey,
): number[] {
    return doc.sections
        .map((section, index) => ({ section, index }))
        .filter(({ section }) => resolveDrawerSectionZone(section, surfaceKey) === zone)
        .map(({ index }) => index);
}

export function reorderSectionInZone(
    doc: LayoutDoc,
    sectionKey: string,
    direction: -1 | 1,
    surfaceKey: DrawerLayoutEditorSurfaceKey,
): LayoutDoc {
    const sIdx = doc.sections.findIndex((s) => s.key === sectionKey);
    if (sIdx < 0) return doc;
    const zone = resolveDrawerSectionZone(doc.sections[sIdx]!, surfaceKey);
    const indices = sectionIndicesInZone(doc, zone, surfaceKey);
    const pos = indices.indexOf(sIdx);
    const targetPos = pos + direction;
    if (pos < 0 || targetPos < 0 || targetPos >= indices.length) return doc;
    const next = cloneDoc(doc);
    const swapWith = indices[targetPos]!;
    [next.sections[sIdx], next.sections[swapWith]] = [next.sections[swapWith]!, next.sections[sIdx]!];
    return next;
}

export function renameSectionTitle(doc: LayoutDoc, sectionKey: string, title: string): LayoutDoc {
    const sIdx = doc.sections.findIndex((s) => s.key === sectionKey);
    if (sIdx < 0) return doc;
    return patchSection(doc, sIdx, { title });
}

export type CompositionGridLayout = {
    summarySections: LayoutSection[];
    leftColumn: LayoutSection | null;
    mainColumn: LayoutSection | null;
    rightRailSections: LayoutSection[];
    fullWidthRow: LayoutSection | null;
    overflowSections: LayoutSection[];
    summaryHostSectionKey: string | null;
};

/** Resolve build-mode composition grid slots for any drawer surface. */
export function resolveCompositionGridLayout(
    doc: LayoutDoc,
    surfaceKey: DrawerLayoutEditorSurfaceKey,
): CompositionGridLayout {
    const zones = partitionDrawerSectionsByZone(doc, surfaceKey);
    const summarySections = zones.summary_strip;
    const renderedInZones = new Set([
        ...summarySections.map((section) => section.key),
        ...zones.right_rail.map((section) => section.key),
        ...zones.footer_actions.map((section) => section.key),
    ]);

    if (surfaceKey === "person_drawer") {
        const slots = partitionPersonOverviewBodySections(doc);
        return {
            summarySections,
            leftColumn: slots.household,
            mainColumn: slots.children,
            rightRailSections: zones.right_rail,
            fullWidthRow: slots.contact,
            overflowSections: [
                ...(slots.notes ? [slots.notes] : []),
                ...(slots.activity ? [slots.activity] : []),
                ...(slots.documents ? [slots.documents] : []),
                ...slots.overflow.filter((section) => !renderedInZones.has(section.key)),
            ],
            summaryHostSectionKey: "person_summary",
        };
    }

    if (surfaceKey === "child_drawer") {
        const slots = partitionChildOverviewBodySections(doc);
        return {
            summarySections,
            leftColumn: slots.family,
            mainColumn: slots.program,
            rightRailSections: zones.right_rail,
            fullWidthRow: slots.schedule,
            overflowSections: [
                ...(slots.notes ? [slots.notes] : []),
                ...(slots.activity ? [slots.activity] : []),
                ...(slots.documents ? [slots.documents] : []),
                ...slots.overflow.filter((section) => !renderedInZones.has(section.key)),
            ],
            summaryHostSectionKey: "child_summary",
        };
    }

    const slots = partitionLeadOverviewBodySections(doc);
    return {
        summarySections,
        leftColumn: slots.household,
        mainColumn: slots.enrollment,
        rightRailSections: zones.right_rail,
        fullWidthRow: slots.leadSource,
        overflowSections: [
            ...(slots.notes ? [slots.notes] : []),
            ...(slots.activity ? [slots.activity] : []),
            ...slots.overflow.filter((section) => !renderedInZones.has(section.key)),
        ],
        summaryHostSectionKey: "lead_summary",
    };
}
