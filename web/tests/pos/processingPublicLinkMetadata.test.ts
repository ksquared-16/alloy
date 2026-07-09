import { describe, it, expect } from "vitest";
import {
    buildProcessingPublicLinkMetadata,
    deriveProcessingFormPublishStatus,
    isProcessingIntakeLink,
    processingPublishMetadataPatch,
    shouldOpenProcessingCaseForFormSubmission,
} from "@/lib/pos/processingPublicLinkMetadata";

describe("processingPublicLinkMetadata", () => {
    it("builds processing intake metadata without lead capture flags", () => {
        const meta = buildProcessingPublicLinkMetadata({ formName: "Lead Form", publicSlug: "lead-form" });
        expect(meta).toMatchObject({
            form_context_mode: "processing_intake",
            pos_connected: true,
            source: "processing_studio",
            embed_mode: true,
            public_slug: "lead-form",
        });
        expect(meta).not.toHaveProperty("lead_capture");
    });

    it("detects processing intake links", () => {
        expect(isProcessingIntakeLink({ form_context_mode: "processing_intake" })).toBe(true);
        expect(isProcessingIntakeLink({ form_context_mode: "packet" })).toBe(false);
    });

    it("patches publish metadata with public slug and form id", () => {
        const patched = processingPublishMetadataPatch({ source: "processing" }, {
            formId: "form-1",
            formKey: "lead_form",
            formName: "Lead Form",
            publicSlug: "lead-form",
        });
        expect(patched).toMatchObject({
            source: "processing",
            processing_intake_enabled: true,
            processing_public_slug: "lead-form",
            processing_public_form_id: "form-1",
            processing_public_form_key: "lead_form",
        });
    });

    it("opens processing cases for processing intake link metadata", () => {
        expect(
            shouldOpenProcessingCaseForFormSubmission({
                definitionMetadata: {},
                linkMetadata: buildProcessingPublicLinkMetadata({ formName: "Lead Form" }),
            })
        ).toBe(true);
    });

    it("derives publish status from form + link state", () => {
        expect(
            deriveProcessingFormPublishStatus({
                formActive: true,
                hasPublishedVersion: true,
                hasActiveProcessingLink: true,
            })
        ).toBe("published");
        expect(
            deriveProcessingFormPublishStatus({
                formActive: true,
                hasPublishedVersion: true,
                hasActiveProcessingLink: false,
            })
        ).toBe("draft");
        expect(
            deriveProcessingFormPublishStatus({
                formActive: false,
                hasPublishedVersion: true,
                hasActiveProcessingLink: true,
            })
        ).toBe("archived");
    });
});
