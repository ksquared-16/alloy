import { describe, expect, it } from "vitest";
import {
    computeOpportunityAdminV2WorkflowLayoutActive,
    computeOpportunityInquiryWorkflowUi,
    OPPORTUNITY_WORKFLOW_V1_LEGACY_OVERVIEW_SECTION_KEYS,
} from "@/lib/admin/opportunityDrawerLayoutPolicy";

describe("opportunityDrawerLayoutPolicy", () => {
    it("Admin V2 modal assumes workflow layout until record chrome resolves", () => {
        expect(
            computeOpportunityAdminV2WorkflowLayoutActive({
                isOpportunityRecordModalTarget: true,
                recordChromeConfigResolved: false,
                inquiryWorkflowDrawer: false,
            })
        ).toBe(true);
    });

    it("Admin V2 modal uses classic when resolved and not workflow_v1", () => {
        expect(
            computeOpportunityAdminV2WorkflowLayoutActive({
                isOpportunityRecordModalTarget: true,
                recordChromeConfigResolved: true,
                inquiryWorkflowDrawer: false,
            })
        ).toBe(false);
    });

    it("Admin V2 modal stays workflow when resolved workflow_v1", () => {
        expect(
            computeOpportunityAdminV2WorkflowLayoutActive({
                isOpportunityRecordModalTarget: true,
                recordChromeConfigResolved: true,
                inquiryWorkflowDrawer: true,
            })
        ).toBe(true);
    });

    it("non-modal uses resolved inquiryWorkflowDrawer only", () => {
        expect(
            computeOpportunityInquiryWorkflowUi({
                isOpportunityRecordModalTarget: false,
                adminV2WorkflowLayoutActive: false,
                inquiryWorkflowDrawer: true,
            })
        ).toBe(true);
        expect(
            computeOpportunityInquiryWorkflowUi({
                isOpportunityRecordModalTarget: false,
                adminV2WorkflowLayoutActive: false,
                inquiryWorkflowDrawer: false,
            })
        ).toBe(false);
    });

    it("modal defers to adminV2WorkflowLayoutActive for inquiry UI", () => {
        expect(
            computeOpportunityInquiryWorkflowUi({
                isOpportunityRecordModalTarget: true,
                adminV2WorkflowLayoutActive: true,
                inquiryWorkflowDrawer: false,
            })
        ).toBe(true);
    });

    it("workflow_v1 strips default presentation section keys from body", () => {
        expect(OPPORTUNITY_WORKFLOW_V1_LEGACY_OVERVIEW_SECTION_KEYS.has("opportunity_details")).toBe(true);
        expect(OPPORTUNITY_WORKFLOW_V1_LEGACY_OVERVIEW_SECTION_KEYS.has("inquiry_children")).toBe(false);
    });
});
