import { describe, expect, it } from "vitest";
import {
    FORMS_QA_GUARDIAN_NAMES,
    isFormsQaArtifactEmail,
    isFormsQaGuardianName,
    submissionPayloadMatchesFormsQaFingerprint,
} from "@/lib/forms/formsQaArtifactFingerprints";

describe("formsQaArtifactFingerprints", () => {
    it("matches qaEnrollmentLeadOpportunityProof guardian and email", () => {
        expect(isFormsQaGuardianName("Jordan Enrollment Lead")).toBe(true);
        expect(isFormsQaArtifactEmail("ic56-lead-proof-123@example.com")).toBe(true);
        expect(
            submissionPayloadMatchesFormsQaFingerprint({
                values: {
                    guardian_full_name: "Jordan Enrollment Lead",
                    guardian_email: "ic56-lead-proof-123@example.com",
                    notes: "IC-5.6 enrollment lead proof",
                },
            })
        ).toBe(true);
    });

    it("matches qaEnrollmentIntakeLifecycleCoherence fingerprints", () => {
        expect(isFormsQaGuardianName("Jordan Lifecycle Coherence")).toBe(true);
        expect(isFormsQaArtifactEmail("lifecycle-coherence-999@example.com")).toBe(true);
    });

    it("does not match real-looking family records", () => {
        expect(isFormsQaGuardianName("Jordan Smith")).toBe(false);
        expect(isFormsQaArtifactEmail("parent@fireflyschool.com")).toBe(false);
        expect(
            submissionPayloadMatchesFormsQaFingerprint({
                values: {
                    guardian_full_name: "Maria Garcia",
                    guardian_email: "maria@fireflyschool.com",
                },
            })
        ).toBe(false);
    });

    it("exports stable guardian name constants", () => {
        expect(FORMS_QA_GUARDIAN_NAMES).toContain("Jordan Enrollment Lead");
        expect(FORMS_QA_GUARDIAN_NAMES).toContain("Jordan Lifecycle Coherence");
    });
});
