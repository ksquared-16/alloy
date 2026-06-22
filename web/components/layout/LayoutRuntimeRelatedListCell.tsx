"use client";

import { useContext } from "react";
import LayoutRuntimeChildLinkSurface from "@/components/layout/LayoutRuntimeChildLinkSurface";
import LayoutRuntimeFieldInput, { layoutRuntimeDependentValueReader } from "@/components/layout/LayoutRuntimeFieldInput";
import { useLayoutRuntimeDrawerEdit } from "@/components/layout/LayoutRuntimeDrawerEditProvider";
import {
    AdornmentActionContext,
    LayoutRuntimeVariantContext,
    type AdornmentActionHandler,
} from "@/components/layout/LayoutRuntimePlanView";
import LayoutRuntimeAdornmentButton from "@/components/layout/LayoutRuntimeAdornmentButton";
import type { LayoutCollectionColumn, LayoutItem } from "@/lib/layout/layoutV2";
import {
    readLayoutEditorDisplayConfig,
    resolveLayoutCollectionColumnLinkAdornment,
    resolveLayoutCollectionColumnShowIcon,
    typographyIntentClass,
} from "@/lib/layout/layoutEditorDisplayConfig";
import { useLayoutEditorRuntimeTrace, layoutEditorTraceProps } from "@/lib/layout/layoutEditorRuntimeTraceContext";
import {
    formatLayoutEditorFieldDateValue,
    layoutEditorStatusFormatClass,
    shouldShowLayoutEditorFieldLabel,
} from "@/lib/layout/runtime/applyLayoutEditorFieldDisplay";
import {
    layoutRuntimeFieldIsEditable,
    resolveLayoutRuntimeEditableFieldFallback,
    resolveLayoutRuntimeEditableRefKey,
} from "@/lib/layout/runtime/layoutRuntimeFieldEditability";
import { isLayoutRuntimeChildLinkColumn } from "@/lib/layout/runtime/layoutRuntimeLinkHarness";
import { resolveLayoutRuntimeRepeaterFieldValue } from "@/lib/layout/runtime/resolveLayoutRuntimeRepeaterFieldValue";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import {
    PRESENTATION_DATA_VALUE_GRID,
    PRESENTATION_VALUE_PLACEHOLDER,
} from "@/lib/presentation/presentationTypography";

type Props = {
    row: ProofRuntimeRecord;
    col: LayoutCollectionColumn;
    rowKey: string;
    anchorRecord?: ProofRuntimeRecord;
    onAction?: AdornmentActionHandler;
};

/** Shared related-list cell renderer — icons, links, and inline edit parity for all presentations. */
export default function LayoutRuntimeRelatedListCell({ row, col, rowKey, anchorRecord, onAction: onActionProp }: Props) {
    const variant = useContext(LayoutRuntimeVariantContext);
    const edit = useLayoutRuntimeDrawerEdit();
    const onActionFromContext = useContext(AdornmentActionContext);
    const onAction = onActionProp ?? onActionFromContext;
    const displayConfig = readLayoutEditorDisplayConfig(col);
    const columnAdornment = resolveLayoutCollectionColumnLinkAdornment(col);
    const showColumnIcon = resolveLayoutCollectionColumnShowIcon(col);
    const synthetic: LayoutItem = {
        id: col.refKey,
        kind: "field",
        refKey: col.refKey,
        renderHint: col.renderHint,
        adornment: columnAdornment ?? col.adornment,
        editable: col.editable,
        metadata: col.metadata,
    };
    const r = resolveLayoutRuntimeRepeaterFieldValue(row, col.refKey, {
        renderHint: col.renderHint,
        template: col.template,
    });
    const trace = useLayoutEditorRuntimeTrace();
    const traceProps = layoutEditorTraceProps(trace, { refKey: col.refKey });
    const editableRefKey = resolveLayoutRuntimeEditableRefKey(col.refKey);
    const canEdit = layoutRuntimeFieldIsEditable(synthetic, variant) && Boolean(edit);
    const editValue =
        canEdit && edit ?
            edit.getFieldValue(
                editableRefKey,
                resolveLayoutRuntimeEditableFieldFallback(row, editableRefKey, r.display ?? ""),
                rowKey,
            )
        :   r.display ?? "";
    const formattedDisplay =
        !r.isPlaceholder && r.display ?
            formatLayoutEditorFieldDateValue(col.refKey, r.display, col.renderHint, displayConfig.dateFormat)
        :   r.display;
    const statusClass = layoutEditorStatusFormatClass(displayConfig, col.renderHint);
    const typographyClass = typographyIntentClass(displayConfig.typographyIntent);
    const showLabel = shouldShowLayoutEditorFieldLabel(displayConfig);
    const columnLabel = showLabel ? col.label?.trim() : "";
    const useLinkSurface =
        !canEdit
        && (
            isLayoutRuntimeChildLinkColumn(col.refKey)
            || displayConfig.linkBehavior === "open_drawer"
            || displayConfig.linkBehavior === "open_record"
        );

    if (useLinkSurface) {
        return (
            <LayoutRuntimeChildLinkSurface
                componentName="LayoutRuntimeRelatedListCell"
                surface="drawer"
                item={synthetic}
                rowRecord={row}
                anchorRecord={anchorRecord}
                adornment={columnAdornment ?? col.adornment}
                display={
                    r.isPlaceholder ? "—"
                    : col.renderHint === "status" ?
                        <span className="inline-block rounded-full border border-alloy-juniper/20 bg-alloy-juniper/8 px-2 py-0.5 text-[11px] text-alloy-midnight/85">{r.display}</span>
                    :   r.display
                }
                onAction={onAction}
                className="inline-flex min-w-0 items-center gap-1.5 rounded px-0.5 text-sm leading-snug text-left text-alloy-pine hover:bg-[#eef3fb] hover:underline"
            />
        );
    }

    return (
        <span
            className={`inline-flex min-w-0 items-center gap-1.5 ${PRESENTATION_DATA_VALUE_GRID} ${typographyClass} ${traceProps.className ?? ""}`}
            {...traceProps.attrs}
            onClick={(e) => {
                traceProps.onClick?.();
                if (trace?.inspectMode) e.stopPropagation();
            }}
        >
            {columnLabel ?
                <span className="shrink-0 text-[11px] font-medium text-alloy-midnight/55">{columnLabel}</span>
            :   null}
            {showColumnIcon && synthetic.adornment && synthetic.adornment.position !== "right" ?
                <LayoutRuntimeAdornmentButton
                    item={synthetic}
                    adornment={synthetic.adornment}
                    rowRecord={row}
                    onAction={onAction}
                    traceSurface="opportunity_drawer"
                />
            :   null}
            {canEdit && edit ?
                <LayoutRuntimeFieldInput
                    refKey={editableRefKey}
                    value={editValue}
                    rowKey={rowKey}
                    onChange={(v) => edit.setFieldValue(editableRefKey, v, rowKey)}
                    getDependentValue={layoutRuntimeDependentValueReader(edit.getFieldValue, rowKey)}
                />
            :   <span className={`${r.isPlaceholder ? PRESENTATION_VALUE_PLACEHOLDER : ""} ${statusClass}`.trim()}>
                    {r.isPlaceholder ? "—"
                    : col.renderHint === "status" || displayConfig.displayType === "badge" || displayConfig.displayType === "pill" ?
                        <span className={statusClass || "inline-block rounded-full border border-alloy-juniper/20 bg-alloy-juniper/8 px-2 py-0.5 text-[11px] font-medium text-alloy-midnight/90"}>
                            {formattedDisplay}
                        </span>
                    :   formattedDisplay}
                </span>
            }
            {showColumnIcon && synthetic.adornment && synthetic.adornment.position === "right" ?
                <LayoutRuntimeAdornmentButton
                    item={synthetic}
                    adornment={synthetic.adornment}
                    rowRecord={row}
                    onAction={onAction}
                    traceSurface="opportunity_drawer"
                />
            :   null}
        </span>
    );
}
