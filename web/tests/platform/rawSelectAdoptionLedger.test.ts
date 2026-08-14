import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Raw `<select>` adoption ledger — the platform select primitive is `AlloySelect`.
 *
 * Doctrine: operator and configuration product UI presents choice through the platform
 * primitive (`components/workspace/AlloySelect.tsx`), never a raw browser `<select>`.
 * The reason is in the primitive's own source: a native option popup ignores CSS on
 * macOS and renders the OS menu — system font, system background, browser-blue
 * selection. That violates the visual doctrine no matter how the trigger is styled,
 * and it cannot be fixed at the call site.
 *
 * This ledger enumerates every enforced file that still renders a raw `<select>`, with
 * its current count. It exists so adoption can only move one direction:
 *
 *   - a NEW enforced file with a raw `<select>` fails the test
 *   - an EXISTING file that grows more raw `<select>`s fails the test
 *   - a file that sheds them fails until the ledger is lowered to match
 *
 * Exempt classes (deliberately NOT enforced — each is a real exception, not an excuse):
 *
 *   | Class            | Why exempt                                                    |
 *   |------------------|---------------------------------------------------------------|
 *   | `app/legacy-admin/**` | Deprecated surface being retired; not operator product UI. |
 *   | `app/dev/**`, `app/(proof)/**` | Engineering harnesses, never shipped to an operator. |
 *   | `tests/**`, `certification/**` | Fixtures asserting behaviour, including native fallback. |
 *   | `components/public/**` | Parent-facing surface with its own design system. |
 *   | `SelectFieldControl.tsx` | The shared native control itself. On the migration path — see below. |
 *   | `AlloySelect.tsx` | The primitive; the only mention is its own docstring. |
 *
 * NOTE on `SelectFieldControl`: it is a *shared* wrapper around a native `<select>`,
 * so it is one file but many rendered surfaces. Converting it to delegate to
 * `AlloySelect` retires its consumers in a single change; until then it stays exempt
 * so this ledger measures call-site adoption rather than double-counting.
 */

const ROOT = join(__dirname, "..", "..");

/** Directories that ship operator/configuration product UI. */
const ENFORCED_ROOTS = ["app", "components", "lib"] as const;

function isExempt(rel: string): boolean {
    if (rel.startsWith("app/legacy-admin/")) return true;
    if (rel.startsWith("app/dev/") || rel.startsWith("app/(proof)")) return true;
    if (rel.startsWith("components/public/")) return true;
    if (rel === "components/admin/fields/SelectFieldControl.tsx") return true;
    if (rel === "components/workspace/AlloySelect.tsx") return true;
    return false;
}

const RAW_SELECT = /<select[\s>]/g;

/**
 * Every enforced file still rendering a raw `<select>`, and how many.
 * This list may SHRINK. It may never grow, and no key may be added.
 */
const LEDGER: Readonly<Record<string, number>> = {
    "app/adminV2/communications/AnnouncementsWorkspace.tsx": 1,
    "app/adminV2/communications/AutomationRuleConditionEditor.tsx": 2,
    "app/adminV2/communications/CommandCenterShell.tsx": 1,
    "app/adminV2/communications/CommsAudienceMultiSelect.tsx": 1,
    "app/adminV2/communications/TemplateCategoryField.tsx": 1,
    "app/adminV2/communications/TemplatesWorkspace.tsx": 5,
    "app/adminV2/communications/TourInternalRecipientsMultiSelect.tsx": 1,
    "app/adminV2/communications/TourTemplateDeliveryAutomationCard.tsx": 3,
    "app/adminV2/components/aiCommandSurface/commandSession/GenericBosCommandSessionBody.tsx": 1,
    "app/adminV2/components/aiCommandSurface/ConfigLayoutAssistFieldSetupCard.tsx": 2,
    "app/adminV2/components/MyTasksPanel.tsx": 1,
    "app/adminV2/components/QuickMessageModal.tsx": 1,
    "app/adminV2/pos/PosPacketResponsibilityEditor.tsx": 3,
    "app/adminV2/pos/RecordLaunchPicker.tsx": 1,
    "app/adminV2/processing/ClassificationPanel.tsx": 1,
    "app/adminV2/settings/analytics/BuilderIconPicker.tsx": 1,
    "app/adminV2/settings/analytics/MetricFormFields.tsx": 5,
    "app/adminV2/settings/analytics/MetricSetupFlow.tsx": 1,
    "app/adminV2/settings/analytics/RollupBuilderPanel.tsx": 2,
    "app/adminV2/settings/analytics/VisualizationBuilderPanel.tsx": 2,
    "app/adminV2/settings/attention-sla-rules/page.tsx": 1,
    "app/adminV2/settings/kpis/KpiPlacementsSettingsClient.tsx": 4,
    "app/adminV2/settings/tours/availability/TourAvailabilitySettingsClient.tsx": 3,
    "components/admin/AdminCollectPaymentModal.tsx": 1,
    "components/admin/agentLab/AgentConfigLabClient.tsx": 3,
    "components/admin/agentLab/AgentLabAssistantPanel.tsx": 1,
    "components/admin/AssociatedDocumentUploadModal.tsx": 2,
    "components/admin/communications/CommunicationPreferencesEditor.tsx": 1,
    "components/admin/DataTable.tsx": 1,
    "components/admin/drawer/JobDrawerV2.tsx": 5,
    "components/admin/drawer/record/RecordDrawerStatusSelect.tsx": 1,
    "components/admin/entity/EntityDrawerOverview.tsx": 5,
    "components/admin/entity/OpportunityInquiryChildrenSection.tsx": 5,
    "components/admin/EntityFieldsClient.tsx": 2,
    "components/admin/fields/DataModelFieldCreateRow.tsx": 2,
    "components/admin/fields/DataModelFieldRow.tsx": 1,
    "components/admin/fields/DataModelRelationshipCreateRow.tsx": 1,
    "components/admin/fields/FieldDefinitionEditModal.tsx": 2,
    "components/admin/fields/FieldRequiredInlineCell.tsx": 1,
    "components/admin/focusPanel/cards/AssignmentProposalControls.tsx": 1,
    "components/admin/focusPanel/cards/CurrentWorkParticipantDecisionsPanel.tsx": 1,
    "components/admin/focusPanel/cards/FormDeliverySurface.tsx": 1,
    "components/admin/focusPanel/cards/SchedulingCard.tsx": 1,
    "components/admin/focusPanel/drillIn/InlineRuntimeFieldList.tsx": 1,
    "components/admin/focusPanel/drillIn/NestedSurfaceFieldLayoutSurface.tsx": 5,
    "components/admin/focusPanel/FocusPanelCardInspector.tsx": 15,
    "components/admin/focusPanel/identity/IdentityFieldValue.tsx": 1,
    "components/admin/forms/documentComposition/DocumentCompositionBlockCard.tsx": 5,
    "components/admin/forms/documentComposition/DocumentCompositionEditor.tsx": 1,
    "components/admin/forms/documentComposition/DocumentCompositionPreview.tsx": 1,
    "components/admin/forms/FormFieldAuthoringCard.tsx": 3,
    "components/admin/forms/FormGroupAuthoringCard.tsx": 2,
    "components/admin/JobManualChargeForm.tsx": 1,
    "components/admin/opportunity/actions/AddPersonModal.tsx": 1,
    "components/admin/opportunity/actions/ChangeEnrollmentStatusModal.tsx": 3,
    "components/admin/opportunity/actions/ContactAttemptedModal.tsx": 1,
    "components/admin/opportunity/actions/MarkLostModal.tsx": 1,
    "components/admin/opportunity/actions/UpdateStatusAddNoteModal.tsx": 1,
    "components/admin/opportunity/OperationalWorkAssigneeSelect.tsx": 1,
    "components/admin/opportunity/OpportunityEnrollmentPacketModal.tsx": 2,
    "components/admin/opportunity/OpportunityRecordCreateWorkModal.tsx": 1,
    "components/admin/opportunity/SendFormToOpportunityModal.tsx": 1,
    "components/admin/OptionSetKeyPicker.tsx": 1,
    "components/admin/quoteIntake/OpportunityQuoteIntakeSection.tsx": 1,
    "components/admin/RelatedRecordsTabs.tsx": 1,
    "components/admin/taskAssist/TaskAssistOpportunityWorkspace.tsx": 2,
    "components/admin/vmDrawer/VmOpportunityStatusControl.tsx": 1,
    "components/adminV2/commercial/CommercialConfigWorkspace.tsx": 14,
    "components/adminV2/commercial/CommercialSimulatorPanel.tsx": 5,
    "components/adminV2/commercial/policyEditorShared.tsx": 5,
    "components/adminV2/commercial/TuitionGridWorkspace.tsx": 1,
    "components/adminV2/intelligence/OperationalIntelligencePanel.tsx": 3,
    "components/adminV2/messaging/ComposerMessageTextToolbar.tsx": 1,
    "components/adminV2/scheduling/screens/SchedulingPatterns.tsx": 1,
    "components/adminV2/settings/access/AccessUsersConfigurationPage.tsx": 2,
    "components/adminV2/settings/ActionButtonCreatePanel.tsx": 1,
    "components/adminV2/settings/ActionPlacementFormFields.tsx": 3,
    "components/adminV2/settings/ActionPlacementGuidedEditor.tsx": 3,
    "components/adminV2/settings/ActionPlacementsSettingsClient.tsx": 1,
    "components/adminV2/settings/businessProcess/BusinessProcessProcessSelectorStrip.tsx": 1,
    "components/adminV2/settings/businessProcess/WorkViewConditionEditor.tsx": 4,
    "components/adminV2/settings/businessProcess/WorkViewConditionValueControl.tsx": 6,
    "components/adminV2/settings/businessProcess/WorkViewProcessEditorCard.tsx": 2,
    "components/adminV2/settings/businessProcess/WorkViewSortRulesEditor.tsx": 2,
    "components/adminV2/settings/configurationRuntime/ConfigEditorPrimitives.tsx": 1,
    "components/adminV2/settings/configurationRuntime/GlCodeSelect.tsx": 1,
    "components/adminV2/settings/configurationRuntime/LayoutAssignmentCard.tsx": 1,
    "components/adminV2/settings/configurationRuntime/workspace/ConfigCollectionRail.tsx": 2,
    "components/adminV2/settings/dataModel/entities/EntitiesWorkspaceSurface.tsx": 1,
    "components/adminV2/settings/dataModel/entities/EntityFieldCreatePanel.tsx": 2,
    "components/adminV2/settings/dataModel/entities/EntityFieldDetail.tsx": 1,
    "components/adminV2/settings/dataModel/entities/EntityRelationshipsTab.tsx": 1,
    "components/adminV2/settings/EffectiveDrawerLayoutPreviewPanel.tsx": 1,
    "components/adminV2/settings/EffectiveLayoutInspectorClient.tsx": 2,
    "components/adminV2/settings/enrollmentProcess/EnrollmentProcessActionsCard.tsx": 1,
    "components/adminV2/settings/enrollmentProcess/EnrollmentProcessFormsCoverageCard.tsx": 1,
    "components/adminV2/settings/enrollmentProcess/EnrollmentProcessStageStatusesCard.tsx": 1,
    "components/adminV2/settings/entities/EntitiesWorkspaceClient.tsx": 1,
    "components/adminV2/settings/financials/accounting/GlCodesConfigurationPage.tsx": 1,
    "components/adminV2/settings/financials/catalog/CatalogConfigurationPage.tsx": 4,
    "components/adminV2/settings/financials/tuitionPlans/TuitionEnrollmentCommitmentsPanel.tsx": 1,
    "components/adminV2/settings/financials/tuitionPlans/TuitionPlanCommitmentDialogs.tsx": 2,
    "components/adminV2/settings/financials/tuitionPlans/TuitionPlanCreateDialog.tsx": 4,
    "components/adminV2/settings/financials/tuitionPlans/TuitionPlanEditDialog.tsx": 3,
    "components/adminV2/settings/financials/tuitionPlans/TuitionPlansConfigurationPage.tsx": 1,
    "components/adminV2/settings/financials/tuitionPlans/TuitionPlansObjectSelector.tsx": 1,
    "components/adminV2/settings/LayoutBuilderAddCardDialog.tsx": 1,
    "components/adminV2/settings/LayoutBuilderInspectorPanel.tsx": 5,
    "components/adminV2/settings/LayoutFieldBehaviorControls.tsx": 2,
    "components/adminV2/settings/LayoutIntegrityReportPanel.tsx": 1,
    "components/adminV2/settings/layouts/LeadSummaryCardBlueprintEditor.tsx": 4,
    "components/adminV2/settings/LayoutSectionFieldsPanel.tsx": 1,
    "components/adminV2/settings/lifecycle/LifecycleBuilderActionsCard.tsx": 1,
    "components/adminV2/settings/lifecycle/LifecycleBuilderToolbar.tsx": 1,
    "components/adminV2/settings/lifecycle/LifecycleCreateForm.tsx": 1,
    "components/adminV2/settings/lifecycle/LifecycleStageAttentionRulesEditor.tsx": 4,
    "components/adminV2/settings/lifecycle/LifecycleStageLayoutAssignmentsCard.tsx": 1,
    "components/adminV2/settings/lifecycle/LifecycleStageOperatingPlanEditor.tsx": 1,
    "components/adminV2/settings/lifecycle/LifecycleStageOutcomeBehaviorEditor.tsx": 10,
    "components/adminV2/settings/lifecycle/LifecycleStageOutgoingTransitionsEditor.tsx": 2,
    "components/adminV2/settings/lifecycle/LifecycleStagePresentationCard.tsx": 1,
    "components/adminV2/settings/lifecycle/LifecycleStageQueueMembershipEditor.tsx": 4,
    "components/adminV2/settings/lifecycle/LifecycleWorkbenchHeader.tsx": 1,
    "components/adminV2/settings/LifecycleStageFieldRequirementsEditor.tsx": 2,
    "components/adminV2/settings/LifecycleStagesRequirementsHub.tsx": 1,
    "components/adminV2/settings/locations/LocationOwnedConcernPanels.tsx": 2,
    "components/adminV2/settings/locations/LocationProgramCreatePanel.tsx": 1,
    "components/adminV2/settings/locations/LocationProgramDetailPanel.tsx": 1,
    "components/adminV2/settings/locations/LocationRoomCreatePanel.tsx": 1,
    "components/adminV2/settings/locations/LocationRoomDetailPanel.tsx": 1,
    "components/adminV2/settings/locations/LocationSchedulePatternCreatePanel.tsx": 2,
    "components/adminV2/settings/locations/LocationScheduleTemplateDetailPanel.tsx": 2,
    "components/adminV2/settings/locations/LocationSchedulingSurface.tsx": 1,
    "components/adminV2/settings/locations/LocationsConfigurationPage.tsx": 1,
    "components/adminV2/settings/locations/LocationSiteDetailPanel.tsx": 1,
    "components/adminV2/settings/LocationsHierarchySettingsClient.tsx": 2,
    "components/adminV2/settings/operationalIntelligence/OiFutureRoomCapacityBuilder.tsx": 2,
    "components/adminV2/settings/operationalIntelligence/OiOrgCalcMeasurementPanel.tsx": 1,
    "components/adminV2/settings/operationalIntelligence/OiRoomUtilizationBuilder.tsx": 1,
    "components/adminV2/settings/OpportunityDrawerLayoutActivityTimelineSettings.tsx": 2,
    "components/adminV2/settings/OpportunityDrawerLayoutBlockSettings.tsx": 4,
    "components/adminV2/settings/OpportunityDrawerLayoutCompositionPanel.tsx": 2,
    "components/adminV2/settings/OpportunityDrawerLayoutFieldSettings.tsx": 11,
    "components/adminV2/settings/OpportunityDrawerLayoutRelatedListSettings.tsx": 3,
    "components/adminV2/settings/OpportunityDrawerLayoutSectionRowEditor.tsx": 4,
    "components/adminV2/settings/OpportunityWorkflowV1SectionsEditor.tsx": 1,
    "components/adminV2/settings/organization/CommunicationsChannelDialog.tsx": 2,
    "components/adminV2/settings/organizationCalculations/OrganizationCalculationsWorkspace.tsx": 1,
    "components/adminV2/settings/organizationCalculations/OrgCalcPivotBuilder.tsx": 6,
    "components/adminV2/settings/organizationCalculations/ReadableDefinitionBuilder.tsx": 6,
    "components/adminV2/settings/PlacementPrioritySettingsClient.tsx": 3,
    "components/adminV2/settings/programs/ProgramDomainSections.tsx": 2,
    "components/adminV2/settings/programs/ProgramOperatorDialogs.tsx": 2,
    "components/adminV2/settings/programs/ProgramsConfigurationPage.tsx": 1,
    "components/adminV2/settings/programs/ProgramsObjectSelector.tsx": 2,
    "components/adminV2/settings/staff/AddStaffModal.tsx": 3,
    "components/adminV2/settings/statuses/StatusCreateModal.tsx": 2,
    "components/adminV2/settings/surfaces/composer/IdentityEvidenceCollectionsPanel.tsx": 1,
    "components/adminV2/settings/surfaces/composer/IdentityRelationshipSectionInspector.tsx": 1,
    "components/adminV2/settings/surfaces/composer/SurfaceHeaderSummaryEditor.tsx": 1,
    "components/adminV2/settings/surfaces/QueueRowBuilderV1.tsx": 1,
    "components/adminV2/settings/surfaces/QueueRowBuilderV2.tsx": 6,
    "components/adminV2/settings/surfaces/QueueRowOrderedCriteriaEditor.tsx": 1,
    "components/adminV2/settings/surfaces/QueueRowPlacementRankingEditor.tsx": 2,
    "components/adminV2/settings/surfaces/WorkspaceHeaderSurfaceEditor.tsx": 3,
    "components/adminV2/settings/surfaces/WorkspaceProcessesSurfaceEditor.tsx": 8,
    "components/adminV2/settings/surfaces/WorkUnitHeaderSurfaceEditor.tsx": 5,
    "components/childcareOperational/ChangeOperationalPlacementModal.tsx": 2,
    "components/childcareOperational/ChangeOperationalScheduleModal.tsx": 1,
    "components/cleaning/CleaningQuickQuoteForm.tsx": 6,
    "components/cleaning/CleaningQuoteForm.tsx": 5,
    "components/cleaning/SpecialtyCleaningQuoteForm.tsx": 4,
    "components/forms/admin/FormIntakeRuntimeOrchestrationPanel.tsx": 1,
    "components/forms/admin/FormLifecycleUsagePanel.tsx": 2,
    "components/forms/admin/FormOutcomeConfigPanel.tsx": 4,
    "components/forms/admin/FormQueueFolderPanel.tsx": 1,
    "components/forms/engine/FormEngineRenderer.tsx": 1,
    "components/forms/inline/InlineFieldTokenAuthoringControls.tsx": 1,
    "components/forms/workspace/PacketStepCompositionEditor.tsx": 1,
    "components/layout/AdornmentIcon.tsx": 1,
    "components/layout/LayoutConfigClient.tsx": 13,
    "components/layout/LayoutRuntimeFieldInput.tsx": 1,
    "components/layout/proofShell/ProofRecordModal.tsx": 1,
    "components/layout/QueueRecordFieldOptions.tsx": 5,
    "components/layout/QueueRecordLayoutSettingsPanel.tsx": 3,
    "components/layout/RelationshipActionGuidedModal.tsx": 2,
    "components/platform/surfaceBuilder/SurfaceBuilder.tsx": 2,
    "components/pos/ProcessingCollectionEvidencePanel.tsx": 1,
    "components/presentation/workUnit/QueueFilterControls.tsx": 5,
    "lib/admin/forms/packetDefinitionStepForms.ts": 1,};

function walk(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        if (entry === "node_modules" || entry === ".next") continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            out.push(...walk(full));
        } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) {
            out.push(full);
        }
    }
    return out;
}

function currentCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const dir of ENFORCED_ROOTS) {
        for (const file of walk(join(ROOT, dir))) {
            const rel = file.slice(ROOT.length + 1);
            if (isExempt(rel)) continue;
            const matches = readFileSync(file, "utf8").match(RAW_SELECT);
            if (matches) counts[rel] = matches.length;
        }
    }
    return counts;
}

describe("raw <select> adoption ledger", () => {
    const counts = currentCounts();

    it("no enforced surface introduces a raw <select> outside the ledger", () => {
        const introduced = Object.keys(counts)
            .filter((rel) => !(rel in LEDGER))
            .sort();
        expect(
            introduced,
            "Use AlloySelect (components/workspace/AlloySelect.tsx) instead of a raw <select>. "
                + "A native option popup ignores CSS on macOS and renders the OS menu.",
        ).toEqual([]);
    });

    it("no ledger entry grows", () => {
        const grown = Object.entries(counts)
            .filter(([rel, n]) => rel in LEDGER && n > LEDGER[rel]!)
            .map(([rel, n]) => `${rel}: ${LEDGER[rel]} -> ${n}`)
            .sort();
        expect(grown, "These files added raw <select>s. Use AlloySelect instead.").toEqual([]);
    });

    it("the ledger is lowered whenever a surface is converted", () => {
        const stale = Object.entries(LEDGER)
            .filter(([rel, n]) => (counts[rel] ?? 0) !== n)
            .map(([rel, n]) => `${rel}: ledger says ${n}, actual ${counts[rel] ?? 0} — lower or remove the entry`)
            .sort();
        expect(stale, "Converted a surface? Update the ledger so adoption stays one-way.").toEqual([]);
    });

    it("records the adoption baseline this sprint started from", () => {
        // 437 raw <select> across 190 enforced files on staging b4bc5d682 (14 Aug 2026).
        // Kept as a fixed number so the ledger's direction of travel is visible in one line.
        const ledgerTotal = Object.values(LEDGER).reduce((a, b) => a + b, 0);
        expect(ledgerTotal).toBeLessThanOrEqual(437);
    });
});
