import { describe, expect, it } from "vitest";
import { OUTCOME_LABEL_UNRESOLVED } from "@/lib/forms/outcomeConfigLabelCatalog";
import { buildFormOutcomeConfigViewModel } from "@/lib/forms/outcomeConfigPresentation";

const locationId = "7ce70708-3517-4ab3-93d0-241a75ec3284";
const workUnitId = "5ba90557-876d-4450-9c28-36beac6e83be";
const verticalId = "1000d719-2248-4816-8ff6-cbdeee8e91ce";

describe("buildFormOutcomeConfigViewModel IC-1", () => {
    it("shows not configured when form and links have no intake metadata", () => {
        const model = buildFormOutcomeConfigViewModel({
            formMetadata: { operator_context: { purpose: "Collect info" } },
            links: [],
            formKey: "waitlist",
            documentGenerationConfigured: false,
        });

        const intake = model.sections.find((s) => s.id === "intake");
        expect(intake?.items.find((i) => i.label === "Lead capture")?.value).toBe("Not configured yet");
        expect(model.resolutionNote).toContain("form default");
    });

    it("reflects active distribution link intake and routing metadata", () => {
        const model = buildFormOutcomeConfigViewModel({
            formMetadata: {},
            links: [
                {
                    id: "187ba369-78ab-4df1-99d9-ca8d3120379f",
                    is_active: true,
                    created_at: "2026-05-27T12:00:00.000Z",
                    metadata: {
                        label: "Demo embed",
                        lead_capture: true,
                        intake: true,
                        auto_create_opportunity: true,
                        auto_create_person: true,
                        default_location_id: locationId,
                        default_work_unit_id: workUnitId,
                        default_vertical_id: verticalId,
                        default_opportunity_status_key: "new",
                        embed_mode: true,
                        intake_opportunity_source: "embed",
                    },
                },
            ],
            formKey: "medication_authorization_demo",
            documentGenerationConfigured: true,
        });

        expect(model.representativeLink?.label).toBe("Demo embed");
        expect(model.resolutionNote).toContain("Demo embed");

        const intake = model.sections.find((s) => s.id === "intake");
        expect(intake?.items.find((i) => i.label === "Lead capture")?.value).toBe("Enabled on distribution link");
        expect(intake?.items.find((i) => i.label === "Creates new lead")?.value).toContain("Creates a new enrollment lead");
        expect(intake?.items.find((i) => i.label === "Duplicate handling")?.value).toContain("Attaches to existing family");

        const routing = model.sections.find((s) => s.id === "routing");
        expect(routing?.items.find((i) => i.label === "Lead status")?.value).toBe("New lead");
        expect(routing?.items.find((i) => i.label === "Source")?.value).toBe("Website embed");
        expect(routing?.items.find((i) => i.label === "Location")?.value).toBe(OUTCOME_LABEL_UNRESOLVED);

        const automation = model.sections.find((s) => s.id === "automation");
        expect(automation?.items.find((i) => i.label === "Document generation")?.value).toContain("PDF output");
        expect(automation?.items.find((i) => i.label === "Workflow trigger")?.value).toContain("Form submitted signal");

        const review = model.sections.find((s) => s.id === "review");
        expect(review?.items.find((i) => i.label === "Review mode")?.value).toBe("Not configured yet");
    });

    it("merges form intake_outcome defaults with link overrides", () => {
        const model = buildFormOutcomeConfigViewModel({
            formMetadata: {
                intake_outcome: {
                    review_mode: "confidence",
                    auto_operationalize: true,
                },
            },
            links: [
                {
                    id: "link-1",
                    is_active: true,
                    created_at: "2026-05-27T12:00:00.000Z",
                    metadata: {
                        lead_capture: true,
                        auto_create_opportunity: true,
                        default_opportunity_status_key: "new",
                    },
                },
            ],
            formKey: "enrollment",
            documentGenerationConfigured: false,
        });

        const review = model.sections.find((s) => s.id === "review");
        expect(review?.items.find((i) => i.label === "Review mode")?.value).toBe(
            "Requires review only when matching is unclear"
        );
        expect(review?.items.find((i) => i.label === "Auto-operationalize")?.value).toContain("auto-operationalize");
    });

    it("detects varying configs across active links", () => {
        const model = buildFormOutcomeConfigViewModel({
            formMetadata: {},
            links: [
                {
                    id: "a",
                    is_active: true,
                    created_at: "2026-05-28T12:00:00.000Z",
                    metadata: { lead_capture: true, auto_create_opportunity: true },
                },
                {
                    id: "b",
                    is_active: true,
                    created_at: "2026-05-27T12:00:00.000Z",
                    metadata: { lead_capture: false },
                },
            ],
            formKey: "form",
            documentGenerationConfigured: false,
        });

        expect(model.multipleActiveConfigs).toBe(true);
        expect(model.resolutionNote).toContain("different outcome settings");
        expect(model.varianceCallout?.title).toContain("Different links can route this form differently");
        expect(model.whenSubmittedStory.length).toBeGreaterThan(0);
        expect(model.whenSubmittedStory.some((b) => b.text.toLowerCase().includes("lead"))).toBe(true);
    });

    it("shows existing-record launch on intake behavior", () => {
        const model = buildFormOutcomeConfigViewModel({
            formMetadata: {},
            links: [
                {
                    id: "existing",
                    is_active: true,
                    created_at: "2026-05-27T12:00:00.000Z",
                    metadata: {
                        form_context_mode: "existing_record",
                        source_entity_type: "opportunity",
                        source_entity_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                    },
                },
            ],
            formKey: "update",
            documentGenerationConfigured: false,
        });

        const attach = model.sections
            .find((s) => s.id === "intake")
            ?.items.find((i) => i.label === "Attaches to existing record");
        expect(attach?.value).toContain("known person");
    });

    it("IC-1b — displays resolved routing labels from catalog", () => {
        const model = buildFormOutcomeConfigViewModel({
            formMetadata: {},
            links: [
                {
                    id: "link-1",
                    is_active: true,
                    created_at: "2026-05-27T12:00:00.000Z",
                    metadata: {
                        lead_capture: true,
                        auto_create_opportunity: true,
                        default_location_id: locationId,
                        default_work_unit_id: workUnitId,
                        default_vertical_id: verticalId,
                        default_opportunity_status_key: "new",
                    },
                },
            ],
            formKey: "demo",
            documentGenerationConfigured: false,
            labelCatalog: {
                locations: { [locationId]: "BrightStart Learning Center" },
                workUnits: { [workUnitId]: "Enrollment · Enrollment Pipeline" },
                departments: {},
                verticals: { [verticalId]: "Childcare" },
                opportunityStatusKeys: { new: "New lead" },
            },
        });

        const routing = model.sections.find((s) => s.id === "routing");
        expect(routing?.items.find((i) => i.label === "Location")?.value).toBe("BrightStart Learning Center");
        expect(routing?.items.find((i) => i.label === "Work unit")?.value).toBe("Enrollment · Enrollment Pipeline");
        expect(routing?.items.find((i) => i.label === "Vertical")?.value).toBe("Childcare");
        expect(routing?.items.find((i) => i.label === "Lead status")?.value).toBe("New lead");
    });

    it("IC-1b — missing catalog entries use unresolved fallback without crashing", () => {
        const model = buildFormOutcomeConfigViewModel({
            formMetadata: {},
            links: [
                {
                    id: "link-1",
                    is_active: true,
                    created_at: "2026-05-27T12:00:00.000Z",
                    metadata: {
                        lead_capture: true,
                        default_location_id: locationId,
                    },
                },
            ],
            formKey: "demo",
            documentGenerationConfigured: false,
            labelCatalog: null,
        });

        expect(model.sections.find((s) => s.id === "routing")?.items.find((i) => i.label === "Location")?.value).toBe(
            OUTCOME_LABEL_UNRESOLVED
        );
    });

    it("IC-5.6 — story summary uses lead language for enrollment intake", () => {
        const model = buildFormOutcomeConfigViewModel({
            formMetadata: {},
            links: [
                {
                    id: "link-1",
                    is_active: true,
                    created_at: "2026-05-27T12:00:00.000Z",
                    metadata: {
                        lead_capture: true,
                        auto_create_opportunity: true,
                        default_work_unit_id: workUnitId,
                        default_opportunity_status_key: "new",
                    },
                },
            ],
            formKey: "enrollment_lead",
            documentGenerationConfigured: false,
            labelCatalog: {
                locations: {},
                workUnits: { [workUnitId]: "Enrollment · Enrollment Pipeline" },
                departments: {},
                verticals: {},
                opportunityStatusKeys: { new: "New lead" },
            },
        });

        expect(model.whenSubmittedStory.some((b) => b.text.includes("Create a new Lead"))).toBe(true);
        expect(model.whenSubmittedStory.some((b) => b.text.includes("Enrollment · Enrollment Pipeline"))).toBe(true);
    });
});
