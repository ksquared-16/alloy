import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SubmissionReviewTechnicalPanel } from "@/components/forms/review/SubmissionReviewTechnicalPanel";

describe("formsReviewTechnicalDisclosure UX-E", () => {
    it("submission technical panel keeps JSON collapsed by default", () => {
        const html = renderToStaticMarkup(
            <SubmissionReviewTechnicalPanel
                submissionId="11111111-1111-4111-8111-111111111111"
                formDefinitionId="22222222-2222-4222-8222-222222222222"
                formDefinitionVersionId="33333333-3333-4333-8333-333333333333"
                createdViaPublicLinkId="44444444-4444-4444-8444-444444444444"
                payload={{ values: { first: "Ada" }, groups: {}, signatures: {} }}
                launchContext={{ form_context_mode: "lead_capture", prefill_enabled: true }}
                hasLaunchContextDisplay
                intakeDebug={{
                    public_link_id: "44444444-4444-4444-8444-444444444444",
                    lead_capture: true,
                    default_vertical_id: null,
                    auto_create_person: true,
                    auto_create_customer: true,
                    auto_create_customer_member: false,
                    auto_create_opportunity: true,
                    link_label: null,
                    alloy_admin_preview: false,
                    form_context_mode: null,
                    source_entity_type: null,
                    source_entity_id: null,
                    prefill_enabled: null,
                    allow_auto_create: null,
                }}
                entityRows={[
                    {
                        key: "person",
                        label: "Person",
                        hint: "Linked",
                        recordId: "55555555-5555-4555-8555-555555555555",
                    },
                ]}
            />
        );

        expect(html).toContain("Review diagnostics");
        expect(html).toContain("Linkage details");
        expect(html).toContain("Technical details");
        expect(html).not.toMatch(/\bopen\b/);
        expect(html).toContain("Submission payload");
        expect(html).toContain("Ada");
        expect(html).toContain("Submission payload");
        expect(html).toContain("form_context_mode");
        expect(html).toContain('data-testid="forms-review-diagnostics-disclosure"');
    });

    it("submission panel omits diagnostics when no launch or intake data", () => {
        const html = renderToStaticMarkup(
            <SubmissionReviewTechnicalPanel
                submissionId="11111111-1111-4111-8111-111111111111"
                formDefinitionId="22222222-2222-4222-8222-222222222222"
                formDefinitionVersionId="33333333-3333-4333-8333-333333333333"
                createdViaPublicLinkId={null}
                payload={{ values: {}, groups: {}, signatures: {} }}
                launchContext={{}}
                hasLaunchContextDisplay={false}
                intakeDebug={null}
                entityRows={[]}
            />
        );
        expect(html).not.toContain("Review diagnostics");
        expect(html).toContain("Technical details");
    });
});
