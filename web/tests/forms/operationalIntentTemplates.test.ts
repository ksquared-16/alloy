import { describe, expect, it } from "vitest";
import {
    buildOperationalIntentFormMetadataPatch,
    buildOperationalIntentLinkMetadataPatch,
    inferOperationalIntentFromContext,
    isOutcomeConfiguredForIntent,
    readStoredOperationalIntent,
    resolveEffectiveOperationalIntent,
} from "@/lib/forms/operationalIntentTemplates";
import { DEMO_CHILDCARE_ENROLLMENT_LEAD_INTAKE_LINK_METADATA } from "@/lib/forms/intakeRuntimeTestFixtures";
import { ENROLLMENT_LEAD_CAPTURE_DEMO_FORM_KEY } from "@/lib/forms/seeds/enrollmentLeadCaptureDemo";

describe("operationalIntentTemplates", () => {
    it("reads stored intake_intent from form metadata", () => {
        expect(readStoredOperationalIntent({ intake_intent: "waitlist" })).toBe("waitlist");
        expect(readStoredOperationalIntent({ intake_purpose: "enrollment_lead" })).toBe("enrollment_lead");
    });

    it("builds enrollment lead link defaults with new_inquiry status", () => {
        const patch = buildOperationalIntentLinkMetadataPatch("enrollment_lead");
        expect(patch.auto_create_opportunity).toBe(true);
        expect(patch.default_opportunity_status_key).toBe("new_inquiry");
        expect(patch.auto_create_customer_member).toBe(false);
    });

    it("requires vertical on link for enrollment lead outcome configured", () => {
        const patch = buildOperationalIntentLinkMetadataPatch("enrollment_lead");
        expect(
            isOutcomeConfiguredForIntent(
                { ...patch, default_vertical_id: "1000d719-2248-4816-8ff6-cbdeee8e91ce" },
                "enrollment_lead"
            )
        ).toBe(true);
        expect(isOutcomeConfiguredForIntent(patch, "enrollment_lead")).toBe(false);
    });

    it("builds existing family link defaults without create opportunity", () => {
        const patch = buildOperationalIntentLinkMetadataPatch("existing_family");
        expect(patch.form_context_mode).toBe("existing_record");
        expect(patch.prefill_enabled).toBe(true);
        expect(patch.auto_create_opportunity).toBe(false);
    });

    it("stores intake_intent on form metadata patch", () => {
        const next = buildOperationalIntentFormMetadataPatch("enrollment_lead", {});
        expect(next.intake_intent).toBe("enrollment_lead");
        expect(next.intake_purpose).toBe("enrollment_lead");
    });

    it("infers enrollment lead from demo link metadata", () => {
        const intent = inferOperationalIntentFromContext({
            formMetadata: {},
            linkMetadata: DEMO_CHILDCARE_ENROLLMENT_LEAD_INTAKE_LINK_METADATA,
            formKey: ENROLLMENT_LEAD_CAPTURE_DEMO_FORM_KEY,
        });
        expect(intent).toBe("enrollment_lead");
    });

    it("prefers stored intent over inference", () => {
        const intent = resolveEffectiveOperationalIntent({
            formMetadata: { intake_intent: "custom" },
            linkMetadata: DEMO_CHILDCARE_ENROLLMENT_LEAD_INTAKE_LINK_METADATA,
            formKey: ENROLLMENT_LEAD_CAPTURE_DEMO_FORM_KEY,
        });
        expect(intent).toBe("custom");
    });
});
