import { describe, expect, it } from "vitest";

import { parseSearchIntent, subjectMatchTerm } from "@/lib/search/searchQueryIntent";

/**
 * Tenant A and Tenant B configure completely different processes. Both must work
 * through the same code path — this fixture pair is the anti-hardcoding control.
 */
const TENANT_A = [
    { key: "enrollment", label: "Enrollment" },
    { key: "annual_registration", label: "Annual Registration" },
    { key: "subsidy_renewal", label: "Subsidy Renewal" },
];

const TENANT_B = [
    { key: "admissions", label: "Admissions" },
    { key: "financial_aid", label: "Financial Aid" },
    { key: "summer_camp_registration", label: "Summer Camp Registration" },
];

describe("parseSearchIntent — subject terms", () => {
    it("treats a plain name as subject terms only", () => {
        const intent = parseSearchIntent("Joe Smith", { processVocabulary: TENANT_A });
        expect(intent.subject_terms).toEqual(["joe", "smith"]);
        expect(intent.context_terms).toEqual([]);
        expect(intent.promoted_keys).toEqual([]);
    });

    it("keeps the subject and promotes a capability term", () => {
        const intent = parseSearchIntent("Joe Smith schedule", { processVocabulary: TENANT_A });
        expect(intent.subject_terms).toEqual(["joe", "smith"]);
        expect(intent.promoted_keys).toEqual(["schedule"]);
        expect(subjectMatchTerm(intent)).toBe("joe smith");
    });

    it("promotes household intent", () => {
        const intent = parseSearchIntent("Smith household", { processVocabulary: TENANT_A });
        expect(intent.subject_terms).toEqual(["smith"]);
        expect(intent.promoted_keys).toEqual(["household"]);
    });

    it("promotes communications intent from 'email'", () => {
        const intent = parseSearchIntent("Jane Smith email", { processVocabulary: TENANT_A });
        expect(intent.subject_terms).toEqual(["jane", "smith"]);
        expect(intent.promoted_keys).toEqual(["communications"]);
    });
});

describe("parseSearchIntent — configured process terms (no hardcoding)", () => {
    it("promotes a tenant A process by its configured label", () => {
        const intent = parseSearchIntent("Joe Smith enrollment", { processVocabulary: TENANT_A });
        expect(intent.subject_terms).toEqual(["joe", "smith"]);
        expect(intent.promoted_keys).toEqual(["enrollment"]);
    });

    it("promotes a multi-word configured label as ONE intent", () => {
        const intent = parseSearchIntent("Joe annual registration", { processVocabulary: TENANT_A });
        expect(intent.subject_terms).toEqual(["joe"]);
        expect(intent.promoted_keys).toEqual(["annual_registration"]);
    });

    it("promotes tenant B's completely different processes through the same path", () => {
        const intent = parseSearchIntent("Joe Smith admissions", { processVocabulary: TENANT_B });
        expect(intent.subject_terms).toEqual(["joe", "smith"]);
        expect(intent.promoted_keys).toEqual(["admissions"]);

        const aid = parseSearchIntent("Jane financial aid", { processVocabulary: TENANT_B });
        expect(aid.subject_terms).toEqual(["jane"]);
        expect(aid.promoted_keys).toEqual(["financial_aid"]);
    });

    it("does NOT promote tenant A's processes for a tenant B operator", () => {
        const intent = parseSearchIntent("Joe Smith enrollment", { processVocabulary: TENANT_B });
        // "enrollment" is not configured for tenant B, so it stays a subject term.
        expect(intent.promoted_keys).toEqual([]);
        expect(intent.subject_terms).toEqual(["joe", "smith", "enrollment"]);
    });

    it("matches on the process_key as well as the label", () => {
        const intent = parseSearchIntent("Joe subsidy renewal", { processVocabulary: TENANT_A });
        expect(intent.promoted_keys).toEqual(["subsidy_renewal"]);
    });
});

describe("parseSearchIntent — guards", () => {
    it("never consumes the entire query as intent", () => {
        const intent = parseSearchIntent("schedule", { processVocabulary: TENANT_A });
        expect(intent.subject_terms).toEqual(["schedule"]);
        expect(intent.promoted_keys).toEqual([]);
    });

    it("drops stop words from subject terms", () => {
        const intent = parseSearchIntent("the Smith household", { processVocabulary: TENANT_A });
        expect(intent.subject_terms).toEqual(["smith"]);
    });

    it("handles empty and punctuation-only input", () => {
        expect(parseSearchIntent("").subject_terms).toEqual([]);
        expect(parseSearchIntent("   ,.  ").subject_terms).toEqual([]);
    });

    it("preserves hyphenated and apostrophe names", () => {
        const intent = parseSearchIntent("O'Brien Smith-Jones", { processVocabulary: TENANT_A });
        expect(intent.subject_terms).toEqual(["o'brien", "smith-jones"]);
    });

    it("promotes multiple distinct intents in operator order", () => {
        const intent = parseSearchIntent("Joe schedule enrollment", { processVocabulary: TENANT_A });
        expect(intent.subject_terms).toEqual(["joe"]);
        expect(intent.promoted_keys).toContain("schedule");
        expect(intent.promoted_keys).toContain("enrollment");
    });
});
