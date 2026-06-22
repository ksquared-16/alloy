/**
 * Layout editor — freeform block configuration metadata (Phase 5.9).
 * Registry constrains allowed values; operators compose blocks from approved primitives.
 */

import type { LayoutCollectionColumn, LayoutCondition, LayoutItem } from "@/lib/layout/layoutV2";
import {
    isLayoutRuntimeEditableRefKeySupported,
    resolveLayoutRuntimeEditableRefKey,
} from "@/lib/layout/runtime/layoutRuntimeFieldEditability";
import {
    LAYOUT_EDITOR_CONTACT_ROLE_METADATA_KEY,
    readLayoutEditorContactRole,
    type LayoutEditorContactRole,
} from "@/lib/layout/layoutEditorContactRoles";
import {
    resolveVisibilityRuleKey,
    visibilityConditionForRule,
    type LayoutEditorVisibilityRule,
} from "@/lib/layout/layoutEditorVisibilityRules";

export const LAYOUT_EDITOR_BLOCK_CONFIG_METADATA_KEY = "layoutEditorBlockConfig" as const;

export const LAYOUT_EDITOR_BLOCK_TYPES = [
    "card",
    "row_group",
    "contact_card",
    "child_row_template",
    "custom_layout_block",
] as const;
export type LayoutEditorBlockType = (typeof LAYOUT_EDITOR_BLOCK_TYPES)[number];

export const LAYOUT_EDITOR_DATA_CONTEXTS = ["lead", "household", "contact", "child", "location"] as const;
export type LayoutEditorDataContext = (typeof LAYOUT_EDITOR_DATA_CONTEXTS)[number];

export const LAYOUT_EDITOR_BLOCK_EDIT_MODES = ["display_only", "inline_editable", "edit_button"] as const;
export type LayoutEditorBlockEditMode = (typeof LAYOUT_EDITOR_BLOCK_EDIT_MODES)[number];

export const LAYOUT_EDITOR_BLOCK_VISIBILITY_RULES = [
    "always",
    "hide_when_empty",
    "show_when_matching_role_exists",
    "show_when_count_gt_1",
] as const;
export type LayoutEditorBlockVisibilityRule = (typeof LAYOUT_EDITOR_BLOCK_VISIBILITY_RULES)[number];

export type LayoutEditorRowConfig = {
    label?: string;
    showLabel?: boolean;
    columnCount?: 1 | 2 | 3;
};

export type LayoutEditorChildRowGroup = {
    columnIndices: number[];
    columnCount?: 1 | 2 | 3;
};

export type LayoutEditorBlockConfig = {
    blockType?: LayoutEditorBlockType;
    dataContext?: LayoutEditorDataContext;
    showTitle?: boolean;
    editMode?: LayoutEditorBlockEditMode;
    visibilityRule?: LayoutEditorBlockVisibilityRule;
    rowConfigs?: Record<string, LayoutEditorRowConfig>;
    /** Related-list child row template: maps logical rows to column indices. */
    childRowGroups?: LayoutEditorChildRowGroup[];
};

export const LAYOUT_EDITOR_BLOCK_TYPE_LABELS: Record<LayoutEditorBlockType, string> = {
    card: "Card",
    row_group: "Row group",
    contact_card: "Contact card",
    child_row_template: "Child row template",
    custom_layout_block: "Custom layout block",
};

export const LAYOUT_EDITOR_DATA_CONTEXT_LABELS: Record<LayoutEditorDataContext, string> = {
    lead: "Lead",
    household: "Household",
    contact: "Contact",
    child: "Child",
    location: "Location",
};

export const LAYOUT_EDITOR_BLOCK_EDIT_MODE_LABELS: Record<LayoutEditorBlockEditMode, string> = {
    display_only: "Display only",
    inline_editable: "Inline editable",
    edit_button: "Edit button opens inline editor",
};

export const LAYOUT_EDITOR_BLOCK_VISIBILITY_LABELS: Record<LayoutEditorBlockVisibilityRule, string> = {
    always: "Always show",
    hide_when_empty: "Hide when empty",
    show_when_matching_role_exists: "Show when matching role exists",
    show_when_count_gt_1: "Show when count > 1",
};

function isBlockType(v: string): v is LayoutEditorBlockType {
    return (LAYOUT_EDITOR_BLOCK_TYPES as readonly string[]).includes(v);
}

function isDataContext(v: string): v is LayoutEditorDataContext {
    return (LAYOUT_EDITOR_DATA_CONTEXTS as readonly string[]).includes(v);
}

function isEditMode(v: string): v is LayoutEditorBlockEditMode {
    return (LAYOUT_EDITOR_BLOCK_EDIT_MODES as readonly string[]).includes(v);
}

function isBlockVisibilityRule(v: string): v is LayoutEditorBlockVisibilityRule {
    return (LAYOUT_EDITOR_BLOCK_VISIBILITY_RULES as readonly string[]).includes(v);
}

function layoutFieldHasRuntimeInlineEdit(item: Pick<LayoutItem, "kind" | "editable" | "refKey">): boolean {
    if (item.kind !== "field" || item.editable !== true) return false;
    const refKey = item.refKey?.trim() ?? "";
    if (!refKey) return false;
    return isLayoutRuntimeEditableRefKeySupported(resolveLayoutRuntimeEditableRefKey(refKey));
}

function relatedListColumnHasRuntimeInlineEdit(col: LayoutCollectionColumn): boolean {
    if (col.editable !== true) return false;
    const refKey = col.refKey?.trim() ?? "";
    if (!refKey) return false;
    return isLayoutRuntimeEditableRefKeySupported(resolveLayoutRuntimeEditableRefKey(refKey));
}

function layoutItemHasEditableDescendants(item: LayoutItem): boolean {
    if (item.kind === "field") return layoutFieldHasRuntimeInlineEdit(item);
    if (item.kind === "related_list") {
        return (item.columns ?? []).some(relatedListColumnHasRuntimeInlineEdit);
    }
    if (item.kind === "field_group") {
        for (const row of item.rows ?? []) {
            for (const col of row.columns) {
                for (const child of col.items) {
                    if (layoutItemHasEditableDescendants(child)) return true;
                }
            }
        }
        for (const child of item.items ?? []) {
            if (layoutItemHasEditableDescendants(child)) return true;
        }
    }
    return false;
}

/** Runtime edit affordance — derived only from field/column editable: true descendants. */
export function resolveLayoutRuntimeBlockEditMode(
    item: LayoutItem,
    _blockConfig: LayoutEditorBlockConfig,
): LayoutEditorBlockEditMode {
    return layoutItemHasEditableDescendants(item) ? "edit_button" : "display_only";
}

/** Whether a flat list of layout items contains at least one inline-editable field/column. */
export function resolveLayoutRuntimeItemsEditMode(items: LayoutItem[]): LayoutEditorBlockEditMode {
    for (const item of items) {
        if (layoutItemHasEditableDescendants(item)) return "edit_button";
    }
    return "display_only";
}

export function readLayoutEditorBlockConfig(metadata: Record<string, unknown> | undefined): LayoutEditorBlockConfig {
    const raw = metadata?.[LAYOUT_EDITOR_BLOCK_CONFIG_METADATA_KEY];
    if (!raw || typeof raw !== "object") return {};
    const bag = raw as Record<string, unknown>;
    const out: LayoutEditorBlockConfig = {};
    if (typeof bag.blockType === "string" && isBlockType(bag.blockType)) out.blockType = bag.blockType;
    if (typeof bag.dataContext === "string" && isDataContext(bag.dataContext)) out.dataContext = bag.dataContext;
    if (typeof bag.showTitle === "boolean") out.showTitle = bag.showTitle;
    if (typeof bag.editMode === "string" && isEditMode(bag.editMode)) out.editMode = bag.editMode;
    if (typeof bag.visibilityRule === "string" && isBlockVisibilityRule(bag.visibilityRule)) {
        out.visibilityRule = bag.visibilityRule;
    }
    if (bag.rowConfigs && typeof bag.rowConfigs === "object") {
        out.rowConfigs = bag.rowConfigs as Record<string, LayoutEditorRowConfig>;
    }
    if (Array.isArray(bag.childRowGroups)) {
        out.childRowGroups = bag.childRowGroups
            .filter((g): g is LayoutEditorChildRowGroup => g && typeof g === "object" && Array.isArray((g as LayoutEditorChildRowGroup).columnIndices))
            .map((g) => {
                const group = g as LayoutEditorChildRowGroup;
                const cc = group.columnCount;
                return {
                    columnIndices: [...group.columnIndices],
                    ...(cc === 1 || cc === 2 || cc === 3 ? { columnCount: cc } : {}),
                };
            });
    }
    return out;
}

export function writeLayoutEditorBlockConfig(
    metadata: Record<string, unknown> | undefined,
    patch: LayoutEditorBlockConfig,
): Record<string, unknown> {
    const next = { ...(metadata ?? {}) };
    const prev = readLayoutEditorBlockConfig(next);
    const merged: LayoutEditorBlockConfig = { ...prev, ...patch };
    if (patch.rowConfigs) {
        merged.rowConfigs = { ...(prev.rowConfigs ?? {}), ...patch.rowConfigs };
    }
    if (patch.childRowGroups) {
        merged.childRowGroups = patch.childRowGroups;
    }
    next[LAYOUT_EDITOR_BLOCK_CONFIG_METADATA_KEY] = merged;
    return next;
}

export function readLayoutEditorRowConfig(
    metadata: Record<string, unknown> | undefined,
    rowId: string,
): LayoutEditorRowConfig {
    return readLayoutEditorBlockConfig(metadata).rowConfigs?.[rowId] ?? {};
}

export function writeLayoutEditorRowConfig(
    metadata: Record<string, unknown> | undefined,
    rowId: string,
    patch: LayoutEditorRowConfig,
): Record<string, unknown> {
    const prev = readLayoutEditorBlockConfig(metadata);
    return writeLayoutEditorBlockConfig(metadata, {
        rowConfigs: {
            ...(prev.rowConfigs ?? {}),
            [rowId]: { ...(prev.rowConfigs?.[rowId] ?? {}), ...patch },
        },
    });
}

export function validateLayoutEditorBlockConfig(config: LayoutEditorBlockConfig, path: string): string[] {
    const errors: string[] = [];
    if (config.blockType && !isBlockType(config.blockType)) {
        errors.push(`${path}: invalid blockType "${config.blockType}"`);
    }
    if (config.dataContext && !isDataContext(config.dataContext)) {
        errors.push(`${path}: invalid dataContext "${config.dataContext}"`);
    }
    if (config.editMode && !isEditMode(config.editMode)) {
        errors.push(`${path}: invalid editMode "${config.editMode}"`);
    }
    if (config.visibilityRule && !isBlockVisibilityRule(config.visibilityRule)) {
        errors.push(`${path}: invalid visibilityRule "${config.visibilityRule}"`);
    }
    return errors;
}

export function defaultBlockVisibilityRule(
    blockType: LayoutEditorBlockType | undefined,
    contactRole: LayoutEditorContactRole | undefined,
): LayoutEditorBlockVisibilityRule {
    if (blockType === "contact_card" && contactRole && contactRole !== "primary") {
        return "show_when_matching_role_exists";
    }
    return "always";
}

export function blockVisibilityCondition(
    rule: LayoutEditorBlockVisibilityRule | undefined,
    metadata: Record<string, unknown> | undefined,
    boundPath?: string,
): LayoutCondition | undefined {
    const effective = rule ?? defaultBlockVisibilityRule(
        readLayoutEditorBlockConfig(metadata).blockType,
        readLayoutEditorContactRole(metadata),
    );
    if (effective === "show_when_matching_role_exists") {
        const role = readLayoutEditorContactRole(metadata);
        const rolePath =
            role === "primary" ? "person.primary_contact_name"
            : role === "secondary" ? "person.secondary_contact_name"
            : role === "emergency" ? "person.emergency_contact_name"
            : role === "billing" ? "person.billing_contact_name"
            : boundPath ?? "person.contact_name";
        return visibilityConditionForRule("show_when_related_exists", rolePath, rolePath);
    }
    if (effective === "hide_when_empty" && boundPath) {
        return visibilityConditionForRule("hide_when_empty", boundPath);
    }
    if (effective === "show_when_count_gt_1") {
        return visibilityConditionForRule("show_when_count_gt_1", boundPath ?? "children", "children");
    }
    return undefined;
}

export function resolveBlockVisibilityRuleKey(
    condition: LayoutCondition | undefined,
    metadata: Record<string, unknown> | undefined,
    boundPath?: string,
): LayoutEditorBlockVisibilityRule {
    const role = readLayoutEditorContactRole(metadata);
    const rolePath =
        role === "secondary" ? "person.secondary_contact_name"
        : role === "emergency" ? "person.emergency_contact_name"
        : role === "billing" ? "person.billing_contact_name"
        : boundPath ?? "";
    if (condition?.type === "exists" && condition.path === rolePath && role !== "primary") {
        return "show_when_matching_role_exists";
    }
    const mapped = resolveVisibilityRuleKey(condition, boundPath ?? rolePath);
    if (mapped === "show_when_related_exists") return "show_when_matching_role_exists";
    if (mapped === "show_when_count_gt_1") return "show_when_count_gt_1";
    if (mapped === "hide_when_empty") return "hide_when_empty";
    return "always";
}

export function blockRefKeyForType(blockType: LayoutEditorBlockType): string {
    if (blockType === "contact_card") return "contact_block";
    if (blockType === "child_row_template") return "children";
    return "layout_block";
}
