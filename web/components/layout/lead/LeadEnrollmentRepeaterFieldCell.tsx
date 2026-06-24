"use client";

import LayoutRuntimeAdornmentButton from "@/components/layout/LayoutRuntimeAdornmentButton";
import LayoutRuntimeChildLinkSurface from "@/components/layout/LayoutRuntimeChildLinkSurface";
import { useLayoutRuntimeDrawerEdit } from "@/components/layout/LayoutRuntimeDrawerEditProvider";
import LayoutRuntimeInlineEditFieldControl from "@/components/layout/LayoutRuntimeInlineEditFieldControl";
import type { AdornmentActionHandler } from "@/components/layout/LayoutRuntimePlanView";
import type { LayoutCollectionColumn, LayoutItem } from "@/lib/layout/layoutV2";
import {
    readLayoutEditorDisplayConfig,
    resolveLayoutCollectionColumnLinkAdornment,
    resolveLayoutCollectionColumnShowIcon,
    typographyIntentClass,
} from "@/lib/layout/layoutEditorDisplayConfig";
import { formatLayoutRuntimeRepeaterColumnDisplay } from "@/lib/layout/runtime/formatLayoutRuntimeRepeaterColumnDisplay";
import {
    shouldShowLayoutEditorFieldLabel,
    layoutEditorStatusFormatClass,
} from "@/lib/layout/runtime/applyLayoutEditorFieldDisplay";
import { layoutRuntimeCollectionColumnIsInlineEditable } from "@/lib/layout/runtime/layoutRuntimeFieldEditability";
import { readEnrollmentGridCellRole } from "@/lib/layout/runtime/enrollmentGridPresentation";
import { layoutRuntimeEnrollmentPlacementDependentValueReader } from "@/lib/layout/runtime/resolveLayoutRuntimeEnrollmentPlacementContext";
import { isLayoutRuntimeChildLinkColumn } from "@/lib/layout/runtime/layoutRuntimeLinkHarness";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import {
    PRESENTATION_DATA_VALUE_COMPACT,
    PRESENTATION_LABEL_INLINE,
    PRESENTATION_VALUE_PLACEHOLDER,
} from "@/lib/presentation/presentationTypography";

type Props = {
    item: LayoutItem;
    col: LayoutCollectionColumn;
    row: ProofRuntimeRecord;
    rowKey: string;
    anchorRecord: ProofRuntimeRecord;
    isEditing: boolean;
    allowChildDrawer?: boolean;
    onAdornmentAction?: AdornmentActionHandler;
};

/** Inline label + value (or in-place control) — same layout in display and edit. */
export default function LeadEnrollmentRepeaterFieldCell({
    item,
    col,
    row,
    rowKey,
    anchorRecord,
    isEditing,
    allowChildDrawer = true,
    onAdornmentAction,
}: Props) {
    const edit = useLayoutRuntimeDrawerEdit();
    const displayConfig = readLayoutEditorDisplayConfig(col);
    const columnAdornment = resolveLayoutCollectionColumnLinkAdornment(col);
    const showColumnIcon = resolveLayoutCollectionColumnShowIcon(col);
    const showLabel = shouldShowLayoutEditorFieldLabel(displayConfig);
    const label = showLabel ?
        col.label?.trim() || col.refKey.split(".").pop()?.replace(/_/g, " ") || col.refKey
    :   "";
    const display = formatLayoutRuntimeRepeaterColumnDisplay(row, col, { anchorRecord });
    const isPlaceholder = display === "—";
    const key = col.refKey.toLowerCase();
    const showInlineEdit =
        isEditing
        && layoutRuntimeCollectionColumnIsInlineEditable(col, "production")
        && Boolean(edit);
    const typographyClass = typographyIntentClass(displayConfig.typographyIntent);
    const statusClass = layoutEditorStatusFormatClass(displayConfig, col.renderHint);
    const synthetic: LayoutItem = {
        id: col.refKey,
        kind: "field",
        refKey: col.refKey,
        renderHint: col.renderHint,
        adornment: columnAdornment ?? col.adornment,
        metadata: col.metadata,
    };

    const valueNode = (() => {
        if (showInlineEdit && edit) {
            return (
                <LayoutRuntimeInlineEditFieldControl
                    refKey={col.refKey}
                    value={edit.getFieldValue(col.refKey, display, rowKey)}
                    rowKey={rowKey}
                    onChange={(v) => edit.setFieldValue(col.refKey, v, rowKey)}
                    getDependentValue={layoutRuntimeEnrollmentPlacementDependentValueReader(
                        row,
                        anchorRecord,
                        edit.getFieldValue,
                        rowKey,
                    )}
                    variant="inline-cell"
                />
            );
        }

        if (isPlaceholder) {
            return <span className={PRESENTATION_VALUE_PLACEHOLDER}>—</span>;
        }

        if (key.includes("status") || col.renderHint === "status") {
            return (
                <span className={statusClass || "inline-flex items-center rounded-full border border-alloy-juniper/20 bg-alloy-juniper/8 px-2 py-0.5 text-[11px] font-medium text-alloy-midnight/90"}>
                    {display}
                </span>
            );
        }

        const useLinkSurface =
            readEnrollmentGridCellRole(item, col) === "primary_link"
            || isLayoutRuntimeChildLinkColumn(col.refKey)
            || displayConfig.linkBehavior === "open_drawer"
            || displayConfig.linkBehavior === "open_record";

        if (useLinkSurface) {
            const childId = String(row["child.id"] ?? row.id ?? "").trim();
            const linkAdornment = columnAdornment ?? col.adornment;
            if (childId && allowChildDrawer) {
                return (
                    <LayoutRuntimeChildLinkSurface
                        componentName="LeadEnrollmentRepeaterFieldCell"
                        surface="drawer"
                        item={synthetic}
                        rowRecord={row}
                        anchorRecord={anchorRecord}
                        adornment={linkAdornment}
                        display={display}
                        onAction={onAdornmentAction}
                        className={`min-w-0 hover:text-alloy-juniper ${PRESENTATION_DATA_VALUE_COMPACT} ${typographyClass}`.trim()}
                    />
                );
            }
        }

        return <span className={`${PRESENTATION_DATA_VALUE_COMPACT} ${typographyClass}`.trim()}>{display}</span>;
    })();

    return (
        <span
            className="inline-flex min-w-0 max-w-full flex-wrap items-baseline gap-x-1"
            data-enrollment-inline-field="true"
            data-enrollment-field-editing={showInlineEdit ? "true" : "false"}
            data-layout-runtime-ref-key={col.refKey}
        >
            {showColumnIcon && synthetic.adornment && synthetic.adornment.position !== "right" ?
                <LayoutRuntimeAdornmentButton
                    item={synthetic}
                    adornment={synthetic.adornment}
                    rowRecord={row}
                    onAction={onAdornmentAction}
                    traceSurface="opportunity_drawer"
                />
            :   null}
            {label ?
                <span className={`shrink-0 ${PRESENTATION_LABEL_INLINE}`}>{label}</span>
            :   null}
            <span className="min-w-0">{valueNode}</span>
        </span>
    );
}
