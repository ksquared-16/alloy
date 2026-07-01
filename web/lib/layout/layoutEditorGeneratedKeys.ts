/**
 * Visual layout editor — safe generated section/block keys (Phase 5.13).
 *
 * Custom containers use deterministic prefixes + short ids. Legacy generic keys
 * (`section_3`, `block`) are rejected by surface validation and repairable.
 */

import { columnWidths as computeColumnWidths, makeId } from "@/lib/layout/builderOps";
import {
    readLayoutEditorBlockConfig,
    validateLayoutEditorBlockConfig,
    writeLayoutEditorBlockConfig,
    type LayoutEditorBlockConfig,
} from "@/lib/layout/layoutEditorBlockConfig";
import type { LayoutDoc, LayoutItem, LayoutSection } from "@/lib/layout/layoutV2";
import {
    isOpportunityDrawerLayoutZone,
    OPPORTUNITY_DRAWER_SECTION_KEYS,
    PLATFORM_RESERVED_SECTION_KEYS,
    type OpportunityDrawerLayoutZone,
} from "@/lib/layout/surfaceLayoutRegistry";

export const LAYOUT_EDITOR_CUSTOM_METADATA_KEY = "layoutEditorCustom" as const;
export const LAYOUT_EDITOR_CREATED_BY_VISUAL_EDITOR_METADATA_KEY = "createdByVisualEditor" as const;

export const CUSTOM_SECTION_KEY_PREFIX = "custom_section_" as const;
export const LAYOUT_SECTION_KEY_PREFIX = "layout_section_" as const;
export const CUSTOM_BLOCK_REF_KEY_PREFIX = "custom_block_" as const;
export const LAYOUT_BLOCK_REF_KEY_SUFFIX_PREFIX = "layout_block_" as const;

/** Legacy builder keys that must not pass surface validation. */
export const LEGACY_INVALID_SECTION_KEY_PATTERN = /^section_\d+$/;
export const LEGACY_INVALID_BLOCK_REF_KEYS = new Set(["block"]);

let _seq = 0;

function makeShortId(): string {
    _seq += 1;
    return `${_seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function makeCustomSectionKey(): string {
    return `${CUSTOM_SECTION_KEY_PREFIX}${makeShortId()}`;
}

export function makeCustomBlockRefKey(): string {
    return `${CUSTOM_BLOCK_REF_KEY_PREFIX}${makeShortId()}`;
}

export function isRegisteredOpportunityDrawerSectionKey(key: string): boolean {
    return (OPPORTUNITY_DRAWER_SECTION_KEYS as readonly string[]).includes(key);
}

export function isLegacyInvalidSectionKey(key: string): boolean {
    const trimmed = key.trim();
    if (!trimmed) return true;
    return LEGACY_INVALID_SECTION_KEY_PATTERN.test(trimmed);
}

export function isValidCustomSectionKeyPattern(key: string): boolean {
    const trimmed = key.trim();
    if (!trimmed || isLegacyInvalidSectionKey(trimmed)) return false;
    if (isRegisteredOpportunityDrawerSectionKey(trimmed)) return false;
    if (PLATFORM_RESERVED_SECTION_KEYS.has(trimmed)) return false;
    return trimmed.startsWith(CUSTOM_SECTION_KEY_PREFIX) || trimmed.startsWith(LAYOUT_SECTION_KEY_PREFIX);
}

export function isValidCustomSection(section: LayoutSection): boolean {
    if (!isValidCustomSectionKeyPattern(section.key)) return false;
    const metadata = section.metadata;
    if (!metadata || metadata[LAYOUT_EDITOR_CUSTOM_METADATA_KEY] !== true) return false;
    const zone = metadata.layoutZone;
    return isOpportunityDrawerLayoutZone(zone);
}

export function isOpportunityDrawerSectionKeyAllowed(section: LayoutSection): boolean {
    if (PLATFORM_RESERVED_SECTION_KEYS.has(section.key)) return false;
    if (isRegisteredOpportunityDrawerSectionKey(section.key)) return true;
    return isValidCustomSection(section);
}

export function isLegacyInvalidBlockRefKey(refKey: string): boolean {
    return LEGACY_INVALID_BLOCK_REF_KEYS.has(refKey.trim());
}

export function isValidCustomBlockRefKeyPattern(refKey: string): boolean {
    const trimmed = refKey.trim();
    if (!trimmed || isLegacyInvalidBlockRefKey(trimmed)) return false;
    if (trimmed.startsWith(CUSTOM_BLOCK_REF_KEY_PREFIX)) {
        return trimmed.length > CUSTOM_BLOCK_REF_KEY_PREFIX.length;
    }
    if (trimmed.startsWith(LAYOUT_BLOCK_REF_KEY_SUFFIX_PREFIX)) {
        return trimmed.length > LAYOUT_BLOCK_REF_KEY_SUFFIX_PREFIX.length;
    }
    return false;
}

export function isValidCustomLayoutBlockItem(item: LayoutItem): boolean {
    if (item.kind !== "field_group" || !item.refKey) return false;
    if (!isValidCustomBlockRefKeyPattern(item.refKey)) return false;
    if (item.metadata?.[LAYOUT_EDITOR_CUSTOM_METADATA_KEY] !== true) return false;
    const config = readLayoutEditorBlockConfig(item.metadata);
    if (!config.blockType || !config.dataContext) return false;
    return validateLayoutEditorBlockConfig(config, "layoutEditorBlockConfig").length === 0;
}

export function writeCustomLayoutEditorMetadata(
    metadata: Record<string, unknown> | undefined,
    patch?: LayoutEditorBlockConfig,
): Record<string, unknown> {
    const next = writeLayoutEditorBlockConfig(metadata, patch ?? {});
    next[LAYOUT_EDITOR_CUSTOM_METADATA_KEY] = true;
    next[LAYOUT_EDITOR_CREATED_BY_VISUAL_EDITOR_METADATA_KEY] = true;
    return next;
}

export function writeCustomSectionMetadata(
    zone: OpportunityDrawerLayoutZone,
    metadata?: Record<string, unknown>,
): Record<string, unknown> {
    return {
        ...(metadata ?? {}),
        layoutZone: zone,
        [LAYOUT_EDITOR_CUSTOM_METADATA_KEY]: true,
        [LAYOUT_EDITOR_CREATED_BY_VISUAL_EDITOR_METADATA_KEY]: true,
    };
}

export function addCustomOpportunityDrawerSection(
    doc: LayoutDoc,
    input?: { title?: string; zone?: OpportunityDrawerLayoutZone },
): LayoutDoc {
    const next = JSON.parse(JSON.stringify(doc)) as LayoutDoc;
    const zone = input?.zone ?? "main";
    const customCount = next.sections.filter((s) => isValidCustomSectionKeyPattern(s.key)).length + 1;
    const key = makeCustomSectionKey();
    next.sections.push({
        id: makeId("sec"),
        key,
        title: input?.title?.replace(/^\s+|\s+$/g, "") || `Custom section ${customCount}`,
        collapsible: true,
        defaultExpanded: true,
        rows: [{ id: makeId("row"), columns: computeColumnWidths(1).map((width) => ({ id: makeId("col"), width, items: [] })) }],
        metadata: writeCustomSectionMetadata(zone),
    });
    return next;
}

function emptyColumns(count: number) {
    return computeColumnWidths(count).map((width) => ({ id: makeId("col"), width, items: [] as LayoutItem[] }));
}

function repairFieldGroupItem(item: LayoutItem, repairs: string[]): void {
    if (item.kind !== "field_group" || !item.refKey) return;
    const refKey = item.refKey.trim();
    const needsRepair =
        isLegacyInvalidBlockRefKey(refKey)
        || (refKey === "layout_block" && !readLayoutEditorBlockConfig(item.metadata).blockType);
    if (!needsRepair && isValidCustomBlockRefKeyPattern(refKey)) return;

    const prev = refKey || "block";
    const nextRef = makeCustomBlockRefKey();
    item.refKey = nextRef;
    item.metadata = writeCustomLayoutEditorMetadata(item.metadata, {
        blockType: readLayoutEditorBlockConfig(item.metadata).blockType ?? "custom_layout_block",
        dataContext: readLayoutEditorBlockConfig(item.metadata).dataContext ?? "lead",
        showTitle: readLayoutEditorBlockConfig(item.metadata).showTitle ?? true,
        editMode: readLayoutEditorBlockConfig(item.metadata).editMode ?? "display_only",
    });
    repairs.push(`Block "${prev}" → "${nextRef}"`);
}

function walkItemsForRepair(items: LayoutItem[], repairs: string[]): void {
    for (const item of items) {
        repairFieldGroupItem(item, repairs);
        item.rows?.forEach((row) => row.columns.forEach((col) => walkItemsForRepair(col.items, repairs)));
        item.items?.forEach((child) => walkItemsForRepair([child], repairs));
    }
}

export function layoutDocHasRepairableGeneratedKeys(doc: LayoutDoc): boolean {
    for (const section of doc.sections) {
        if (isLegacyInvalidSectionKey(section.key)) return true;
        if (isValidCustomSectionKeyPattern(section.key) && !isValidCustomSection(section)) return true;
    }
    for (const section of doc.sections) {
        for (const row of section.rows) {
            for (const col of row.columns) {
                for (const item of col.items) {
                    if (item.kind === "field_group" && item.refKey) {
                        if (isLegacyInvalidBlockRefKey(item.refKey)) return true;
                        if (item.refKey === "layout_block" && !readLayoutEditorBlockConfig(item.metadata).blockType) {
                            return true;
                        }
                    }
                }
            }
        }
    }
    return false;
}

/** Repair legacy generic section/block keys in-place on a doc copy. */
export function repairOpportunityDrawerLayoutGeneratedKeys(doc: LayoutDoc): {
    doc: LayoutDoc;
    repairs: string[];
    changed: boolean;
} {
    const next = JSON.parse(JSON.stringify(doc)) as LayoutDoc;
    const repairs: string[] = [];
    const usedKeys = new Set(next.sections.map((s) => s.key));

    for (const section of next.sections) {
        const needsKeyRepair = isLegacyInvalidSectionKey(section.key);
        const needsMetadataRepair = isValidCustomSectionKeyPattern(section.key) && !isValidCustomSection(section);

        if (needsKeyRepair || needsMetadataRepair) {
            if (needsKeyRepair) {
                const prev = section.key;
                let newKey = makeCustomSectionKey();
                while (usedKeys.has(newKey)) newKey = makeCustomSectionKey();
                section.key = newKey;
                usedKeys.add(newKey);
                repairs.push(`Section "${prev}" → "${newKey}"`);
            }
            section.metadata = writeCustomSectionMetadata(
                isOpportunityDrawerLayoutZone(section.metadata?.layoutZone) ?
                    (section.metadata!.layoutZone as OpportunityDrawerLayoutZone)
                :   "main",
                section.metadata,
            );
        }
    }

    for (const section of next.sections) {
        for (const row of section.rows) {
            for (const col of row.columns) {
                walkItemsForRepair(col.items, repairs);
            }
        }
    }

    return { doc: next, repairs, changed: repairs.length > 0 };
}

/** Ensure a newly added empty block uses a valid custom ref key + metadata. */
export function makeEmptyCustomLayoutBlockItem(): LayoutItem {
    return {
        id: makeId("grp"),
        kind: "field_group",
        refKey: makeCustomBlockRefKey(),
        label: "Block",
        rows: [{ id: makeId("row"), columns: emptyColumns(2) }],
        metadata: writeCustomLayoutEditorMetadata(undefined, {
            blockType: "custom_layout_block",
            dataContext: "lead",
            showTitle: true,
            editMode: "display_only",
        }),
    };
}
