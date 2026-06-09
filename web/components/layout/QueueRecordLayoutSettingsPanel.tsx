"use client";

import { useEffect, useMemo, useState } from "react";
import type { LayoutDoc } from "@/lib/layout/layoutV2";
import LayoutFieldPickerOverlay, {
    type LayoutFieldPickerCatalog,
} from "@/components/layout/LayoutFieldPickerOverlay";
import QueueRecordFieldOptions from "@/components/layout/QueueRecordFieldOptions";
import QueueRecordLayoutPreview from "@/components/layout/QueueRecordLayoutPreview";
import {
    addColumn,
    addFieldToBlock,
    addWidgetToBlock,
    collectUsedFieldKeysInBlock,
    moveColumn,
    moveFieldInBlock,
    patchColumn,
    patchFieldInBlock,
    removeBlockFromColumn,
    removeColumn,
    removeFieldFromBlock,
    resolveEditorConfigFromDoc,
} from "@/lib/layout/queueRecordLayoutEditorModel";
import { filterCatalogGroupsForScope } from "@/lib/layout/queueRecordScopeCatalog";
import type { QueueRecordLayoutEditorConfig } from "@/lib/layout/queueRecordLayoutV3";
import {
    QUEUE_RECORD_SCOPE_PRESETS,
    createFieldGroupBlock,
    createRepeatedBlock,
    parseScopePresetKey,
    scopePresetKey,
    type QueueRecordBlockConfig,
} from "@/lib/layout/queueRecordLayoutV3";
import { QUEUE_RECORD_WIDTH_OPTIONS } from "@/lib/layout/queueRecordLayoutWidth";
import type { QueueRecordColumnWidth } from "@/lib/layout/queueRecordLayoutConfig";
import type { LayoutCatalogField, LayoutCatalogWidget } from "@/lib/layout/fieldCatalog";
import { scopeLabel } from "@/lib/layout/queueRecordScopeCatalog";

type Props = {
    doc: LayoutDoc;
    editable: boolean;
    catalog: LayoutFieldPickerCatalog | null;
    onChange: (config: QueueRecordLayoutEditorConfig) => void;
};

type PickerTarget = { columnId: string; blockId: string } | null;

function isWaitlistDoc(doc: LayoutDoc): boolean {
    const meta = doc.metadata as { queue_context?: { queue_type?: string }; template?: string } | undefined;
    if (meta?.queue_context?.queue_type === "waitlist") return true;
    return (meta?.template ?? "").toLowerCase().includes("waitlist");
}

function blockLabel(block: QueueRecordBlockConfig): string {
    if (block.type === "widget") return `Widget · ${block.label ?? block.widgetKey}`;
    if (block.type === "repeated_record_block") return `Repeated · ${block.relationshipKey}`;
    return block.label ?? "Field group";
}

export default function QueueRecordLayoutSettingsPanel({ doc, editable, catalog, onChange }: Props) {
    const initial = useMemo(
        () =>
            resolveEditorConfigFromDoc(
                (doc.metadata as { queue_record_layout?: unknown } | undefined)?.queue_record_layout,
                isWaitlistDoc(doc),
            ),
        [doc],
    );
    const [editorConfig, setEditorConfig] = useState<QueueRecordLayoutEditorConfig>(initial);

    useEffect(() => {
        setEditorConfig(initial);
    }, [initial]);

    const [picker, setPicker] = useState<PickerTarget>(null);
    const [pickerTab, setPickerTab] = useState<"field" | "widget">("field");
    const [pickerGroup, setPickerGroup] = useState("");
    const [lastAddedRefKey, setLastAddedRefKey] = useState<string | null>(null);
    const [expandedFieldId, setExpandedFieldId] = useState<string | null>(null);
    const [addColumnOpen, setAddColumnOpen] = useState(false);

    const patch = (next: QueueRecordLayoutEditorConfig) => {
        setEditorConfig(next);
        onChange(next);
    };

    const pickerColumn = picker ? editorConfig.columns.find((c) => c.id === picker.columnId) : null;
    const pickerBlock =
        pickerColumn && picker ? pickerColumn.blocks.find((b) => b.id === picker.blockId) : null;
    const pickerScope = pickerColumn?.scope;

    const scopedCatalog = useMemo((): LayoutFieldPickerCatalog | null => {
        if (!catalog || !pickerScope) return catalog;
        const groups = filterCatalogGroupsForScope(catalog.groups, pickerScope);
        return { groups, widgets: catalog.widgets };
    }, [catalog, pickerScope]);

    useEffect(() => {
        if (scopedCatalog?.groups?.length && !pickerGroup) {
            setPickerGroup(scopedCatalog.groups[0]!.entityKey);
        }
    }, [scopedCatalog, pickerGroup]);

    const usedRefKeys = useMemo(() => {
        if (!pickerBlock || pickerBlock.type === "widget") return new Set<string>();
        return collectUsedFieldKeysInBlock(pickerBlock.fields);
    }, [pickerBlock]);

    const handleAddField = (field: LayoutCatalogField) => {
        if (!picker) return;
        patch(addFieldToBlock(editorConfig, picker.columnId, picker.blockId, field));
        setPickerGroup(field.entityKey);
        setLastAddedRefKey(field.refKey);
    };

    const handleAddWidget = (widget: LayoutCatalogWidget) => {
        if (!picker) return;
        patch(addWidgetToBlock(editorConfig, picker.columnId, picker.blockId, widget));
        setPicker(null);
    };

    return (
        <div className="flex flex-col gap-5">
            <div>
                <h3 className="text-base font-semibold text-[#273f52]">Queue Record Row Composer</h3>
                <p className="mt-1 text-sm text-[#59678b]">
                    Build columns with scopes, blocks, and fields — same layout concepts as drawer setup.
                </p>
                {!editable ?
                    <p className="mt-2 text-xs text-[#9aa4bf]">Read-only — use &quot;Edit a draft&quot; to change.</p>
                :   null}
            </div>

            <QueueRecordLayoutPreview config={editorConfig} />

            <section className="rounded-lg border border-[#e6e8ec] bg-white p-3">
                <h4 className="text-sm font-semibold text-[#273f52]">Fixed Row Controls</h4>
                <div className="mt-2 flex flex-wrap gap-2">
                    <span className="inline-flex items-center rounded border border-[#b8d4f0] bg-[#f5f8ff] px-3 py-1.5 text-xs font-semibold text-[#00458c]">
                        Work with BOS
                    </span>
                    <span className="inline-flex items-center rounded border border-[#e6e8ec] bg-white px-3 py-1.5 text-xs font-semibold text-[#31394d] shadow-sm">
                        Actions ▾
                    </span>
                </div>
            </section>

            <section>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold text-[#273f52]">Columns</h4>
                    {editable ?
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setAddColumnOpen((v) => !v)}
                                className="rounded border border-[#bfe9dd] bg-[#f0fbf8] px-2.5 py-1 text-xs font-medium text-[#0a6b58]"
                            >
                                + Add column
                            </button>
                            {addColumnOpen ?
                                <div className="absolute right-0 top-full z-10 mt-1 min-w-[12rem] rounded-md border border-[#e6e8ec] bg-white py-1 shadow-md">
                                    {QUEUE_RECORD_SCOPE_PRESETS.map((preset) => (
                                        <button
                                            key={scopePresetKey(preset.scope)}
                                            type="button"
                                            className="block w-full px-3 py-1.5 text-left text-xs hover:bg-[#f4f6f9]"
                                            onClick={() => {
                                                patch(
                                                    addColumn(
                                                        editorConfig,
                                                        scopePresetKey(preset.scope),
                                                        preset.label,
                                                    ),
                                                );
                                                setAddColumnOpen(false);
                                            }}
                                        >
                                            <span className="font-medium text-[#31394d]">{preset.label}</span>
                                            <span className="mt-0.5 block text-[10px] text-[#9aa4bf]">
                                                {preset.description}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            :   null}
                        </div>
                    :   null}
                </div>

                <div className="flex gap-3 overflow-x-auto pb-2">
                    {editorConfig.columns.map((col, colIndex) => {
                        const repeatedRelationshipKey =
                            col.scope.type === "repeated_related" ? col.scope.relationshipKey : null;
                        return (
                        <div
                            key={col.id}
                            className="flex min-w-[13rem] max-w-[16rem] shrink-0 flex-col rounded-lg border border-[#d5dbe8] bg-[#fafbfc] p-3"
                        >
                            <input
                                value={col.label}
                                disabled={!editable}
                                onChange={(e) => patch(patchColumn(editorConfig, col.id, { label: e.target.value }))}
                                className="mb-1 w-full rounded border border-[#e6e8ec] bg-white px-2 py-1 text-sm font-semibold text-[#273f52] disabled:bg-[#f4f6f9]"
                            />
                            <label className="mb-2 flex flex-col gap-0.5 text-[11px] text-[#59678b]">
                                <span className="shrink-0">Scope</span>
                                <select
                                    disabled={!editable}
                                    value={scopePresetKey(col.scope)}
                                    onChange={(e) =>
                                        patch(
                                            patchColumn(editorConfig, col.id, {
                                                scope: parseScopePresetKey(e.target.value),
                                            }),
                                        )
                                    }
                                    className="w-full rounded border border-[#e6e8ec] bg-white px-1.5 py-0.5 text-[11px]"
                                >
                                    {QUEUE_RECORD_SCOPE_PRESETS.map((preset) => (
                                        <option key={scopePresetKey(preset.scope)} value={scopePresetKey(preset.scope)}>
                                            {preset.label}
                                        </option>
                                    ))}
                                </select>
                                <span className="text-[10px] text-[#9aa4bf]">{scopeLabel(col.scope)}</span>
                            </label>
                            <label className="mb-2 flex items-center gap-2 text-[11px] text-[#59678b]">
                                <span className="shrink-0">Width</span>
                                <select
                                    disabled={!editable}
                                    value={col.width}
                                    onChange={(e) =>
                                        patch(
                                            patchColumn(editorConfig, col.id, {
                                                width: e.target.value as QueueRecordColumnWidth,
                                            }),
                                        )
                                    }
                                    className="min-w-0 flex-1 rounded border border-[#e6e8ec] bg-white px-1.5 py-0.5 text-[11px]"
                                >
                                    {QUEUE_RECORD_WIDTH_OPTIONS.map((opt) => (
                                        <option key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            {col.blocks.map((block) => (
                                <div key={block.id} className="mb-2 rounded border border-[#eef0f4] bg-white p-2">
                                    <div className="mb-1 flex items-center justify-between gap-1">
                                        <span className="text-[10px] font-semibold uppercase tracking-wide text-[#7a8bbf]">
                                            {blockLabel(block)}
                                        </span>
                                        {editable && col.blocks.length > 1 ?
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    patch(removeBlockFromColumn(editorConfig, col.id, block.id))
                                                }
                                                className="text-[10px] text-red-600"
                                            >
                                                ×
                                            </button>
                                        :   null}
                                    </div>
                                    {block.type === "repeated_record_block" ?
                                        <div className="mb-1 flex flex-wrap items-center gap-2 text-[10px] text-[#59678b]">
                                            <label className="flex items-center gap-1">
                                                <span>Display</span>
                                                <select
                                                    disabled={!editable}
                                                    value={block.display}
                                                    onChange={(e) => {
                                                        const display = e.target.value as typeof block.display;
                                                        patch({
                                                            ...editorConfig,
                                                            columns: editorConfig.columns.map((c) =>
                                                                c.id !== col.id ? c : {
                                                                    ...c,
                                                                    blocks: c.blocks.map((b) =>
                                                                        b.id === block.id && b.type === "repeated_record_block" ?
                                                                            { ...b, display }
                                                                        :   b,
                                                                    ),
                                                                },
                                                            ),
                                                        });
                                                    }}
                                                    className="rounded border border-[#e6e8ec] px-1 py-0.5"
                                                >
                                                    <option value="rows">Rows</option>
                                                    <option value="chips">Chips</option>
                                                    <option value="compact-cards">Compact cards</option>
                                                </select>
                                            </label>
                                            <label className="flex items-center gap-1">
                                                <span>Max visible</span>
                                                <input
                                                    type="number"
                                                    min={1}
                                                    max={12}
                                                    disabled={!editable}
                                                    value={block.maxItems ?? 5}
                                                    onChange={(e) => {
                                                        const maxItems = Math.max(1, Math.min(12, Number(e.target.value) || 5));
                                                        patch({
                                                            ...editorConfig,
                                                            columns: editorConfig.columns.map((c) =>
                                                                c.id !== col.id ? c : {
                                                                    ...c,
                                                                    blocks: c.blocks.map((b) =>
                                                                        b.id === block.id && b.type === "repeated_record_block" ?
                                                                            { ...b, maxItems }
                                                                        :   b,
                                                                    ),
                                                                },
                                                            ),
                                                        });
                                                    }}
                                                    className="w-12 rounded border border-[#e6e8ec] px-1 py-0.5"
                                                />
                                            </label>
                                        </div>
                                    :   null}
                                    <ul className="m-0 list-none space-y-1 p-0">
                                        {block.type === "widget" ?
                                            <li className="text-xs text-[#59678b]">{block.label ?? block.widgetKey}</li>
                                        :   block.fields.length === 0 ?
                                            <li className="text-center text-[11px] text-[#9aa4bf]">No fields</li>
                                        :   block.fields.map((field, fieldIndex) => (
                                                <li key={field.id} className="rounded border border-[#f0f2f6] px-2 py-1">
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            type="button"
                                                            className="min-w-0 flex-1 truncate text-left text-xs font-medium"
                                                            onClick={() =>
                                                                setExpandedFieldId((id) =>
                                                                    id === field.id ? null : field.id,
                                                                )
                                                            }
                                                        >
                                                            {field.label ?? field.fieldKey}
                                                        </button>
                                                        {editable ?
                                                            <span className="flex shrink-0 gap-0.5">
                                                                <button
                                                                    type="button"
                                                                    disabled={fieldIndex === 0}
                                                                    onClick={() =>
                                                                        patch(
                                                                            moveFieldInBlock(
                                                                                editorConfig,
                                                                                col.id,
                                                                                block.id,
                                                                                fieldIndex,
                                                                                -1,
                                                                            ),
                                                                        )
                                                                    }
                                                                    className="text-[10px] disabled:opacity-30"
                                                                >
                                                                    ↑
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    disabled={fieldIndex === block.fields.length - 1}
                                                                    onClick={() =>
                                                                        patch(
                                                                            moveFieldInBlock(
                                                                                editorConfig,
                                                                                col.id,
                                                                                block.id,
                                                                                fieldIndex,
                                                                                1,
                                                                            ),
                                                                        )
                                                                    }
                                                                    className="text-[10px] disabled:opacity-30"
                                                                >
                                                                    ↓
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        patch(
                                                                            removeFieldFromBlock(
                                                                                editorConfig,
                                                                                col.id,
                                                                                block.id,
                                                                                field.id,
                                                                            ),
                                                                        )
                                                                    }
                                                                    className="text-[10px] text-red-600"
                                                                >
                                                                    ×
                                                                </button>
                                                            </span>
                                                        :   null}
                                                    </div>
                                                    {expandedFieldId === field.id ?
                                                        <QueueRecordFieldOptions
                                                            field={field}
                                                            editable={editable}
                                                            canInline={fieldIndex > 0}
                                                            onPatch={(fieldPatch) =>
                                                                patch(
                                                                    patchFieldInBlock(
                                                                        editorConfig,
                                                                        col.id,
                                                                        block.id,
                                                                        field.id,
                                                                        fieldPatch,
                                                                    ),
                                                                )
                                                            }
                                                        />
                                                    :   null}
                                                </li>
                                            ))
                                        }
                                    </ul>
                                    {editable ?
                                        <div className="mt-1 flex flex-wrap gap-1">
                                            {block.type !== "widget" ?
                                                <button
                                                    type="button"
                                                    disabled={!catalog}
                                                    onClick={() => {
                                                        if (scopedCatalog?.groups?.length) {
                                                            setPickerGroup(scopedCatalog.groups[0]!.entityKey);
                                                        }
                                                        setPickerTab("field");
                                                        setPicker({ columnId: col.id, blockId: block.id });
                                                    }}
                                                    className="flex-1 rounded border border-dashed border-[#bfe9dd] bg-[#f7fcfa] py-1 text-[11px] font-medium text-[#0a6b58] disabled:opacity-50"
                                                >
                                                    + Add field
                                                </button>
                                            :   null}
                                            <button
                                                type="button"
                                                disabled={!catalog}
                                                onClick={() => {
                                                    setPickerTab("widget");
                                                    setPicker({ columnId: col.id, blockId: block.id });
                                                }}
                                                className="flex-1 rounded border border-dashed border-[#d4e3fb] bg-[#f5f8ff] py-1 text-[11px] font-medium text-[#2f6df6] disabled:opacity-50"
                                            >
                                                + Add widget
                                            </button>
                                        </div>
                                    :   null}
                                </div>
                            ))}

                            {editable ?
                                <div className="mb-2 flex flex-wrap gap-1">
                                    <button
                                        type="button"
                                        onClick={() =>
                                            patch({
                                                ...editorConfig,
                                                columns: editorConfig.columns.map((c) =>
                                                    c.id !== col.id ? c : {
                                                        ...c,
                                                        blocks: [...c.blocks, createFieldGroupBlock()],
                                                    },
                                                ),
                                            })
                                        }
                                        className="rounded border border-[#e6e8ec] px-1.5 py-0.5 text-[10px]"
                                    >
                                        + Block
                                    </button>
                                    {repeatedRelationshipKey ?
                                        <button
                                            type="button"
                                            onClick={() =>
                                                patch({
                                                    ...editorConfig,
                                                    columns: editorConfig.columns.map((c) =>
                                                        c.id !== col.id ? c : {
                                                            ...c,
                                                            blocks: [
                                                                ...c.blocks,
                                                                createRepeatedBlock(repeatedRelationshipKey),
                                                            ],
                                                        },
                                                    ),
                                                })
                                            }
                                            className="rounded border border-[#e6e8ec] px-1.5 py-0.5 text-[10px]"
                                        >
                                            + Repeat
                                        </button>
                                    :   null}
                                </div>
                            :   null}

                            {editable ?
                                <div className="flex items-center justify-between gap-1 border-t border-[#eef0f4] pt-2">
                                    <button
                                        type="button"
                                        disabled={colIndex === 0}
                                        onClick={() => patch(moveColumn(editorConfig, colIndex, -1))}
                                        className="rounded border border-[#e6e8ec] px-1.5 text-[10px] disabled:opacity-40"
                                    >
                                        ←
                                    </button>
                                    <button
                                        type="button"
                                        disabled={editorConfig.columns.length <= 1}
                                        onClick={() => patch(removeColumn(editorConfig, col.id))}
                                        className="text-[10px] text-red-600 disabled:opacity-40"
                                    >
                                        Remove
                                    </button>
                                    <button
                                        type="button"
                                        disabled={colIndex === editorConfig.columns.length - 1}
                                        onClick={() => patch(moveColumn(editorConfig, colIndex, 1))}
                                        className="rounded border border-[#e6e8ec] px-1.5 text-[10px] disabled:opacity-40"
                                    >
                                        →
                                    </button>
                                </div>
                            :   null}
                        </div>
                        );
                    })}
                </div>
            </section>

            {picker && scopedCatalog ?
                <LayoutFieldPickerOverlay
                    catalog={scopedCatalog}
                    surface="queue"
                    tab={pickerTab}
                    setTab={setPickerTab}
                    group={pickerGroup}
                    setGroup={setPickerGroup}
                    usedRefKeys={usedRefKeys}
                    lastAddedRefKey={lastAddedRefKey}
                    onPickField={handleAddField}
                    onPickWidget={handleAddWidget}
                    onClose={() => {
                        setPicker(null);
                        setLastAddedRefKey(null);
                    }}
                />
            :   null}
        </div>
    );
}
