"use client";

/**
 * Layout runtime plan proof renderer (Phase 2).
 *
 * Renders Resolved LayoutDoc + LayoutRuntimePlan for opportunity drawer proof.
 * Binding-aware: relationship/reference handles, computed read-only fields,
 * repeaters, widgets. NOT wired to AdminEntityDrawer or VM.
 */

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Activity, AlertTriangle, Calendar, CheckSquare2, Heart, HeartPulse, MessageSquare, Users } from "lucide-react";
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
import {
    readLayoutEditorDisplayConfig,
    typographyIntentClass,
    resolveLayoutCollectionColumnAdornment,
    resolveLayoutCollectionColumnLinkAdornment,
    resolveLayoutCollectionColumnShowIcon,
} from "@/lib/layout/layoutEditorDisplayConfig";
import { readLayoutEditorActionButtonConfig } from "@/lib/layout/layoutEditorActionButton";
import { readLayoutEditorBlockConfig, resolveLayoutRuntimeBlockEditMode } from "@/lib/layout/layoutEditorBlockConfig";
import { readLayoutEditorContactRole } from "@/lib/layout/layoutEditorContactRoles";
import {
    overlayLayoutEditorContactBlockRecord,
    resolveLayoutEditorContactBlockPerson,
    shouldHideEmptyLayoutEditorContactBlock,
} from "@/lib/layout/runtime/resolveLayoutEditorContactBlockRecord";
import {
    readLayoutEditorWidgetStyle,
    resolveLayoutEditorWidgetAccentRail,
    resolveLayoutEditorWidgetLeadCardAccent,
    resolveLayoutEditorWidgetRuntimeTone,
    resolveLayoutEditorWidgetToneDotClass,
    resolveLayoutEditorWidgetToneHeaderWashClass,
    resolveLayoutEditorWidgetToneIconClass,
    resolveLayoutEditorWidgetToneRailClass,
    resolveLayoutEditorWidgetToneTitleClass,
    resolveLayoutSectionWidgetTone,
    resolveLayoutItemWidgetTone,
    resolveLeadOperatingCardAccent,
    type LayoutEditorWidgetRuntimeTone,
    type LeadOperatingCardAccentInput,
} from "@/lib/layout/layoutEditorWidgetStyle";
import {
    formatLayoutEditorFieldDateValue,
    isLayoutEditorInlineFieldLabel,
    layoutEditorStatusFormatClass,
    shouldShowLayoutEditorFieldIcon,
    shouldShowLayoutEditorFieldLabel,
} from "@/lib/layout/runtime/applyLayoutEditorFieldDisplay";
import { readCardWidthFraction } from "@/lib/layout/layoutBuilderCardWidth";
import { sectionIsKpiTile } from "@/lib/layout/runtime/layoutRuntimeKpiTilePresentation";
import { readLayoutEditorRelatedListConfigFromItem } from "@/lib/layout/runtime/resolveLayoutRuntimeRelatedListPresentation";
import LayoutRuntimeRelatedListCompactRows from "@/components/layout/LayoutRuntimeRelatedListCompactRows";
import {
    LayoutRuntimeBlockEditProvider,
    layoutRuntimeBlockAllowsFieldEdit,
    useLayoutRuntimeBlockEdit,
} from "@/components/layout/LayoutRuntimeBlockEditContext";
import {
    layoutRuntimeOnPickOptionCompanion,
    useLayoutRuntimeResolvedDisplayLabel,
} from "@/components/layout/useLayoutRuntimeResolvedDisplayLabel";
import { layoutEditorTraceProps, useLayoutEditorRuntimeTrace } from "@/lib/layout/layoutEditorRuntimeTraceContext";
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
import LayoutRuntimeCurrentWorkWidget from "@/components/layout/LayoutRuntimeCurrentWorkWidget";
import LayoutRuntimeFollowUpsWidget from "@/components/layout/LayoutRuntimeFollowUpsWidget";
import { mapLayoutRuntimeTasksFromVm } from "@/lib/layout/runtime/mapLayoutRuntimeTasksFromVm";
import LayoutRuntimeChildrenListWidget from "@/components/layout/LayoutRuntimeChildrenListWidget";
import LayoutRuntimeChildrenEmptyState from "@/components/layout/LayoutRuntimeChildrenEmptyState";
import { useLayoutRuntimeDrawerEdit } from "@/components/layout/LayoutRuntimeDrawerEditProvider";
import LayoutRuntimeFieldInput, {
    layoutRuntimeDependentValueReader,
} from "@/components/layout/LayoutRuntimeFieldInput";
import { layoutRuntimeFieldIsEditable, resolveLayoutRuntimeEditableFieldFallback, resolveLayoutRuntimeEditableRefKey } from "@/lib/layout/runtime/layoutRuntimeFieldEditability";
import LayoutRuntimeAdornmentButton from "@/components/layout/LayoutRuntimeAdornmentButton";
import LayoutRuntimeChildLinkSurface from "@/components/layout/LayoutRuntimeChildLinkSurface";
import LayoutRuntimeEnrollmentGrid from "@/components/layout/LayoutRuntimeEnrollmentGrid";
import LeadEnrollmentHealthSummaryCard from "@/components/layout/lead/LeadEnrollmentHealthSummaryCard";
import LeadEnrollmentCardList from "@/components/layout/lead/LeadEnrollmentCardList";
import LeadContactRepeaterCardList from "@/components/layout/lead/LeadContactRepeaterCardList";
import DrawerOverviewEmptyState from "@/components/layout/DrawerOverviewEmptyState";
import { isLayoutRuntimeContactRepeater } from "@/lib/layout/runtime/mapLayoutRuntimeContactRepeaterRows";
import PersonConnectedChildrenCardList from "@/components/layout/person/PersonConnectedChildrenCardList";
import PersonRelatedPeopleGroupsWidget from "@/components/layout/person/PersonRelatedPeopleGroupsWidget";
import LeadHouseholdContactsWidget from "@/components/layout/lead/LeadHouseholdContactsWidget";
import LeadLastTouchSummaryCard from "@/components/layout/lead/LeadLastTouchSummaryCard";
import LeadOperatingAttentionSummaryCard from "@/components/layout/lead/LeadOperatingAttentionSummaryCard";
import LeadOperatingCurrentWorkSummaryCard from "@/components/layout/lead/LeadOperatingCurrentWorkSummaryCard";
import LayoutRuntimeSectionFlowView from "@/components/layout/LayoutRuntimeSectionFlowView";
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
import DrawerOverviewPanelShell from "@/components/layout/DrawerOverviewPanelShell";
import LayoutRuntimeTonedPanelShell from "@/components/layout/LayoutRuntimeTonedPanelShell";
import DrawerHouseholdProfileSection from "@/components/layout/DrawerHouseholdProfileSection";
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
import {
    DRAWER_OVERVIEW_PANEL_BODY_CLASS,
    DRAWER_OVERVIEW_PANEL_ENROLLMENT_BODY_CLASS,
} from "@/lib/layout/runtime/drawerOverviewCompositionStandard";
import {
    drawerOverviewSectionIsCenterpiece,
    resolveDrawerOverviewSectionEyebrow,
} from "@/lib/layout/runtime/drawerOverviewSectionPresentation";
import { shouldRenderLayoutRuntimeSection } from "@/lib/layout/runtime/resolveLayoutRuntimeSectionVisibility";
import { isLayoutRuntimeOpportunityDrawerEntityLayoutsVisualConfigEnabledClient } from "@/lib/layout/featureFlag";
import {
    sectionHasLayoutOwnedComposition,
    shouldUseDrawerHouseholdProfileSubstitution,
} from "@/lib/layout/runtime/resolveLayoutEditorHouseholdRendering";
import {
    resolveLeadEnrollmentRowTemplatePresentation,
    shouldApplyLeadEnrollmentRowTemplatePresentation,
} from "@/lib/layout/runtime/resolveLeadEnrollmentRowTemplatePresentation";
import { layoutSectionIncludesWidget } from "@/lib/layout/runtime/layoutSectionIncludesWidget";
import {
    scrollToLeadEnrollmentSection,
    summarizeLeadDrawerEnrollmentHealth,
} from "@/lib/layout/runtime/summarizeLeadDrawerEnrollmentHealth";
import {
    LAYOUT_RUNTIME_BODY_SECTION_HEADER,
    LAYOUT_RUNTIME_BODY_SECTION_SURFACE,
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

export function useLayoutRuntimeHostContext(): LayoutRuntimeHostContextValue {
    return useContext(LayoutRuntimeHostContext);
}

function isLayoutRuntimeChildrenRepeater(item: LayoutItem): boolean {
    const keys = [item.source, item.refKey].filter(Boolean).map(String);
    return keys.some((key) => CHILDREN_REPEATER_KEYS.has(key));
}

export type AdornmentActionHandler = (
    item: LayoutItem,
    adornment: LayoutFieldAdornment,
    rowRecord?: ProofRuntimeRecord,
) => void;
export const LayoutRuntimeVariantContext = createContext<"proof" | "production" | "preview">("proof");
export const AdornmentActionContext = createContext<AdornmentActionHandler | undefined>(undefined);

type LayoutRuntimeSectionContextValue = {
    sectionPresentation: LayoutRuntimeSectionPresentation;
    sectionKey: string;
    stackRows?: boolean;
    stackFieldColumns?: boolean;
    kpiTile?: boolean;
};

const LayoutRuntimeSectionContext = createContext<LayoutRuntimeSectionContextValue>({
    sectionPresentation: "default",
    sectionKey: "",
    kpiTile: false,
});

type LayoutRuntimeRenderedContactIdsContextValue = {
    renderedPersonIds: Set<string>;
    registerPersonId: (personId: string) => void;
};

const LayoutRuntimeRenderedContactIdsContext = createContext<LayoutRuntimeRenderedContactIdsContextValue>({
    renderedPersonIds: new Set<string>(),
    registerPersonId: () => undefined,
});

function LayoutRuntimeRenderedContactIdsProvider({ children }: { children: ReactNode }) {
    const [renderedPersonIds] = useState(() => new Set<string>());
    const value = useMemo(
        () => ({
            renderedPersonIds,
            registerPersonId: (personId: string) => {
                const trimmed = personId.trim();
                if (trimmed) renderedPersonIds.add(trimmed);
            },
        }),
        [renderedPersonIds],
    );
    return (
        <LayoutRuntimeRenderedContactIdsContext.Provider value={value}>
            {children}
        </LayoutRuntimeRenderedContactIdsContext.Provider>
    );
}

function useLayoutRuntimeOperatorSurfaces(): boolean {
    const variant = useContext(LayoutRuntimeVariantContext);
    return variant === "production" || variant === "preview";
}

function useLayoutRuntimeSummaryStrip(): boolean {
    const ctx = useContext(LayoutRuntimeSectionContext);
    return ctx.sectionPresentation === "summary_strip" || ctx.kpiTile === true;
}

function useLayoutRuntimeKpiTile(): boolean {
    return useContext(LayoutRuntimeSectionContext).kpiTile === true;
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
    const blockEdit = useLayoutRuntimeBlockEdit();
    const onAdornmentAction = useContext(AdornmentActionContext);
    const binding = classifyLayoutItemBinding(item, anchorEntity);
    const r = resolveProofBindingValue(record, item, anchorEntity, binding);
    const displayConfig = readLayoutEditorDisplayConfig(item);
    const showLabel = shouldShowLayoutEditorFieldLabel(displayConfig);
    const label = showLabel ? operatorLabel(item, variant) : "";
    const inlineLabel = isLayoutEditorInlineFieldLabel(displayConfig);
    const showIcon = shouldShowLayoutEditorFieldIcon(item, displayConfig);
    const trace = useLayoutEditorRuntimeTrace();
    const traceProps = layoutEditorTraceProps(trace, { itemId: item.id, refKey: item.refKey });
    const display =
        variant === "production" || variant === "preview" ?
            sanitizeOperatorDisplay(r.isPlaceholder ? null : r.display)
        :   r.display;
    const formattedDisplay =
        display && (variant === "production" || variant === "preview") ?
            formatLayoutEditorFieldDateValue(item.refKey ?? "", display, item.renderHint, displayConfig.dateFormat)
        :   display;
    const refKey = item.refKey ?? "";
    const resolvedDisplay = useLayoutRuntimeResolvedDisplayLabel({
        refKey,
        rawValue: formattedDisplay ?? "",
        record,
        renderHint: item.renderHint,
    });
    const emptyDisplay = displayConfig.emptyState?.trim() || "—";
    const editableRefKey = resolveLayoutRuntimeEditableRefKey(refKey);
    const canEdit =
        layoutRuntimeFieldIsEditable(item, variant) &&
        Boolean(edit) &&
        layoutRuntimeBlockAllowsFieldEdit(blockEdit);
    const editValue =
        canEdit && edit ?
            edit.getFieldValue(
                editableRefKey,
                resolveLayoutRuntimeEditableFieldFallback(record, editableRefKey, display ?? ""),
            )
        :   display ?? "";
    const actionButton = item.refKey === "_action_button" ? readLayoutEditorActionButtonConfig(item.metadata) : null;

    const valueBody = (() => {
        if (!resolvedDisplay) {
            return (
                <span title={variant === "proof" ? (r.reason ?? "Value unavailable") : undefined}>{emptyDisplay}</span>
            );
        }
        if (r.renderHint === "status" || displayConfig.displayType === "badge" || displayConfig.displayType === "pill") {
            return (
                <span className={layoutEditorStatusFormatClass(displayConfig, item.renderHint) || undefined}>
                    {resolvedDisplay}
                </span>
            );
        }
        const linkBehavior = displayConfig.linkBehavior;
        const linkClass = "min-w-0 break-words text-alloy-pine hover:underline";
        if (linkBehavior === "mailto") {
            return (
                <a href={`mailto:${resolvedDisplay}`} className={linkClass} title={resolvedDisplay}>
                    {resolvedDisplay}
                </a>
            );
        }
        if (linkBehavior === "tel") {
            const dial = resolvedDisplay.replace(/[^\d+]/g, "");
            return (
                <a href={`tel:${dial}`} className={linkClass} title={resolvedDisplay}>
                    {resolvedDisplay}
                </a>
            );
        }
        if (
            (linkBehavior === "open_drawer" || linkBehavior === "open_record")
            && item.adornment?.action
            && onAdornmentAction
        ) {
            return (
                <button
                    type="button"
                    className={`${linkClass} text-left`}
                    title={resolvedDisplay}
                    onClick={(e) => {
                        if (trace?.inspectMode) {
                            e.stopPropagation();
                            return;
                        }
                        onAdornmentAction(item, item.adornment!, undefined);
                    }}
                >
                    {resolvedDisplay}
                </button>
            );
        }
        return (
            <span className="min-w-0 break-words" title={resolvedDisplay}>
                {resolvedDisplay}
            </span>
        );
    })();

    return (
        <div
            className={`${operatorSurfaces ? LAYOUT_RUNTIME_FIELD_READ_SURFACE : LAYOUT_RUNTIME_FIELD_SURFACE} ${traceProps.className ?? ""}`}
            {...traceProps.attrs}
            onClick={(e) => {
                traceProps.onClick?.();
                if (trace?.inspectMode) e.stopPropagation();
            }}
        >
            {label && !inlineLabel ?
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
            <div
                className={`${inlineLabel ? "flex min-w-0 flex-wrap items-center gap-2" : "mt-0.5"} flex min-w-0 items-center gap-1 ${operatorSurfaces ? PRESENTATION_DATA_VALUE : inlineLabel ? "text-sm" : "text-sm"} ${typographyIntentClass(displayConfig.typographyIntent)}`}
            >
                {inlineLabel && label ?
                    <span className={`shrink-0 ${operatorSurfaces ? PRESENTATION_LABEL : "text-[11px] font-medium text-alloy-midnight/55"}`}>
                        {label}
                    </span>
                :   null}
                {showIcon && item.adornment && item.adornment.position !== "right" ? <Adorn item={item} /> : null}
                {canEdit && edit ?
                    <LayoutRuntimeFieldInput
                        refKey={editableRefKey}
                        value={editValue}
                        onChange={(v) => edit.setFieldValue(editableRefKey, v)}
                        onPickOption={(_value, label) => {
                            layoutRuntimeOnPickOptionCompanion(editableRefKey, label, edit.setFieldValue);
                        }}
                        getDependentValue={layoutRuntimeDependentValueReader(edit.getFieldValue)}
                    />
                : actionButton ?
                    <button
                        type="button"
                        className="inline-flex rounded border border-alloy-forge/20 bg-white px-2 py-0.5 text-xs font-medium text-alloy-pine"
                        data-testid={`layout-runtime-action-button-${item.id}`}
                    >
                        {actionButton.label ?? item.label ?? "Action"}
                    </button>
                :   <span className={!resolvedDisplay ? PRESENTATION_VALUE_PLACEHOLDER : undefined}>{valueBody}</span>
                }
                {showIcon && item.adornment && item.adornment.position === "right" ? <Adorn item={item} /> : null}
            </div>
            {displayConfig.helperText ?
                <p className="mt-1 text-[10px] text-alloy-midnight/45">{displayConfig.helperText}</p>
            :   null}
        </div>
    );
}

function LayoutRuntimeBlockEditToggle({
    itemId,
    blockEdit,
}: {
    itemId: string;
    blockEdit: NonNullable<ReturnType<typeof useLayoutRuntimeBlockEdit>>;
}) {
    return (
        <button
            type="button"
            className="rounded border border-alloy-forge/20 bg-white px-2 py-0.5 text-[10px] font-medium text-alloy-pine opacity-60 transition-opacity hover:border-alloy-pine/30 group-hover/block:opacity-100 focus:opacity-100 focus-visible:opacity-100"
            onClick={() => blockEdit.setBlockEditing(!blockEdit.blockEditing)}
            data-testid={`layout-runtime-block-edit-${itemId}`}
        >
            {blockEdit.blockEditing ? "Done" : "Edit"}
        </button>
    );
}

function wrapLayoutRuntimeCompositionWidget(
    title: string,
    tone: LayoutEditorWidgetRuntimeTone | undefined,
    children: ReactNode,
): ReactNode {
    return (
        <LayoutRuntimeTonedPanelShell title={title} tone={tone} bodyClassName="px-2.5 py-2">
            {children}
        </LayoutRuntimeTonedPanelShell>
    );
}

function GroupCell({ record, item, anchorEntity }: { record: ProofRuntimeRecord; item: LayoutItem; anchorEntity: string }) {
    const blockConfig = readLayoutEditorBlockConfig(item.metadata);
    const editMode = resolveLayoutRuntimeBlockEditMode(item, blockConfig);
    const isContactBlock = item.kind === "field_group" && item.refKey === "contact_block";
    const renderedContacts = useContext(LayoutRuntimeRenderedContactIdsContext);

    let contactRecord = record;
    if (isContactBlock) {
        const contactRole = readLayoutEditorContactRole(item.metadata);
        const person = resolveLayoutEditorContactBlockPerson(record, contactRole, {
            excludedPersonIds: renderedContacts.renderedPersonIds,
        });
        if (shouldHideEmptyLayoutEditorContactBlock(contactRole, person)) return null;
        if (person?.personId) renderedContacts.registerPersonId(person.personId);
        contactRecord = overlayLayoutEditorContactBlockRecord(record, contactRole, person);
    }

    return (
        <LayoutRuntimeBlockEditProvider editMode={editMode}>
            <GroupCellContent record={contactRecord} item={item} anchorEntity={anchorEntity} blockConfig={blockConfig} />
        </LayoutRuntimeBlockEditProvider>
    );
}

function GroupCellContent({
    record,
    item,
    anchorEntity,
    blockConfig,
}: {
    record: ProofRuntimeRecord;
    item: LayoutItem;
    anchorEntity: string;
    blockConfig: ReturnType<typeof readLayoutEditorBlockConfig>;
}) {
    const variant = useContext(LayoutRuntimeVariantContext);
    const operatorSurfaces = useLayoutRuntimeOperatorSurfaces();
    const blockEdit = useLayoutRuntimeBlockEdit();
    const drawerEdit = useLayoutRuntimeDrawerEdit();
    const hasSubgrid = Array.isArray(item.rows) && item.rows.length > 0;
    const showTitle = blockConfig.showTitle !== false;
    const title = showTitle ? operatorLabel(item, variant) : "";
    const resolvedEditMode = blockEdit?.editMode ?? "display_only";
    const showEditButton =
        (resolvedEditMode === "edit_button" || resolvedEditMode === "inline_editable") && Boolean(drawerEdit);
    const blockTone = resolveLayoutItemWidgetTone(item);
    const shellTitle = blockTone && operatorSurfaces ? title || undefined : undefined;
    const blockEditToggle =
        showEditButton && blockEdit ?
            <LayoutRuntimeBlockEditToggle itemId={item.id} blockEdit={blockEdit} />
        :   null;
    const body = (
        <div className="group/block">
            {!shellTitle && (title || showEditButton) ?
                <div className="mb-1.5 flex items-center justify-between gap-2">
                    {title ?
                        <div
                            className={`${operatorSurfaces ? "text-[10px] uppercase tracking-[0.08em] text-alloy-midnight/50" : "text-[11px] font-semibold uppercase tracking-wide"}`}
                            style={operatorSurfaces ? undefined : { color: MUTED }}
                        >
                            {title}
                        </div>
                    :   <span />}
                    {blockEditToggle}
                </div>
            :   null}
            {hasSubgrid ?
                <div className="flex flex-col gap-2">
                    {item.rows!.map((row) => (
                        <RowView key={row.id} record={record} row={row} anchorEntity={anchorEntity} />
                    ))}
                </div>
            :   <div className="grid grid-cols-2 gap-2">
                    {(item.items ?? []).map((child) => (
                        <ValueCell key={child.id} record={record} item={child} anchorEntity={anchorEntity} />
                    ))}
                </div>
            }
        </div>
    );

    if (blockTone && operatorSurfaces) {
        return (
            <LayoutRuntimeTonedPanelShell
                title={shellTitle}
                tone={blockTone}
                headerActions={blockEditToggle}
                bodyClassName="px-2.5 py-2"
            >
                {body}
            </LayoutRuntimeTonedPanelShell>
        );
    }

    return (
        <div className={operatorSurfaces ? LAYOUT_RUNTIME_GROUP_READ_SURFACE : LAYOUT_RUNTIME_GROUP_SURFACE}>
            {body}
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
    const blockEdit = useLayoutRuntimeBlockEdit();
    const onAction = useContext(AdornmentActionContext);
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
    const canEdit =
        layoutRuntimeFieldIsEditable(synthetic, variant)
        && Boolean(edit)
        && layoutRuntimeBlockAllowsFieldEdit(blockEdit);
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
    const resolvedDisplay = useLayoutRuntimeResolvedDisplayLabel({
        refKey: col.refKey,
        rawValue: formattedDisplay ?? "",
        row,
        anchorRecord,
        renderHint: col.renderHint,
    });
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
                componentName="LayoutRuntimePlanView/RepeaterCellContent"
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
                <Adorn item={synthetic} rowRecord={row} />
            :   null}
            {canEdit && edit ?
                <LayoutRuntimeFieldInput
                    refKey={editableRefKey}
                    value={editValue}
                    rowKey={rowKey}
                    onChange={(v) => edit.setFieldValue(editableRefKey, v, rowKey)}
                    onPickOption={(_value, label) => {
                        layoutRuntimeOnPickOptionCompanion(editableRefKey, label, edit.setFieldValue, rowKey);
                    }}
                    getDependentValue={layoutRuntimeDependentValueReader(edit.getFieldValue, rowKey)}
                />
            :   <span className={`${r.isPlaceholder ? PRESENTATION_VALUE_PLACEHOLDER : ""} ${statusClass}`.trim()}>
                    {r.isPlaceholder ? "—"
                    : col.renderHint === "status" || displayConfig.displayType === "badge" || displayConfig.displayType === "pill" ?
                        <span className={statusClass || "inline-block rounded-full border border-alloy-juniper/20 bg-alloy-juniper/8 px-2 py-0.5 text-[11px] font-medium text-alloy-midnight/90"}>
                            {resolvedDisplay}
                        </span>
                    :   resolvedDisplay}
                </span>
            }
            {showColumnIcon && synthetic.adornment && synthetic.adornment.position === "right" ?
                <Adorn item={synthetic} rowRecord={row} />
            :   null}
        </span>
    );
}

function renderRelatedListPanelShell(input: {
    tone?: LayoutEditorWidgetRuntimeTone;
    operatorSurfaces: boolean;
    title: string;
    suppressHeader: boolean;
    surfaceClassName?: string;
    headerExtra?: ReactNode;
    headerActions?: ReactNode;
    children: ReactNode;
}) {
    const { tone, operatorSurfaces, title, suppressHeader, surfaceClassName, headerExtra, headerActions, children } = input;
    if (tone && operatorSurfaces) {
        return (
            <LayoutRuntimeTonedPanelShell
                title={suppressHeader ? undefined : title}
                tone={tone}
                headerActions={headerActions}
                bodyClassName="p-0"
            >
                {headerExtra}
                {children}
            </LayoutRuntimeTonedPanelShell>
        );
    }
    return (
        <div className={`group/block ${surfaceClassName ?? LAYOUT_RUNTIME_PANEL_SURFACE}`}>
            {headerExtra}
            {!suppressHeader ?
                <div className={`${LAYOUT_RUNTIME_PANEL_HEADER} justify-between`}>
                    <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: MUTED }}>
                        {title}
                    </span>
                    {headerActions}
                </div>
            :   null}
            {children}
        </div>
    );
}

function RelatedCell({ record, item, anchorEntity }: { record: ProofRuntimeRecord; item: LayoutItem; anchorEntity: string }) {
    const blockConfig = readLayoutEditorBlockConfig(item.metadata);
    const editMode = resolveLayoutRuntimeBlockEditMode(item, blockConfig);
    return (
        <LayoutRuntimeBlockEditProvider editMode={editMode}>
            <RelatedCellInner record={record} item={item} anchorEntity={anchorEntity} blockConfig={blockConfig} />
        </LayoutRuntimeBlockEditProvider>
    );
}

function RelatedCellInner({
    record,
    item,
    anchorEntity,
    blockConfig,
}: {
    record: ProofRuntimeRecord;
    item: LayoutItem;
    anchorEntity: string;
    blockConfig: ReturnType<typeof readLayoutEditorBlockConfig>;
}) {
    const variant = useContext(LayoutRuntimeVariantContext);
    const operatorSurfaces = useLayoutRuntimeOperatorSurfaces();
    const { sectionKey } = useContext(LayoutRuntimeSectionContext);
    const host = useContext(LayoutRuntimeHostContext);
    const onAdornmentAction = useContext(AdornmentActionContext);
    const drawerEdit = useLayoutRuntimeDrawerEdit();
    const blockEdit = useLayoutRuntimeBlockEdit();
    const resolvedEditMode = blockEdit?.editMode ?? "display_only";
    const showBlockEditButton =
        (resolvedEditMode === "edit_button" || resolvedEditMode === "inline_editable") && Boolean(drawerEdit);
    const blockEditToggle =
        showBlockEditButton && blockEdit ?
            <LayoutRuntimeBlockEditToggle itemId={item.id} blockEdit={blockEdit} />
        :   null;
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
    const suppressRelatedListHeader = composition.suppressRelatedListPanelHeader === true;
    const columns = item.columns as LayoutCollectionColumn[];
    const allRows = readLayoutRuntimeRepeaterRows(record, item);
    const title = operatorLabel(item, variant);
    const isChildrenRepeater = isLayoutRuntimeChildrenRepeater(item);
    const isContactRepeater = isLayoutRuntimeContactRepeater(item);
    const editorRelatedList = readLayoutEditorRelatedListConfigFromItem(item);
    const editorPresentation = editorRelatedList?.presentationMode ?? "table";
    const listTone = resolveLayoutItemWidgetTone(item);
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
    const showContactsEmpty =
        variant === "production" &&
        allRows.length === 0 &&
        isContactRepeater &&
        isOpportunityAnchor;

    if (isContactRepeater) {
        const entityLabel = item.refKey === "household_members" ? "household members" : "contacts";
        const presentation = editorRelatedList ? editorPresentation : "cards";

        const contactTableMarkup = (
            <div className="overflow-x-auto">
                <table className="min-w-[480px] w-full table-fixed text-left text-xs">
                    <thead>
                        <tr className="border-b border-admin-border" style={{ color: MUTED }}>
                            {columns.map((c) => (
                                <th key={c.refKey} className="px-2 py-1.5 font-semibold">
                                    {layoutRepeaterColumnHeaderLabel(c)}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {allRows.length === 0 ?
                            <tr>
                                <td colSpan={columns.length} className="px-3 py-4 text-alloy-muted">
                                    No {entityLabel} on this record yet.
                                </td>
                            </tr>
                        :   allRows.map((rw, i) => {
                                const rowKey = layoutRuntimeRepeaterRowReactKey(rw, i, item.source ?? item.refKey);
                                return (
                                    <tr key={rowKey} className="border-b border-alloy-stone/80 hover:bg-[#fafbfc]">
                                        {columns.map((c) => (
                                            <td key={c.refKey} className="px-2.5 py-2.5 align-middle" style={{ color: TEXT }}>
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

        return (
            <div className={LAYOUT_RUNTIME_PANEL_SURFACE}>
                {suppressRelatedListHeader ? null : (
                    <div className={LAYOUT_RUNTIME_PANEL_HEADER}>
                        <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: MUTED }}>
                            {title || "Contacts"}
                        </span>
                    </div>
                )}
                {showContactsEmpty ?
                    <div className="p-2">
                        <DrawerOverviewEmptyState
                            message={`No ${entityLabel} on this record yet.`}
                            hint="Add household adults or contact details to populate this list."
                            compact
                        />
                    </div>
                : presentation === "compact" ?
                    <LayoutRuntimeRelatedListCompactRows
                        item={item}
                        columns={columns}
                        rows={allRows}
                        anchorRecord={record}
                        onAdornmentAction={onAdornmentAction}
                        emptyMessage={`No ${entityLabel} on this record yet.`}
                    />
                : presentation === "table" ?
                    contactTableMarkup
                :   <LeadContactRepeaterCardList
                        item={item}
                        columns={columns}
                        rows={allRows}
                        anchorRecord={record}
                        entityLabel={entityLabel}
                        onAdornmentAction={onAdornmentAction}
                    />
                }
            </div>
        );
    }

    if (isChildrenRepeater && editorRelatedList) {
        const childTableMarkup = (
            <div className="overflow-x-auto">
                <table className="min-w-[640px] w-full table-fixed text-left text-xs">
                    <thead>
                        <tr className="border-b border-admin-border" style={{ color: MUTED }}>
                            {columns.map((c) => (
                                <th
                                    key={c.refKey}
                                    className="px-2 py-1.5 font-semibold"
                                    style={layoutRepeaterColumnWidthStyle(c, columns)}
                                >
                                    {layoutRepeaterColumnHeaderLabel(c)}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {allRows.length === 0 ?
                            <tr>
                                <td colSpan={columns.length} className="px-3 py-4 text-alloy-muted">
                                    No children linked yet.
                                </td>
                            </tr>
                        :   allRows.map((rw, i) => {
                                const rowKey = layoutRuntimeRepeaterRowReactKey(rw, i, item.source ?? item.refKey);
                                return (
                                    <tr key={rowKey} className="border-b border-alloy-stone/80 hover:bg-[#fafbfc]">
                                        {columns.map((c) => (
                                            <td
                                                key={c.refKey}
                                                className="px-2.5 py-2.5 align-middle"
                                                style={{ ...layoutRepeaterColumnWidthStyle(c, columns), color: TEXT }}
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

        return renderRelatedListPanelShell({
            tone: listTone,
            operatorSurfaces: Boolean(operatorSurfaces),
            title: title || "Related records",
            suppressHeader: suppressRelatedListHeader,
            surfaceClassName: `${LAYOUT_RUNTIME_PANEL_SURFACE} ${LAYOUT_RUNTIME_WORK_RAIL}`,
            headerExtra: <LayoutRuntimeLinkDebugModeBanner />,
            headerActions: blockEditToggle,
            children:
                showChildrenEmpty ?
                    <LayoutRuntimeChildrenEmptyState
                        opportunityId={host.entityId ?? ""}
                        canMutate={host.canMutate}
                    />
                : editorPresentation === "cards" ?
                    <LeadEnrollmentCardList
                        item={item}
                        columns={columns}
                        rows={allRows}
                        anchorRecord={record}
                        canMutate={host.canMutate}
                        onAdornmentAction={onAdornmentAction}
                    />
                : editorPresentation === "compact" ?
                    <LayoutRuntimeRelatedListCompactRows
                        item={item}
                        columns={columns}
                        rows={allRows}
                        anchorRecord={record}
                        onAdornmentAction={onAdornmentAction}
                        emptyMessage="No children linked yet."
                    />
                :   childTableMarkup,
        });
    }

    const useEnrollmentReadTable =
        operatorSurfaces &&
        isChildrenRepeater &&
        sectionKey === "children_enrollment" &&
        (item.displayMode ?? "table") === "table";
    const rowTemplatePresentation =
        useEnrollmentReadTable
        && shouldApplyLeadEnrollmentRowTemplatePresentation(item, {
            honorLayoutDocBlocks: composition.honorLayoutDocBlocks,
            opportunityEntityLayoutsVisualConfig:
                isLayoutRuntimeOpportunityDrawerEntityLayoutsVisualConfigEnabledClient(),
        }) ?
            resolveLeadEnrollmentRowTemplatePresentation(item)
        :   null;
    const enrollmentUsesCardList =
        rowTemplatePresentation ?
            rowTemplatePresentation.useCardList && !rowTemplatePresentation.useDetailedGrid
        :   Boolean(composition.leadEnrollmentCardList);
    const enrollmentUsesDetailedGrid =
        rowTemplatePresentation?.useDetailedGrid ?? false;
    const usePersonConnectedChildrenTable =
        operatorSurfaces &&
        isChildrenRepeater &&
        sectionKey === "connected_children" &&
        composition.personOverviewComposition &&
        (item.displayMode ?? "table") === "table";
    const useChildFamilySection =
        operatorSurfaces &&
        isChildrenRepeater &&
        sectionKey === "family_relationships" &&
        composition.childOverviewComposition;
    const useChildFamilyCardList = Boolean(useChildFamilySection && composition.childFamilyCardList);
    const useChildFamilyTable =
        useChildFamilySection &&
        !composition.childFamilyCardList &&
        (item.displayMode ?? "table") === "table";
    const useChildFamilyPresentation = useChildFamilyCardList || useChildFamilyTable;
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
            || (useChildFamilyPresentation && composition.familyPrimaryColumnsOnly),
        ),
    );
    const hideInnerHeader =
        useEnrollmentReadTable || usePersonConnectedChildrenTable || useChildFamilyPresentation || suppressRelatedListHeader;
    const rowLimit =
        useEnrollmentReadTable && maxEnrollmentRows != null && !enrollmentExpanded ? maxEnrollmentRows
        : usePersonConnectedChildrenTable && maxConnectedChildrenRows != null && !enrollmentExpanded ?
            maxConnectedChildrenRows
        : useChildFamilyPresentation && maxFamilyRows != null && !enrollmentExpanded ?
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

    const enrollmentGridMarkup = enrollmentUsesCardList && !enrollmentUsesDetailedGrid ?
        <LeadEnrollmentCardList
            item={item}
            columns={visibleColumns}
            rows={rows}
            anchorRecord={record}
            overflowFooter={enrollmentOverflowFooter}
            canMutate={host.canMutate}
            onAdornmentAction={onAdornmentAction}
            rowTemplate={rowTemplatePresentation ?? undefined}
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
        : useChildFamilyPresentation ? childFamilyMarkup
        : legacyTableMarkup;

    if (useEnrollmentReadTable || usePersonConnectedChildrenTable || useChildFamilyPresentation) {
        const compositionTitle =
            useEnrollmentReadTable ? title || "Children"
            : usePersonConnectedChildrenTable ? title || "Connected children"
            : title || "Family";
        return renderRelatedListPanelShell({
            tone: listTone,
            operatorSurfaces: Boolean(operatorSurfaces),
            title: compositionTitle,
            suppressHeader: suppressRelatedListHeader,
            surfaceClassName: `${LAYOUT_RUNTIME_PANEL_SURFACE} ${isChildrenRepeater ? LAYOUT_RUNTIME_WORK_RAIL : ""}`,
            headerExtra: isChildrenRepeater ? <LayoutRuntimeLinkDebugModeBanner /> : null,
            headerActions: blockEditToggle,
            children:
                showChildrenEmpty ?
                    <LayoutRuntimeChildrenEmptyState
                        opportunityId={host.entityId ?? ""}
                        canMutate={host.canMutate}
                    />
                :   collectionMarkup,
        });
    }

    return (
        <div className={`${LAYOUT_RUNTIME_PANEL_SURFACE} ${isChildrenRepeater ? LAYOUT_RUNTIME_WORK_RAIL : ""}`}>
            {isChildrenRepeater ? <LayoutRuntimeLinkDebugModeBanner /> : null}
            {!hideInnerHeader ?
                <div className={`${LAYOUT_RUNTIME_PANEL_HEADER} justify-between`}>
                    <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: MUTED }}>
                        {title || "Related records"}
                    </span>
                    <div className="flex items-center gap-2">
                        {blockEditToggle}
                        {variant === "proof" ?
                            <span className="text-[10px]" style={{ color: MUTED }}>
                                {rows.length} row{rows.length === 1 ? "" : "s"}
                                {binding.relationKey === "enrollment_children" ? " · enrollment context" : ""}
                            </span>
                        :   null}
                    </div>
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
    tone,
    minimized = false,
    widgetKey,
    leadCard,
}: {
    title: string;
    children: ReactNode;
    accentRail?: "work" | "attention";
    tone?: LayoutEditorWidgetRuntimeTone;
    minimized?: boolean;
    widgetKey?: string;
    leadCard?: { icon: ReactNode; accent: LeadOperatingCardAccentInput };
}) {
    const compact = useLayoutRuntimeSummaryStrip();
    const composition = useLayoutRuntimeCompositionHints();
    const resolvedTone = tone ? resolveLeadOperatingCardAccent(tone) : leadCard ? resolveLeadOperatingCardAccent(leadCard.accent) : undefined;

    if (compact && (composition.leadOperatingSummaryCards || composition.personOperatingSummaryCards || composition.childOperatingSummaryCards) && leadCard) {
        return (
            <LeadOperatingSummaryCard
                title={title}
                icon={leadCard.icon}
                accent={resolveLeadOperatingCardAccent(leadCard.accent)}
                minimized={minimized}
                widgetKey={widgetKey}
            >
                {children}
            </LeadOperatingSummaryCard>
        );
    }

    if (compact) {
        const railClass =
            resolvedTone ? resolveLayoutEditorWidgetToneRailClass(resolvedTone)
            : accentRail === "attention" ? "border-l-alloy-ember/75"
            : accentRail === "work" ? "border-l-alloy-juniper/70"
            :   "";
        const iconBadgeClass = resolvedTone ? resolveLayoutEditorWidgetToneIconClass(resolvedTone) : "";
        const titleClass = resolvedTone ? resolveLayoutEditorWidgetToneTitleClass(resolvedTone) : "text-alloy-midnight/50";
        const surfaceClass = `${LAYOUT_RUNTIME_SUMMARY_WIDGET_SURFACE}${railClass ? ` border-l-[3px] ${railClass}` : ""}`;
        return (
            <div
                className={surfaceClass}
                data-layout-runtime-summary-widget="true"
                {...(resolvedTone ? { "data-layout-runtime-widget-tone": resolvedTone } : {})}
                {...(minimized ? { "data-layout-runtime-summary-widget-minimized": "true" } : {})}
            >
                <div className={`${LAYOUT_RUNTIME_SUMMARY_WIDGET_HEADER}${resolvedTone ? " gap-2 border-b border-alloy-stone/8 px-2.5 py-1.5" : ""}`}>
                    {resolvedTone ?
                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${iconBadgeClass}`} aria-hidden>
                            <span className={`h-1.5 w-1.5 rounded-full ${resolveLayoutEditorWidgetToneDotClass(resolvedTone)}`} />
                        </span>
                    :   <span className={`h-1 w-1 shrink-0 rounded-full ${resolveLayoutEditorWidgetToneDotClass(resolvedTone)}`} aria-hidden />
                    }
                    <span className={`truncate text-[9px] font-semibold uppercase tracking-[0.08em] ${titleClass}`}>
                        {title}
                    </span>
                </div>
                <div className={`${LAYOUT_RUNTIME_SUMMARY_WIDGET_BODY} overflow-hidden`}>{children}</div>
            </div>
        );
    }
    const rail =
        resolvedTone ? resolveLayoutEditorWidgetToneRailClass(resolvedTone)
        : accentRail === "attention" ? "border-l-alloy-ember/75"
        : accentRail === "work" ? "border-l-alloy-juniper/45"
        : "border-l-alloy-juniper/70";
    const iconBadgeClass = resolvedTone ? resolveLayoutEditorWidgetToneIconClass(resolvedTone) : "";
    const titleClass = resolvedTone ? resolveLayoutEditorWidgetToneTitleClass(resolvedTone) : "";
    const headerWash = resolvedTone ? resolveLayoutEditorWidgetToneHeaderWashClass(resolvedTone) : "bg-gradient-to-r from-emerald-50/60 via-white to-white";
    return (
        <div
            className={`${LAYOUT_RUNTIME_PANEL_SURFACE} border-l-[3px] ${rail} shadow-[0_1px_5px_rgba(24,39,58,0.06)]`}
            {...(resolvedTone ? { "data-layout-runtime-widget-tone": resolvedTone } : {})}
        >
            <div className={`${LAYOUT_RUNTIME_PANEL_HEADER} gap-2 ${headerWash}`}>
                {resolvedTone ?
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${iconBadgeClass}`} aria-hidden>
                        <span className={`h-1.5 w-1.5 rounded-full ${resolveLayoutEditorWidgetToneDotClass(resolvedTone)}`} />
                    </span>
                :   null}
                <span className={`text-[11px] font-semibold uppercase tracking-wide ${titleClass || ""}`} style={titleClass ? undefined : { color: MUTED }}>
                    {title}
                </span>
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
    const host = useContext(LayoutRuntimeHostContext);
    const { onSelectDrawerTab, activityTabKey } = useLayoutRuntimeDrawerHost();
    const widgetKey = resolveLayoutRuntimeWidgetKey(item);
    const title = operatorLabel(item, variant) || "Details";
    const isFutureModule = item.metadata?.[FUTURE_MODULE_METADATA_KEY] === true;
    const leadCards = composition.leadOperatingSummaryCards === true;
    const personCards = composition.personOperatingSummaryCards === true;
    const childCards = composition.childOperatingSummaryCards === true;
    const operatingCards = leadCards || personCards || childCards;
    const kpiTile = useLayoutRuntimeKpiTile();
    const compact = useLayoutRuntimeSummaryStrip();
    const operatingCard = (operatingCards || kpiTile) && compact;
    const leadOperatingCard = (leadCards || kpiTile) && compact;
    const widgetStyle = readLayoutEditorWidgetStyle(item.metadata);
    if (widgetStyle.hidden) return null;
    const configuredAccentRail = resolveLayoutEditorWidgetAccentRail(widgetStyle);
    const configuredLeadAccent = resolveLayoutEditorWidgetLeadCardAccent(widgetStyle);
    const configuredTone = widgetStyle.tone ? resolveLayoutEditorWidgetRuntimeTone(widgetStyle) : undefined;
    const leadWidgetAccent = (fallback: LayoutEditorWidgetRuntimeTone) => configuredTone ?? fallback;
    const widgetDescription = widgetStyle.description?.trim();

    if (isFutureModule) {
        if (variant === "production") return null;
        return <FutureModulePlaceholder title={title} />;
    }

    const empty = (
        <DrawerOverviewEmptyState
            message={`No ${title.toLowerCase()} yet`}
            compact
        />
    );
    const emptyQuiet = (
        <DrawerOverviewEmptyState message={`No ${title.toLowerCase()} yet`} compact />
    );

    if (widgetKey === "current_work") {
        const opportunityId = String(record.id ?? record.opportunity_id ?? "").trim();
        if (operatingCard) {
            return (
                <LeadOperatingSummaryCard
                    title={title || "Current Work"}
                    icon={<CheckSquare2 className="h-3.5 w-3.5" aria-hidden />}
                    accent={leadWidgetAccent("green")}
                    widgetKey="current_work"
                >
                    <LeadOperatingCurrentWorkSummaryCard
                        record={record}
                        opportunityId={opportunityId}
                        canMutate={host.canMutate}
                    />
                </LeadOperatingSummaryCard>
            );
        }
        return (
            <LayoutRuntimeCurrentWorkWidget
                record={record}
                opportunityId={opportunityId}
                title={title}
                compact={compact}
                canMutate={host.canMutate}
            />
        );
    }

    if (widgetKey === "follow_ups") {
        const followUps = mapLayoutRuntimeTasksFromVm(record as Record<string, unknown>);
        if (compact && followUps.length === 0 && !kpiTile) return null;
        if (operatingCard) {
            return (
                <LeadOperatingSummaryCard
                    title={title || "Follow-ups"}
                    icon={<CheckSquare2 className="h-3.5 w-3.5" aria-hidden />}
                    accent={leadWidgetAccent("green")}
                    widgetKey="follow_ups"
                >
                    <LayoutRuntimeFollowUpsWidget record={record} title={title || "Follow-ups"} compact chromeless />
                </LeadOperatingSummaryCard>
            );
        }
        return (
            <LayoutRuntimeFollowUpsWidget record={record} title={title || "Follow-ups"} compact={compact} />
        );
    }

    if (widgetKey === "tasks") {
        const followUps = mapLayoutRuntimeTasksFromVm(record as Record<string, unknown>);
        const followUpTitle = title === "Tasks" ? "Follow-ups" : title;
        if (operatingCard && followUps.length === 0 && !kpiTile) return null;
        if (operatingCard) {
            return (
                <LeadOperatingSummaryCard
                    title={followUpTitle}
                    icon={<CheckSquare2 className="h-3.5 w-3.5" aria-hidden />}
                    accent={leadWidgetAccent("green")}
                    widgetKey="tasks"
                >
                    <LayoutRuntimeFollowUpsWidget
                        record={record}
                        title={followUpTitle}
                        compact
                        chromeless
                    />
                </LeadOperatingSummaryCard>
            );
        }
        return (
            <LayoutRuntimeFollowUpsWidget
                record={record}
                title={followUpTitle}
                compact={compact}
            />
        );
    }

    if (widgetKey === "household_summary" && personCards && compact) {
        return <PersonHouseholdSummaryCardShell record={record} />;
    }

    if (widgetKey === "connected_children" && personCards && compact) {
        return <PersonConnectedChildrenSummaryCardShell record={record} />;
    }

    if (widgetKey === "household_contacts" && composition.leadOverviewComposition) {
        return (
            <LeadHouseholdContactsWidget
                record={record}
                onAdornmentAction={onAdornmentAction}
                canMutate={host.canMutate}
            />
        );
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
        if (leadOperatingCard) {
            return (
                <LeadOperatingSummaryCard
                    title={title}
                    icon={<AlertTriangle className="h-3.5 w-3.5" aria-hidden />}
                    accent={leadWidgetAccent("amber")}
                    minimized={!visible}
                    widgetKey="attention"
                >
                    {visible ?
                        <LeadOperatingAttentionSummaryCard record={record} />
                    :   <DrawerOverviewEmptyState message="No attention needed" compact />}
                </LeadOperatingSummaryCard>
            );
        }
        if (!visible) {
            const attentionEmpty = (
                <WidgetChrome title={title} accentRail={configuredAccentRail} tone={configuredTone}>
                    {emptyQuiet}
                </WidgetChrome>
            );
            return composition.compositionSectionSurface ?
                    wrapLayoutRuntimeCompositionWidget(title, configuredTone, emptyQuiet)
                :   attentionEmpty;
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
        if (leadOperatingCard) {
            return (
                <LeadOperatingSummaryCard
                    title={cardTitle}
                    icon={<Calendar className="h-3.5 w-3.5" aria-hidden />}
                    accent={widgetStyle.tone ? configuredLeadAccent : hasContent ? "neutral" : "green"}
                    widgetKey="last_touch"
                >
                    {widgetDescription ?
                        <p className="mb-1 text-[10px] text-alloy-midnight/50">{widgetDescription}</p>
                    :   null}
                    <LeadLastTouchSummaryCard touch={lastTouch} />
                </LeadOperatingSummaryCard>
            );
        }
        return (
            <WidgetChrome title={cardTitle} accentRail={configuredAccentRail} tone={configuredTone}>
                {widgetDescription ?
                    <p className="mb-1 text-[10px] text-alloy-midnight/50">{widgetDescription}</p>
                :   null}
                <LeadLastTouchSummaryCard touch={lastTouch} />
            </WidgetChrome>
        );
    }

    if (widgetKey === "children_list") {
        const enrollmentHealth = summarizeLeadDrawerEnrollmentHealth(record);
        const cardTitle = title.trim() || "Enrollment Health";
        if (leadOperatingCard) {
            return (
                <LeadOperatingSummaryCard
                    title={cardTitle}
                    icon={<Heart className="h-3.5 w-3.5" aria-hidden />}
                    accent={leadWidgetAccent("green")}
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
        const viewAll =
            onSelectDrawerTab && activityTabKey ?
                () => onSelectDrawerTab(activityTabKey)
            :   undefined;
        const preview =
            composition.childOverviewComposition || composition.personOverviewComposition ?
                <PersonActivityPreview entries={entries} onViewAll={viewAll} />
            :   <LeadActivityPreview entries={entries} onViewAll={viewAll} />;

        if (operatingCard || kpiTile) {
            return (
                <LeadOperatingSummaryCard
                    title={title || "Activity"}
                    icon={<Activity className="h-3.5 w-3.5" aria-hidden />}
                    accent={configuredLeadAccent ?? "blue"}
                    widgetKey="activity"
                >
                    {preview}
                </LeadOperatingSummaryCard>
            );
        }

        const activityMarkup = (
            <div
                className="min-w-0 break-words px-1"
                data-layout-runtime-activity-widget="true"
                {...(configuredTone ? { "data-layout-runtime-widget-tone": configuredTone } : {})}
            >
                {preview}
            </div>
        );
        if (composition.compositionSectionSurface) {
            return wrapLayoutRuntimeCompositionWidget(title || "Activity", configuredTone, activityMarkup);
        }
        return <WidgetChrome title={title} tone={configuredTone}>{activityMarkup}</WidgetChrome>;
    }

    if (widgetKey === "documents") {
        const hasContent =
            record.documents != null
            || record._documents_preview != null
            || (record._overview_data
                && typeof record._overview_data === "object"
                && Array.isArray((record._overview_data as Record<string, unknown>).documents));
        const markup = (
            <LayoutRuntimeDocumentsOverviewWidget record={record} title={title} showEmptyState={!hasContent} />
        );
        return composition.compositionSectionSurface ?
                wrapLayoutRuntimeCompositionWidget(title, configuredTone, markup)
            :   <WidgetChrome title={title} tone={configuredTone}>{markup}</WidgetChrome>;
    }

    if (widgetKey === "notes" || widgetKey === "recent_communication") {
        const hasContent =
            widgetKey === "notes"
                ? layoutRuntimeNotesWidgetHasContent(record)
                : layoutRuntimeCommunicationWidgetHasContent(record);
        const markup = (
            <LayoutRuntimeNotesCommunicationWidget
                record={record}
                widgetKey={widgetKey === "notes" ? "notes" : "recent_communication"}
                showEmptyState={!hasContent}
            />
        );
        return composition.compositionSectionSurface ?
                wrapLayoutRuntimeCompositionWidget(title, configuredTone, markup)
            :   <WidgetChrome title={title} tone={configuredTone}>{markup}</WidgetChrome>;
    }

    if (kpiTile) {
        return (
            <LeadOperatingSummaryCard
                title={title}
                icon={<CheckSquare2 className="h-3.5 w-3.5" aria-hidden />}
                accent={configuredLeadAccent ?? "neutral"}
                widgetKey={widgetKey}
            >
                {widgetDescription ?
                    <p className="mb-1 text-[10px] text-alloy-midnight/50">{widgetDescription}</p>
                :   null}
                {empty}
            </LeadOperatingSummaryCard>
        );
    }

    const fallbackBody = (
        <>
            {widgetDescription ?
                <p className="mb-1 text-[10px] text-alloy-midnight/50">{widgetDescription}</p>
            :   null}
            {empty}
        </>
    );

    return composition.compositionSectionSurface ?
            wrapLayoutRuntimeCompositionWidget(title, configuredTone, fallbackBody)
        :   (
            <WidgetChrome title={title} accentRail={configuredAccentRail} tone={configuredTone}>
                {fallbackBody}
            </WidgetChrome>
        );
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
    const { stackRows, stackFieldColumns: stackFieldColumnsInSection } = useContext(LayoutRuntimeSectionContext);
    const kpiTile = useLayoutRuntimeKpiTile();
    const summaryCompact = useLayoutRuntimeSummaryStrip() && useLayoutRuntimeCompositionHints().summaryStripCompactRow;
    const stackFieldColumns =
        stackFieldColumnsInSection === true
        || useLayoutRuntimeCompositionHints().stackFieldColumns === true;

    if (stackRows || stackFieldColumns) {
        return (
            <div
                className="flex flex-col gap-2.5"
                data-layout-runtime-stack-rows={stackRows ? "true" : undefined}
                data-layout-runtime-stack-field-columns={stackFieldColumns ? "true" : undefined}
            >
                {row.columns.map((col) => (
                    <ColumnView key={col.id} record={record} column={col} anchorEntity={anchorEntity} />
                ))}
            </div>
        );
    }

    if (summaryCompact && kpiTile) {
        return (
            <div className="flex min-w-0 flex-col gap-2" data-layout-runtime-summary-row="true">
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
        <div
            className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[repeat(12,minmax(0,1fr))]"
            data-layout-runtime-row-columns={row.columns.length}
        >
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
    const onAdornmentAction = useContext(AdornmentActionContext);
    const host = useContext(LayoutRuntimeHostContext);
    if (!evaluateLayoutCondition(record, section.visibleWhen)) return null;

    const isKpiTile = sectionIsKpiTile(section);
    const effectiveSectionPresentation: LayoutRuntimeSectionPresentation =
        sectionPresentation === "summary_strip" || isKpiTile ? "summary_strip" : sectionPresentation;

    const useCompositionSurfaceEarly = composition.compositionSectionSurface === true && operatorSurfaces;
    const visibilityCtx = {
        compositionShell: useCompositionSurfaceEarly,
        sectionPresentation: effectiveSectionPresentation,
        opportunityEntityLayoutsVisualConfig: isLayoutRuntimeOpportunityDrawerEntityLayoutsVisualConfigEnabledClient(),
    };
    if (!shouldRenderLayoutRuntimeSection(section, record, visibilityCtx)) {
        return null;
    }

    const useHouseholdProfile =
        shouldUseDrawerHouseholdProfileSubstitution({
            sectionKey: section.key,
            compositionSectionSurface: composition.compositionSectionSurface,
            operatorSurfaces,
            opportunityEntityLayoutsVisualConfig: visibilityCtx.opportunityEntityLayoutsVisualConfig,
            honorLayoutDocBlocks: composition.honorLayoutDocBlocks,
        }) && !sectionHasLayoutOwnedComposition(section);

    const stackFieldColumns =
        composition.stackFieldColumns === true || readCardWidthFraction(section) === "quarter";

    const sectionContext = {
        sectionPresentation: effectiveSectionPresentation,
        sectionKey: section.key,
        kpiTile: isKpiTile,
        stackFieldColumns,
        stackRows:
            composition.compositionSectionSurface === true
            && (section.key === "household_contact" || section.key === "household_relationships")
            && useHouseholdProfile,
    };

    const showHouseholdContactsList =
        useHouseholdProfile
        && section.key === "household_contact"
        && layoutSectionIncludesWidget(section, "household_contacts");

    const body = useHouseholdProfile ?
        <DrawerHouseholdProfileSection
            record={record}
            variant={section.key === "household_contact" ? "lead" : "person"}
            onAdornmentAction={onAdornmentAction}
            showContactsList={showHouseholdContactsList}
            canMutate={host.canMutate}
        />
    :   (
            <LayoutRuntimeRenderedContactIdsProvider>
                <LayoutRuntimeSectionContext.Provider value={sectionContext}>
                    {section.rows.map((row) => (
                        <RowView key={row.id} record={record} row={row} anchorEntity={anchorEntity} />
                    ))}
                </LayoutRuntimeSectionContext.Provider>
            </LayoutRuntimeRenderedContactIdsProvider>
        );

    if (effectiveSectionPresentation === "summary_strip") {
        return (
            <div
                className={isKpiTile ? "min-w-0" : "flex flex-col gap-2"}
                data-layout-runtime-section-presentation="summary_strip"
                {...(isKpiTile ? { "data-layout-runtime-kpi-tile": "true" } : {})}
            >
                {body}
            </div>
        );
    }

    const useCompositionSurface = composition.compositionSectionSurface === true && operatorSurfaces;
    const isEnrollmentSection = section.key === "children_enrollment";

    if (useCompositionSurface) {
        const sectionEyebrow =
            LEAD_COMPOSITION_SECTION_EYEBROWS[section.key]
            ?? PERSON_COMPOSITION_SECTION_EYEBROWS[section.key]
            ?? CHILD_COMPOSITION_SECTION_EYEBROWS[section.key]
            ?? resolveDrawerOverviewSectionEyebrow(section.key);
        const bodyClassName =
            isEnrollmentSection
            || section.key === "connected_children"
            || section.key === "program_enrollment"
            || section.key === "family_relationships"
            || section.key === "household_relationships"
            || section.key === "household_contact" ?
                DRAWER_OVERVIEW_PANEL_ENROLLMENT_BODY_CLASS
            :   DRAWER_OVERVIEW_PANEL_BODY_CLASS;

        if (composition.suppressDrawerOverviewSectionHeader) {
            return (
                <div
                    className={bodyClassName}
                    data-layout-runtime-section-key={section.key}
                    data-layout-runtime-section-presentation="composition_body_only"
                >
                    {body}
                </div>
            );
        }

        return (
            <div className="flex h-full min-h-0 flex-col" data-layout-runtime-section-shell="true">
                <DrawerOverviewPanelShell
                    sectionKey={section.key}
                    eyebrow={sectionEyebrow}
                    title={section.title}
                    variant={drawerOverviewSectionIsCenterpiece(section.key) ? "centerpiece" : "default"}
                    tone={resolveLayoutSectionWidgetTone(section)}
                    bodyClassName={bodyClassName}
                >
                    {body}
                </DrawerOverviewPanelShell>
            </div>
        );
    }

    let surfaceClass = LAYOUT_RUNTIME_SECTION_SURFACE;
    let headerClass = LAYOUT_RUNTIME_SECTION_HEADER;
    let bodyPadding = "gap-3 p-3";

    if (operatorSurfaces) {
        const isPrimaryWorkspace = isEnrollmentSection;
        surfaceClass =
            isPrimaryWorkspace ? LAYOUT_RUNTIME_PRIMARY_WORKSPACE_SECTION : LAYOUT_RUNTIME_BODY_SECTION_SURFACE;
        headerClass =
            isPrimaryWorkspace ? LAYOUT_RUNTIME_PRIMARY_WORKSPACE_HEADER : LAYOUT_RUNTIME_BODY_SECTION_HEADER;
        bodyPadding = isPrimaryWorkspace ? "" : "gap-2.5 p-3 sm:p-3.5";
    }

    return (
        <div
            className={surfaceClass}
            data-layout-runtime-section-key={section.key}
            {...(isEnrollmentSection ?
                { "data-layout-runtime-primary-workspace-section": "true" }
            :   {})}
        >
            <div className={headerClass}>
                <div className="text-inherit">{section.title}</div>
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
    /** When false, render sections directly (used by LayoutRuntimeSectionFlowView to avoid recursion). */
    useSectionFlow?: boolean;
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
    useSectionFlow = true,
}: LayoutRuntimePlanViewProps) {
    const plan = useMemo(() => planProp ?? buildLayoutRuntimePlan(doc), [planProp, doc]);
    const anchorEntity = plan.entityType;
    const hostContext = useMemo(
        () => ({ entityId, canMutate, anchorEntity }),
        [entityId, canMutate, anchorEntity],
    );

    const visibleSections = useMemo(
        () => (doc?.sections ?? []).filter((section) => evaluateLayoutCondition(record, section.visibleWhen)),
        [doc?.sections, record],
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
                    {visibleSections.length > 0 && useSectionFlow ?
                        <LayoutRuntimeSectionFlowView
                            doc={doc}
                            sections={visibleSections}
                            record={record}
                            entityId={entityId ?? ""}
                            canMutate={canMutate}
                            onAdornmentAction={onAdornmentAction}
                            sectionPresentation={sectionPresentation}
                            stackClassName="min-w-0"
                            rowClassName="min-w-0 items-stretch"
                            rowCellClassName="min-w-0 flex h-full min-h-0 flex-col"
                        />
                    :   null}
                    {!useSectionFlow ?
                        visibleSections.map((section) => (
                            <SectionView
                                key={section.id}
                                record={record}
                                section={section}
                                anchorEntity={anchorEntity}
                                sectionPresentation={sectionPresentation}
                            />
                        ))
                    :   null}
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
