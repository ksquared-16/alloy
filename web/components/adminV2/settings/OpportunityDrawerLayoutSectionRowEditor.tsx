"use client";

import { useMemo, useState } from "react";
import OpportunityDrawerLayoutBlockSettings from "@/components/adminV2/settings/OpportunityDrawerLayoutBlockSettings";
import OpportunityDrawerLayoutFieldPicker from "@/components/adminV2/settings/OpportunityDrawerLayoutFieldPicker";
import OpportunityDrawerLayoutWidgetPicker from "@/components/adminV2/settings/OpportunityDrawerLayoutWidgetPicker";
import OpportunityDrawerLayoutSectionCompositionDiagnostics from "@/components/adminV2/settings/OpportunityDrawerLayoutSectionCompositionDiagnostics";
import OpportunityDrawerLayoutFieldSettings from "@/components/adminV2/settings/OpportunityDrawerLayoutFieldSettings";
import type { LayoutCatalogGroup } from "@/lib/layout/fieldCatalog";
import type { LayoutDoc } from "@/lib/layout/layoutV2";
import {
    LAYOUT_EDITOR_ACTION_KEY_LABELS,
    LAYOUT_EDITOR_ACTION_STYLE_INTENTS,
    LAYOUT_EDITOR_DRAWER_ACTION_KEYS,
    readLayoutEditorActionButtonConfig,
    type LayoutEditorActionStyleIntent,
} from "@/lib/layout/layoutEditorActionButton";
import { findLayoutBlockLocation, patchLayoutBlockRowTemplateConfig } from "@/lib/layout/layoutEditorBlockRegistry";
import { buildBlockContextFieldPickerGroups } from "@/lib/layout/layoutEditorBlockFieldCatalog";
import { readLayoutEditorBlockConfig } from "@/lib/layout/layoutEditorBlockConfig";
import { readLayoutEditorContactRole } from "@/lib/layout/layoutEditorContactRoles";
import {
    patchLayoutEditorFieldDisplay,
    patchLayoutEditorFieldVisibility,
    type LayoutEditorFieldNode,
} from "@/lib/layout/layoutEditorCompositionModel";
import { readLayoutEditorDisplayConfig } from "@/lib/layout/layoutEditorDisplayConfig";
import {
    addRowToCustomBlock,
    listCustomBlockRows,
    patchCustomBlockConfig,
    removeRowFromCustomBlock,
    setCustomBlockRowColumnCount,
} from "@/lib/layout/layoutEditorFreeformBlocks";
import { readLayoutEditorRowTemplateConfig } from "@/lib/layout/layoutEditorRowTemplateConfig";
import {
    addSectionActionButtonItem,
    addSectionBlockItem,
    addSectionFieldItem,
    addSectionListItem,
    addSectionRow,
    addSectionTextItem,
    addSectionWidgetItem,
    listSectionCompositionRows,
    moveSectionItemHorizontal,
    moveSectionItemVertical,
    moveSectionRow,
    patchSectionActionButtonItem,
    patchSectionTextItem,
    removeSectionItem,
    removeSectionRow,
    setSectionRowColumnCount,
    type SectionCompositionItem,
} from "@/lib/layout/layoutEditorSectionComposition";
import { resolveLayoutEditorItemDisplayLabel } from "@/lib/layout/opportunityDrawerLayoutEditorFieldCatalog";
import { summarizeSectionCompositionDiagnostic } from "@/lib/layout/layoutEditorSectionCompositionDiagnostics";
import { resolveVisibilityRuleKey } from "@/lib/layout/layoutEditorVisibilityRules";

type Props = {
    doc: LayoutDoc;
    sectionKey: string;
    fieldPickerGroups: LayoutCatalogGroup[];
    validationOk: boolean;
    selectedItemId: string | null;
    onSelectItemId: (itemId: string | null) => void;
    onFieldAddError: (message: string | null) => void;
    applyDoc: (next: LayoutDoc) => void;
    layoutRecordId?: string | null;
    layoutVersion?: number | null;
};

const ITEM_KIND_LABELS: Record<SectionCompositionItem["kind"], string> = {
    field: "Field",
    block: "Block",
    text: "Text",
    list: "List",
    action_button: "Action",
    widget: "Widget",
};

export default function OpportunityDrawerLayoutSectionRowEditor({
    doc,
    sectionKey,
    fieldPickerGroups,
    validationOk,
    selectedItemId,
    onSelectItemId,
    onFieldAddError,
    applyDoc,
    layoutRecordId,
    layoutVersion,
}: Props) {
    const rows = useMemo(() => listSectionCompositionRows(doc, sectionKey), [doc, sectionKey]);
    const [pickerTarget, setPickerTarget] = useState<{ rowIndex: number; colIndex: number; kind: "field" | "widget" } | null>(null);
    const previewDiagnostic = useMemo(
        () =>
            summarizeSectionCompositionDiagnostic(doc, sectionKey, {
                layoutRecordId,
                layoutVersion,
                surface: "editor_preview",
                honorLayoutDocBlocks: true,
            }),
        [doc, sectionKey, layoutRecordId, layoutVersion],
    );

    const selectedItem =
        selectedItemId ?
            rows.flatMap((r) => r.columns.flatMap((c) => c.items)).find((it) => it.itemId === selectedItemId)
        :   null;

    return (
        <div className="mt-4 space-y-3" data-testid="visual-editor-section-rows">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">Section layout</p>
                <span className="flex gap-1">
                    {([1, 2, 3] as const).map((count) => (
                        <button
                            key={count}
                            type="button"
                            className="rounded border border-alloy-forge/15 px-1.5 py-0.5 text-[10px] text-alloy-midnight/65 hover:border-alloy-pine/30"
                            onClick={() => applyDoc(addSectionRow(doc, sectionKey, count))}
                            data-testid={`visual-editor-add-section-row-${count}`}
                        >
                            + {count}-col row
                        </button>
                    ))}
                </span>
            </div>

            {rows.map((row) => (
                <div
                    key={row.rowId}
                    className="rounded-lg border border-alloy-forge/12 bg-white/90 p-2"
                    data-testid={`visual-editor-section-row-${row.rowIndex}`}
                >
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[10px] font-medium text-alloy-midnight/55">
                            Row {row.rowIndex + 1} · {row.columnCount} column{row.columnCount === 1 ? "" : "s"}
                        </span>
                        <span className="flex gap-1">
                            {([1, 2, 3] as const).map((count) => (
                                <button
                                    key={count}
                                    type="button"
                                    className={`rounded px-1 text-[10px] ${
                                        row.columnCount === count ?
                                            "bg-alloy-pine/10 text-alloy-pine"
                                        :   "text-alloy-midnight/45 hover:text-alloy-pine"
                                    }`}
                                    onClick={() =>
                                        applyDoc(setSectionRowColumnCount(doc, sectionKey, row.rowIndex, count))
                                    }
                                    data-testid={`visual-editor-section-row-${row.rowIndex}-cols-${count}`}
                                >
                                    {count}
                                </button>
                            ))}
                            <button
                                type="button"
                                className="px-1 text-[10px] text-alloy-midnight/50 hover:text-alloy-pine"
                                onClick={() => applyDoc(moveSectionRow(doc, sectionKey, row.rowIndex, -1))}
                                aria-label="Move row up"
                            >
                                ↑
                            </button>
                            <button
                                type="button"
                                className="px-1 text-[10px] text-alloy-midnight/50 hover:text-alloy-pine"
                                onClick={() => applyDoc(moveSectionRow(doc, sectionKey, row.rowIndex, 1))}
                                aria-label="Move row down"
                            >
                                ↓
                            </button>
                            {rows.length > 1 ?
                                <button
                                    type="button"
                                    className="px-1 text-[10px] text-red-500/70 hover:text-red-600"
                                    onClick={() => applyDoc(removeSectionRow(doc, sectionKey, row.rowIndex))}
                                    data-testid={`visual-editor-remove-section-row-${row.rowIndex}`}
                                >
                                    Remove
                                </button>
                            :   null}
                        </span>
                    </div>

                    <div
                        className="grid gap-2"
                        style={{ gridTemplateColumns: `repeat(${Math.max(1, row.columnCount)}, minmax(0, 1fr))` }}
                    >
                        {row.columns.map((col) => (
                            <div
                                key={col.colId}
                                className="min-w-0 rounded border border-dashed border-alloy-forge/10 p-2"
                                data-testid={`visual-editor-section-col-${row.rowIndex}-${col.colIndex}`}
                            >
                                <p className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-alloy-midnight/35">
                                    Column {col.colIndex + 1}
                                </p>
                                <ul className="space-y-1">
                                    {col.items.map((entry) => (
                                        <SectionItemRow
                                            key={entry.itemId}
                                            entry={entry}
                                            selected={selectedItemId === entry.itemId}
                                            onSelect={() => onSelectItemId(selectedItemId === entry.itemId ? null : entry.itemId)}
                                            onRemove={() => {
                                                applyDoc(removeSectionItem(doc, sectionKey, entry.itemId));
                                                if (selectedItemId === entry.itemId) onSelectItemId(null);
                                            }}
                                            onMoveVertical={(dir) =>
                                                applyDoc(moveSectionItemVertical(doc, sectionKey, entry.itemId, dir))
                                            }
                                            onMoveHorizontal={(dir) =>
                                                applyDoc(moveSectionItemHorizontal(doc, sectionKey, entry.itemId, dir))
                                            }
                                            canMoveLeft={col.colIndex > 0}
                                            canMoveRight={col.colIndex < row.columnCount - 1}
                                        />
                                    ))}
                                </ul>

                                {pickerTarget?.rowIndex === row.rowIndex && pickerTarget.colIndex === col.colIndex && pickerTarget.kind === "field" ?
                                    <div className="mt-2">
                                        <OpportunityDrawerLayoutFieldPicker
                                            groups={fieldPickerGroups}
                                            disabled={!validationOk}
                                            onPickField={(field) => {
                                                const result = addSectionFieldItem(
                                                    doc,
                                                    sectionKey,
                                                    row.rowIndex,
                                                    col.colIndex,
                                                    field,
                                                );
                                                if (!result.ok) {
                                                    onFieldAddError(result.error);
                                                    return;
                                                }
                                                applyDoc(result.doc);
                                                onFieldAddError(null);
                                                onSelectItemId(result.itemId);
                                                setPickerTarget(null);
                                            }}
                                        />
                                    </div>
                                :   null}

                                {pickerTarget?.rowIndex === row.rowIndex && pickerTarget.colIndex === col.colIndex && pickerTarget.kind === "widget" ?
                                    <div className="mt-2">
                                        <OpportunityDrawerLayoutWidgetPicker
                                            disabled={!validationOk}
                                            onPickWidget={(widgetKey) => {
                                                const result = addSectionWidgetItem(
                                                    doc,
                                                    sectionKey,
                                                    row.rowIndex,
                                                    col.colIndex,
                                                    widgetKey,
                                                );
                                                if (!result.ok) {
                                                    onFieldAddError(result.error);
                                                    return;
                                                }
                                                applyDoc(result.doc);
                                                onFieldAddError(null);
                                                onSelectItemId(result.itemId);
                                                setPickerTarget(null);
                                            }}
                                        />
                                    </div>
                                :   null}

                                <div className="mt-2 flex flex-wrap gap-1">
                                    <AddItemButton
                                        label="Field"
                                        testId={`visual-editor-add-field-${row.rowIndex}-${col.colIndex}`}
                                        onClick={() => {
                                            setPickerTarget({ rowIndex: row.rowIndex, colIndex: col.colIndex, kind: "field" });
                                            onSelectItemId(null);
                                        }}
                                    />
                                    <AddItemButton
                                        label="Block"
                                        testId={`visual-editor-add-block-${row.rowIndex}-${col.colIndex}`}
                                        onClick={() => {
                                            const result = addSectionBlockItem(doc, sectionKey, row.rowIndex, col.colIndex);
                                            if (!result.ok) {
                                                onFieldAddError(result.error);
                                                return;
                                            }
                                            applyDoc(result.doc);
                                            onSelectItemId(result.itemId);
                                        }}
                                    />
                                    <AddItemButton
                                        label="Text"
                                        testId={`visual-editor-add-text-${row.rowIndex}-${col.colIndex}`}
                                        onClick={() => {
                                            const result = addSectionTextItem(doc, sectionKey, row.rowIndex, col.colIndex);
                                            if (!result.ok) {
                                                onFieldAddError(result.error);
                                                return;
                                            }
                                            applyDoc(result.doc);
                                            onSelectItemId(result.itemId);
                                        }}
                                    />
                                    <AddItemButton
                                        label="List"
                                        testId={`visual-editor-add-list-${row.rowIndex}-${col.colIndex}`}
                                        onClick={() => {
                                            const result = addSectionListItem(doc, sectionKey, row.rowIndex, col.colIndex);
                                            if (!result.ok) {
                                                onFieldAddError(result.error);
                                                return;
                                            }
                                            applyDoc(result.doc);
                                            onSelectItemId(result.itemId);
                                        }}
                                    />
                                    <AddItemButton
                                        label="Action"
                                        testId={`visual-editor-add-action-${row.rowIndex}-${col.colIndex}`}
                                        onClick={() => {
                                            const result = addSectionActionButtonItem(doc, sectionKey, row.rowIndex, col.colIndex);
                                            if (!result.ok) {
                                                onFieldAddError(result.error);
                                                return;
                                            }
                                            applyDoc(result.doc);
                                            onSelectItemId(result.itemId);
                                        }}
                                    />
                                    <AddItemButton
                                        label="Widget"
                                        testId={`visual-editor-add-widget-${row.rowIndex}-${col.colIndex}`}
                                        onClick={() => {
                                            setPickerTarget({ rowIndex: row.rowIndex, colIndex: col.colIndex, kind: "widget" });
                                            onSelectItemId(null);
                                        }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>

                    {selectedItem && row.columns.some((c) => c.items.some((it) => it.itemId === selectedItem.itemId)) ?
                        <div className="mt-2 rounded-lg border border-alloy-blue/20 bg-alloy-blue/[0.03] p-2" data-testid="visual-editor-item-settings">
                            <InlineItemSettings
                                doc={doc}
                                sectionKey={sectionKey}
                                entry={selectedItem}
                                fieldPickerGroups={fieldPickerGroups}
                                validationOk={validationOk}
                                applyDoc={applyDoc}
                                onFieldAddError={onFieldAddError}
                                onClose={() => onSelectItemId(null)}
                            />
                        </div>
                    :   null}
                </div>
            ))}
            <OpportunityDrawerLayoutSectionCompositionDiagnostics
                title="Editor preview composition"
                diagnostic={previewDiagnostic}
            />
        </div>
    );
}

function AddItemButton({ label, testId, onClick }: { label: string; testId: string; onClick: () => void }) {
    return (
        <button
            type="button"
            className="rounded border border-dashed border-alloy-forge/15 px-1.5 py-0.5 text-[10px] font-medium text-alloy-pine hover:border-alloy-pine/30"
            onClick={onClick}
            data-testid={testId}
        >
            + {label}
        </button>
    );
}

function SectionItemRow({
    entry,
    selected,
    onSelect,
    onRemove,
    onMoveVertical,
    onMoveHorizontal,
    canMoveLeft,
    canMoveRight,
}: {
    entry: SectionCompositionItem;
    selected: boolean;
    onSelect: () => void;
    onRemove: () => void;
    onMoveVertical: (dir: -1 | 1) => void;
    onMoveHorizontal: (dir: -1 | 1) => void;
    canMoveLeft: boolean;
    canMoveRight: boolean;
}) {
    return (
        <li
            className={`rounded border px-2 py-1.5 text-xs ${
                selected ? "border-alloy-pine/30 bg-alloy-pine/[0.05]" : "border-alloy-forge/10 bg-alloy-stone/[0.02]"
            }`}
            data-testid={`visual-editor-section-item-${entry.itemId}`}
        >
            <div className="flex items-center justify-between gap-2">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={onSelect}>
                    <span className="block truncate font-medium text-alloy-midnight">{entry.title}</span>
                    <span className="text-[10px] text-alloy-midnight/45">
                        {ITEM_KIND_LABELS[entry.kind]}
                        {!entry.runtimeEffective ?
                            <span className="text-alloy-midnight/35"> · preview only</span>
                        :   null}
                    </span>
                </button>
                <span className="flex shrink-0 gap-0.5">
                    {canMoveLeft ?
                        <button type="button" className="px-1 text-alloy-midnight/50 hover:text-alloy-pine" onClick={() => onMoveHorizontal(-1)} aria-label="Move left">
                            ←
                        </button>
                    :   null}
                    {canMoveRight ?
                        <button type="button" className="px-1 text-alloy-midnight/50 hover:text-alloy-pine" onClick={() => onMoveHorizontal(1)} aria-label="Move right">
                            →
                        </button>
                    :   null}
                    <button type="button" className="px-1 text-alloy-midnight/50 hover:text-alloy-pine" onClick={() => onMoveVertical(-1)} aria-label="Move up">
                        ↑
                    </button>
                    <button type="button" className="px-1 text-alloy-midnight/50 hover:text-alloy-pine" onClick={() => onMoveVertical(1)} aria-label="Move down">
                        ↓
                    </button>
                    <button type="button" className="px-1 text-red-500/70 hover:text-red-600" onClick={onRemove} aria-label="Remove">
                        ✕
                    </button>
                </span>
            </div>
        </li>
    );
}

function InlineItemSettings({
    doc,
    sectionKey,
    entry,
    fieldPickerGroups,
    validationOk,
    applyDoc,
    onFieldAddError,
    onClose,
}: {
    doc: LayoutDoc;
    sectionKey: string;
    entry: SectionCompositionItem;
    fieldPickerGroups: LayoutCatalogGroup[];
    validationOk: boolean;
    applyDoc: (next: LayoutDoc) => void;
    onFieldAddError: (message: string | null) => void;
    onClose: () => void;
}) {
    if (entry.kind === "text") {
        return (
            <div className="space-y-2">
                <SettingsHeader title="Edit text" onClose={onClose} />
                <label className="block text-[11px] text-alloy-midnight/60">
                    Content
                    <input
                        type="text"
                        defaultValue={entry.item.template ?? ""}
                        onChange={(e) =>
                            applyDoc(patchSectionTextItem(doc, sectionKey, entry.itemId, { template: e.target.value }))
                        }
                        className="mt-1 w-full rounded-md border border-alloy-forge/20 px-2 py-1 text-xs"
                        data-testid="visual-editor-text-content"
                    />
                </label>
                <label className="block text-[11px] text-alloy-midnight/60">
                    Label
                    <input
                        type="text"
                        defaultValue={entry.item.label ?? ""}
                        onChange={(e) =>
                            applyDoc(patchSectionTextItem(doc, sectionKey, entry.itemId, { label: e.target.value }))
                        }
                        className="mt-1 w-full rounded-md border border-alloy-forge/20 px-2 py-1 text-xs"
                    />
                </label>
            </div>
        );
    }

    if (entry.kind === "action_button") {
        const cfg = readLayoutEditorActionButtonConfig(entry.item.metadata) ?? {};
        return (
            <div className="space-y-2">
                <SettingsHeader title="Edit action button" onClose={onClose} />
                <label className="block text-[11px] text-alloy-midnight/60">
                    Label
                    <input
                        type="text"
                        defaultValue={cfg.label ?? entry.item.label ?? ""}
                        onChange={(e) =>
                            applyDoc(
                                patchSectionActionButtonItem(doc, sectionKey, entry.itemId, {
                                    ...cfg,
                                    label: e.target.value,
                                }),
                            )
                        }
                        className="mt-1 w-full rounded-md border border-alloy-forge/20 px-2 py-1 text-xs"
                        data-testid="visual-editor-action-label"
                    />
                </label>
                <label className="block text-[11px] text-alloy-midnight/60">
                    Action key
                    <select
                        value={String(cfg.actionKey ?? "edit_enrollment")}
                        onChange={(e) =>
                            applyDoc(
                                patchSectionActionButtonItem(doc, sectionKey, entry.itemId, {
                                    ...cfg,
                                    actionKey: e.target.value,
                                }),
                            )
                        }
                        className="mt-1 w-full rounded-md border border-alloy-forge/20 px-2 py-1 text-xs"
                        data-testid="visual-editor-action-key"
                    >
                        {LAYOUT_EDITOR_DRAWER_ACTION_KEYS.map((key) => (
                            <option key={key} value={key}>
                                {LAYOUT_EDITOR_ACTION_KEY_LABELS[key]}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="block text-[11px] text-alloy-midnight/60">
                    Style
                    <select
                        value={cfg.styleIntent ?? "secondary"}
                        onChange={(e) =>
                            applyDoc(
                                patchSectionActionButtonItem(doc, sectionKey, entry.itemId, {
                                    ...cfg,
                                    styleIntent: e.target.value as LayoutEditorActionStyleIntent,
                                }),
                            )
                        }
                        className="mt-1 w-full rounded-md border border-alloy-forge/20 px-2 py-1 text-xs"
                    >
                        {LAYOUT_EDITOR_ACTION_STYLE_INTENTS.map((intent) => (
                            <option key={intent} value={intent}>
                                {intent}
                            </option>
                        ))}
                    </select>
                </label>
                <p className="text-[10px] text-alloy-midnight/45">Preview only until live drawer action wiring ships.</p>
            </div>
        );
    }

    if (entry.kind === "block" || entry.kind === "list") {
        const blockConfig = readLayoutEditorBlockConfig(entry.item.metadata);
        const blockFieldPickerGroups = buildBlockContextFieldPickerGroups({
            dataContext: blockConfig.dataContext,
            contactRole:
                entry.item.refKey === "contact_block" ?
                    readLayoutEditorContactRole(entry.item.metadata)
                :   undefined,
            isChildRowTemplate: blockConfig.blockType === "child_row_template" || entry.item.kind === "related_list",
        });
        const blockNode = {
            id: entry.itemId,
            kind: entry.item.kind === "related_list" ? ("related_list" as const) : ("field_group" as const),
            title: entry.title,
            itemId: entry.itemId,
            children: [],
        };
        return (
            <OpportunityDrawerLayoutBlockSettings
                block={blockNode}
                blockItemMetadata={entry.item.metadata}
                showBlockBuilder={
                    entry.item.refKey === "layout_block"
                    || entry.item.refKey === "contact_block"
                    || Boolean(entry.item.metadata?.layoutEditorBlockConfig)
                }
                rows={listCustomBlockRows(entry.item)}
                showContactRole={entry.item.refKey === "contact_block"}
                contactRole={
                    entry.item.refKey === "contact_block" ?
                        readLayoutEditorContactRole(entry.item.metadata)
                    :   undefined
                }
                rowTemplateConfig={readLayoutEditorRowTemplateConfig(entry.item.metadata)}
                onBlockConfigChange={(patch) => {
                    applyDoc(patchCustomBlockConfig(doc, entry.itemId, patch));
                }}
                onContactRoleChange={
                    entry.item.refKey === "contact_block" ?
                        (role) => applyDoc(patchCustomBlockConfig(doc, entry.itemId, { contactRole: role }))
                    :   undefined
                }
                onAddRow={(columnCount) => applyDoc(addRowToCustomBlock(doc, entry.itemId, columnCount))}
                onRemoveRow={(rowIndex) => applyDoc(removeRowFromCustomBlock(doc, entry.itemId, rowIndex))}
                onSetRowColumns={(rowIndex, columnCount) =>
                    applyDoc(setCustomBlockRowColumnCount(doc, entry.itemId, rowIndex, columnCount))
                }
                onRowTemplateChange={(patch) => {
                    const loc = findLayoutBlockLocation(doc, entry.itemId);
                    if (!loc) return;
                    applyDoc(patchLayoutBlockRowTemplateConfig(doc, loc, patch));
                }}
                blockItem={entry.item}
                doc={doc}
                sectionKey={sectionKey}
                fieldPickerGroups={blockFieldPickerGroups}
                validationOk={validationOk}
                applyDoc={applyDoc}
                onFieldAddError={onFieldAddError}
                onClose={onClose}
            />
        );
    }

    const fieldNode: LayoutEditorFieldNode = {
        id: entry.itemId,
        title: resolveLayoutEditorItemDisplayLabel(entry.item),
        refKey: entry.item.refKey,
        path: { kind: "field", sectionKey, itemId: entry.itemId },
        displayConfig: readLayoutEditorDisplayConfig(entry.item),
        visibilityRule: resolveVisibilityRuleKey(entry.item.visibleWhen, entry.item.refKey),
    };

    return (
        <OpportunityDrawerLayoutFieldSettings
            inline
            node={fieldNode}
            onClose={onClose}
            onChange={(patch) => {
                let next = doc;
                if (patch.label !== undefined || patch.display) {
                    next = patchLayoutEditorFieldDisplay(next, fieldNode.path, patch.display ?? {}, patch.label);
                }
                if (patch.visibility) {
                    next = patchLayoutEditorFieldVisibility(next, fieldNode.path, patch.visibility, fieldNode.refKey);
                }
                applyDoc(next);
            }}
        />
    );
}

function SettingsHeader({ title, onClose }: { title: string; onClose: () => void }) {
    return (
        <div className="mb-1 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-alloy-midnight">{title}</p>
            <button type="button" className="text-[11px] text-alloy-midnight/50 hover:text-alloy-pine" onClick={onClose}>
                Close
            </button>
        </div>
    );
}
