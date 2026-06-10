"use client";

/**
 * Layout runtime plan proof renderer (Phase 2).
 *
 * Renders Resolved LayoutDoc + LayoutRuntimePlan for opportunity drawer proof.
 * Binding-aware: relationship/reference handles, computed read-only fields,
 * repeaters, widgets. NOT wired to AdminEntityDrawer or VM.
 */

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, CheckSquare2, HeartPulse, MessageSquare } from "lucide-react";
import {
    LAYOUT_GRID_COLUMNS,
    type LayoutCollectionColumn,
    type LayoutColumn,
    type LayoutDoc,
    type LayoutFieldAdornment,
    type LayoutItem,
    type LayoutRow,
    type LayoutSection,
} from "@/lib/layout/layoutV2";
import { resolveItemValue } from "@/lib/layout/resolveItemValue";
import { buildLayoutRuntimePlan, type LayoutRuntimePlan } from "@/lib/layout/runtime/layoutRuntimePlan";
import { classifyLayoutItemBinding } from "@/lib/layout/runtime/classifyLayoutItemBinding";
import {
    resolveProofBindingValue,
    shouldRenderProofItem,
    type ProofBindingResolution,
} from "@/lib/layout/runtime/resolveProofBindingValue";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import { readLayoutRuntimeRepeaterRows } from "@/lib/layout/runtime/readLayoutRuntimeRepeaterRows";
import { logLayoutRuntimeChildrenRenderDebug } from "@/lib/layout/runtime/logLayoutRuntimeChildrenRenderDebug";
import { isOpaqueIdValue } from "@/lib/layout/runtime/proofRecordContext";
import { resolveLayoutRuntimeRepeaterFieldValue } from "@/lib/layout/runtime/resolveLayoutRuntimeRepeaterFieldValue";
import { FUTURE_MODULE_METADATA_KEY } from "@/lib/layout/runtime/proofLayoutHelpers";
import { isLayoutItemSupportedForProduction } from "@/lib/layout/runtime/isLayoutItemSupportedForProduction";
import { evaluateLayoutCondition } from "@/lib/layout/runtime/evaluateLayoutCondition";
import { resolveLayoutRuntimeWidgetKey } from "@/lib/layout/runtime/resolveLayoutRuntimeWidgetKey";
import { DrawerHeaderAttentionBlock } from "@/components/admin/drawer/DrawerHeaderAttentionBlock";
import { isDrawerHeaderAttentionVisible } from "@/lib/admin/drawer/drawerHeaderAttentionPresentation";
import LayoutRuntimeTasksWidget from "@/components/layout/LayoutRuntimeTasksWidget";
import LayoutRuntimeChildrenListWidget from "@/components/layout/LayoutRuntimeChildrenListWidget";
import LayoutRuntimeChildrenEmptyState from "@/components/layout/LayoutRuntimeChildrenEmptyState";
import { useLayoutRuntimeDrawerEdit } from "@/components/layout/LayoutRuntimeDrawerEditProvider";
import LayoutRuntimeFieldInput, {
    layoutRuntimeDependentValueReader,
} from "@/components/layout/LayoutRuntimeFieldInput";
import { layoutRuntimeFieldIsEditable } from "@/lib/layout/runtime/layoutRuntimeFieldEditability";
import LayoutRuntimeAdornmentButton from "@/components/layout/LayoutRuntimeAdornmentButton";
import LayoutRuntimeChildLinkSurface from "@/components/layout/LayoutRuntimeChildLinkSurface";
import LayoutRuntimeEnrollmentGrid from "@/components/layout/LayoutRuntimeEnrollmentGrid";
import LeadEnrollmentHealthSummaryCard from "@/components/layout/lead/LeadEnrollmentHealthSummaryCard";
import LeadEnrollmentCardList from "@/components/layout/lead/LeadEnrollmentCardList";
import PersonConnectedChildrenCardList from "@/components/layout/person/PersonConnectedChildrenCardList";
import PersonRelatedPeopleGroupsWidget from "@/components/layout/person/PersonRelatedPeopleGroupsWidget";
import LeadHouseholdContactsWidget from "@/components/layout/lead/LeadHouseholdContactsWidget";
import LeadLastTouchSummaryCard from "@/components/layout/lead/LeadLastTouchSummaryCard";
import LeadOperatingAttentionSummaryCard from "@/components/layout/lead/LeadOperatingAttentionSummaryCard";
import LeadActivityPreview from "@/components/layout/lead/LeadActivityPreview";
import LeadOperatingSummaryCard from "@/components/layout/lead/LeadOperatingSummaryCard";
import PersonActivityPreview from "@/components/layout/person/PersonActivityPreview";
import { PersonConnectedChildrenSummaryCardShell } from "@/components/layout/person/PersonConnectedChildrenSummaryCard";
import { PersonHouseholdSummaryCardShell } from "@/components/layout/person/PersonHouseholdSummaryCard";
import { PersonLastTouchSummaryCardShell } from "@/components/layout/person/PersonLastTouchSummaryCard";
import { ChildDocumentsRequirementsSummaryCardShell } from "@/components/layout/child/ChildDocumentsRequirementsSummaryCard";
import { ChildFamilySummaryCardShell } from "@/components/layout/child/ChildFamilySummaryCard";
import ChildFamilyMembersCardList from "@/components/layout/child/ChildFamilyMembersCardList";
import { ChildLastTouchSummaryCardShell } from "@/components/layout/child/ChildLastTouchSummaryCard";
import { ChildProgramEnrollmentSummaryCardShell } from "@/components/layout/child/ChildProgramEnrollmentSummaryCard";
import LayoutRuntimeNotesCommunicationWidget, {
    layoutRuntimeCommunicationWidgetHasContent,
    layoutRuntimeNotesWidgetHasContent,
} from "@/components/layout/LayoutRuntimeNotesCommunicationWidget";
import LayoutRuntimeDocumentsOverviewWidget from "@/components/layout/LayoutRuntimeDocumentsOverviewWidget";
import LayoutRuntimeLinkDebugModeBanner from "@/components/layout/LayoutRuntimeLinkDebugModeBanner";
import { useLayoutRuntimeDrawerHost } from "@/lib/layout/runtime/layoutRuntimeDrawerHostContext";
import { logChildLinkInstrumentationMounted } from "@/lib/layout/runtime/childLinkBrowserTrace";
import { isLayoutRuntimeChildLinkColumn } from "@/lib/layout/runtime/layoutRuntimeLinkHarness";
import {
    layoutRepeaterColumnHeaderLabel,
    layoutRepeaterColumnWidthStyle,
} from "@/lib/layout/runtime/layoutRepeaterColumnLayout";
import { layoutRuntimeRepeaterRowReactKey } from "@/lib/layout/runtime/layoutRuntimeRepeaterRowKey";
import { useLayoutRuntimeCompositionHints } from "@/lib/layout/runtime/layoutRuntimeCompositionContext";
import {
    filterRelatedListColumnsForComposition as filterLeadRelatedListColumnsForComposition,
    LEAD_COMPOSITION_SECTION_EYEBROWS,
} from "@/lib/layout/runtime/leadOverviewComposition";
import {
    filterRelatedListColumnsForComposition as filterPersonRelatedListColumnsForComposition,
    PERSON_COMPOSITION_SECTION_EYEBROWS,
} from "@/lib/layout/runtime/personOverviewComposition";
import {
    filterRelatedListColumnsForComposition as filterChildRelatedListColumnsForComposition,
    CHILD_COMPOSITION_SECTION_EYEBROWS,
} from "@/lib/layout/runtime/childOverviewComposition";
import { resolveLeadSummaryLastTouch } from "@/lib/layout/runtime/resolveLeadSummaryLastTouch";
import { resolveLeadActivityPreview } from "@/lib/layout/runtime/resolveLeadActivityPreview";
import { resolvePersonActivityPreview } from "@/lib/layout/runtime/resolvePersonActivityPreview";
import { resolveChildActivityPreview } from "@/lib/layout/runtime/resolveChildActivityPreview";
import { shouldRenderLayoutRuntimeSection } from "@/lib/layout/runtime/resolveLayoutRuntimeSectionVisibility";
import {
    scrollToLeadEnrollmentSection,
    summarizeLeadDrawerEnrollmentHealth,
} from "@/lib/layout/runtime/summarizeLeadDrawerEnrollmentHealth";
import {
    LAYOUT_RUNTIME_BODY_SECTION_HEADER,
    LAYOUT_RUNTIME_BODY_SECTION_SURFACE,
    LAYOUT_RUNTIME_COMPOSITION_SECTION_EYEBROW,
    LAYOUT_RUNTIME_COMPOSITION_SECTION_HEADER,
    LAYOUT_RUNTIME_COMPOSITION_SECTION_TITLE,
    LAYOUT_RUNTIME_COMPOSITION_ENROLLMENT_BODY,
    LAYOUT_RUNTIME_COMPOSITION_SECTION_BODY,
    LAYOUT_RUNTIME_COMPOSITION_SECTION_SURFACE,
    LAYOUT_RUNTIME_SUMMARY_WIDGET_MINIMIZED,
    LAYOUT_RUNTIME_FIELD_READ_SURFACE,
    LAYOUT_RUNTIME_FIELD_SURFACE,
    LAYOUT_RUNTIME_GROUP_READ_SURFACE,
    LAYOUT_RUNTIME_GROUP_SURFACE,
    LAYOUT_RUNTIME_MUTED,
    LAYOUT_RUNTIME_PANEL_HEADER,
    LAYOUT_RUNTIME_PANEL_SURFACE,
    LAYOUT_RUNTIME_PRIMARY_WORKSPACE_HEADER,
    LAYOUT_RUNTIME_PRIMARY_WORKSPACE_SECTION,
    LAYOUT_RUNTIME_SECTION_HEADER,
    LAYOUT_RUNTIME_SECTION_SURFACE,
    LAYOUT_RUNTIME_SUMMARY_WIDGET_BODY,
    LAYOUT_RUNTIME_SUMMARY_WIDGET_HEADER,
    LAYOUT_RUNTIME_SUMMARY_WIDGET_SURFACE,
    LAYOUT_RUNTIME_TEXT,
    LAYOUT_RUNTIME_WORK_RAIL,
} from "@/lib/layout/runtime/layoutRuntimeSurfaceStyles";

import {
    PRESENTATION_DATA_VALUE,
    PRESENTATION_DATA_VALUE_GRID,
    PRESENTATION_LABEL,
    PRESENTATION_VALUE_PLACEHOLDER,
} from "@/lib/presentation/presentationTypography";

const TEXT = LAYOUT_RUNTIME_TEXT;
const MUTED = LAYOUT_RUNTIME_MUTED;
const BORDER = "#e2e6ec";

const CHILDREN_REPEATER_KEYS = new Set([
    "children",
    "enrollment_children",
    "inquiry_children",
    "_inquiry_children",
    "household_children",
    "_household_children",
]);

type LayoutRuntimeHostContextValue = {
    entityId?: string;
    canMutate?: boolean;
    anchorEntity?: string;
};

const LayoutRuntimeHostContext = createContext<LayoutRuntimeHostContextValue>({});

function isLayoutRuntimeChildrenRepeater(item: LayoutItem): boolean {
    const keys = [item.source, item.refKey].filter(Boolean).map(String);
    return keys.some((key) => CHILDREN_REPEATER_KEYS.has(key));
}

export type AdornmentActionHandler = (
    item: LayoutItem,
    adornment: LayoutFieldAdornment,
    rowRecord?: ProofRuntimeRecord,
) => void;
const AdornmentActionContext = createContext<AdornmentActionHandler | undefined>(undefined);
const LayoutRuntimeVariantContext = createContext<"proof" | "production" | "preview">("proof");

type LayoutRuntimeSectionContextValue = {
    sectionPresentation: LayoutRuntimeSectionPresentation;
    sectionKey: string;
    stackRows?: boolean;
};

const LayoutRuntimeSectionContext = createContext<LayoutRuntimeSectionContextValue>({
    sectionPresentation: "default",
    sectionKey: "",
});

function useLayoutRuntimeOperatorSurfaces(): boolean {
    const variant = useContext(LayoutRuntimeVariantContext);
    return variant === "production" || variant === "preview";
}

function useLayoutRuntimeSummaryStrip(): boolean {
    return useContext(LayoutRuntimeSectionContext).sectionPresentation === "summary_strip";
}

const INTERNAL_OPERATOR_TOKENS =
    /\b(inquiry_child|customer_member|ocm_id|child_inquiry)\b|^[0-9a-f-]{36}$/i;

function sanitizeOperatorDisplay(display: string | null | undefined): string | null {
    if (display == null) return null;
    const text = String(display).trim();
    if (!text || isOpaqueIdValue(text) || INTERNAL_OPERATOR_TOKENS.test(text)) return null;
    return text;
}

function operatorLabel(item: LayoutItem, variant: "proof" | "production" | "preview"): string {
    const label = item.label?.trim() || item.refKey || "";
    if (variant === "production" || variant === "preview") return label;
    return item.label || item.refKey;
}

function Adorn({ item, rowRecord }: { item: LayoutItem; rowRecord?: ProofRuntimeRecord }) {
    const onAction = useContext(AdornmentActionContext);
    const ad = item.adornment;
    if (!ad) return null;
    return (
        <LayoutRuntimeAdornmentButton
            item={item}
            adornment={ad}
            rowRecord={rowRecord}
            onAction={onAction}
            traceSurface="opportunity_drawer"
        />
    );
}

function BindingBadge({ resolution }: { resolution: ProofBindingResolution }) {
    if (resolution.isComputed) {
        return (
            <span className="ml-1 rounded bg-[#f4f3ff] px-1 text-[9px] text-[#5925dc]" title="Lifecycle-owned computed projection">
                computed
            </span>
        );
    }
    if (resolution.bindingClass === "relationship_field" || resolution.bindingClass === "reference_field") {
        return (
            <span className="ml-1 rounded bg-[#eff8ff] px-1 text-[9px] text-[#175cd3]" title="Related record">
                relation
            </span>
        );
    }
    return null;
}

function ValueCell({
    record,
    item,
    anchorEntity,
}: {
    record: ProofRuntimeRecord;
    item: LayoutItem;
    anchorEntity: string;
}) {
    const variant = useContext(LayoutRuntimeVariantContext);
    const operatorSurfaces = useLayoutRuntimeOperatorSurfaces();
    const edit = useLayoutRuntimeDrawerEdit();
    const binding = classifyLayoutItemBinding(item, anchorEntity);
    const r = resolveProofBindingValue(record, item, anchorEntity, binding);
    const label = operatorLabel(item, variant);
    const display =
        variant === "production" || variant === "preview" ?
            sanitizeOperatorDisplay(r.isPlaceholder ? null : r.display)
        :   r.display;
    const refKey = item.refKey ?? "";
    const canEdit =
        layoutRuntimeFieldIsEditable(item, variant) &&
        Boolean(edit);
    const editValue = canEdit && edit ? edit.getFieldValue(refKey, display ?? "") : display ?? "";

    return (
        <div className={operatorSurfaces ? LAYOUT_RUNTIME_FIELD_READ_SURFACE : LAYOUT_RUNTIME_FIELD_SURFACE}>
            {label ?
                <div
                    className={`flex flex-wrap items-center gap-1 ${operatorSurfaces ? PRESENTATION_LABEL : "text-[11px] font-medium"}`}
                    style={operatorSurfaces ? undefined : { color: MUTED }}
                >
                    {label}
                    {variant === "proof" ? <BindingBadge resolution={r} /> : null}
                    {variant === "proof" && r.relationHandle ?
                        <span className="truncate text-[10px] font-normal text-[#5c6478]" title="Related entity handle">
                            · {r.relationHandle}
                        </span>
                    :   null}
                </div>
            :   null}
            <div className={`mt-0.5 flex items-center gap-1 ${operatorSurfaces ? PRESENTATION_DATA_VALUE : "text-sm"}`}>
                {item.adornment && item.adornment.position !== "right" ? <Adorn item={item} /> : null}
                {canEdit && edit ?
                    <LayoutRuntimeFieldInput
                        refKey={refKey}
                        value={editValue}
                        onChange={(v) => edit.setFieldValue(refKey, v)}
                        getDependentValue={layoutRuntimeDependentValueReader(edit.getFieldValue)}
                    />
                :   <span className={!display ? PRESENTATION_VALUE_PLACEHOLDER : undefined}>
                        {!display ?
                            <span title={variant === "proof" ? (r.reason ?? "Value unavailable") : undefined}>—</span>
                        : r.renderHint === "status" ?
                            <span className="inline-block rounded-full border border-alloy-juniper/20 bg-alloy-juniper/8 px-2 py-0.5 text-xs font-medium text-alloy-midnight/90">{display}</span>
                        :   display}
                    </span>
                }
                {item.adornment && item.adornment.position === "right" ? <Adorn item={item} /> : null}
            </div>
        </div>
    );
}

function GroupCell({ record, item, anchorEntity }: { record: ProofRuntimeRecord; item: LayoutItem; anchorEntity: string }) {
    const variant = useContext(LayoutRuntimeVariantContext);
    const operatorSurfaces = useLayoutRuntimeOperatorSurfaces();
    const hasSubgrid = Array.isArray(item.rows) && item.rows.length > 0;
    const title = operatorLabel(item, variant);
    return (
        <div className={operatorSurfaces ? LAYOUT_RUNTIME_GROUP_READ_SURFACE : LAYOUT_RUNTIME_GROUP_SURFACE}>
            {title ?
                <div
                    className={`${operatorSurfaces ? "text-[10px] uppercase tracking-[0.08em] text-alloy-midnight/50" : "mb-1.5 text-[11px] font-semibold uppercase tracking-wide"}`}
                    style={operatorSurfaces ? undefined : { color: MUTED }}
                >
                    {title}
                </div>
            :   null}
            {hasSubgrid ? (
                <div className="flex flex-col gap-2">
                    {item.rows!.map((row) => (
                        <RowView key={row.id} record={record} row={row} anchorEntity={anchorEntity} />
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-2 gap-2">
                    {(item.items ?? []).map((child) => (
                        <ValueCell key={child.id} record={record} item={child} anchorEntity={anchorEntity} />
                    ))}
                </div>
            )}
        </div>
    );
}

function RepeaterCellContent({
    row,
    col,
    rowKey,
    anchorRecord,
}: {
    row: ProofRuntimeRecord;
    col: LayoutCollectionColumn;
    rowKey: string;
    anchorRecord?: ProofRuntimeRecord;
}) {
    const variant = useContext(LayoutRuntimeVariantContext);
    const edit = useLayoutRuntimeDrawerEdit();
    const onAction = useContext(AdornmentActionContext);
    const synthetic: LayoutItem = {
        id: col.refKey,
        kind: "field",
        refKey: col.refKey,
        renderHint: col.renderHint,
        adornment: col.adornment,
        editable: col.editable,
    };
    const r = resolveLayoutRuntimeRepeaterFieldValue(row, col.refKey, {
        renderHint: col.renderHint,
        template: col.template,
    });
    const canEdit = layoutRuntimeFieldIsEditable(synthetic, variant) && Boolean(edit);
    const editValue =
        canEdit && edit ? edit.getFieldValue(col.refKey, r.display ?? "", rowKey) : r.display ?? "";
    if (isLayoutRuntimeChildLinkColumn(col.refKey) && !canEdit) {
        return (
            <LayoutRuntimeChildLinkSurface
                componentName="LayoutRuntimePlanView/RepeaterCellContent"
                surface="drawer"
                item={synthetic}
                rowRecord={row}
                anchorRecord={anchorRecord}
                adornment={col.adornment}
                display={
                    r.isPlaceholder ? "—"
                    : col.renderHint === "status" ?
                        <span className="inline-block rounded-full border border-alloy-juniper/20 bg-alloy-juniper/8 px-2 py-0.5 text-[11px] text-alloy-midnight/85">{r.display}</span>
                    :   r.display
                }
                onAction={onAction}
                className="inline-flex min-w-0 items-center gap-1.5 rounded px-0.5 text-sm leading-snug text-left hover:bg-[#eef3fb]"
            />
        );
    }

    return (
        <span className={`inline-flex items-center gap-1.5 ${PRESENTATION_DATA_VALUE_GRID}`}>
            {col.adornment && col.adornment.position !== "right" ?
                <Adorn item={synthetic} rowRecord={row} />
            :   null}
            {canEdit && edit ?
                <LayoutRuntimeFieldInput
                    refKey={col.refKey}
                    value={editValue}
                    rowKey={rowKey}
                    onChange={(v) => edit.setFieldValue(col.refKey, v, rowKey)}
                    getDependentValue={layoutRuntimeDependentValueReader(edit.getFieldValue, rowKey)}
                />
            :   <span className={r.isPlaceholder ? PRESENTATION_VALUE_PLACEHOLDER : undefined}>
                    {r.isPlaceholder ? "—" : col.renderHint === "status" ?
                        <span className="inline-block rounded-full border border-alloy-juniper/20 bg-alloy-juniper/8 px-2 py-0.5 text-[11px] font-medium text-alloy-midnight/90">{r.display}</span>
                    :   r.display}
                </span>
            }
            {col.adornment && col.adornment.position === "right" ?
                <Adorn item={synthetic} rowRecord={row} />
            :   null}
        </span>
    );
}

function RelatedCell({ record, item, anchorEntity }: { record: ProofRuntimeRecord; item: LayoutItem; anchorEntity: string }) {
    const variant = useContext(LayoutRuntimeVariantContext);
    const operatorSurfaces = useLayoutRuntimeOperatorSurfaces();
    const { sectionKey } = useContext(LayoutRuntimeSectionContext);
    const host = useContext(LayoutRuntimeHostContext);
    const onAdornmentAction = useContext(AdornmentActionContext);
    const [enrollmentExpanded, setEnrollmentExpanded] = useState(false);
    // A configured collection (any displayMode — table/rows/list) renders its rows
    // whenever it has columns. This matches isLayoutItemSupportedForProduction
    // (which accepts table|rows) so a configured children list is never counted
    // as supported yet silently dropped in production.
    const hasColumns = Array.isArray(item.columns) && item.columns.length > 0;

    if (!hasColumns) {
        if (variant === "production") return null;
        return (
            <div className="rounded-md border border-dashed border-[#d5dae3] bg-[#fafbfc] px-2.5 py-2 text-xs text-[#9aa4bf]">
                Repeater preview unavailable
            </div>
        );
    }

    const composition = useLayoutRuntimeCompositionHints();
    const columns = item.columns as LayoutCollectionColumn[];
    const allRows = readLayoutRuntimeRepeaterRows(record, item);
    const title = operatorLabel(item, variant);
    const isChildrenRepeater = isLayoutRuntimeChildrenRepeater(item);
    const maxEnrollmentRows =
        composition.enrollmentMaxVisibleRows != null && composition.enrollmentMaxVisibleRows > 0 ?
            composition.enrollmentMaxVisibleRows
        :   null;
    const maxConnectedChildrenRows =
        composition.connectedChildrenMaxVisibleRows != null && composition.connectedChildrenMaxVisibleRows > 0 ?
            composition.connectedChildrenMaxVisibleRows
        :   null;
    const maxFamilyRows =
        composition.familyMaxVisibleRows != null && composition.familyMaxVisibleRows > 0 ?
            composition.familyMaxVisibleRows
        :   null;
    useEffect(() => {
        if (!isChildrenRepeater) return;
        logChildLinkInstrumentationMounted("LayoutRuntimePlanView/RelatedCell", {
            surface: "drawer",
            rowCount: allRows.length,
            columnRefKeys: columns.map((c) => c.refKey),
        });
    }, [columns, isChildrenRepeater, allRows.length]);
    if (isChildrenRepeater) {
        logLayoutRuntimeChildrenRenderDebug(
            "drawer",
            record,
            item,
            columns.map((c) => c.refKey),
        );
    }
    const isOpportunityAnchor =
        host.anchorEntity === "opportunities" || host.anchorEntity === "opportunity";
    const showChildrenEmpty =
        variant === "production" &&
        allRows.length === 0 &&
        isChildrenRepeater &&
        isOpportunityAnchor &&
        Boolean(host.entityId);

    const useEnrollmentReadTable =
        operatorSurfaces &&
        isChildrenRepeater &&
        sectionKey === "children_enrollment" &&
        (item.displayMode ?? "table") === "table";
    const usePersonConnectedChildrenTable =
        operatorSurfaces &&
        isChildrenRepeater &&
        sectionKey === "connected_children" &&
        composition.personOverviewComposition &&
        (item.displayMode ?? "table") === "table";
    const useChildFamilyTable =
        operatorSurfaces &&
        isChildrenRepeater &&
        sectionKey === "family_relationships" &&
        composition.childOverviewComposition &&
        (item.displayMode ?? "table") === "table";
    const filterColumnsForComposition = composition.childOverviewComposition ?
        filterChildRelatedListColumnsForComposition
    : composition.personOverviewComposition ?
        filterPersonRelatedListColumnsForComposition
    :   filterLeadRelatedListColumnsForComposition;
    const visibleColumns = filterColumnsForComposition(
        columns,
        item,
        Boolean(
            (useEnrollmentReadTable &&
                composition.enrollmentPrimaryColumnsOnly &&
                !composition.leadEnrollmentCardList)
            || (usePersonConnectedChildrenTable && composition.connectedChildrenPrimaryColumnsOnly)
            || (useChildFamilyTable && composition.familyPrimaryColumnsOnly),
        ),
    );
    const hideInnerHeader = useEnrollmentReadTable || usePersonConnectedChildrenTable || useChildFamilyTable;
    const rowLimit =
        useEnrollmentReadTable && maxEnrollmentRows != null && !enrollmentExpanded ? maxEnrollmentRows
        : usePersonConnectedChildrenTable && maxConnectedChildrenRows != null && !enrollmentExpanded ?
            maxConnectedChildrenRows
        : useChildFamilyTable && maxFamilyRows != null && !enrollmentExpanded ?
            maxFamilyRows
        :   null;
    const rows = rowLimit != null ? allRows.slice(0, rowLimit) : allRows;
    const enrollmentOverflow =
        useEnrollmentReadTable && maxEnrollmentRows != null && allRows.length > maxEnrollmentRows && !enrollmentExpanded ?
            allRows.length - maxEnrollmentRows
        :   0;
    const connectedChildrenOverflow =
        usePersonConnectedChildrenTable
        && maxConnectedChildrenRows != null
        && allRows.length > maxConnectedChildrenRows
        && !enrollmentExpanded ?
            allRows.length - maxConnectedChildrenRows
        :   0;

    const scrollToEnrollmentSection = scrollToLeadEnrollmentSection;

    const enrollmentOverflowFooter =
        enrollmentOverflow > 0 ?
            <button
                type="button"
                className="w-full border-t border-alloy-stone/10 px-4 py-2.5 text-left text-[11px] font-medium text-alloy-juniper hover:bg-alloy-juniper/[0.04]"
                data-lead-enrollment-view-all="true"
                data-lead-overview-enrollment-overflow="true"
                onClick={() => {
                    setEnrollmentExpanded(true);
                    requestAnimationFrame(scrollToEnrollmentSection);
                }}
            >
                +{enrollmentOverflow} more · View all children
            </button>
        :   null;

    const connectedChildrenOverflowFooter =
        connectedChildrenOverflow > 0 ?
            <button
                type="button"
                className="w-full border-t border-alloy-stone/10 px-4 py-2.5 text-left text-[11px] font-medium text-[#0d9488] hover:bg-[#0d9488]/[0.04]"
                data-person-connected-children-view-all="true"
                onClick={() => setEnrollmentExpanded(true)}
            >
                +{connectedChildrenOverflow} more · View all children
            </button>
        :   null;

    const binding = classifyLayoutItemBinding(item, anchorEntity);

    const enrollmentGridMarkup = composition.leadEnrollmentCardList ?
        <LeadEnrollmentCardList
            item={item}
            columns={visibleColumns}
            rows={rows}
            anchorRecord={record}
            overflowFooter={enrollmentOverflowFooter}
            canMutate={host.canMutate}
            onAdornmentAction={onAdornmentAction}
        />
    :   <LayoutRuntimeEnrollmentGrid
            item={item}
            columns={visibleColumns}
            rows={rows}
            anchorRecord={record}
            overflowFooter={enrollmentOverflowFooter}
            canMutate={host.canMutate}
            onAdornmentAction={onAdornmentAction}
        />;

    const legacyTableMarkup = (
        <div className="overflow-x-auto">
            <table className="min-w-[640px] w-full table-fixed text-left text-xs">
                <thead>
                    <tr className="border-b border-admin-border" style={{ color: MUTED }}>
                        {visibleColumns.map((c) => (
                            <th
                                key={c.refKey}
                                className="px-2 py-1.5 font-semibold"
                                style={layoutRepeaterColumnWidthStyle(c, visibleColumns)}
                            >
                                {layoutRepeaterColumnHeaderLabel(c)}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.length === 0 ?
                        <tr>
                            <td colSpan={visibleColumns.length} className="px-3 py-4 text-alloy-muted">
                                {variant === "production" ?
                                    sectionKey === "family_relationships" ?
                                        "No linked family members yet."
                                    :   "No children linked yet."
                                :   "No rows in proof context."}
                            </td>
                        </tr>
                    :   rows.map((rw, i) => {
                            const rowKey = layoutRuntimeRepeaterRowReactKey(rw, i, item.source ?? item.refKey);
                            return (
                                <tr
                                    key={rowKey}
                                    className="border-b border-alloy-stone/80 hover:bg-[#fafbfc]"
                                    data-layout-runtime-enrollment-row="true"
                                >
                                    {visibleColumns.map((c) => (
                                        <td
                                            key={c.refKey}
                                            className="px-2.5 py-2.5 align-middle"
                                            style={{ ...layoutRepeaterColumnWidthStyle(c, visibleColumns), color: TEXT }}
                                        >
                                            <RepeaterCellContent row={rw} col={c} rowKey={rowKey} anchorRecord={record} />
                                        </td>
                                    ))}
                                </tr>
                            );
                        })
                    }
                </tbody>
            </table>
        </div>
    );

    const personConnectedChildrenMarkup = composition.personConnectedChildrenCardList ?
        <PersonConnectedChildrenCardList
            item={item}
            columns={visibleColumns}
            rows={rows}
            anchorRecord={record}
            overflowFooter={connectedChildrenOverflowFooter}
            onAdornmentAction={onAdornmentAction}
        />
    :   legacyTableMarkup;

    const childFamilyMarkup = composition.childFamilyCardList ?
        <ChildFamilyMembersCardList
            item={item}
            columns={visibleColumns}
            rows={rows}
            anchorRecord={record}
            overflowFooter={undefined}
            onAdornmentAction={onAdornmentAction}
        />
    :   legacyTableMarkup;

    const collectionMarkup =
        useEnrollmentReadTable ? enrollmentGridMarkup
        : usePersonConnectedChildrenTable ? personConnectedChildrenMarkup
        : useChildFamilyTable ? childFamilyMarkup
        : legacyTableMarkup;

    if (useEnrollmentReadTable || usePersonConnectedChildrenTable || useChildFamilyTable) {
        return (
            <>
                {isChildrenRepeater ? <LayoutRuntimeLinkDebugModeBanner /> : null}
                {showChildrenEmpty ?
                    <LayoutRuntimeChildrenEmptyState
                        opportunityId={host.entityId ?? ""}
                        canMutate={host.canMutate}
                    />
                :   collectionMarkup}
            </>
        );
    }

    return (
        <div className={`${LAYOUT_RUNTIME_PANEL_SURFACE} ${isChildrenRepeater ? LAYOUT_RUNTIME_WORK_RAIL : ""}`}>
            {isChildrenRepeater ? <LayoutRuntimeLinkDebugModeBanner /> : null}
            {!hideInnerHeader ?
                <div className={LAYOUT_RUNTIME_PANEL_HEADER}>
                    <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: MUTED }}>
                        {title || "Related records"}
                    </span>
                    {variant === "proof" ?
                        <span className="text-[10px]" style={{ color: MUTED }}>
                            {rows.length} row{rows.length === 1 ? "" : "s"}
                            {binding.relationKey === "enrollment_children" ? " · enrollment context" : ""}
                        </span>
                    :   null}
                </div>
            :   null}
            {showChildrenEmpty ?
                <LayoutRuntimeChildrenEmptyState
                    opportunityId={host.entityId ?? ""}
                    canMutate={host.canMutate}
                />
            :   legacyTableMarkup}
        </div>
    );
}

function WidgetChrome({
    title,
    children,
    accentRail,
    minimized = false,
    widgetKey,
    leadCard,
}: {
    title: string;
    children: ReactNode;
    accentRail?: "work" | "attention";
    minimized?: boolean;
    widgetKey?: string;
    leadCard?: { icon: ReactNode; accent: "attention" | "work" | "neutral" | "muted" };
}) {
    const compact = useLayoutRuntimeSummaryStrip();
    const composition = useLayoutRuntimeCompositionHints();

    if (compact && (composition.leadOperatingSummaryCards || composition.personOperatingSummaryCards || composition.childOperatingSummaryCards) && leadCard) {
        return (
            <LeadOperatingSummaryCard
                title={title}
                icon={leadCard.icon}
                accent={leadCard.accent}
                minimized={minimized}
                widgetKey={widgetKey}
            >
                {children}
            </LeadOperatingSummaryCard>
        );
    }

    if (compact) {
        const railClass =
            accentRail === "attention" ? "bg-alloy-ember/80"
            : accentRail === "work" ? "bg-alloy-juniper/70"
            : minimized ? "bg-alloy-stone/25"
            : "bg-alloy-stone/35";
        const surfaceClass = minimized ? LAYOUT_RUNTIME_SUMMARY_WIDGET_MINIMIZED : LAYOUT_RUNTIME_SUMMARY_WIDGET_SURFACE;
        return (
            <div
                className={surfaceClass}
                data-layout-runtime-summary-widget="true"
                {...(minimized ? { "data-layout-runtime-summary-widget-minimized": "true" } : {})}
            >
                <div className={minimized ? `${LAYOUT_RUNTIME_SUMMARY_WIDGET_HEADER} py-0.5` : LAYOUT_RUNTIME_SUMMARY_WIDGET_HEADER}>
                    <span className={`h-1 w-1 shrink-0 rounded-full ${railClass}`} aria-hidden />
                    <span
                        className={`truncate font-semibold uppercase tracking-[0.08em] ${minimized ? "text-[8px] text-alloy-midnight/35" : "text-[9px] text-alloy-midnight/50"}`}
                    >
                        {title}
                    </span>
                </div>
                <div className={`${LAYOUT_RUNTIME_SUMMARY_WIDGET_BODY} overflow-hidden ${minimized ? "py-1" : ""}`}>{children}</div>
            </div>
        );
    }
    const rail = accentRail === "attention" ? "border-l-alloy-ember/75" : accentRail === "work" ? "border-l-alloy-juniper/45" : "";
    return (
        <div className={`${LAYOUT_RUNTIME_PANEL_SURFACE} ${rail ? `border-l-[3px] ${rail}` : ""}`}>
            <div className={LAYOUT_RUNTIME_PANEL_HEADER}>
                <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: MUTED }}>{title}</span>
            </div>
            <div className="px-2.5 py-2">{children}</div>
        </div>
    );
}

function widgetRows(record: ProofRuntimeRecord, key: string): { label: string; meta?: string }[] {
    const raw = record[key];
    if (!Array.isArray(raw)) return [];
    return (raw as unknown[]).map((r) => {
        if (r && typeof r === "object") {
            const o = r as Record<string, unknown>;
            return { label: String(o.label ?? o.title ?? o.name ?? o.body ?? ""), meta: o.due || o.when || o.at ? String(o.due ?? o.when ?? o.at) : undefined };
        }
        return { label: String(r) };
    });
}

function FutureModulePlaceholder({ title }: { title: string }) {
    return (
        <div className="rounded-md border border-dashed border-[#c9d4e8] bg-[#f8fafc] px-3 py-4 text-center">
            <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: MUTED }}>
                Future module
            </div>
            <div className="mt-1 text-sm font-medium" style={{ color: TEXT }}>
                {title}
            </div>
            <div className="mt-1 text-[10px]" style={{ color: MUTED }}>
                Placeholder only — not implemented in layout runtime
            </div>
        </div>
    );
}

function WidgetCell({ record, item }: { record: ProofRuntimeRecord; item: LayoutItem }) {
    const variant = useContext(LayoutRuntimeVariantContext);
    const composition = useLayoutRuntimeCompositionHints();
    const onAdornmentAction = useContext(AdornmentActionContext);
    const { onSelectDrawerTab, activityTabKey } = useLayoutRuntimeDrawerHost();
    const widgetKey = resolveLayoutRuntimeWidgetKey(item);
    const title = operatorLabel(item, variant) || "Details";
    const isFutureModule = item.metadata?.[FUTURE_MODULE_METADATA_KEY] === true;
    const leadCards = composition.leadOperatingSummaryCards === true;
    const personCards = composition.personOperatingSummaryCards === true;
    const childCards = composition.childOperatingSummaryCards === true;
    const operatingCards = leadCards || personCards || childCards;
    const compact = useLayoutRuntimeSummaryStrip();

    if (isFutureModule) {
        if (variant === "production") return null;
        return <FutureModulePlaceholder title={title} />;
    }

    const empty = <span className="text-[11px] text-alloy-midnight/40">No {title.toLowerCase()} yet</span>;
    const emptyQuiet = <span className="text-[10px] text-alloy-midnight/35">—</span>;

    if (widgetKey === "tasks") {
        if (operatingCards && compact) {
            return (
                <LeadOperatingSummaryCard
                    title={title}
                    icon={<CheckSquare2 className="h-3.5 w-3.5" aria-hidden />}
                    accent="work"
                    widgetKey="tasks"
                >
                    <LayoutRuntimeTasksWidget record={record} title={title} compact chromeless />
                </LeadOperatingSummaryCard>
            );
        }
        return <LayoutRuntimeTasksWidget record={record} title={title} compact={compact} />;
    }

    if (widgetKey === "household_summary" && personCards && compact) {
        return <PersonHouseholdSummaryCardShell record={record} />;
    }

    if (widgetKey === "connected_children" && personCards && compact) {
        return <PersonConnectedChildrenSummaryCardShell record={record} />;
    }

    if (widgetKey === "household_contacts" && composition.leadOverviewComposition) {
        return <LeadHouseholdContactsWidget record={record} onAdornmentAction={onAdornmentAction} />;
    }

    if (widgetKey === "related_people" && composition.personOverviewComposition) {
        return (
            <PersonRelatedPeopleGroupsWidget record={record} onAdornmentAction={onAdornmentAction} />
        );
    }

    if (widgetKey === "last_touch" && personCards && compact) {
        return <PersonLastTouchSummaryCardShell record={record} />;
    }

    if (widgetKey === "program_enrollment" && childCards && compact) {
        return <ChildProgramEnrollmentSummaryCardShell record={record} />;
    }

    if (widgetKey === "family" && childCards && compact) {
        return <ChildFamilySummaryCardShell record={record} />;
    }

    if (widgetKey === "documents_requirements" && childCards && compact) {
        return <ChildDocumentsRequirementsSummaryCardShell record={record} />;
    }

    if (widgetKey === "last_touch" && childCards && compact) {
        return <ChildLastTouchSummaryCardShell record={record} />;
    }

    if (widgetKey === "attention") {
        const overview =
            record._overview_data && typeof record._overview_data === "object"
                ? (record._overview_data as Record<string, unknown>)
                : record;
        const visible = isDrawerHeaderAttentionVisible(overview);
        if (leadCards && compact) {
            return (
                <LeadOperatingSummaryCard
                    title={title}
                    icon={<AlertTriangle className="h-3.5 w-3.5" aria-hidden />}
                    accent="attention"
                    minimized={!visible}
                    widgetKey="attention"
                >
                    {visible ?
                        <LeadOperatingAttentionSummaryCard record={record} />
                    :   <p className="text-[11px] text-alloy-midnight/45">No attention needed</p>}
                </LeadOperatingSummaryCard>
            );
        }
        if (!visible) {
            return (
                <WidgetChrome title={title}>
                    {emptyQuiet}
                </WidgetChrome>
            );
        }
        return (
            <WidgetChrome title={title} accentRail="attention">
                <DrawerHeaderAttentionBlock overviewData={overview} />
            </WidgetChrome>
        );
    }

    if (widgetKey === "reminders") {
        const rows = widgetRows(record, widgetKey);
        return (
            <WidgetChrome title={title}>
                {rows.length === 0 ? empty : (
                    <ul className="flex flex-col gap-1">
                        {rows.map((r, i) => (
                            <li key={i} className="flex items-center justify-between rounded bg-[#f7f9fc] px-2 py-1 text-xs" style={{ color: TEXT }}>
                                <span className="truncate">{sanitizeOperatorDisplay(r.label) ?? "—"}</span>
                                {r.meta ? <span className="ml-2 shrink-0 text-[10px]" style={{ color: MUTED }}>{r.meta}</span> : null}
                            </li>
                        ))}
                    </ul>
                )}
            </WidgetChrome>
        );
    }

    if (widgetKey === "tour_summary") {
        const lastTouch = resolveLeadSummaryLastTouch(record);
        const hasContent = lastTouch.kind !== "empty";
        const cardTitle = title.trim() || "Last Touch";
        if (leadCards && compact) {
            return (
                <LeadOperatingSummaryCard
                    title={cardTitle}
                    icon={<MessageSquare className="h-3.5 w-3.5" aria-hidden />}
                    accent={hasContent ? "neutral" : "muted"}
                    minimized={!hasContent}
                    widgetKey="last_touch"
                >
                    <LeadLastTouchSummaryCard touch={lastTouch} />
                </LeadOperatingSummaryCard>
            );
        }
        return (
            <WidgetChrome title={cardTitle} minimized={!hasContent}>
                <LeadLastTouchSummaryCard touch={lastTouch} />
            </WidgetChrome>
        );
    }

    if (widgetKey === "children_list") {
        const enrollmentHealth = summarizeLeadDrawerEnrollmentHealth(record);
        const cardTitle = title.trim() || "Enrollment Health";
        if (leadCards && compact) {
            return (
                <LeadOperatingSummaryCard
                    title={cardTitle}
                    icon={<HeartPulse className="h-3.5 w-3.5" aria-hidden />}
                    accent="work"
                    widgetKey="enrollment_health"
                >
                    <LeadEnrollmentHealthSummaryCard summary={enrollmentHealth} />
                </LeadOperatingSummaryCard>
            );
        }
        return (
            <WidgetChrome title={title}>
                <LayoutRuntimeChildrenListWidget record={record} compact={compact} />
            </WidgetChrome>
        );
    }

    if (widgetKey === "actions" && variant === "proof") {
        return (
            <WidgetChrome title={title}>
                <div className="flex flex-wrap gap-1.5">
                    {["Call", "Email", "Schedule tour"].map((a) => (
                        <button key={a} type="button" disabled className="rounded-md border border-[#dbe7ff] bg-[#f5f8ff] px-2 py-1 text-[11px] font-medium text-[#00458C] disabled:opacity-90">
                            {a}
                        </button>
                    ))}
                    <span className="self-center text-[10px]" style={{ color: MUTED }}>(simulated)</span>
                </div>
            </WidgetChrome>
        );
    }

    if (widgetKey === "activity") {
        const entries =
            composition.childOverviewComposition ?
                resolveChildActivityPreview(record)
            : composition.personOverviewComposition ?
                resolvePersonActivityPreview(record)
            :   resolveLeadActivityPreview(record);
        if (composition.compositionSectionSurface && entries.length === 0) return null;
        const viewAll =
            onSelectDrawerTab && activityTabKey ?
                () => onSelectDrawerTab(activityTabKey)
            :   undefined;
        const preview =
            composition.childOverviewComposition || composition.personOverviewComposition ?
                <PersonActivityPreview entries={entries} onViewAll={viewAll} />
            :   <LeadActivityPreview entries={entries} onViewAll={viewAll} />;
        const activityMarkup = (
            <div className="min-w-0 break-words" data-layout-runtime-activity-widget="true">
                {preview}
            </div>
        );
        return composition.compositionSectionSurface ? activityMarkup : <WidgetChrome title={title}>{activityMarkup}</WidgetChrome>;
    }

    if (widgetKey === "documents") {
        const hasContent =
            record.documents != null
            || record._documents_preview != null
            || (record._overview_data
                && typeof record._overview_data === "object"
                && Array.isArray((record._overview_data as Record<string, unknown>).documents));
        if (!hasContent) {
            return composition.compositionSectionSurface ? null : <WidgetChrome title={title}>{empty}</WidgetChrome>;
        }
        const markup = <LayoutRuntimeDocumentsOverviewWidget record={record} title={title} />;
        return composition.compositionSectionSurface ? markup : <WidgetChrome title={title}>{markup}</WidgetChrome>;
    }

    if (widgetKey === "notes" || widgetKey === "recent_communication") {
        const hasContent =
            widgetKey === "notes"
                ? layoutRuntimeNotesWidgetHasContent(record)
                : layoutRuntimeCommunicationWidgetHasContent(record);
        if (!hasContent) {
            return composition.compositionSectionSurface ? null : <WidgetChrome title={title}>{empty}</WidgetChrome>;
        }
        const markup = (
            <LayoutRuntimeNotesCommunicationWidget
                record={record}
                widgetKey={widgetKey === "notes" ? "notes" : "recent_communication"}
            />
        );
        return composition.compositionSectionSurface ? markup : <WidgetChrome title={title}>{markup}</WidgetChrome>;
    }

    return <WidgetChrome title={title}>{empty}</WidgetChrome>;
}

function ItemCell({ record, item, anchorEntity }: { record: ProofRuntimeRecord; item: LayoutItem; anchorEntity: string }) {
    const variant = useContext(LayoutRuntimeVariantContext);
    if (!evaluateLayoutCondition(record, item.visibleWhen)) return null;
    if (variant === "production" && !isLayoutItemSupportedForProduction(item)) return null;
    if (variant === "preview" && !isLayoutItemSupportedForProduction(item)) return null;
    if (!shouldRenderProofItem(item)) return null;

    switch (item.kind) {
        case "field":
            return <ValueCell record={record} item={item} anchorEntity={anchorEntity} />;
        case "field_group":
            return <GroupCell record={record} item={item} anchorEntity={anchorEntity} />;
        case "related_list":
            return <RelatedCell record={record} item={item} anchorEntity={anchorEntity} />;
        case "widget_placeholder":
            return <WidgetCell record={record} item={item} />;
        default:
            return null;
    }
}

function ColumnView({ record, column, anchorEntity }: { record: ProofRuntimeRecord; column: LayoutColumn; anchorEntity: string }) {
    const summaryCompact = useLayoutRuntimeSummaryStrip() && useLayoutRuntimeCompositionHints().summaryStripCompactRow;
    const span = summaryCompact ? 1 : Math.max(1, Math.min(LAYOUT_GRID_COLUMNS, column.width));
    return (
        <div
            style={summaryCompact ? undefined : { gridColumn: `span ${span} / span ${span}` }}
            className="flex min-w-0 flex-col gap-1"
        >
            {column.items.map((item) => (
                <ItemCell key={item.id} record={record} item={item} anchorEntity={anchorEntity} />
            ))}
        </div>
    );
}

function RowView({ record, row, anchorEntity }: { record: ProofRuntimeRecord; row: LayoutRow; anchorEntity: string }) {
    if (!evaluateLayoutCondition(record, row.visibleWhen)) return null;
    const { stackRows } = useContext(LayoutRuntimeSectionContext);
    const summaryCompact = useLayoutRuntimeSummaryStrip() && useLayoutRuntimeCompositionHints().summaryStripCompactRow;

    if (stackRows) {
        return (
            <div className="flex flex-col gap-2.5" data-layout-runtime-stack-rows="true">
                {row.columns.map((col) => (
                    <ColumnView key={col.id} record={record} column={col} anchorEntity={anchorEntity} />
                ))}
            </div>
        );
    }

    if (summaryCompact) {
        return (
            <div
                className="grid grid-cols-2 gap-2 sm:grid-cols-4"
                data-layout-runtime-summary-row="true"
            >
                {row.columns.map((col) => (
                    <ColumnView key={col.id} record={record} column={col} anchorEntity={anchorEntity} />
                ))}
            </div>
        );
    }

    return (
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${LAYOUT_GRID_COLUMNS}, minmax(0, 1fr))` }}>
            {row.columns.map((col) => (
                <ColumnView key={col.id} record={record} column={col} anchorEntity={anchorEntity} />
            ))}
        </div>
    );
}

export type LayoutRuntimeSectionPresentation = "default" | "summary_strip";

function SectionView({
    record,
    section,
    anchorEntity,
    sectionPresentation = "default",
}: {
    record: ProofRuntimeRecord;
    section: LayoutSection;
    anchorEntity: string;
    sectionPresentation?: LayoutRuntimeSectionPresentation;
}) {
    const variant = useContext(LayoutRuntimeVariantContext);
    const operatorSurfaces = useLayoutRuntimeOperatorSurfaces();
    const composition = useLayoutRuntimeCompositionHints();
    const sectionContext = {
        sectionPresentation,
        sectionKey: section.key,
        stackRows: composition.compositionSectionSurface === true && section.key === "household_contact",
    };
    if (!evaluateLayoutCondition(record, section.visibleWhen)) return null;

    const useCompositionSurfaceEarly = composition.compositionSectionSurface === true && operatorSurfaces;
    if (
        useCompositionSurfaceEarly &&
        sectionPresentation !== "summary_strip" &&
        !shouldRenderLayoutRuntimeSection(section, record, {
            compositionShell: true,
            sectionPresentation,
        })
    ) {
        return null;
    }

    const body = (
        <LayoutRuntimeSectionContext.Provider value={sectionContext}>
            {section.rows.map((row) => (
                <RowView key={row.id} record={record} row={row} anchorEntity={anchorEntity} />
            ))}
        </LayoutRuntimeSectionContext.Provider>
    );

    if (sectionPresentation === "summary_strip") {
        return (
            <div className="flex flex-col gap-2" data-layout-runtime-section-presentation="summary_strip">
                {body}
            </div>
        );
    }

    const useCompositionSurface = composition.compositionSectionSurface === true && operatorSurfaces;
    const isEnrollmentSection = section.key === "children_enrollment";

    let surfaceClass = LAYOUT_RUNTIME_SECTION_SURFACE;
    let headerClass = LAYOUT_RUNTIME_SECTION_HEADER;
    let bodyPadding = "gap-3 p-3";

    if (useCompositionSurface) {
        surfaceClass = LAYOUT_RUNTIME_COMPOSITION_SECTION_SURFACE;
        headerClass = LAYOUT_RUNTIME_COMPOSITION_SECTION_HEADER;
        bodyPadding = isEnrollmentSection ? LAYOUT_RUNTIME_COMPOSITION_ENROLLMENT_BODY : LAYOUT_RUNTIME_COMPOSITION_SECTION_BODY;
    } else if (operatorSurfaces) {
        const isPrimaryWorkspace = isEnrollmentSection;
        surfaceClass =
            isPrimaryWorkspace ? LAYOUT_RUNTIME_PRIMARY_WORKSPACE_SECTION : LAYOUT_RUNTIME_BODY_SECTION_SURFACE;
        headerClass =
            isPrimaryWorkspace ? LAYOUT_RUNTIME_PRIMARY_WORKSPACE_HEADER : LAYOUT_RUNTIME_BODY_SECTION_HEADER;
        bodyPadding = isPrimaryWorkspace ? "" : "gap-2.5 p-3 sm:p-3.5";
    }

    const sectionEyebrow =
        useCompositionSurface ?
            (LEAD_COMPOSITION_SECTION_EYEBROWS[section.key]
                ?? PERSON_COMPOSITION_SECTION_EYEBROWS[section.key]
                ?? CHILD_COMPOSITION_SECTION_EYEBROWS[section.key])
        :   null;

    const compositionPanelShellSection =
        (composition.leadOverviewComposition === true
            && (section.key === "household_contact" || section.key === "children_enrollment"))
        || (composition.personOverviewComposition === true
            && (section.key === "household_relationships" || section.key === "connected_children"))
        || (composition.childOverviewComposition === true
            && (section.key === "family_relationships" || section.key === "program_enrollment"));

    if (compositionPanelShellSection) {
        return (
            <div
                className="flex min-w-0 flex-col gap-2"
                data-drawer-overview-composition-section={section.key}
            >
                {body}
            </div>
        );
    }

    return (
        <div
            className={surfaceClass}
            data-layout-runtime-section-key={section.key}
            {...(isEnrollmentSection ?
                { "data-layout-runtime-primary-workspace-section": "true" }
            :   {})}
            {...(useCompositionSurface ?
                {
                    "data-lead-overview-composition-section": section.key,
                    "data-person-overview-composition-section": section.key,
                }
            :   {})}
        >
            <div className={headerClass}>
                {sectionEyebrow ?
                    <span className={LAYOUT_RUNTIME_COMPOSITION_SECTION_EYEBROW}>{sectionEyebrow}</span>
                :   null}
                <div className={useCompositionSurface ? LAYOUT_RUNTIME_COMPOSITION_SECTION_TITLE : "text-inherit"}>
                    {section.title}
                </div>
            </div>
            <div className={`flex flex-col ${bodyPadding}`}>{body}</div>
        </div>
    );
}

export type LayoutRuntimePlanViewProps = {
    doc: LayoutDoc;
    record: ProofRuntimeRecord;
    plan?: LayoutRuntimePlan;
    onAdornmentAction?: AdornmentActionHandler;
    /** Entity id for empty-state actions (e.g. Add Child on opportunity). */
    entityId?: string;
    canMutate?: boolean;
    /** `proof` shows binding diagnostics; `production`/`preview` are operator-safe. */
    variant?: "proof" | "production" | "preview";
    /** Platform shell zone presentation — summary strip omits section chrome. */
    sectionPresentation?: LayoutRuntimeSectionPresentation;
};

export default function LayoutRuntimePlanView({
    doc,
    record,
    plan: planProp,
    onAdornmentAction,
    entityId,
    canMutate = false,
    variant = "proof",
    sectionPresentation = "default",
}: LayoutRuntimePlanViewProps) {
    const plan = useMemo(() => planProp ?? buildLayoutRuntimePlan(doc), [planProp, doc]);
    const anchorEntity = plan.entityType;
    const hostContext = useMemo(
        () => ({ entityId, canMutate, anchorEntity }),
        [entityId, canMutate, anchorEntity],
    );

    if (!doc?.sections?.length) {
        return <div className="text-sm" style={{ color: MUTED }}>No drawer layout.</div>;
    }

    return (
        <LayoutRuntimeVariantContext.Provider value={variant}>
            <LayoutRuntimeHostContext.Provider value={hostContext}>
                <AdornmentActionContext.Provider value={onAdornmentAction}>
                <div className={`flex flex-col gap-3 ${variant === "production" || variant === "preview" ? "sm:gap-4" : ""}`} style={{ border: `0 solid ${BORDER}` }}>
                    {variant === "proof" ?
                        <div className="rounded-md border border-[#e6e8ec] bg-[#fbfcfe] px-3 py-2 text-[11px]" style={{ color: MUTED }}>
                            Runtime plan · {plan.layoutKey ?? "default"} · bindings:{" "}
                            {Object.entries(plan.bindingClassCounts)
                                .filter(([, n]) => n > 0)
                                .map(([k, n]) => `${k}=${n}`)
                                .join(", ")}
                        </div>
                    :   null}
                    {doc.sections.map((section) => {
                if (!evaluateLayoutCondition(record, section.visibleWhen)) return null;
                return (
                    <SectionView
                        key={section.id}
                        record={record}
                        section={section}
                        anchorEntity={anchorEntity}
                        sectionPresentation={sectionPresentation}
                    />
                );
            })}
                </div>
                </AdornmentActionContext.Provider>
            </LayoutRuntimeHostContext.Provider>
        </LayoutRuntimeVariantContext.Provider>
    );
}

/** Parity helper: resolve base field the legacy proof path would show. */
export function resolveLegacyProofValue(record: ProofRuntimeRecord, item: LayoutItem) {
    return resolveItemValue(record, item);
}
