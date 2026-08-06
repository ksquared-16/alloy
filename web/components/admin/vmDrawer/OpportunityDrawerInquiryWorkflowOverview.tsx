"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import OpportunityInquiryChildrenSection from "@/components/admin/entity/OpportunityInquiryChildrenSection";
import ParticipantDecisionsPanel from "@/components/admin/opportunity/ParticipantDecisionsPanel";
import { FamilyContactsPanel } from "@/components/admin/opportunity/FamilyContactsPanel";
import { OpportunityInquirySummaryActivity } from "@/components/admin/opportunity/OpportunityInquirySummaryActivity";
import { OpportunityInquirySummaryRightColumn } from "@/components/admin/opportunity/OpportunityInquirySummaryRightColumn";
import { OpportunityInquiryTourDateBlock } from "@/components/admin/opportunity/tours/OpportunityInquiryTourDateBlock";
import {
    oppInqEyebrow,
    oppInqInnerCardCompact,
    oppInqLeadSummaryShellClassName,
    oppInqReadonlyField,
} from "@/components/admin/drawer/opportunityInquiryDrawerTypography";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { useAdminViewerTimezone } from "@/contexts/AdminViewerTimezoneContext";
import type { FieldDefForLinkedEdit } from "@/lib/admin/drawer/linkedRecordFieldEditing";
import { inquiryChildrenRowCountFromEntity, mapRawInquiryChildrenToDrawerRows } from "@/lib/admin/drawer/inquiryChildrenDrawerRows";
import { logDrawerHardTrace } from "@/lib/adminV2/drawer/drawerHardTrace";
import { openInquiryChildPersonFromOpportunitySync } from "@/lib/admin/drawer/openInquiryChildPersonFromOpportunity";
import { opportunityStatusDisplayLabelSafe } from "@/lib/admin/drawer/opportunityRawValueGuard";
import { isOperationalWorkV1Enabled } from "@/lib/admin/operationalWork/operationalWorkV1UiGate";
import { isTaskAssistV1UiEnabled } from "@/lib/agent/taskAssist/taskAssistV1UiGate";
import { loadOpportunityDrawerViaViewModel } from "@/lib/adminV2/viewModel/drawer/opportunity/loadOpportunityDrawerViaViewModel";
import { opportunityDrawerVmFirstPaintDependencySettled } from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerViewModelFirstPaint";
import type { OpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/types";
import { resolveDrawerSubjectFocusPresentation } from "@/lib/admin/drawer/resolveDrawerSubjectFocusPresentation";
import { opportunityDisplayLocationFromRecord } from "@/lib/opportunities/resolveOpportunityDisplayLocation";

type Props = {
    displayVm: OpportunityDrawerViewModel;
    drawerId: string;
    opportunitySingular: string;
    onSelectTab: (tab: "activity" | "documents") => void;
};

export default function OpportunityDrawerInquiryWorkflowOverview({
    displayVm,
    drawerId,
    opportunitySingular,
    onSelectTab,
}: Props) {
    const { canMutate } = useAdminAuth();
    const { openDrawer, drawer, drawerLinkPending } = useAdminDrawer();
    const router = useRouter();
    const viewerTz = useAdminViewerTimezone();
    const [relatedPeopleRefreshKey, setRelatedPeopleRefreshKey] = useState(0);

    const record = displayVm.above_fold.record ?? {};

    const subjectFocusPresentation = useMemo(
        () => resolveDrawerSubjectFocusPresentation(drawer.drawerSubjectContext),
        [drawer.drawerSubjectContext],
    );
    const inqModel = displayVm.above_fold.render_model.inquiry_summary;
    const shellContract = displayVm.layout.shell;
    const fcSlot = inqModel?.family_contacts;
    const rightColumnModel = inqModel?.right_column ?? null;
    const inquirySummaryColumnMode = inqModel?.column_mode ?? "two";
    const showInquirySummaryRightColumn = inqModel?.show_right_column === true;
    const showTourFromPrimaryOnly = inqModel?.what_matters?.tour_from_metadata === true;
    const showTourFromBookings = inqModel?.what_matters?.show_tour_bookings_enrichment === true;
    const showWhatMattersTourSlot = showTourFromPrimaryOnly || showTourFromBookings;
    const tourBookingsFirstPaintReady = opportunityDrawerVmFirstPaintDependencySettled(
        displayVm,
        "tour_bookings"
    );
    const vmActiveTourBookings = displayVm.summaries.active_tour_bookings ?? [];
    /** VM first paint is authoritative — do not wait on legacy background full hydrate. */
    const vmFamilyContactsReady = displayVm.structureSettled && displayVm.first_paint.settled;

    const stageLabel =
        opportunityStatusDisplayLabelSafe(
            record,
            displayVm.header.status.renderAs === "readonly_pill" ? displayVm.header.status.label : null
        ) ?? "—";

    const drawerChildRows = useMemo(() => {
        const raw = (record._inquiry_children as unknown[]) ?? [];
        return mapRawInquiryChildrenToDrawerRows(raw);
    }, [record._inquiry_children]);

    const opportunityDisplayLocationKind = useMemo(() => {
        return opportunityDisplayLocationFromRecord(record).kind;
    }, [record]);

    const expectedRowCount = useMemo(() => {
        const hasSlot = shellContract.section_slots.some((s) => s.section_key === "inquiry_children");
        return Math.max(
            drawerChildRows.length,
            inquiryChildrenRowCountFromEntity(record),
            hasSlot ? 1 : 0
        );
    }, [drawerChildRows.length, record, shellContract.section_slots]);

    const showInquiryChildren =
        shellContract.section_slots.some((s) => s.section_key === "inquiry_children") ||
        drawerChildRows.length > 0;

    /**
     * The per-child decision surface is CONFIGURATION-GATED, not stage-gated.
     *
     * This used to read `current_stage_key === "decision"`, which hardcoded one tenant's stage key
     * into the drawer: a process that named the stage anything else got no surface, and a process
     * that had no per-child decisions on Decision got one anyway. The panel now asks the platform
     * whether this stage's work configures participant decisions and renders nothing when it does
     * not, so the stage key stops being product logic.
     */
    const participantDecisionScope = useMemo(() => {
        const stageKey = displayVm.workspace.lifecycle_rail?.current_stage_key?.trim();
        const departmentId = drawer.opportunityWorkspaceContext?.department_id?.trim();
        if (!stageKey || !departmentId) return null;
        return { opportunityId: drawerId, departmentId, stageKey, templateKey: "" };
    }, [displayVm.workspace.lifecycle_rail?.current_stage_key, drawer.opportunityWorkspaceContext, drawerId]);

    const refreshVm = useCallback(() => {
        void loadOpportunityDrawerViaViewModel(drawerId, drawer.opportunityWorkspaceContext ?? null);
        setRelatedPeopleRefreshKey((n) => n + 1);
    }, [drawer.opportunityWorkspaceContext, drawerId]);

    const showRightColumnOperational =
        isOperationalWorkV1Enabled() || isTaskAssistV1UiEnabled();

    return (
        <div className="space-y-3" data-opportunity-inquiry-workflow-overview="true" data-debug-drawer-path="OpportunityDrawerInquiryWorkflowOverview">
            <div
                className={oppInqLeadSummaryShellClassName}
                data-opportunity-inquiry-summary="true"
                data-opportunity-inquiry-summary-layout="workflow_vm_v1"
            >
                <div className="flex flex-wrap items-end justify-between gap-1.5 border-b border-alloy-stone/12 pb-1">
                    <span className={oppInqEyebrow}>{opportunitySingular} summary</span>
                    {stageLabel && stageLabel !== "—" ?
                        <span className="text-[10px] font-medium tracking-[0.08em] text-alloy-midnight/40">
                            Status · <span className="text-alloy-midnight/60">{stageLabel}</span>
                        </span>
                    :   null}
                </div>
                <div
                    className={`mt-0.5 grid grid-cols-1 gap-0.5 ${inquirySummaryColumnMode === "two" ? "lg:grid-cols-2 lg:items-start" : ""} lg:gap-1`}
                    data-opportunity-inquiry-summary-columns={inquirySummaryColumnMode}
                >
                    <div className={`${oppInqInnerCardCompact} min-h-0`} data-opportunity-lead-summary="true">
                        <div className={oppInqEyebrow}>Family & contacts</div>
                        <div className="mt-1 flex min-h-0 flex-col">
                            <FamilyContactsPanel
                                variant="summary"
                                opportunityId={drawerId}
                                record={record}
                                canMutate={!!canMutate}
                                sectionKey="family_contacts"
                                departmentId={displayVm.workspace.department_id}
                                workUnitId={displayVm.workspace.work_unit_id}
                                router={router}
                                openDrawer={openDrawer}
                                recordHydrationPending={false}
                                opportunityFullHydratePending={!vmFamilyContactsReady}
                                opportunityFullHydrateApplied={vmFamilyContactsReady}
                                opportunityRelationshipsFullHydrateFailed={
                                    fcSlot?.relationships_full_hydrate_failed === true
                                }
                                shellReservedAdditionalCount={
                                    fcSlot?.shell_reserved_additional_count ??
                                    Math.max(
                                        0,
                                        Number(
                                            (record as Record<string, unknown>)._additional_contacts_shell_count ?? 0
                                        ) || 0
                                    )
                                }
                                fieldDefinitions={
                                    (record._field_definitions as FieldDefForLinkedEdit[] | undefined) ?? []
                                }
                                onPrimaryPersonUpdated={() => refreshVm()}
                                onLinkedPersonUpdated={() => refreshVm()}
                                openForm={() => {}}
                                actionsFetchEnabled={vmFamilyContactsReady}
                                refreshKey={relatedPeopleRefreshKey}
                                onRegistryApplied={refreshVm}
                            />
                        </div>
                        <div
                            className="mt-2.5 min-h-[3.25rem] border-t border-alloy-stone/10 pt-2"
                            data-shell-slot="inquiry_tour_date"
                            data-opportunity-tour-block="true"
                        >
                            {showWhatMattersTourSlot || record.metadata != null ?
                                <OpportunityInquiryTourDateBlock
                                    opportunityId={drawerId}
                                    locationId={String(record.location_id ?? "").trim()}
                                    statusKey={typeof record.status_key === "string" ? record.status_key : null}
                                    metadata={record.metadata}
                                    viewerTimezone={viewerTz}
                                    canMutate={!!canMutate}
                                    onRefresh={refreshVm}
                                    labelClassName={oppInqEyebrow}
                                    readonlyFieldClassName={oppInqReadonlyField}
                                    sharedActiveBookings={
                                        tourBookingsFirstPaintReady ? vmActiveTourBookings : undefined
                                    }
                                    fetchEnabled={
                                        showTourFromBookings &&
                                        !showTourFromPrimaryOnly &&
                                        !tourBookingsFirstPaintReady
                                    }
                                />
                            :   null}
                        </div>
                    </div>
                    {showInquirySummaryRightColumn && showRightColumnOperational ?
                        <div
                            className={`${oppInqInnerCardCompact} flex min-h-0 min-w-0 flex-col`}
                            data-shell-slot="inquiry_summary_right"
                            data-opportunity-inquiry-right-column="true"
                        >
                            <OpportunityInquirySummaryRightColumn
                                model={
                                    rightColumnModel ?? {
                                        tasks: {
                                            visible: true,
                                            state: "empty",
                                            open_count: 0,
                                            open_tasks: [],
                                        },
                                        reminders: {
                                            visible: true,
                                            state: "empty",
                                            next_follow_up_iso: null,
                                        },
                                        orchestrator_handoff: {
                                            visible: false,
                                            state: "hidden",
                                        },
                                    }
                                }
                                opportunityId={drawerId}
                                entityLabel={String(record.name ?? "").trim() || null}
                                overviewData={record}
                                fetchEnabled={false}
                                vmFirstPaintCommit
                                initialScheduledSends={displayVm.summaries.reminders.scheduled_sends}
                                opportunitySingular={opportunitySingular}
                                reviewAssistLoading={false}
                            />
                            <OpportunityInquirySummaryActivity
                                opportunityId={drawerId}
                                canMutate={!!canMutate}
                                fetchEnabled={false}
                                onInvalidate={refreshVm}
                                onGoToTab={onSelectTab}
                            />
                        </div>
                    :   null}
                </div>
            </div>
            {participantDecisionScope ?
                <ParticipantDecisionsPanel
                    scope={participantDecisionScope}
                    canMutate={!!canMutate}
                    onApplied={refreshVm}
                />
            :   null}
            {showInquiryChildren ?
                <div
                    className={oppInqLeadSummaryShellClassName}
                    data-opportunity-inquiry-children-section="true"
                >
                    <div className="flex flex-wrap items-end justify-between gap-1.5 border-b border-alloy-stone/12 pb-1">
                        <span className={oppInqEyebrow}>{opportunitySingular} children</span>
                    </div>
                    <div className="mt-1 min-w-0 px-0.5 pb-0.5">
                    <OpportunityInquiryChildrenSection
                        rows={drawerChildRows}
                        highlightSubjectIds={subjectFocusPresentation.highlightSubjectIds}
                        opportunityId={drawerId}
                        opportunityStartDate={(() => {
                            // Opportunity-level legacy field key — not the OCM column.
                            const rawStart =
                                record.desired_start_date ??
                                (record.metadata as Record<string, unknown> | null)?.desired_start_date;
                            return typeof rawStart === "string" && rawStart.trim() ?
                                    rawStart.trim().slice(0, 10)
                                :   null;
                        })()}
                        canEdit={!!canMutate}
                        enrichmentFetchEnabled={drawerChildRows.length > 0 && !!canMutate}
                        placementLabelFetchEnabled={drawerChildRows.length > 0}
                        embeddedInPremiumSection
                        recordDetailPending={drawerChildRows.length === 0 && expectedRowCount > 0}
                        shellReservedRowCount={expectedRowCount}
                        opportunityDisplayLocationKind={opportunityDisplayLocationKind ?? undefined}
                        onChildrenMutated={refreshVm}
                        configuredLifecycleStages={
                            displayVm.workspace.lifecycle_rail?.stages.map((s, index) => ({
                                id: s.key,
                                key: s.key,
                                label: s.label,
                                sort_order: index,
                                is_active: true,
                            })) ?? null
                        }
                        opportunityRecord={record}
                        opportunityWorkspaceContext={drawer.opportunityWorkspaceContext ?? null}
                        linkPending={drawerLinkPending}
                        onOpenChild={(row) => {
                            logDrawerHardTrace(
                                "child_click",
                                "components/admin/vmDrawer/OpportunityDrawerInquiryWorkflowOverview.tsx",
                                {
                                    opportunity_id: drawerId,
                                    person_id: row.person_id,
                                    customer_member_id: row.customer_member_id,
                                }
                            );
                            void openInquiryChildPersonFromOpportunitySync({
                                openDrawer,
                                opportunityRecord: record,
                                opportunityId: drawerId,
                                opportunityWorkspaceContext: drawer.opportunityWorkspaceContext ?? null,
                                linkPending: drawerLinkPending,
                                row,
                            });
                        }}
                    />
                    </div>
                </div>
            :   null}
        </div>
    );
}
