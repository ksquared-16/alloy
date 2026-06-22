/**
 * Related list section builder config — entity type + primary/secondary/tertiary rows (Phase 5.14A).
 */

import { addItem, makeId, patchSection } from "@/lib/layout/builderOps";
import {
    LAYOUT_EDITOR_BLOCK_CONFIG_METADATA_KEY,
    readLayoutEditorBlockConfig,
    writeLayoutEditorBlockConfig,
    type LayoutEditorChildRowGroup,
} from "@/lib/layout/layoutEditorBlockConfig";
import { LAYOUT_EDITOR_BLOCK_TEMPLATE_METADATA_KEY } from "@/lib/layout/layoutEditorBlockRegistry";
import { readLayoutEditorRowTemplateConfig, writeLayoutEditorRowTemplateConfig } from "@/lib/layout/layoutEditorRowTemplateConfig";
import type { LayoutCollectionColumn, LayoutDoc, LayoutItem, LayoutSection } from "@/lib/layout/layoutV2";
import { relatedListPresentationToDisplayMode } from "@/lib/layout/runtime/resolveLayoutRuntimeRelatedListPresentation";
import { isAllowedOpportunityDrawerFieldRefKey } from "@/lib/layout/surfaceLayoutRegistry";

export const LAYOUT_EDITOR_RELATED_LIST_CONFIG_METADATA_KEY = "layoutEditorRelatedListConfig" as const;

export const LAYOUT_EDITOR_RELATED_LIST_ENTITY_TYPES = [
    "children",
    "contacts",
    "household_members",
    "opportunities",
] as const;

export type LayoutEditorRelatedListEntityType = (typeof LAYOUT_EDITOR_RELATED_LIST_ENTITY_TYPES)[number];

export type LayoutEditorRelatedListRowTemplate = {
    fields: string[];
};

export const LAYOUT_EDITOR_RELATED_LIST_PRESENTATION_MODES = ["table", "cards", "compact"] as const;
export type LayoutEditorRelatedListPresentationMode = (typeof LAYOUT_EDITOR_RELATED_LIST_PRESENTATION_MODES)[number];

export const LAYOUT_EDITOR_RELATED_LIST_PRESENTATION_LABELS: Record<LayoutEditorRelatedListPresentationMode, string> = {
    table: "Table",
    cards: "Cards",
    compact: "Compact summary",
};

export type LayoutEditorRelatedListConfig = {
    entityType: LayoutEditorRelatedListEntityType;
    presentationMode?: LayoutEditorRelatedListPresentationMode;
    primaryRow: LayoutEditorRelatedListRowTemplate;
    secondaryRow?: LayoutEditorRelatedListRowTemplate;
    tertiaryRow?: LayoutEditorRelatedListRowTemplate;
};

export const LAYOUT_EDITOR_RELATED_LIST_ENTITY_LABELS: Record<LayoutEditorRelatedListEntityType, string> = {
    children: "Children",
    contacts: "Contacts",
    household_members: "Household members",
    opportunities: "Opportunities",
};

export const DEFAULT_CHILDREN_RELATED_LIST_CONFIG: LayoutEditorRelatedListConfig = {
    entityType: "children",
    primaryRow: { fields: ["child.name", "child.dob_age"] },
    secondaryRow: { fields: ["child.program", "child.room"] },
    tertiaryRow: { fields: ["child.schedule", "child.status"] },
};

export const DEFAULT_CONTACTS_RELATED_LIST_CONFIG: LayoutEditorRelatedListConfig = {
    entityType: "contacts",
    primaryRow: { fields: ["person.primary_contact_name", "person.role"] },
    secondaryRow: { fields: ["person.primary_email", "person.primary_phone"] },
    tertiaryRow: { fields: ["person.relationship", "person.is_primary"] },
};

export const DEFAULT_HOUSEHOLD_MEMBERS_RELATED_LIST_CONFIG: LayoutEditorRelatedListConfig = {
    entityType: "household_members",
    primaryRow: { fields: ["person.primary_contact_name", "person.role"] },
    secondaryRow: { fields: ["person.primary_email", "person.primary_phone"] },
    tertiaryRow: { fields: ["person.email", "person.phone"] },
};

const ENTITY_RUNTIME_SUPPORT: Record<LayoutEditorRelatedListEntityType, boolean> = {
    children: true,
    contacts: true,
    household_members: true,
    opportunities: false,
};

export function relatedListEntityTypeRuntimeSupported(entityType: LayoutEditorRelatedListEntityType): boolean {
    return ENTITY_RUNTIME_SUPPORT[entityType] ?? false;
}

const ENTITY_REF_KEYS: Record<LayoutEditorRelatedListEntityType, string> = {
    children: "children",
    contacts: "contacts",
    household_members: "household_members",
    opportunities: "opportunities",
};

function cloneDoc(doc: LayoutDoc): LayoutDoc {
    return JSON.parse(JSON.stringify(doc)) as LayoutDoc;
}

function isEntityType(v: string): v is LayoutEditorRelatedListEntityType {
    return (LAYOUT_EDITOR_RELATED_LIST_ENTITY_TYPES as readonly string[]).includes(v);
}

function isPresentationMode(v: string): v is LayoutEditorRelatedListPresentationMode {
    return (LAYOUT_EDITOR_RELATED_LIST_PRESENTATION_MODES as readonly string[]).includes(v);
}

function normalizeRowTemplate(raw: unknown): LayoutEditorRelatedListRowTemplate | null {
    if (!raw || typeof raw !== "object") return null;
    const bag = raw as Record<string, unknown>;
    if (!Array.isArray(bag.fields)) return null;
    const fields = bag.fields.filter((f): f is string => typeof f === "string" && f.trim().length > 0);
    return fields.length > 0 ? { fields } : null;
}

export function readLayoutEditorRelatedListConfig(section: LayoutSection): LayoutEditorRelatedListConfig {
    const raw = section.metadata?.[LAYOUT_EDITOR_RELATED_LIST_CONFIG_METADATA_KEY];
    if (!raw || typeof raw !== "object") return { ...DEFAULT_CHILDREN_RELATED_LIST_CONFIG };
    const bag = raw as Record<string, unknown>;
    const entityType =
        typeof bag.entityType === "string" && isEntityType(bag.entityType) ? bag.entityType : "children";
    const defaults =
        entityType === "contacts" ? DEFAULT_CONTACTS_RELATED_LIST_CONFIG
        : entityType === "household_members" ? DEFAULT_HOUSEHOLD_MEMBERS_RELATED_LIST_CONFIG
        : DEFAULT_CHILDREN_RELATED_LIST_CONFIG;
    const primaryRow = normalizeRowTemplate(bag.primaryRow) ?? defaults.primaryRow;
    const secondaryRow = normalizeRowTemplate(bag.secondaryRow) ?? defaults.secondaryRow;
    const tertiaryRow = normalizeRowTemplate(bag.tertiaryRow) ?? defaults.tertiaryRow;
    const presentationMode =
        typeof bag.presentationMode === "string" && isPresentationMode(bag.presentationMode) ?
            bag.presentationMode
        :   "table";
    return { entityType, presentationMode, primaryRow, secondaryRow, tertiaryRow };
}

export function writeLayoutEditorRelatedListConfig(
    metadata: Record<string, unknown> | undefined,
    config: LayoutEditorRelatedListConfig,
): Record<string, unknown> {
    return {
        ...(metadata ?? {}),
        [LAYOUT_EDITOR_RELATED_LIST_CONFIG_METADATA_KEY]: {
            entityType: config.entityType,
            ...(config.presentationMode ? { presentationMode: config.presentationMode } : {}),
            primaryRow: config.primaryRow,
            ...(config.secondaryRow ? { secondaryRow: config.secondaryRow } : {}),
            ...(config.tertiaryRow ? { tertiaryRow: config.tertiaryRow } : {}),
        },
    };
}

export function patchLayoutEditorRelatedListConfig(
    doc: LayoutDoc,
    sectionKey: string,
    patch: Partial<LayoutEditorRelatedListConfig>,
): LayoutDoc {
    const sIdx = doc.sections.findIndex((s) => s.key === sectionKey);
    if (sIdx < 0) return doc;
    const section = doc.sections[sIdx]!;
    const current = readLayoutEditorRelatedListConfig(section);
    const nextConfig: LayoutEditorRelatedListConfig = {
        ...current,
        ...patch,
        primaryRow: patch.primaryRow ?? current.primaryRow,
        secondaryRow: patch.secondaryRow !== undefined ? patch.secondaryRow : current.secondaryRow,
        tertiaryRow: patch.tertiaryRow !== undefined ? patch.tertiaryRow : current.tertiaryRow,
    };
    const next = cloneDoc(doc);
    next.sections[sIdx] = {
        ...section,
        metadata: writeLayoutEditorRelatedListConfig(section.metadata, nextConfig),
    };
    return syncRelatedListSectionToItem(next, sectionKey);
}

function fieldLabel(refKey: string): string {
    const tail = refKey.split(".").pop() ?? refKey;
    return tail.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildColumnsFromConfig(
    config: LayoutEditorRelatedListConfig,
    existingItem?: LayoutItem | null,
): LayoutCollectionColumn[] {
    const ordered: string[] = [];
    for (const row of [config.primaryRow, config.secondaryRow, config.tertiaryRow]) {
        if (!row) continue;
        for (const refKey of row.fields) {
            if (!ordered.includes(refKey)) ordered.push(refKey);
        }
    }
    const existingByRef = new Map((existingItem?.columns ?? []).map((col) => [col.refKey, col]));
    return ordered.map((refKey) => {
        const preserved = existingByRef.get(refKey);
        if (preserved) return { ...preserved };
        return {
            label: fieldLabel(refKey),
            refKey,
            width: "medium" as const,
            ...(refKey.includes("status") ? { renderHint: "status" as const } : {}),
        };
    });
}

function buildChildRowGroups(config: LayoutEditorRelatedListConfig, columns: LayoutCollectionColumn[]): LayoutEditorChildRowGroup[] {
    const indexFor = (refKey: string) => columns.findIndex((c) => c.refKey === refKey);
    const groups: LayoutEditorChildRowGroup[] = [];

    const pushGroup = (row?: LayoutEditorRelatedListRowTemplate) => {
        if (!row?.fields.length) return;
        const indices = row.fields.map(indexFor).filter((i) => i >= 0);
        if (indices.length === 0) return;
        groups.push({
            columnIndices: indices,
            columnCount: Math.max(1, Math.min(3, indices.length)) as 1 | 2 | 3,
        });
    };

    pushGroup(config.primaryRow);
    pushGroup(config.secondaryRow);
    pushGroup(config.tertiaryRow);
    return groups;
}

export function findRelatedListItemInSection(section: LayoutSection): { rIdx: number; cIdx: number; item: LayoutItem } | null {
    return findRelatedListItem(section);
}

function findRelatedListItem(section: LayoutSection): { rIdx: number; cIdx: number; item: LayoutItem } | null {
    for (let rIdx = 0; rIdx < section.rows.length; rIdx += 1) {
        const row = section.rows[rIdx]!;
        for (let cIdx = 0; cIdx < row.columns.length; cIdx += 1) {
            for (const item of row.columns[cIdx]!.items) {
                if (item.kind === "related_list") return { rIdx, cIdx, item };
            }
        }
    }
    return null;
}

function writeRelatedListConfigOnItem(
    config: LayoutEditorRelatedListConfig,
    childRowGroups: LayoutEditorChildRowGroup[],
    dataContext: "child" | "contact" | "lead",
    existingMetadata?: Record<string, unknown>,
): Record<string, unknown> {
    const rowTemplate = readLayoutEditorRowTemplateConfig(existingMetadata);
    const prevBlock = readLayoutEditorBlockConfig(existingMetadata);
    return {
        [LAYOUT_EDITOR_BLOCK_TEMPLATE_METADATA_KEY]: "child_row_template",
        [LAYOUT_EDITOR_RELATED_LIST_CONFIG_METADATA_KEY]: {
            entityType: config.entityType,
            presentationMode: config.presentationMode ?? "table",
            primaryRow: config.primaryRow,
            ...(config.secondaryRow ? { secondaryRow: config.secondaryRow } : {}),
            ...(config.tertiaryRow ? { tertiaryRow: config.tertiaryRow } : {}),
        },
        ...writeLayoutEditorRowTemplateConfig(existingMetadata, rowTemplate),
        ...writeLayoutEditorBlockConfig(existingMetadata, {
            ...prevBlock,
            blockType: "child_row_template",
            dataContext,
            childRowGroups,
        }),
    };
}

function makeRelatedListItem(config: LayoutEditorRelatedListConfig): LayoutItem {
    const columns = buildColumnsFromConfig(config, null);
    const childRowGroups = buildChildRowGroups(config, columns);
    const refKey = ENTITY_REF_KEYS[config.entityType];
    const dataContext =
        config.entityType === "children" ? "child"
        : config.entityType === "contacts" || config.entityType === "household_members" ? "contact"
        :   "lead";
    return {
        id: makeId("item"),
        kind: "related_list",
        refKey,
        label: LAYOUT_EDITOR_RELATED_LIST_ENTITY_LABELS[config.entityType],
        source: refKey === "children" ? "children" : refKey,
        displayMode: relatedListPresentationToDisplayMode(config.presentationMode),
        related: {
            entityType:
                config.entityType === "children" ? "child"
                : config.entityType === "household_members" ? "household_member"
                : config.entityType,
        },
        metadata: writeRelatedListConfigOnItem(config, childRowGroups, dataContext),
        columns,
    };
}

/** Sync section metadata config onto the related_list item columns + row groups. */
export function syncRelatedListSectionToItem(doc: LayoutDoc, sectionKey: string): LayoutDoc {
    const sIdx = doc.sections.findIndex((s) => s.key === sectionKey);
    if (sIdx < 0) return doc;
    const section = doc.sections[sIdx]!;
    const config = readLayoutEditorRelatedListConfig(section);

    if (!relatedListEntityTypeRuntimeSupported(config.entityType)) {
        return removeRelatedListItemFromSection(doc, sectionKey);
    }
    const existing = findRelatedListItem(section);
    const columns = buildColumnsFromConfig(config, existing?.item ?? null);
    const childRowGroups = buildChildRowGroups(config, columns);

    let next = cloneDoc(doc);
    const nextSection = next.sections[sIdx]!;

    if (!existing) {
        if (nextSection.rows.length === 0) {
            nextSection.rows.push({
                id: makeId("row"),
                columns: [{ id: makeId("col"), width: 12, items: [] }],
            });
        }
        const item = makeRelatedListItem(config);
        next = addItem(next, sIdx, 0, 0, item);
        return next;
    }

    const item = { ...existing.item };
    item.refKey = ENTITY_REF_KEYS[config.entityType];
    item.source = config.entityType === "children" ? "children" : ENTITY_REF_KEYS[config.entityType];
    item.label = LAYOUT_EDITOR_RELATED_LIST_ENTITY_LABELS[config.entityType];
    item.columns = columns;
    item.displayMode = relatedListPresentationToDisplayMode(config.presentationMode);
    const dataContext =
        config.entityType === "children" ? "child"
        : config.entityType === "contacts" || config.entityType === "household_members" ? "contact"
        :   "lead";
    item.metadata = writeRelatedListConfigOnItem(config, childRowGroups, dataContext, existing.item.metadata);

    const row = nextSection.rows[existing.rIdx]!;
    const col = row.columns[existing.cIdx]!;
    const itemIdx = col.items.findIndex((it) => it.id === existing.item.id);
    if (itemIdx >= 0) col.items[itemIdx] = item;

    return next;
}

function removeRelatedListItemFromSection(doc: LayoutDoc, sectionKey: string): LayoutDoc {
    const sIdx = doc.sections.findIndex((s) => s.key === sectionKey);
    if (sIdx < 0) return doc;
    const next = cloneDoc(doc);
    const section = next.sections[sIdx]!;
    for (const row of section.rows) {
        for (const col of row.columns) {
            col.items = col.items.filter((item) => item.kind !== "related_list");
        }
    }
    return next;
}

export function validateLayoutEditorRelatedListConfig(config: LayoutEditorRelatedListConfig, path: string): string[] {
    const errors: string[] = [];
    if (!isEntityType(config.entityType)) {
        errors.push(`${path}: invalid related list entityType "${String(config.entityType)}"`);
    }
    for (const refKey of config.primaryRow.fields) {
        if (!isAllowedOpportunityDrawerFieldRefKey(refKey)) {
            errors.push(`${path}.primaryRow: unknown field refKey "${refKey}"`);
        }
    }
    for (const row of [config.secondaryRow, config.tertiaryRow]) {
        if (!row) continue;
        for (const refKey of row.fields) {
            if (!isAllowedOpportunityDrawerFieldRefKey(refKey)) {
                errors.push(`${path}: unknown field refKey "${refKey}"`);
            }
        }
    }
    return errors;
}

export function validateRelatedListSectionMetadata(doc: LayoutDoc): string[] {
    const errors: string[] = [];
    for (const section of doc.sections) {
        if (section.metadata?.layoutEditorSectionType !== "related_list") continue;
        const config = readLayoutEditorRelatedListConfig(section);
        errors.push(...validateLayoutEditorRelatedListConfig(config, `Section "${section.key}" related list`));
    }
    return errors;
}
