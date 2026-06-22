"use client";

import { useCallback, useState } from "react";
import type { LayoutCollectionColumn, LayoutItem } from "@/lib/layout/layoutV2";
import DrawerHouseholdChildLinkAvatar from "@/components/layout/DrawerHouseholdChildLinkAvatar";
import LayoutRuntimeChildLinkSurface from "@/components/layout/LayoutRuntimeChildLinkSurface";
import { personDrawerHouseholdInitials } from "@/lib/admin/person/personDrawerHouseholdDisplay";
import { useLayoutRuntimeDrawerEdit } from "@/components/layout/LayoutRuntimeDrawerEditProvider";
import {
    layoutRuntimeBlockAllowsFieldEdit,
    useLayoutRuntimeBlockEdit,
} from "@/components/layout/LayoutRuntimeBlockEditContext";
import type { AdornmentActionHandler } from "@/components/layout/LayoutRuntimePlanView";
import LeadEnrollmentCardMetaLines from "@/components/layout/lead/LeadEnrollmentCardMetaLines";
import LeadEnrollmentRepeaterFieldCell from "@/components/layout/lead/LeadEnrollmentRepeaterFieldCell";
import DrawerOverviewEmptyState from "@/components/layout/DrawerOverviewEmptyState";
import {
    formatLayoutRuntimeRepeaterColumnDisplay,
} from "@/lib/layout/runtime/formatLayoutRuntimeRepeaterColumnDisplay";
import { resolveLayoutCollectionColumnLinkAdornment } from "@/lib/layout/layoutEditorDisplayConfig";
import { layoutRuntimeCollectionColumnIsInlineEditable } from "@/lib/layout/runtime/layoutRuntimeFieldEditability";
import {
    readEnrollmentGridCellRole,
} from "@/lib/layout/runtime/enrollmentGridPresentation";
import { layoutRuntimeRepeaterRowReactKey } from "@/lib/layout/runtime/layoutRuntimeRepeaterRowKey";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import type { LeadEnrollmentRowTemplatePresentation } from "@/lib/layout/runtime/resolveLeadEnrollmentRowTemplatePresentation";
import { resolveChildRowTemplateRowLayout } from "@/lib/layout/runtime/resolveChildRowTemplateRowLayout";
import { PRESENTATION_DATA_VALUE_COMPACT } from "@/lib/presentation/presentationTypography";

type Props = {
    item: LayoutItem;
    columns: LayoutCollectionColumn[];
    rows: ProofRuntimeRecord[];
    anchorRecord: ProofRuntimeRecord;
    overflowFooter?: React.ReactNode;
    canMutate?: boolean;
    onAdornmentAction?: AdornmentActionHandler;
    rowTemplate?: LeadEnrollmentRowTemplatePresentation;
};

/**
 * Compact child enrollment card list — designed operational rows, not a data table.
 */
export default function LeadEnrollmentCardList({
    item,
    columns,
    rows,
    anchorRecord,
    overflowFooter,
    canMutate,
    onAdornmentAction,
    rowTemplate,
}: Props) {
    const edit = useLayoutRuntimeDrawerEdit();
    const blockEdit = useLayoutRuntimeBlockEdit();
    const blockEditingActive = Boolean(blockEdit && layoutRuntimeBlockAllowsFieldEdit(blockEdit));
    const useBlockHeaderEdit =
        blockEdit?.editMode === "edit_button" || blockEdit?.editMode === "inline_editable";
    const readFirst = !blockEditingActive;
    const showAvatar = rowTemplate?.showAvatar !== false;
    const showStatusPill = rowTemplate?.showStatusPill !== false;
    const showSecondaryMetadata = rowTemplate?.showSecondaryMetadata !== false;
    const allowEditEnrollment = rowTemplate ? rowTemplate.enabledActions.has("edit_enrollment") : true;
    const allowChildDrawer = rowTemplate ? rowTemplate.enabledActions.has("open_child_drawer") : true;
    const [editingRowKeys, setEditingRowKeys] = useState<Set<string>>(() => new Set());

    const toggleRowEdit = useCallback((rowKey: string) => {
        setEditingRowKeys((prev) => {
            const next = new Set(prev);
            if (next.has(rowKey)) next.delete(rowKey);
            else next.add(rowKey);
            return next;
        });
    }, []);

    const nameColumn = columns.find((c) => readEnrollmentGridCellRole(item, c) === "primary_link") ?? columns[0];
    const statusColumn = columns.find((c) => {
        const key = c.refKey.toLowerCase();
        return key.includes("status") || c.renderHint === "status";
    });
    const metaColumns = columns.filter((c) => c !== nameColumn && c !== statusColumn);

    const rowCanEdit = (rowKey: string, row: ProofRuntimeRecord, index: number) => {
        if (canMutate === false || !edit) return false;
        return columns.some((col) => layoutRuntimeCollectionColumnIsInlineEditable(col, "production"));
    };

    const configuredRowLayout = resolveChildRowTemplateRowLayout(item);

    return (
        <div
            className="min-w-0"
            data-lead-enrollment-card-list="true"
            data-layout-runtime-enrollment-read-mode="card-list"
            data-enrollment-row-layout={rowTemplate?.layoutMode ?? "standard"}
        >
            {rows.length === 0 ?
                <div className="p-2">
                    <DrawerOverviewEmptyState
                        message="No children linked yet."
                        hint="Add a child to capture program interest and enrollment details."
                        compact
                    />
                </div>
            :   <ul className="flex flex-col gap-2 p-2">
                    {rows.map((row, index) => {
                        const rowKey = layoutRuntimeRepeaterRowReactKey(row, index, item.source ?? item.refKey);
                        const isEditing =
                            blockEditingActive
                            || (readFirst && editingRowKeys.has(rowKey));
                        const showEdit = !useBlockHeaderEdit && !blockEditingActive && readFirst && rowCanEdit(rowKey, row, index);
                        const nameCol = nameColumn!;
                        const nameLinkAdornment = resolveLayoutCollectionColumnLinkAdornment(nameCol);
                        const nameSynthetic: LayoutItem = {
                            id: nameCol.refKey,
                            kind: "field",
                            refKey: nameCol.refKey,
                            adornment: nameLinkAdornment ?? nameCol.adornment,
                            metadata: nameCol.metadata,
                        };
                        const statusDisplay =
                            statusColumn ? formatLayoutRuntimeRepeaterColumnDisplay(row, statusColumn, { anchorRecord }) : null;
                        const childDisplayName = formatLayoutRuntimeRepeaterColumnDisplay(row, nameCol, { anchorRecord });
                        const childId = String(row["child.id"] ?? row.id ?? "").trim();
                        const childPhotoUrl = String(row["child.photo_url"] ?? row.photo_url ?? row.image_url ?? "").trim() || null;

                        const repeaterCellProps = {
                            item,
                            row,
                            rowKey,
                            anchorRecord,
                            isEditing,
                            allowChildDrawer,
                            onAdornmentAction,
                        };

                        if (configuredRowLayout) {
                            return (
                                <li
                                    key={rowKey}
                                    className="group rounded-lg border border-alloy-stone/12 bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(24,39,58,0.03)] transition-shadow hover:shadow-[0_2px_6px_rgba(24,39,58,0.06)]"
                                    data-lead-enrollment-card-row="true"
                                    data-layout-runtime-enrollment-row="true"
                                    data-child-row-template-configured="true"
                                    data-enrollment-row-editing={isEditing ? "true" : "false"}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0 flex-1 space-y-1">
                                            {configuredRowLayout.map((layoutRow) => (
                                                <div
                                                    key={layoutRow.rowIndex}
                                                    className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1"
                                                    data-child-row-template-row={layoutRow.rowIndex}
                                                >
                                                    {layoutRow.slots.map((col, slot) => {
                                                        if (!col) return null;
                                                        return (
                                                            <LeadEnrollmentRepeaterFieldCell
                                                                key={`${layoutRow.rowIndex}-${col.refKey}-${slot}`}
                                                                col={col}
                                                                {...repeaterCellProps}
                                                            />
                                                        );
                                                    })}
                                                </div>
                                            ))}
                                        </div>
                                        <div className="flex shrink-0 items-center gap-1.5">
                                            {showEdit && allowEditEnrollment ?
                                                <button
                                                    type="button"
                                                    className="rounded-md px-1.5 py-0.5 text-[10px] font-medium text-alloy-midnight/40 opacity-0 transition-opacity hover:bg-alloy-stone/10 hover:text-alloy-juniper group-hover:opacity-100 focus:opacity-100"
                                                    onClick={() => toggleRowEdit(rowKey)}
                                                    data-enrollment-row-action={isEditing ? "done" : "edit"}
                                                >
                                                    {isEditing ? "Done" : "Edit"}
                                                </button>
                                            :   null}
                                        </div>
                                    </div>
                                </li>
                            );
                        }

                        return (
                            <li
                                key={rowKey}
                                className="group rounded-lg border border-alloy-stone/12 bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(24,39,58,0.03)] transition-shadow hover:shadow-[0_2px_6px_rgba(24,39,58,0.06)]"
                                data-lead-enrollment-card-row="true"
                                data-layout-runtime-enrollment-row="true"
                                data-enrollment-row-editing={isEditing ? "true" : "false"}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex min-w-0 flex-1 items-start gap-2.5">
                                        {showAvatar ?
                                            <DrawerHouseholdChildLinkAvatar
                                                childId={childId}
                                                displayName={childDisplayName}
                                                initials={personDrawerHouseholdInitials(childDisplayName)}
                                                photoUrl={childPhotoUrl}
                                                rowRecord={row}
                                                onAdornmentAction={onAdornmentAction}
                                                componentName="LeadEnrollmentCardList"
                                            />
                                        :   null}
                                        <div className="min-w-0 flex-1">
                                            <div className="flex min-w-0 items-start justify-between gap-2">
                                                {childId && allowChildDrawer ?
                                                    <LayoutRuntimeChildLinkSurface
                                                        componentName="LeadEnrollmentCardList"
                                                        surface="drawer"
                                                        item={nameSynthetic}
                                                        rowRecord={row}
                                                        anchorRecord={anchorRecord}
                                                        adornment={nameLinkAdornment ?? nameCol.adornment}
                                                        display={childDisplayName}
                                                        onAction={onAdornmentAction}
                                                        className={`block min-w-0 truncate hover:text-alloy-juniper ${PRESENTATION_DATA_VALUE_COMPACT}`}
                                                    />
                                                :   <p className={`min-w-0 truncate ${PRESENTATION_DATA_VALUE_COMPACT}`}>
                                                        {childDisplayName}
                                                    </p>
                                                }
                                            {!isEditing && showStatusPill && statusDisplay && statusDisplay !== "—" ?
                                                <span className="shrink-0 rounded-full border border-alloy-juniper/20 bg-alloy-juniper/8 px-2 py-0.5 text-[11px] font-medium text-alloy-midnight/90">
                                                    {statusDisplay}
                                                </span>
                                            :   null}
                                        </div>
                                        {showSecondaryMetadata && metaColumns.length > 0 ?
                                            <LeadEnrollmentCardMetaLines
                                                item={item}
                                                row={row}
                                                metaColumns={metaColumns}
                                                rowKey={rowKey}
                                                anchorRecord={anchorRecord}
                                                isEditing={isEditing}
                                                allowChildDrawer={allowChildDrawer}
                                                onAdornmentAction={onAdornmentAction}
                                            />
                                        :   null}
                                        </div>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-1.5">
                                        {showEdit && allowEditEnrollment ?
                                            <button
                                                type="button"
                                                className="rounded-md px-1.5 py-0.5 text-[10px] font-medium text-alloy-midnight/40 opacity-0 transition-opacity hover:bg-alloy-stone/10 hover:text-alloy-juniper group-hover:opacity-100 focus:opacity-100"
                                                onClick={() => toggleRowEdit(rowKey)}
                                                data-enrollment-row-action={isEditing ? "done" : "edit"}
                                            >
                                                {isEditing ? "Done" : "Edit"}
                                            </button>
                                        :   null}
                                    </div>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            }
            {overflowFooter}
        </div>
    );
}
