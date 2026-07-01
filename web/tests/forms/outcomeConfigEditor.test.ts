import { describe, expect, it } from "vitest";
import {
    mergeOutcomeConfigIntoLinkMetadata,
    parseOutcomeConfigEditForm,
    validateOutcomeConfigEditForm,
} from "@/lib/forms/outcomeConfigEditor";

const locationId = "7ce70708-3517-4ab3-93d0-241a75ec3284";
const workUnitId = "5ba90557-876d-4450-9c28-36beac6e83be";
const verticalId = "1000d719-2248-4816-8ff6-cbdeee8e91ce";

describe("outcomeConfigEditor IC-1c", () => {
    it("parses link metadata into edit form", () => {
        const form = parseOutcomeConfigEditForm({
            lead_capture: true,
            auto_create_opportunity: true,
            review_mode: "confidence",
            auto_operationalize: true,
            default_location_id: locationId,
            default_work_unit_id: workUnitId,
            default_vertical_id: verticalId,
            default_opportunity_status_key: "new",
            embed_mode: true,
        });

        expect(form.leadCaptureEnabled).toBe(true);
        expect(form.autoCreateOpportunity).toBe(true);
        expect(form.reviewMode).toBe("confidence");
        expect(form.autoOperationalize).toBe(true);
        expect(form.locationId).toBe(locationId);
    });

    it("maps exception_only review mode to confidence edit value", () => {
        const form = parseOutcomeConfigEditForm({ review_mode: "exception_only" });
        expect(form.reviewMode).toBe("confidence");
    });

    it("preserves unknown metadata keys when merging", () => {
        const merged = mergeOutcomeConfigIntoLinkMetadata(
            {
                runtime_test: "forms_2d_demo_childcare",
                custom_flag: true,
                label: "Demo embed",
            },
            {
                leadCaptureEnabled: true,
                autoCreateOpportunity: true,
                autoOperationalize: true,
                reviewMode: "confidence",
                reviewRequired: false,
                locationId,
                workUnitId,
                departmentId: "",
                verticalId,
                statusKey: "new",
                source: "embed",
            }
        );

        expect(merged.runtime_test).toBe("forms_2d_demo_childcare");
        expect(merged.custom_flag).toBe(true);
        expect(merged.label).toBe("Demo embed");
        expect(merged.review_mode).toBe("confidence");
        expect(merged.auto_operationalize).toBe(true);
        expect(merged.lead_capture).toBe(true);
    });

    it("writes IC-4 compatible review metadata for auto-operationalize", () => {
        const merged = mergeOutcomeConfigIntoLinkMetadata(
            {},
            {
                leadCaptureEnabled: true,
                autoCreateOpportunity: true,
                autoOperationalize: true,
                reviewMode: "",
                reviewRequired: false,
                locationId,
                workUnitId,
                departmentId: "",
                verticalId,
                statusKey: "new",
                source: "embed",
            }
        );

        expect(merged.review_mode).toBe("confidence");
        expect(merged.auto_operationalize).toBe(true);
        expect(merged.auto_create_person).toBe(true);
        expect(merged.auto_create_customer).toBe(true);
    });

    it("review_required disables auto-operationalize on save", () => {
        const merged = mergeOutcomeConfigIntoLinkMetadata(
            { auto_operationalize: true },
            {
                leadCaptureEnabled: true,
                autoCreateOpportunity: true,
                autoOperationalize: true,
                reviewMode: "confidence",
                reviewRequired: true,
                locationId,
                workUnitId,
                departmentId: "",
                verticalId,
                statusKey: "new",
                source: "",
            }
        );

        expect(merged.review_required).toBe(true);
        expect(merged.auto_operationalize).toBe(false);
    });

    it("disabled lead capture clears intake flags safely", () => {
        const merged = mergeOutcomeConfigIntoLinkMetadata(
            { lead_capture: true, intake: true, auto_create_opportunity: true },
            {
                leadCaptureEnabled: false,
                autoCreateOpportunity: false,
                autoOperationalize: false,
                reviewMode: "",
                reviewRequired: false,
                locationId: "",
                workUnitId: "",
                departmentId: "",
                verticalId: "",
                statusKey: "",
                source: "",
            }
        );

        expect(merged.lead_capture).toBe(false);
        expect(merged.intake).toBe(false);
        expect(merged.auto_create_opportunity).toBe(false);
    });

    it("warns when auto-operationalize lacks routing", () => {
        const v = validateOutcomeConfigEditForm({
            leadCaptureEnabled: true,
            autoCreateOpportunity: true,
            autoOperationalize: true,
            reviewMode: "confidence",
            reviewRequired: false,
            locationId: "",
            workUnitId: "",
            departmentId: "",
            verticalId: "",
            statusKey: "",
            source: "",
        });
        expect(v.warnings.some((w) => w.includes("Missing routing"))).toBe(true);
    });
});
