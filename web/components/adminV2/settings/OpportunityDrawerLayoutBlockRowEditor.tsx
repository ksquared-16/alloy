"use client";

import { useMemo, useState } from "react";
import OpportunityDrawerLayoutFieldPicker from "@/components/adminV2/settings/OpportunityDrawerLayoutFieldPicker";
import OpportunityDrawerLayoutFieldSettings from "@/components/adminV2/settings/OpportunityDrawerLayoutFieldSettings";
import type { LayoutCatalogGroup } from "@/lib/layout/fieldCatalog";
import type { LayoutDoc, LayoutItem } from "@/lib/layout/layoutV2";
import {
    patchLayoutEditorFieldDisplay,
    patchLayoutEditorFieldVisibility,
    type LayoutEditorFieldNode,
} from "@/lib/layout/layoutEditorCompositionModel";
import { readLayoutEditorDisplayConfig } from "@/lib/layout/layoutEditorDisplayConfig";
import {
    addActionToCustomBlockRow,
    addFieldToCustomBlockRow,
    addTextToCustomBlockRow,
    listCustomBlockRowLayout,
    moveCustomBlockNestedField,
    removeCustomBlockNestedField,
} from "@/lib/layout/layoutEditorFreeformBlocks";
import { resolveLayoutEditorItemDisplayLabel } from "@/lib/layout/opportunityDrawerLayoutEditorFieldCatalog";
import { resolveVisibilityRuleKey } from "@/lib/layout/layoutEditorVisibilityRules";

type Props = {
    doc: LayoutDoc;
    sectionKey: string;
    blockItemId: string;
    blockItem: LayoutItem;
    fieldPickerGroups: LayoutCatalogGroup[];
    validationOk: boolean;
    applyDoc: (next: LayoutDoc) => void;
    onFieldAddError: (message: string | null) => void;
    supportsAction?: boolean;
    supportsText?: boolean;
    onSetRowColumns?: (rowIndex: number, columnCount: 1 | 2 | 3) => void;
    onRemoveRow?: (rowIndex: number) => void;
};

export default function OpportunityDrawerLayoutBlockRowEditor({
    doc,
    sectionKey,
    blockItemId,
    blockItem,
    fieldPickerGroups,
    validationOk,
    applyDoc,
    onFieldAddError,
    supportsAction = true,
    supportsText = true,
    onSetRowColumns,
    onRemoveRow,
}: Props) {
    const rows = useMemo(() => listCustomBlockRowLayout(blockItem), [blockItem]);
    const [pickerTarget, setPickerTarget] = useState<{ rowIndex: number; colIndex: number } | null>(null);
    const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);

    const selectedField = useMemo(() => {
        if (!selectedFieldId) return null;
        for (const row of rows) {
            for (const col of row.columns) {
                const item = col.items.find((it) => it.id === selectedFieldId);
                if (item) {
                    return { row, col, item };
                }
            }
        }
        return null;
    }, [rows, selectedFieldId]);

    const selectedFieldNode: LayoutEditorFieldNode | null =
        selectedField ?
            {
                id: selectedField.item.id,
                title: resolveLayoutEditorItemDisplayLabel(selectedField.item),
                refKey: selectedField.item.refKey,
                path:
                    blockItem.kind === "related_list" ?
                        {
                            kind: "column",
                            sectionKey,
                            blockItemId,
                            colIdx: selectedField.col.relatedColumnIndex ?? 0,
                        }
                    :   {
                            kind: "group_field",
                            sectionKey,
                            blockItemId,
                            gr: selectedField.row.rowIndex,
                            gc: selectedField.col.colIndex,
                            fieldId: selectedField.item.id,
                        },
                displayConfig: readLayoutEditorDisplayConfig(selectedField.item),
                visibilityRule: resolveVisibilityRuleKey(selectedField.item.visibleWhen, selectedField.item.refKey),
            }
        :   null;

    return (
        <div className="mt-3 space-y-2 border-t border-alloy-forge/10 pt-3" data-testid="visual-editor-block-rows">
            {rows.map((row) => (
                <div
                    key={row.rowId}
                    className="rounded border border-alloy-forge/10 bg-white/80 p-2"
                    data-testid={`visual-editor-block-row-${row.rowIndex}`}
                >
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[10px] font-medium text-alloy-midnight/55">
                            Row {row.rowIndex + 1} · {row.columnCount} column{row.columnCount === 1 ? "" : "s"}
                        </p>
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
                    <div
                        className="grid gap-2"
                        style={{ gridTemplateColumns: `repeat(${Math.max(1, row.columnCount)}, minmax(0, 1fr))` }}
                    >
                        {row.columns.map((col) => (
                            <div
                                key={col.colId}
                                className="min-w-0 rounded border border-dashed border-alloy-forge/10 p-2"
                                data-testid={`visual-editor-block-col-${row.rowIndex}-${col.colIndex}`}
                            >
                                <p className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-alloy-midnight/35">
                                    Column {col.colIndex + 1}
                                </p>
                                <ul className="space-y-1">
                                    {col.items.map((item) => (
                                        <li
                                            key={item.id}
                                            className={`rounded border px-2 py-1 text-[11px] ${
                                                selectedFieldId === item.id ?
                                                    "border-alloy-pine/40 bg-alloy-pine/[0.06]"
                                                :   "border-alloy-forge/10 bg-white"
                                            }`}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <button
                                                    type="button"
                                                    className="min-w-0 flex-1 truncate text-left text-alloy-midnight"
                                                    onClick={() =>
                                                        setSelectedFieldId(selectedFieldId === item.id ? null : item.id)
                                                    }
                                                    data-testid={`visual-editor-block-field-${item.id}`}
                                                >
                                                    {resolveLayoutEditorItemDisplayLabel(item)}
                                                </button>
                                                <span className="flex shrink-0 gap-0.5">
                                                    {col.colIndex > 0 ?
                                                        <button
                                                            type="button"
                                                            className="px-1 text-alloy-midnight/50 hover:text-alloy-pine"
                                                            onClick={() =>
                                                                applyDoc(
                                                                    moveCustomBlockNestedField(
                                                                        doc,
                                                                        blockItemId,
                                                                        row.rowIndex,
                                                                        col.colIndex,
                                                                        item.id,
                                                                        -1,
                                                                        "horizontal",
                                                                    ),
                                                                )
                                                            }
                                                            aria-label="Move left"
                                                        >
                                                            ←
                                                        </button>
                                                    :   null}
                                                    {col.colIndex < row.columnCount - 1 ?
                                                        <button
                                                            type="button"
                                                            className="px-1 text-alloy-midnight/50 hover:text-alloy-pine"
                                                            onClick={() =>
                                                                applyDoc(
                                                                    moveCustomBlockNestedField(
                                                                        doc,
                                                                        blockItemId,
                                                                        row.rowIndex,
                                                                        col.colIndex,
                                                                        item.id,
                                                                        1,
                                                                        "horizontal",
                                                                    ),
                                                                )
                                                            }
                                                            aria-label="Move right"
                                                        >
                                                            →
                                                        </button>
                                                    :   null}
                                                    <button
                                                        type="button"
                                                        className="px-1 text-alloy-midnight/50 hover:text-alloy-pine"
                                                        onClick={() =>
                                                            applyDoc(
                                                                moveCustomBlockNestedField(
                                                                    doc,
                                                                    blockItemId,
                                                                    row.rowIndex,
                                                                    col.colIndex,
                                                                    item.id,
                                                                    -1,
                                                                    "vertical",
                                                                ),
                                                            )
                                                        }
                                                        aria-label="Move up"
                                                    >
                                                        ↑
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="px-1 text-alloy-midnight/50 hover:text-alloy-pine"
                                                        onClick={() =>
                                                            applyDoc(
                                                                moveCustomBlockNestedField(
                                                                    doc,
                                                                    blockItemId,
                                                                    row.rowIndex,
                                                                    col.colIndex,
                                                                    item.id,
                                                                    1,
                                                                    "vertical",
                                                                ),
                                                            )
                                                        }
                                                        aria-label="Move down"
                                                    >
                                                        ↓
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="px-1 text-red-500/70 hover:text-red-600"
                                                        onClick={() => {
                                                            applyDoc(
                                                                removeCustomBlockNestedField(
                                                                    doc,
                                                                    blockItemId,
                                                                    row.rowIndex,
                                                                    col.colIndex,
                                                                    item.id,
                                                                ),
                                                            );
                                                            if (selectedFieldId === item.id) setSelectedFieldId(null);
                                                        }}
                                                        aria-label="Remove"
                                                    >
                                                        ✕
                                                    </button>
                                                </span>
                                            </div>
                                        </li>
                                    ))}
                                </ul>

                                {pickerTarget?.rowIndex === row.rowIndex && pickerTarget.colIndex === col.colIndex ?
                                    <div className="mt-2">
                                        <OpportunityDrawerLayoutFieldPicker
                                            groups={fieldPickerGroups}
                                            disabled={!validationOk}
                                            onPickField={(field) => {
                                                const result = addFieldToCustomBlockRow(
                                                    doc,
                                                    blockItemId,
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
                                                setSelectedFieldId(result.fieldId);
                                                setPickerTarget(null);
                                            }}
                                        />
                                    </div>
                                :   null}

                                <div className="mt-2 flex flex-wrap gap-1">
                                    <AddItemButton
                                        label="Field"
                                        testId={`visual-editor-block-add-field-${row.rowIndex}-${col.colIndex}`}
                                        onClick={() => {
                                            setPickerTarget({ rowIndex: row.rowIndex, colIndex: col.colIndex });
                                            setSelectedFieldId(null);
                                        }}
                                    />
                                    {supportsText ?
                                        <AddItemButton
                                            label="Text"
                                            testId={`visual-editor-block-add-text-${row.rowIndex}-${col.colIndex}`}
                                            onClick={() => {
                                                const result = addTextToCustomBlockRow(
                                                    doc,
                                                    blockItemId,
                                                    row.rowIndex,
                                                    col.colIndex,
                                                );
                                                if (!result.ok) {
                                                    onFieldAddError(result.error);
                                                    return;
                                                }
                                                applyDoc(result.doc);
                                                onFieldAddError(null);
                                                setSelectedFieldId(result.fieldId);
                                            }}
                                        />
                                    :   null}
                                    {supportsAction && blockItem.kind === "field_group" ?
                                        <AddItemButton
                                            label="Action"
                                            testId={`visual-editor-block-add-action-${row.rowIndex}-${col.colIndex}`}
                                            onClick={() => {
                                                const result = addActionToCustomBlockRow(
                                                    doc,
                                                    blockItemId,
                                                    row.rowIndex,
                                                    col.colIndex,
                                                );
                                                if (!result.ok) {
                                                    onFieldAddError(result.error);
                                                    return;
                                                }
                                                applyDoc(result.doc);
                                                onFieldAddError(null);
                                                setSelectedFieldId(result.fieldId);
                                            }}
                                        />
                                    :   null}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ))}

            {selectedFieldNode ?
                <OpportunityDrawerLayoutFieldSettings
                    inline
                    node={selectedFieldNode}
                    onClose={() => setSelectedFieldId(null)}
                    onChange={(patch) => {
                        let next = doc;
                        if (patch.label !== undefined || patch.display) {
                            next = patchLayoutEditorFieldDisplay(
                                next,
                                selectedFieldNode.path,
                                patch.display ?? {},
                                patch.label,
                            );
                        }
                        if (patch.visibility) {
                            next = patchLayoutEditorFieldVisibility(
                                next,
                                selectedFieldNode.path,
                                patch.visibility,
                                selectedFieldNode.refKey,
                            );
                        }
                        applyDoc(next);
                    }}
                />
            :   null}
        </div>
    );
}

function AddItemButton({ label, testId, onClick }: { label: string; testId: string; onClick: () => void }) {
    return (
        <button
            type="button"
            className="rounded border border-alloy-forge/15 px-1.5 py-0.5 text-[10px] text-alloy-midnight/65 hover:border-alloy-pine/30 hover:text-alloy-pine"
            onClick={onClick}
            data-testid={testId}
        >
            + {label}
        </button>
    );
}
