import { describe, expect, it } from "vitest";
import {
    classifyPersonCandidateFromEvaluation,
    mapLegacyConfidenceToBand,
    scoreHouseholdCoherence,
    isEligibleOrgScopedRecord,
    opportunityOrgIntegrityDiagnostic,
} from "@/lib/identity";
import { evaluateParentPersonMatch, evaluateChildPersonMatch } from "@/lib/intake/resolve/matchIdentity";

describe("B1b confidence bands", () => {
    it("maps exact email match to confirmed", () => {
        expect(mapLegacyConfidenceToBand("exact_match", "email")).toBe("confirmed");
    });

    it("maps conflict to conflicted", () => {
        expect(mapLegacyConfidenceToBand("conflict")).toBe("conflicted");
    });

    it("maps no_match to excluded", () => {
        expect(mapLegacyConfidenceToBand("no_match")).toBe("excluded");
    });
});

describe("B1b classifyPersonCandidateFromEvaluation", () => {
    it("exact email + name → confirmed band with email signal", () => {
        const evaluation = evaluateParentPersonMatch({
            firstName: "Sarah",
            lastName: "Emerson",
            emailNorm: "sarah@example.com",
            phoneNorm: null,
            emailMatches: [
                { id: "p1", first_name: "Sarah", last_name: "Emerson", email: "sarah@example.com" },
            ],
            phoneMatches: [],
            nameMatches: [],
        });
        const candidate = classifyPersonCandidateFromEvaluation({
            subject: {
                subjectRef: "parent-1",
                firstName: "Sarah",
                lastName: "Emerson",
                emailNorm: "sarah@example.com",
                phoneNorm: null,
            },
            evaluation,
            person: { id: "p1", first_name: "Sarah", last_name: "Emerson" },
        });
        expect(candidate?.confidenceBand).toBe("confirmed");
        expect(candidate?.signals.some((s) => s.reasonCode === "exact_email_match")).toBe(true);
    });

    it("ambiguous email → conflicted with blocking conflicts", () => {
        const evaluation = evaluateParentPersonMatch({
            firstName: "Sarah",
            lastName: "Emerson",
            emailNorm: "shared@example.com",
            phoneNorm: null,
            emailMatches: [
                { id: "p1", first_name: "Sarah", last_name: "Emerson" },
                { id: "p2", first_name: "Sarah", last_name: "Smith" },
            ],
            phoneMatches: [],
            nameMatches: [],
        });
        expect(evaluation.confidence).toBe("conflict");
        const candidate = classifyPersonCandidateFromEvaluation({
            subject: {
                subjectRef: "parent-1",
                firstName: "Sarah",
                lastName: "Emerson",
                emailNorm: "shared@example.com",
                phoneNorm: null,
            },
            evaluation,
            person: null,
        });
        expect(candidate?.confidenceBand).toBe("conflicted");
        expect(candidate?.blockingConflicts.length).toBeGreaterThan(0);
    });

    it("email match with name mismatch → conflicted", () => {
        const evaluation = evaluateParentPersonMatch({
            firstName: "Jane",
            lastName: "Doe",
            emailNorm: "sarah@example.com",
            phoneNorm: null,
            emailMatches: [
                { id: "p1", first_name: "Sarah", last_name: "Emerson", email: "sarah@example.com" },
            ],
            phoneMatches: [],
            nameMatches: [],
        });
        const candidate = classifyPersonCandidateFromEvaluation({
            subject: {
                subjectRef: "parent-1",
                firstName: "Jane",
                lastName: "Doe",
                emailNorm: "sarah@example.com",
                phoneNorm: null,
            },
            evaluation,
            person: { id: "p1", first_name: "Sarah", last_name: "Emerson" },
        });
        expect(candidate?.confidenceBand).toBe("conflicted");
    });
});

describe("B1b child classification", () => {
    it("exact child name + DOB → strong/confirmed band", () => {
        const evaluation = evaluateChildPersonMatch({
            firstName: "Mia",
            lastName: "Emerson",
            dob: "2020-03-15",
            householdMembers: [],
            orgPersonMatches: [
                {
                    id: "c1",
                    first_name: "Mia",
                    last_name: "Emerson",
                    date_of_birth: "2020-03-15",
                },
            ],
        });
        expect(evaluation.confidence).toBe("exact_match");
        expect(mapLegacyConfidenceToBand(evaluation.confidence)).toBe("strong");
    });

    it("same name conflicting DOB → conflict", () => {
        const evaluation = evaluateChildPersonMatch({
            firstName: "Mia",
            lastName: "Emerson",
            dob: "2020-03-15",
            householdMembers: [],
            orgPersonMatches: [
                {
                    id: "c1",
                    first_name: "Mia",
                    last_name: "Emerson",
                    date_of_birth: "2019-01-01",
                },
            ],
        });
        expect(evaluation.confidence).toBe("no_match");
    });
});

describe("B1b tenant guards", () => {
    it("isEligibleOrgScopedRecord requires matching org", () => {
        expect(isEligibleOrgScopedRecord("org-a", "org-a")).toBe(true);
        expect(isEligibleOrgScopedRecord("org-b", "org-a")).toBe(false);
        expect(isEligibleOrgScopedRecord(null, "org-a")).toBe(false);
    });

    it("null-org opportunity diagnostic", () => {
        expect(opportunityOrgIntegrityDiagnostic(null)).toBe("opportunity_missing_org_id");
        expect(opportunityOrgIntegrityDiagnostic("org-a")).toBeNull();
    });
});

describe("B1b household coherence", () => {
    it("prefers shared household context", () => {
        const without = scoreHouseholdCoherence({
            parentBand: "strong",
            childBand: "strong",
            sharedHousehold: false,
        });
        const withHousehold = scoreHouseholdCoherence({
            parentBand: "strong",
            childBand: "strong",
            sharedHousehold: true,
        });
        expect(withHousehold).toBeGreaterThan(without);
    });
});
