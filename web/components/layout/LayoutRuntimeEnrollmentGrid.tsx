"use client";

import { useCallback, useMemo, useState } from "react";
import type { LayoutCollectionColumn, LayoutItem } from "@/lib/layout/layoutV2";
import { normalizeRefKeyOnRead } from "@/lib/layout/layoutRefKeyAliases";
import LayoutRuntimeChildLinkSurface from "@/components/layout/LayoutRuntimeChildLinkSurface";
import { useLayoutRuntimeDrawerEdit } from "@/components/layout/LayoutRuntimeDrawerEditProvider";
import LayoutRuntimeFieldInput, {
    layoutRuntimeDependentValueReader,
} from "@/components/layout/LayoutRuntimeFieldInput";
import type { AdornmentActionHandler } from "@/components/layout/LayoutRuntimePlanView";
import { useLayoutRuntimeCompositionHints } from "@/lib/layout/runtime/layoutRuntimeCompositionContext";
import { layoutRuntimeFieldIsEditable } from "@/lib/layout/runtime/layoutRuntimeFieldEditability";
import {
    enrollmentGridColumnIsEditable,
    enrollmentRosterReadFirstActive,
    readEnrollmentGridCellRole,
    type EnrollmentGridCellRole,
} from "@/lib/layout/runtime/enrollmentGridPresentation";
import { layoutRuntimeRepeaterRowReactKey } from "@/lib/layout/runtime/layoutRuntimeRepeaterRowKey";
import { resolveLayoutRuntimeRepeaterFieldValue } from "@/lib/layout/runtime/resolveLayoutRuntimeRepeaterFieldValue";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import { LAYOUT_RUNTIME_ENROLLMENT_GRID_WRAP } from "@/lib/layout/runtime/layoutRuntimeSurfaceStyles";

type Props = {
    item: LayoutItem;
    columns: LayoutCollectionColumn[];
    rows: ProofRuntimeRecord[];
    anchorRecord: ProofRuntimeRecord;
    overflowFooter?: React.ReactNode;
    canMutate?: boolean;
    onAdornmentAction?: AdornmentActionHandler;
};

function EnrollmentGridPill({ children }: { children: React.ReactNode }) {
    return (
        <span className="inline-flex max-w-full truncate rounded-full border border-alloy-stone/12 bg-alloy-stone/[0.03] px-1.5 py-px text-[10px] font-medium leading-tight text-alloy-midnight/75">
            {children}
        </span>
    );
}

function EnrollmentGridStatusPill({ children }: { children: React.ReactNode }) {
    return (
        <span className="inline-flex max-w-full truncate rounded-full border border-alloy-juniper/18 bg-alloy-juniper/[0.06] px-1.5 py-px text-[10px] font-medium leading-tight text-alloy-midnight/80">
            {children}
        </span>
    );
}

function EnrollmentGridCell({
    row,
    col,
    rowKey,
    anchorRecord,
    role,
    isRowEditing,
    canMutate,
    onAdornmentAction,
}: {
    row: ProofRuntimeRecord;
    col: LayoutCollectionColumn;
    rowKey: string;
    anchorRecord: ProofRuntimeRecord;
    role: EnrollmentGridCellRole;
    isRowEditing: boolean;
    canMutate?: boolean;
    onAdornmentAction?: AdornmentActionHandler;
}) {
    const edit = useLayoutRuntimeDrawerEdit();
    const synthetic: LayoutItem = {
        id: col.refKey,
        kind: "field",
        refKey: col.refKey,
        renderHint: col.renderHint,
        adornment: col.adornment,
        editable: col.editable,
    };
    const resolved = resolveLayoutRuntimeRepeaterFieldValue(row, col.refKey, {
        renderHint: col.renderHint,
        template: col.template,
    });
    const editableRefKey = normalizeRefKeyOnRead(col.refKey);
    const fieldEditable =
        canMutate !== false
        && layoutRuntimeFieldIsEditable(
            { ...synthetic, refKey: editableRefKey, editable: col.editable ?? enrollmentGridColumnIsEditable(col) },
            "production",
        )
        && Boolean(edit)
        && enrollmentGridColumnIsEditable(col);
    const showInlineEdit = isRowEditing && fieldEditable;
    const editValue =
        showInlineEdit && edit ?
            edit.getFieldValue(col.refKey, resolved.display ?? "", rowKey)
        :   resolved.display ?? "";

    if (role === "primary_link" && !showInlineEdit) {
        return (
            <LayoutRuntimeChildLinkSurface
                componentName="LayoutRuntimeEnrollmentGrid"
                surface="drawer"
                item={synthetic}
                rowRecord={row}
                anchorRecord={anchorRecord}
                adornment={col.adornment}
                display={resolved.isPlaceholder ? "—" : resolved.display}
                onAction={onAdornmentAction}
                className="inline-flex min-w-0 items-center truncate text-[12px] font-semibold leading-tight text-alloy-midnight hover:text-alloy-juniper"
            />
        );
    }

    if (showInlineEdit && edit) {
        return (
            <div
                className="min-w-0"
                data-layout-runtime-enrollment-editable="true"
                data-layout-runtime-ref-key={col.refKey}
            >
                <LayoutRuntimeFieldInput
                    refKey={col.refKey}
                    value={editValue}
                    rowKey={rowKey}
                    onChange={(v) => edit.setFieldValue(col.refKey, v, rowKey)}
                    getDependentValue={layoutRuntimeDependentValueReader(edit.getFieldValue, rowKey)}
                    compact
                />
            </div>
        );
    }

    if (resolved.isPlaceholder) {
        return <span className="text-[11px] text-alloy-midnight/30">—</span>;
    }

    if (role === "pill") {
        return col.renderHint === "status" ?
                <EnrollmentGridStatusPill>{resolved.display}</EnrollmentGridStatusPill>
            :   <EnrollmentGridPill>{resolved.display}</EnrollmentGridPill>;
    }

    return (
        <span className="block truncate text-[11px] leading-tight text-alloy-midnight/75">{resolved.display}</span>
    );
}

function rowHasEditableFields(columns: LayoutCollectionColumn[], canMutate?: boolean): boolean {
    if (canMutate === false) return false;
    return columns.some((col) => enrollmentGridColumnIsEditable(col));
}

/**
 * Compact operational enrollment roster — read-first with explicit row edit.
 */
export default function LayoutRuntimeEnrollmentGrid({
    item,
    columns,
    rows,
    anchorRecord,
    overflowFooter,
    canMutate,
    onAdornmentAction,
}: Props) {
    const composition = useLayoutRuntimeCompositionHints();
    const readFirst = enrollmentRosterReadFirstActive(item, composition.enrollmentRosterReadFirst);
    const [editingRowKeys, setEditingRowKeys] = useState<Set<string>>(() => new Set());
    const showRowActions = readFirst && rowHasEditableFields(columns, canMutate);

    const gridTemplateColumns = useMemo(() => {
        if (columns.length === 0) return "1fr";
        const dataCols =
            columns.length === 1 ? "minmax(0, 1.25fr)" : (
                `minmax(0, 1.25fr) ${columns.slice(1).map(() => "minmax(0, 0.9fr)").join(" ")}`
            );
        return showRowActions ? `${dataCols} minmax(2.5rem, auto)` : dataCols;
    }, [columns.length, showRowActions]);

    const toggleRowEdit = useCallback((rowKey: string) => {
        setEditingRowKeys((prev) => {
            const next = new Set(prev);
            if (next.has(rowKey)) next.delete(rowKey);
            else next.add(rowKey);
            return next;
        });
    }, []);

    return (
        <div
            className={LAYOUT_RUNTIME_ENROLLMENT_GRID_WRAP}
            data-layout-runtime-enrollment-grid="true"
            data-layout-runtime-enrollment-roster="true"
            data-layout-runtime-enrollment-read-mode={readFirst ? "roster" : "inline"}
        >
            <div
                className="hidden border-b border-alloy-stone/10 bg-alloy-stone/[0.015] px-2 py-1.5 sm:grid sm:gap-2"
                style={{ gridTemplateColumns }}
            >
                {columns.map((col) => (
                    <span
                        key={col.refKey}
                        className="truncate text-[9px] font-semibold uppercase tracking-[0.07em] text-alloy-midnight/40"
                    >
                        {col.label}
                    </span>
                ))}
                {showRowActions ?
                    <span className="sr-only">Actions</span>
                :   null}
            </div>
            <div className="overflow-x-auto">
                {rows.length === 0 ?
                    <div className="px-3 py-4 text-[12px] text-alloy-midnight/40">No children linked yet.</div>
                :   rows.map((row, index) => {
                        const rowKey = layoutRuntimeRepeaterRowReactKey(row, index, item.source ?? item.refKey);
                        const isRowEditing = readFirst ? editingRowKeys.has(rowKey) : true;
                        return (
                            <div
                                key={rowKey}
                                className="group grid items-center gap-x-2 border-b border-alloy-stone/8 px-2 py-1.5 last:border-b-0 hover:bg-alloy-stone/[0.02]"
                                style={{ gridTemplateColumns }}
                                data-layout-runtime-enrollment-row="true"
                                data-enrollment-row-editing={isRowEditing && readFirst ? "true" : "false"}
                            >
                                {columns.map((col) => {
                                    const role = readEnrollmentGridCellRole(item, col);
                                    return (
                                        <div key={col.refKey} className="min-w-0" data-enrollment-cell-role={role}>
                                            <EnrollmentGridCell
                                                row={row}
                                                col={col}
                                                rowKey={rowKey}
                                                anchorRecord={anchorRecord}
                                                role={role}
                                                isRowEditing={isRowEditing}
                                                canMutate={canMutate}
                                                onAdornmentAction={onAdornmentAction}
                                            />
                                        </div>
                                    );
                                })}
                                {showRowActions ?
                                    <div className="flex justify-end">
                                        <button
                                            type="button"
                                            className="rounded px-1.5 py-0.5 text-[10px] font-medium text-alloy-midnight/45 opacity-0 transition-opacity hover:bg-alloy-stone/10 hover:text-alloy-juniper group-hover:opacity-100 focus:opacity-100"
                                            onClick={() => toggleRowEdit(rowKey)}
                                            data-enrollment-row-action={isRowEditing ? "done" : "edit"}
                                        >
                                            {isRowEditing ? "Done" : "Edit"}
                                        </button>
                                    </div>
                                :   null}
                            </div>
                        );
                    })
                }
            </div>
            {overflowFooter}
        </div>
    );
}
