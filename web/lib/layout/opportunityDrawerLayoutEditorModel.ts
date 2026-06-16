/**
 * Opportunity drawer visual layout editor — pure doc/model helpers (Phase 3).
 *
 * Settings-only: partitions zones, reorders within zone, field/section edits,
 * and validation messaging. No runtime drawer behavior.
 */

import {
    addItem,
    addRow,
    makeFieldItem,
    moveItemVertical,
    patchSection,
    removeItem,
} from "@/lib/layout/builderOps";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { validateOpportunityDrawerLayoutBlocks } from "@/lib/layout/layoutEditorBlockRegistry";
import type { LayoutDoc, LayoutItem, LayoutSection } from "@/lib/layout/layoutV2";
import { parseLayoutDoc } from "@/lib/layout/layoutV2Schema";
import { readLayoutSectionPresentationMetadata } from "@/lib/layout/runtime/layoutSectionPresentationMetadata";
import { buildOpportunityDrawerEditorFieldPickerGroups } from "@/lib/layout/opportunityDrawerLayoutEditorFieldCatalog";
import {
    addCustomOpportunityDrawerSection,
    layoutDocHasRepairableGeneratedKeys,
    repairOpportunityDrawerLayoutGeneratedKeys,
} from "@/lib/layout/layoutEditorGeneratedKeys";
import { splitDrawerLayoutDocShellZones } from "@/lib/layout/runtime/splitDrawerLayoutDocShellZones";
import {
    isAllowedOpportunityDrawerFieldRefKey,
    isOpportunityDrawerLayoutZone,
    OPPORTUNITY_DRAWER_SECTION_DEFAULT_ZONE,
    OPPORTUNITY_DRAWER_SECTION_KEYS,
    OPPORTUNITY_DRAWER_SURFACE,
    PLATFORM_SHELL_SLOTS,
    resolveSurfaceLayoutKeyFromDoc,
    type OpportunityDrawerLayoutZone,
    type OpportunityDrawerSectionKey,
} from "@/lib/layout/surfaceLayoutRegistry";

export const LAYOUT_SECTION_EDITOR_HIDDEN_METADATA_KEY = "layoutEditorHidden" as const;

/** Platform-owned shell slots shown as locked chrome in the visual editor. */
export const OPPORTUNITY_DRAWER_LOCKED_SHELL_SLOTS = PLATFORM_SHELL_SLOTS;

export type OpportunityDrawerZonePartition = Record<OpportunityDrawerLayoutZone, LayoutSection[]>;

export type LayoutItemLocation = {
    sIdx: number;
    rIdx: number;
    cIdx: number;
    itemId: string;
    item: LayoutItem;
};

function cloneDoc(doc: LayoutDoc): LayoutDoc {
    return JSON.parse(JSON.stringify(doc)) as LayoutDoc;
}

export function isOpportunityDrawerLayoutDoc(doc: Pick<LayoutDoc, "entityType" | "surface">): boolean {
    return resolveSurfaceLayoutKeyFromDoc(doc) === "opportunity_drawer";
}

export function resolveOpportunityDrawerSectionZone(section: LayoutSection): OpportunityDrawerLayoutZone {
    const layoutZone = section.metadata?.layoutZone;
    if (isOpportunityDrawerLayoutZone(layoutZone)) return layoutZone;

    const defaultZone = OPPORTUNITY_DRAWER_SECTION_DEFAULT_ZONE[section.key as OpportunityDrawerSectionKey];
    if (defaultZone) return defaultZone;

    const railSlot = readLayoutSectionPresentationMetadata(section).railSlot;
    if (railSlot === "right_rail") return "right_rail";
    if (railSlot === "footer") return "footer_actions";
    if (section.key === "lead_summary") return "summary_strip";
    return "main";
}

export function isSectionEditorHidden(section: LayoutSection): boolean {
    return section.metadata?.[LAYOUT_SECTION_EDITOR_HIDDEN_METADATA_KEY] === true;
}

export function partitionOpportunityDrawerSectionsByZone(doc: LayoutDoc): OpportunityDrawerZonePartition {
    const empty = (): OpportunityDrawerZonePartition => ({
        summary_strip: [],
        main: [],
        right_rail: [],
        footer_actions: [],
    });
    const zones = empty();
    for (const section of doc.sections) {
        zones[resolveOpportunityDrawerSectionZone(section)].push(section);
    }
    return zones;
}

/** Preview doc: omit sections marked hidden in the layout editor. */
export function filterHiddenSectionsForPreview(doc: LayoutDoc): LayoutDoc {
    return {
        ...doc,
        sections: doc.sections.filter((s) => !isSectionEditorHidden(s)),
    };
}

export function buildOpportunityDrawerPreviewDocs(doc: LayoutDoc): {
    summaryDoc: LayoutDoc;
    mainDoc: LayoutDoc;
    rightRailDoc: LayoutDoc;
} {
    const visible = filterHiddenSectionsForPreview(doc);
    const split = splitDrawerLayoutDocShellZones(visible, "opportunity");
    const bodyZones = partitionOpportunityDrawerSectionsByZone(split.bodyDoc);
    return {
        summaryDoc: split.summaryDoc,
        mainDoc: { ...visible, sections: bodyZones.main },
        rightRailDoc: { ...visible, sections: bodyZones.right_rail },
    };
}

export function buildSingleSectionPreviewDoc(doc: LayoutDoc, sectionKey: string): LayoutDoc | null {
    const section = doc.sections.find((s) => s.key === sectionKey);
    if (!section) return null;
    return { ...doc, sections: [section] };
}

function sectionIndicesInZone(doc: LayoutDoc, zone: OpportunityDrawerLayoutZone): number[] {
    return doc.sections
        .map((section, index) => ({ section, index }))
        .filter(({ section }) => resolveOpportunityDrawerSectionZone(section) === zone)
        .map(({ index }) => index);
}

export function reorderSectionInZone(doc: LayoutDoc, sectionKey: string, direction: -1 | 1): LayoutDoc {
    const sIdx = doc.sections.findIndex((s) => s.key === sectionKey);
    if (sIdx < 0) return doc;
    const zone = resolveOpportunityDrawerSectionZone(doc.sections[sIdx]!);
    const indices = sectionIndicesInZone(doc, zone);
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
    return patchSection(doc, sIdx, { title: title.trim() || doc.sections[sIdx]!.title });
}

export function setSectionEditorHidden(doc: LayoutDoc, sectionKey: string, hidden: boolean): LayoutDoc {
    const sIdx = doc.sections.findIndex((s) => s.key === sectionKey);
    if (sIdx < 0) return doc;
    const section = doc.sections[sIdx]!;
    const metadata = { ...(section.metadata ?? {}) };
    if (hidden) metadata[LAYOUT_SECTION_EDITOR_HIDDEN_METADATA_KEY] = true;
    else delete metadata[LAYOUT_SECTION_EDITOR_HIDDEN_METADATA_KEY];
    return patchSection(doc, sIdx, { metadata });
}

export function listMissingRegisteredSections(doc: LayoutDoc): OpportunityDrawerSectionKey[] {
    const present = new Set(doc.sections.map((s) => s.key));
    return OPPORTUNITY_DRAWER_SECTION_KEYS.filter((key) => !present.has(key));
}

export function addRegisteredSection(doc: LayoutDoc, sectionKey: OpportunityDrawerSectionKey): LayoutDoc {
    if (doc.sections.some((s) => s.key === sectionKey)) return doc;
    const template = buildLeadDrawerDefaultDoc().sections.find((s) => s.key === sectionKey);
    if (!template) return doc;

    const next = cloneDoc(doc);
    const zone = OPPORTUNITY_DRAWER_SECTION_DEFAULT_ZONE[sectionKey];
    const indices = sectionIndicesInZone(next, zone);
    const insertAfter = indices.length > 0 ? indices[indices.length - 1]! + 1 : next.sections.length;
    next.sections.splice(insertAfter, 0, cloneDoc({ formatVersion: 1, surface: "drawer", entityType: "opportunities", sections: [template] }).sections[0]!);
    return next;
}

export function findLayoutItemLocation(doc: LayoutDoc, itemId: string): LayoutItemLocation | null {
    for (let sIdx = 0; sIdx < doc.sections.length; sIdx += 1) {
        const section = doc.sections[sIdx]!;
        for (let rIdx = 0; rIdx < section.rows.length; rIdx += 1) {
            const row = section.rows[rIdx]!;
            for (let cIdx = 0; cIdx < row.columns.length; cIdx += 1) {
                const col = row.columns[cIdx]!;
                for (const item of col.items) {
                    if (item.id === itemId) return { sIdx, rIdx, cIdx, itemId, item };
                    if (item.rows?.length) {
                        for (let srIdx = 0; srIdx < item.rows.length; srIdx += 1) {
                            const subRow = item.rows[srIdx]!;
                            for (let scIdx = 0; scIdx < subRow.columns.length; scIdx += 1) {
                                const nested = subRow.columns[scIdx]!.items.find((it) => it.id === itemId);
                                if (nested) return { sIdx, rIdx, cIdx, itemId, item: nested };
                            }
                        }
                    }
                }
            }
        }
    }
    return null;
}

export function listSectionTopLevelItems(doc: LayoutDoc, sectionKey: string): LayoutItemLocation[] {
    const sIdx = doc.sections.findIndex((s) => s.key === sectionKey);
    if (sIdx < 0) return [];
    const out: LayoutItemLocation[] = [];
    const section = doc.sections[sIdx]!;
    section.rows.forEach((row, rIdx) => {
        row.columns.forEach((col, cIdx) => {
            col.items.forEach((item) => {
                out.push({ sIdx, rIdx, cIdx, itemId: item.id, item });
            });
        });
    });
    return out;
}

export type AddFieldResult = { ok: true; doc: LayoutDoc } | { ok: false; error: string };

export function tryAddFieldRefToSection(
    doc: LayoutDoc,
    sectionKey: string,
    refKey: string,
    label: string,
    fieldType = "text",
): AddFieldResult {
    const trimmed = refKey.trim();
    if (!trimmed) return { ok: false, error: "Choose a field to add." };
    if (!isAllowedOpportunityDrawerFieldRefKey(trimmed)) {
        return { ok: false, error: `"${trimmed}" is not allowed on the opportunity drawer.` };
    }

    const sIdx = doc.sections.findIndex((s) => s.key === sectionKey);
    if (sIdx < 0) return { ok: false, error: "Section not found." };

    let next = doc;
    const section = next.sections[sIdx]!;
    if (section.rows.length === 0) {
        next = addRow(next, sIdx, 1);
    }
    const rIdx = 0;
    const cIdx = 0;
    try {
        const item = makeFieldItem(trimmed, label.trim() || trimmed, fieldType);
        next = addItem(next, sIdx, rIdx, cIdx, item);
        return { ok: true, doc: next };
    } catch (e) {
        return { ok: false, error: (e as Error).message };
    }
}

export function removeLayoutItem(doc: LayoutDoc, itemId: string): LayoutDoc {
    const loc = findLayoutItemLocation(doc, itemId);
    if (!loc) return doc;
    return removeItem(doc, loc.sIdx, loc.rIdx, loc.cIdx, itemId);
}

export function reorderLayoutItemInColumn(doc: LayoutDoc, itemId: string, direction: -1 | 1): LayoutDoc {
    const loc = findLayoutItemLocation(doc, itemId);
    if (!loc) return doc;
    return moveItemVertical(doc, loc.sIdx, loc.rIdx, loc.cIdx, itemId, direction);
}

export function validateOpportunityDrawerLayoutDoc(doc: LayoutDoc): {
    ok: boolean;
    errors: string[];
    warnings: string[];
} {
    const parsed = parseLayoutDoc(doc, { inferSurfaceKey: true });
    const blockErrors = isOpportunityDrawerLayoutDoc(doc) ? validateOpportunityDrawerLayoutBlocks(doc) : [];
    const errors = [...parsed.errors, ...blockErrors];
    return {
        ok: parsed.ok && blockErrors.length === 0,
        errors,
        warnings: parsed.warnings,
    };
}

export type PrepareOpportunityDrawerLayoutDocResult =
    | { ok: true; doc: LayoutDoc; autoRepaired: boolean; repairs: string[]; warnings: string[] }
    | { ok: false; errors: string[] };

/**
 * Load path for the visual editor: structural parse → repair legacy keys → surface validate.
 * Legacy drafts with section_N / block fail surface validation until repaired.
 */
export function prepareOpportunityDrawerLayoutDocForEditor(raw: unknown): PrepareOpportunityDrawerLayoutDocResult {
    const structural = parseLayoutDoc(raw);
    if (!structural.ok || !structural.doc) {
        return { ok: false, errors: structural.errors };
    }
    if (!isOpportunityDrawerLayoutDoc(structural.doc)) {
        return { ok: false, errors: ["Layout is not an opportunity drawer document."] };
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

    return {
        ok: true,
        doc: validated.doc,
        autoRepaired,
        repairs,
        warnings: validated.warnings,
    };
}

/** Repair legacy keys before save/publish if still present. */
export function ensureOpportunityDrawerLayoutDocSaveReady(doc: LayoutDoc): {
    doc: LayoutDoc;
    repaired: boolean;
    repairs: string[];
} {
    if (!layoutDocHasRepairableGeneratedKeys(doc)) {
        return { doc, repaired: false, repairs: [] };
    }
    const repaired = repairOpportunityDrawerLayoutGeneratedKeys(doc);
    return { doc: repaired.doc, repaired: repaired.changed, repairs: repaired.repairs };
}

export function formatLayoutValidationErrors(errors: string[]): string[] {
    return errors.map((err) => {
        let msg = err
            .replace(/^sections\[(\d+)\]\.key:/, "Section $1:")
            .replace(/^sections\[(\d+)\]\./, "Section $1 · ")
            .replace(/^doc\.metadata:/, "Layout settings:")
            .replace(/^doc\.sections\[(\d+)\]\./, "Section $1 · ");

        msg = msg.replace(
            /legacy_invalid_section_key "([^"]+)"/,
            'This custom section was created with an invalid key ("$1"). Please recreate it or use "Repair generated layout keys".',
        );
        msg = msg.replace(
            /custom_section_missing_metadata for key "([^"]+)"/,
            'Custom section "$1" is missing required layout metadata. Use "Repair generated layout keys" or recreate the section.',
        );
        msg = msg.replace(
            /legacy_invalid_block_refKey "([^"]+)"/,
            'This custom block is missing a valid layout block ID. Use "Repair generated layout keys" or add the block again.',
        );
        msg = msg.replace(
            /custom_block_missing_metadata for refKey "([^"]+)"/,
            'Custom block "$1" is missing required layout metadata. Use "Repair generated layout keys" or recreate the block.',
        );
        msg = msg.replace(/unknown field refKey "([^"]+)"/, 'Field "$1" is not allowed on the opportunity drawer');
        msg = msg.replace(/unknown field_group refKey "([^"]+)"/, 'Block "$1" is not allowed on this surface');
        msg = msg.replace(/unknown related_list refKey "([^"]+)"/, 'List "$1" is not allowed on this surface');
        msg = msg.replace(/unknown section key "([^"]+)"/, 'Section "$1" is not registered for this surface');
        msg = msg.replace(/unknown metadata key "([^"]+)"/, 'Setting "$1" is not supported');
        msg = msg.replace(/unknown widget refKey "([^"]+)"/, 'Widget "$1" is not allowed on this surface');

        return msg;
    });
}

export { addCustomOpportunityDrawerSection, layoutDocHasRepairableGeneratedKeys, repairOpportunityDrawerLayoutGeneratedKeys };

export type VisualEditorActionState = {
    canSave: boolean;
    canPublish: boolean;
    statusLabel: string;
    statusTone: "neutral" | "warning" | "success" | "error";
    publishBlockedReason: string | null;
};

/** Derive save/publish affordances for the visual editor toolbar. */
export function resolveVisualEditorActionState(input: {
    dirty: boolean;
    validationOk: boolean;
    recordStatus: "draft" | "published" | string;
    busy: boolean;
}): VisualEditorActionState {
    if (input.recordStatus === "published") {
        if (input.dirty) {
            return {
                canSave: input.validationOk && !input.busy,
                canPublish: false,
                statusLabel: "Published — save creates a new draft with your changes",
                statusTone: input.validationOk ? "warning" : "error",
                publishBlockedReason: "Save as draft first, then publish the new draft.",
            };
        }
        return {
            canSave: false,
            canPublish: false,
            statusLabel: "Published — edit to start a new draft",
            statusTone: "success",
            publishBlockedReason: "This version is already published.",
        };
    }

    if (!input.validationOk) {
        return {
            canSave: false,
            canPublish: false,
            statusLabel: input.dirty ? "Unsaved changes · fix validation issues" : "Fix validation issues before saving",
            statusTone: "error",
            publishBlockedReason: "Resolve validation errors before publishing.",
        };
    }

    if (input.dirty) {
        return {
            canSave: !input.busy,
            canPublish: !input.busy,
            statusLabel: "Unsaved changes",
            statusTone: "warning",
            publishBlockedReason: null,
        };
    }

    return {
        canSave: false,
        canPublish: !input.busy,
        statusLabel: "Draft saved",
        statusTone: "neutral",
        publishBlockedReason: null,
    };
}

export function opportunityDrawerEditorFieldPickerOptions(): { refKey: string; label: string }[] {
    return buildOpportunityDrawerEditorFieldPickerGroups().flatMap((group) =>
        group.fields.map((field) => ({ refKey: field.refKey, label: field.fieldLabel })),
    );
}

export function isPlatformShellSlotEditable(slot: string): boolean {
    return false;
}
