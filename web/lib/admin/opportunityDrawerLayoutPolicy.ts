/**
 * Pure helpers for Admin V2 opportunity drawer layout gating (client + tests).
 * Modal opportunities assume inquiry workflow chrome until record-layout fetch completes,
 * so the generic EntityDrawerOverview grid never flashes ahead confirmed `workflow_v1`.
 */

/**
 * Default `entityPresentation` opportunity overview section keys — covered by inquiry header/summary + workflow virtuals.
 * workflow_v1 body omits these so `overview_section_order` / presentation fallback cannot surface them first.
 */
export const OPPORTUNITY_WORKFLOW_V1_LEGACY_OVERVIEW_SECTION_KEYS = new Set([
    "opportunity_details",
    "customer_booking",
    "quote",
    "notes",
    "record_info",
]);

export function computeOpportunityAdminV2WorkflowLayoutActive(params: {
    isOpportunityRecordModalTarget: boolean;
    recordChromeConfigResolved: boolean;
    inquiryWorkflowDrawer: boolean;
}): boolean {
    const { isOpportunityRecordModalTarget, recordChromeConfigResolved, inquiryWorkflowDrawer } = params;
    return isOpportunityRecordModalTarget && (!recordChromeConfigResolved || inquiryWorkflowDrawer);
}

export function computeOpportunityInquiryWorkflowUi(params: {
    isOpportunityRecordModalTarget: boolean;
    adminV2WorkflowLayoutActive: boolean;
    inquiryWorkflowDrawer: boolean;
}): boolean {
    const { isOpportunityRecordModalTarget, adminV2WorkflowLayoutActive, inquiryWorkflowDrawer } = params;
    return adminV2WorkflowLayoutActive || (!isOpportunityRecordModalTarget && inquiryWorkflowDrawer);
}
