import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FormOutcomeConfigPanel } from "@/components/forms/admin/FormOutcomeConfigPanel";
import { buildFormOutcomeConfigViewModel } from "@/lib/forms/outcomeConfigPresentation";

const formId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const linkId = "187ba369-78ab-4df1-99d9-ca8d3120379f";
const locationId = "7ce70708-3517-4ab3-93d0-241a75ec3284";

const baseLink = {
    id: linkId,
    is_active: true,
    created_at: "2026-05-27T12:00:00.000Z",
    metadata: {
        label: "Demo embed",
        lead_capture: true,
        auto_create_opportunity: true,
        default_location_id: locationId,
        runtime_test: "preserve_me",
    },
};

describe("FormOutcomeConfigPanel IC-1c", () => {
    beforeEach(() => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async (url: string) => {
                if (url.includes("outcome-labels")) {
                    return {
                        ok: true,
                        json: async () => ({
                            data: {
                                locations: { [locationId]: "BrightStart Learning Center" },
                                workUnits: {},
                                departments: {},
                                verticals: {},
                                opportunityStatusKeys: { new: "New lead" },
                                pickerOptions: {
                                    locations: [{ id: locationId, label: "BrightStart Learning Center" }],
                                    workUnits: [],
                                    departments: [],
                                    verticals: [],
                                    opportunityStatusKeys: [{ id: "new", label: "New lead" }],
                                },
                            },
                        }),
                    };
                }
                return { ok: false, json: async () => ({}) };
            })
        );
    });

    it("renders read mode with operational outcome panel", () => {
        const html = renderToStaticMarkup(
            <FormOutcomeConfigPanel
                formId={formId}
                formMetadata={{}}
                links={[baseLink]}
                formKey="medication_demo"
                documentGenerationConfigured={false}
            />
        );

        expect(html).toContain('data-testid="form-operational-outcome-panel"');
        expect(html).toContain('data-testid="form-outcome-read-mode"');
        expect(html).toContain('data-testid="form-outcome-when-submitted-story"');
        expect(html).toContain("When this form is submitted");
        expect(html).toContain("Selected distribution link");
        expect(html).toContain('data-testid="form-outcome-copy-settings-planned"');
    });

    it("shows edit button when canMutate", () => {
        const html = renderToStaticMarkup(
            <FormOutcomeConfigPanel
                formId={formId}
                formMetadata={{}}
                links={[baseLink]}
                formKey="medication_demo"
                documentGenerationConfigured={false}
                canMutate
            />
        );

        expect(html).toContain('data-testid="form-outcome-edit-button"');
        expect(html).toContain("Edit outcome");
    });

    it("read model reflects saved auto-operationalize metadata", () => {
        const model = buildFormOutcomeConfigViewModel({
            formMetadata: {},
            links: [
                {
                    ...baseLink,
                    metadata: {
                        ...baseLink.metadata,
                        review_mode: "confidence",
                        auto_operationalize: true,
                        default_opportunity_status_key: "new",
                    },
                },
            ],
            formKey: "demo",
            documentGenerationConfigured: false,
        });

        const review = model.sections.find((s) => s.id === "review");
        expect(review?.items.find((i) => i.label === "Auto-operationalize")?.value).toContain("auto-operationalize");
        expect(review?.items.find((i) => i.label === "Review mode")?.value).toContain("unclear");
    });

    it("variance note remains visible with multiple links", () => {
        const model = buildFormOutcomeConfigViewModel({
            formMetadata: {},
            links: [
                baseLink,
                {
                    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                    is_active: true,
                    created_at: "2026-05-26T12:00:00.000Z",
                    metadata: { lead_capture: false },
                },
            ],
            formKey: "demo",
            documentGenerationConfigured: false,
        });

        expect(model.multipleActiveConfigs).toBe(true);
        expect(model.varianceCallout?.title).toContain("Different links can route this form differently");
    });
});
