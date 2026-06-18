"use client";

import { useState } from "react";
import {
    LAYOUT_EDITOR_BLOCK_EDIT_MODES,
    LAYOUT_EDITOR_BLOCK_EDIT_MODE_LABELS,
    LAYOUT_EDITOR_BLOCK_TYPES,
    LAYOUT_EDITOR_BLOCK_TYPE_LABELS,
    LAYOUT_EDITOR_BLOCK_VISIBILITY_LABELS,
    LAYOUT_EDITOR_BLOCK_VISIBILITY_RULES,
    LAYOUT_EDITOR_DATA_CONTEXTS,
    LAYOUT_EDITOR_DATA_CONTEXT_LABELS,
    readLayoutEditorBlockConfig,
    type LayoutEditorBlockConfig,
    type LayoutEditorBlockEditMode,
    type LayoutEditorBlockType,
    type LayoutEditorBlockVisibilityRule,
    type LayoutEditorDataContext,
} from "@/lib/layout/layoutEditorBlockConfig";
import {
    LAYOUT_EDITOR_CONTACT_ROLES,
    LAYOUT_EDITOR_CONTACT_ROLE_LABELS,
    contactRoleEditorDescription,
    readLayoutEditorContactRole,
    type LayoutEditorContactRole,
} from "@/lib/layout/layoutEditorContactRoles";
import type { LayoutEditorBlockNode } from "@/lib/layout/layoutEditorCompositionModel";
import type { LayoutCatalogGroup } from "@/lib/layout/fieldCatalog";
import type { LayoutDoc, LayoutItem } from "@/lib/layout/layoutV2";
import type { listCustomBlockRows } from "@/lib/layout/layoutEditorFreeformBlocks";
import OpportunityDrawerLayoutBlockRowEditor from "@/components/adminV2/settings/OpportunityDrawerLayoutBlockRowEditor";
import {
    LAYOUT_EDITOR_ROW_ACTIONS,
    LAYOUT_EDITOR_ROW_ACTION_LABELS,
    LAYOUT_EDITOR_ROW_LAYOUT_MODES,
    LAYOUT_EDITOR_ROW_LAYOUT_MODE_LABELS,
    readLayoutEditorRowTemplateConfig,
    type LayoutEditorRowAction,
    type LayoutEditorRowTemplateConfig,
} from "@/lib/layout/layoutEditorRowTemplateConfig";

type CustomBlockRow = ReturnType<typeof listCustomBlockRows>[number];

type Props = {
    block: LayoutEditorBlockNode;
    blockItemMetadata?: Record<string, unknown>;
    showBlockBuilder?: boolean;
    rows?: CustomBlockRow[];
    showContactRole?: boolean;
    contactRole?: LayoutEditorContactRole;
    rowTemplateConfig?: LayoutEditorRowTemplateConfig;
    onBlockConfigChange?: (patch: LayoutEditorBlockConfig & { title?: string; contactRole?: LayoutEditorContactRole }) => void;
    onContactRoleChange?: (role: LayoutEditorContactRole) => void;
    onRowTemplateChange?: (patch: LayoutEditorRowTemplateConfig) => void;
    onAddRow?: (columnCount: 1 | 2 | 3) => void;
    onRemoveRow?: (rowIndex: number) => void;
    onSetRowColumns?: (rowIndex: number, columnCount: 1 | 2 | 3) => void;
    blockItem?: LayoutItem;
    doc?: LayoutDoc;
    sectionKey?: string;
    fieldPickerGroups?: LayoutCatalogGroup[];
    validationOk?: boolean;
    applyDoc?: (doc: LayoutDoc) => void;
    onFieldAddError?: (message: string | null) => void;
    onClose: () => void;
};

export default function OpportunityDrawerLayoutBlockSettings({
    block,
    blockItemMetadata,
    showBlockBuilder = false,
    rows = [],
    showContactRole = false,
    contactRole,
    rowTemplateConfig,
    onBlockConfigChange,
    onContactRoleChange,
    onRowTemplateChange,
    onAddRow,
    onRemoveRow,
    onSetRowColumns,
    blockItem,
    doc,
    sectionKey,
    fieldPickerGroups = [],
    validationOk = true,
    applyDoc,
    onFieldAddError,
    onClose,
}: Props) {
    const blockConfig = readLayoutEditorBlockConfig(blockItemMetadata);
    const rowConfig = rowTemplateConfig ?? readLayoutEditorRowTemplateConfig(undefined);
    const isContactBlock = showContactRole;
    const isRowTemplate = block.kind === "related_list";
    const unsupportedRowActions: LayoutEditorRowAction[] = ["open_schedule"];

    return (
        <div
            className="mt-2 rounded-lg border border-alloy-blue/20 bg-alloy-blue/[0.03] p-3 shadow-sm"
            data-testid="visual-editor-block-settings"
        >
            <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-alloy-midnight">{block.title}</p>
                <button type="button" className="text-[11px] text-alloy-midnight/50 hover:text-alloy-pine" onClick={onClose}>
                    Close
                </button>
            </div>

            {showBlockBuilder && onBlockConfigChange ?
                <div className="space-y-3 border-b border-alloy-forge/10 pb-3">
                    <label className="block text-[11px] text-alloy-midnight/60">
                        Block title
                        <input
                            type="text"
                            value={block.title}
                            onChange={(e) => onBlockConfigChange({ title: e.target.value })}
                            className="mt-1 w-full rounded-md border border-alloy-forge/20 px-2 py-1 text-xs"
                            data-testid="visual-editor-block-title"
                        />
                    </label>

                    <label className="flex items-center gap-2 text-[11px] text-alloy-midnight/75">
                        <input
                            type="checkbox"
                            checked={blockConfig.showTitle !== false}
                            onChange={(e) => onBlockConfigChange({ showTitle: e.target.checked })}
                            data-testid="visual-editor-block-show-title"
                        />
                        Show block title in drawer
                    </label>

                    {blockConfig.blockType ?
                        <p className="text-[11px] text-alloy-midnight/55">
                            Block type: {LAYOUT_EDITOR_BLOCK_TYPE_LABELS[blockConfig.blockType]}
                        </p>
                    :   null}

                    {blockConfig.dataContext ?
                        <p className="text-[11px] text-alloy-midnight/55">
                            Data context: {LAYOUT_EDITOR_DATA_CONTEXT_LABELS[blockConfig.dataContext]}
                        </p>
                    :   null}

                    <label className="block text-[11px] text-alloy-midnight/60">
                        Visibility
                        <select
                            value={blockConfig.visibilityRule ?? "always"}
                            onChange={(e) =>
                                onBlockConfigChange({
                                    visibilityRule: e.target.value as LayoutEditorBlockVisibilityRule,
                                })
                            }
                            className="mt-1 w-full rounded-md border border-alloy-forge/20 px-2 py-1 text-xs"
                            data-testid="visual-editor-block-visibility"
                        >
                            {LAYOUT_EDITOR_BLOCK_VISIBILITY_RULES.map((rule) => (
                                <option key={rule} value={rule}>
                                    {LAYOUT_EDITOR_BLOCK_VISIBILITY_LABELS[rule]}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="block text-[11px] text-alloy-midnight/60">
                        Edit behavior
                        <select
                            value={blockConfig.editMode ?? "display_only"}
                            onChange={(e) =>
                                onBlockConfigChange({
                                    editMode: e.target.value as LayoutEditorBlockEditMode,
                                })
                            }
                            className="mt-1 w-full rounded-md border border-alloy-forge/20 px-2 py-1 text-xs"
                            data-testid="visual-editor-block-edit-mode"
                        >
                            {LAYOUT_EDITOR_BLOCK_EDIT_MODES.map((mode) => (
                                <option key={mode} value={mode}>
                                    {LAYOUT_EDITOR_BLOCK_EDIT_MODE_LABELS[mode]}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>
            :   null}

            {isContactBlock && onContactRoleChange ?
                <div className="space-y-2">
                    <p className="text-[11px] leading-relaxed text-alloy-midnight/60">
                        {contactRoleEditorDescription(contactRole ?? "primary")}
                    </p>
                    <fieldset className="space-y-1">
                        <legend className="text-[11px] font-medium text-alloy-midnight/60">Relationship role</legend>
                        {LAYOUT_EDITOR_CONTACT_ROLES.filter((role) => role !== "secondary" && role !== "any").map((role) => (
                            <label key={role} className="flex items-center gap-2 text-[11px] text-alloy-midnight/75">
                                <input
                                    type="radio"
                                    name={`contact-role-${block.itemId}`}
                                    checked={(contactRole ?? readLayoutEditorContactRole(undefined)) === role}
                                    onChange={() => onContactRoleChange(role)}
                                    data-testid={`visual-editor-block-role-${role}`}
                                />
                                {LAYOUT_EDITOR_CONTACT_ROLE_LABELS[role]}
                            </label>
                        ))}
                    </fieldset>
                </div>
            :   null}

            {showBlockBuilder && rows.length > 0 ?
                <div className="mt-3 space-y-2 border-t border-alloy-forge/10 pt-3">
                    <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] font-medium text-alloy-midnight/60">Rows</p>
                        {onAddRow ?
                            <span className="flex gap-1">
                                {([1, 2, 3] as const).map((count) => (
                                    <button
                                        key={count}
                                        type="button"
                                        className="rounded border border-alloy-forge/15 px-1.5 py-0.5 text-[10px] text-alloy-midnight/65 hover:border-alloy-pine/30"
                                        onClick={() => onAddRow(count)}
                                        data-testid={`visual-editor-add-row-${count}-col`}
                                    >
                                        + {count}-col row
                                    </button>
                                ))}
                            </span>
                        :   null}
                    </div>
                    {blockItem && applyDoc && sectionKey ?
                        <OpportunityDrawerLayoutBlockRowEditor
                            doc={doc!}
                            sectionKey={sectionKey}
                            blockItemId={block.itemId}
                            blockItem={blockItem}
                            fieldPickerGroups={fieldPickerGroups}
                            validationOk={validationOk}
                            applyDoc={applyDoc}
                            onFieldAddError={onFieldAddError ?? (() => undefined)}
                            supportsAction={blockItem.kind === "field_group"}
                            supportsText={blockItem.kind === "field_group"}
                            onSetRowColumns={onSetRowColumns}
                            onRemoveRow={onRemoveRow}
                        />
                    :   rows.map((row) => (
                        <div
                            key={row.rowId}
                            className="rounded border border-alloy-forge/10 bg-white/80 px-2 py-1.5"
                            data-testid={`visual-editor-block-row-${row.rowIndex}`}
                        >
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] font-medium text-alloy-midnight/55">
                                    Row {row.rowIndex + 1} · {row.columnCount} column{row.columnCount === 1 ? "" : "s"}
                                </span>
                                <span className="flex gap-1">
                                    {onSetRowColumns ?
                                        ([1, 2, 3] as const).map((count) => (
                                            <button
                                                key={count}
                                                type="button"
                                                className={`rounded px-1 text-[10px] ${
                                                    row.columnCount === count ?
                                                        "bg-alloy-pine/10 text-alloy-pine"
                                                    :   "text-alloy-midnight/45 hover:text-alloy-pine"
                                                }`}
                                                onClick={() => onSetRowColumns(row.rowIndex, count)}
                                                data-testid={`visual-editor-row-${row.rowIndex}-cols-${count}`}
                                            >
                                                {count}
                                            </button>
                                        ))
                                    :   null}
                                    {onRemoveRow && rows.length > 1 ?
                                        <button
                                            type="button"
                                            className="px-1 text-[10px] text-red-500/70 hover:text-red-600"
                                            onClick={() => onRemoveRow(row.rowIndex)}
                                            data-testid={`visual-editor-remove-row-${row.rowIndex}`}
                                        >
                                            Remove
                                        </button>
                                    :   null}
                                </span>
                            </div>
                            <p className="mt-1 text-[10px] text-alloy-midnight/45">
                                {row.fields.map((f) => f.label || f.refKey).join(" · ") || "Empty row — add fields below"}
                            </p>
                        </div>
                    ))}
                </div>
            :   null}

            {isRowTemplate && onRowTemplateChange ?
                <div className="space-y-3">
                    <label className="block text-[11px] text-alloy-midnight/60">
                        Row layout
                        <select
                            value={rowConfig.layoutMode ?? "standard"}
                            onChange={(e) =>
                                onRowTemplateChange({
                                    ...rowConfig,
                                    layoutMode: e.target.value as LayoutEditorRowTemplateConfig["layoutMode"],
                                })
                            }
                            className="mt-1 w-full rounded-md border border-alloy-forge/20 px-2 py-1 text-xs"
                            data-testid="visual-editor-row-layout-mode"
                        >
                            {LAYOUT_EDITOR_ROW_LAYOUT_MODES.map((mode) => (
                                <option key={mode} value={mode}>
                                    {LAYOUT_EDITOR_ROW_LAYOUT_MODE_LABELS[mode]}
                                </option>
                            ))}
                        </select>
                    </label>

                    <fieldset>
                        <legend className="text-[11px] font-medium text-alloy-midnight/60">Actions</legend>
                        <div className="mt-1 space-y-1">
                            {LAYOUT_EDITOR_ROW_ACTIONS.map((action) => {
                                const unsupported = unsupportedRowActions.includes(action);
                                return (
                                    <label key={action} className="flex items-center gap-2 text-[11px] text-alloy-midnight/75">
                                        <input
                                            type="checkbox"
                                            disabled={unsupported}
                                            checked={!unsupported && (rowConfig.actions?.includes(action) ?? false)}
                                            onChange={(e) => {
                                                if (unsupported) return;
                                                const current = new Set(rowConfig.actions ?? []);
                                                if (e.target.checked) current.add(action);
                                                else current.delete(action);
                                                onRowTemplateChange({ ...rowConfig, actions: [...current] });
                                            }}
                                            data-testid={`visual-editor-row-action-${action}`}
                                        />
                                        {LAYOUT_EDITOR_ROW_ACTION_LABELS[action]}
                                        {unsupported ?
                                            <span className="text-[10px] text-alloy-midnight/40">· coming later</span>
                                        :   null}
                                    </label>
                                );
                            })}
                        </div>
                    </fieldset>

                    <fieldset>
                        <legend className="text-[11px] font-medium text-alloy-midnight/60">Display</legend>
                        <div className="mt-1 space-y-1">
                            {(
                                [
                                    ["avatar", "Avatar"],
                                    ["statusPill", "Status pill"],
                                    ["secondaryMetadata", "Secondary metadata"],
                                ] as const
                            ).map(([key, label]) => (
                                <label key={key} className="flex items-center gap-2 text-[11px] text-alloy-midnight/75">
                                    <input
                                        type="checkbox"
                                        checked={rowConfig.display?.[key] !== false}
                                        onChange={(e) =>
                                            onRowTemplateChange({
                                                ...rowConfig,
                                                display: { ...rowConfig.display, [key]: e.target.checked },
                                            })
                                        }
                                        data-testid={`visual-editor-row-display-${key}`}
                                    />
                                    {label}
                                </label>
                            ))}
                        </div>
                    </fieldset>
                </div>
            :   null}
        </div>
    );
}

export type CreateCustomBlockFormState = {
    title: string;
    blockType: LayoutEditorBlockType;
    dataContext: LayoutEditorDataContext;
    contactRole: LayoutEditorContactRole;
    editMode: LayoutEditorBlockEditMode;
    showTitle: boolean;
};

export function OpportunityDrawerLayoutCreateBlockForm({
    sectionKey,
    onCreate,
    onCancel,
}: {
    sectionKey: string;
    onCreate: (input: CreateCustomBlockFormState) => void;
    onCancel: () => void;
}) {
    const defaultDataContext: LayoutEditorDataContext =
        sectionKey === "children_enrollment" ? "child"
        : sectionKey === "household_contact" ? "contact"
        :   "lead";
    const defaultBlockType: LayoutEditorBlockType =
        sectionKey === "children_enrollment" ? "child_row_template" : "custom_layout_block";

    const [title, setTitle] = useState("New block");
    const [blockType, setBlockType] = useState<LayoutEditorBlockType>(defaultBlockType);
    const [dataContext, setDataContext] = useState<LayoutEditorDataContext>(defaultDataContext);
    const [contactRole, setContactRole] = useState<LayoutEditorContactRole>("secondary");
    const [editMode, setEditMode] = useState<LayoutEditorBlockEditMode>("display_only");
    const [showTitle, setShowTitle] = useState(true);

    return (
        <div className="mt-2 space-y-2 rounded-lg border border-alloy-pine/25 bg-alloy-pine/[0.04] p-2" data-testid="visual-editor-create-block-form">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-pine">Create block</p>
            <label className="block text-[11px] text-alloy-midnight/60">
                Title
                <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="mt-1 w-full rounded-md border border-alloy-forge/20 px-2 py-1 text-xs"
                    data-testid="visual-editor-create-block-title"
                />
            </label>
            <label className="block text-[11px] text-alloy-midnight/60">
                Block type
                <select
                    value={blockType}
                    onChange={(e) => setBlockType(e.target.value as LayoutEditorBlockType)}
                    className="mt-1 w-full rounded-md border border-alloy-forge/20 px-2 py-1 text-xs"
                    data-testid="visual-editor-create-block-type"
                >
                    {LAYOUT_EDITOR_BLOCK_TYPES.map((type) => (
                        <option key={type} value={type}>
                            {LAYOUT_EDITOR_BLOCK_TYPE_LABELS[type]}
                        </option>
                    ))}
                </select>
            </label>
            <label className="block text-[11px] text-alloy-midnight/60">
                Data context
                <select
                    value={dataContext}
                    onChange={(e) => setDataContext(e.target.value as LayoutEditorDataContext)}
                    className="mt-1 w-full rounded-md border border-alloy-forge/20 px-2 py-1 text-xs"
                    data-testid="visual-editor-create-block-data-context"
                >
                    {LAYOUT_EDITOR_DATA_CONTEXTS.map((ctx) => (
                        <option key={ctx} value={ctx}>
                            {LAYOUT_EDITOR_DATA_CONTEXT_LABELS[ctx]}
                        </option>
                    ))}
                </select>
            </label>
            {blockType === "contact_card" ?
                <fieldset className="space-y-1">
                    <legend className="text-[11px] font-medium text-alloy-midnight/60">Contact role</legend>
                    {LAYOUT_EDITOR_CONTACT_ROLES.map((role) => (
                        <label key={role} className="flex items-center gap-2 text-[11px] text-alloy-midnight/75">
                            <input
                                type="radio"
                                name="create-block-contact-role"
                                checked={contactRole === role}
                                onChange={() => setContactRole(role)}
                                data-testid={`visual-editor-create-block-role-${role}`}
                            />
                            {LAYOUT_EDITOR_CONTACT_ROLE_LABELS[role]}
                        </label>
                    ))}
                </fieldset>
            :   null}
            <label className="flex items-center gap-2 text-[11px] text-alloy-midnight/75">
                <input
                    type="checkbox"
                    checked={showTitle}
                    onChange={(e) => setShowTitle(e.target.checked)}
                    data-testid="visual-editor-create-block-show-title"
                />
                Show block title
            </label>
            <label className="block text-[11px] text-alloy-midnight/60">
                Edit behavior
                <select
                    value={editMode}
                    onChange={(e) => setEditMode(e.target.value as LayoutEditorBlockEditMode)}
                    className="mt-1 w-full rounded-md border border-alloy-forge/20 px-2 py-1 text-xs"
                    data-testid="visual-editor-create-block-edit-mode"
                >
                    {LAYOUT_EDITOR_BLOCK_EDIT_MODES.map((mode) => (
                        <option key={mode} value={mode}>
                            {LAYOUT_EDITOR_BLOCK_EDIT_MODE_LABELS[mode]}
                        </option>
                    ))}
                </select>
            </label>
            <div className="flex gap-2 pt-1">
                <button
                    type="button"
                    className="rounded bg-alloy-pine px-2 py-1 text-[10px] font-semibold text-white"
                    onClick={() =>
                        onCreate({ title, blockType, dataContext, contactRole, editMode, showTitle })
                    }
                    data-testid="visual-editor-create-block-submit"
                >
                    Create block
                </button>
                <button type="button" className="text-[10px] text-alloy-midnight/50 hover:text-alloy-pine" onClick={onCancel}>
                    Cancel
                </button>
            </div>
        </div>
    );
}
