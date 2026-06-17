import { describe, expect, it, beforeEach } from "vitest";
import {
    __resetExtractFactCounterForTests,
    extractFactsFromText,
} from "@/lib/intake/extract/extractFactsFromText";
import {
    __resetHouseholdCandidateCounterForTests,
    groupFactsIntoHouseholdCandidates,
} from "@/lib/intake/group/groupFactsIntoHouseholdCandidates";

const RAVI_PASTE = [
    "Ravi Almead",
    "9879879876",
    "ravi@almead.com",
    "",
    "child is Kai Almead, he's 2 years old (06/06/2024 DOB)",
    "",
    "North Campus",
].join("\n");

beforeEach(() => {
    __resetExtractFactCounterForTests();
    __resetHouseholdCandidateCounterForTests();
});

describe("groupFactsIntoHouseholdCandidates — Ravi/Kai", () => {
    it("groups parent, child with dob/age, and location", () => {
        const extraction = extractFactsFromText({ text: RAVI_PASTE });
        const household = groupFactsIntoHouseholdCandidates(extraction.facts);
        expect(household.parents).toHaveLength(1);
        expect(household.parents[0]?.first_name).toBe("Ravi");
        expect(household.parents[0]?.last_name).toBe("Almead");
        expect(household.children).toHaveLength(1);
        expect(household.children[0]?.first_name).toBe("Kai");
        expect(household.children[0]?.last_name).toBe("Almead");
        expect(household.children[0]?.dob).toBe("2024-06-06");
        expect(household.children[0]?.age_years).toBe(2);
        expect(household.children[0]?.confidence).toBe("high");
        expect(household.location?.label).toBe("North Campus");
    });
});

describe("groupFactsIntoHouseholdCandidates — multiple children", () => {
    it("builds two child candidates", () => {
        const text = [
            "Parent: Ravi Almead",
            "Phone: 9879879876",
            "Children:",
            "Kai Almead DOB 06/06/2024",
            "Mia Almead age 4",
            "North Campus",
        ].join("\n");
        const extraction = extractFactsFromText({ text });
        const household = groupFactsIntoHouseholdCandidates(extraction.facts);
        expect(household.parents).toHaveLength(1);
        expect(household.children).toHaveLength(2);
        expect(household.children[0]?.first_name).toBe("Kai");
        expect(household.children[1]?.first_name).toBe("Mia");
        expect(household.review_warnings.some((w) => w.includes("additional child"))).toBe(true);
    });
});

describe("groupFactsIntoHouseholdCandidates — two parents", () => {
    it("builds two parent candidates", () => {
        const text = [
            "Parents: Ravi Almead and Sam Almead",
            "Email: ravi@almead.com",
            "Phone: 9879879876",
            "Child: Kai Almead, age 2",
        ].join("\n");
        const extraction = extractFactsFromText({ text });
        const household = groupFactsIntoHouseholdCandidates(extraction.facts);
        expect(household.parents).toHaveLength(2);
        expect(household.parents[0]?.first_name).toBe("Ravi");
        expect(household.parents[1]?.first_name).toBe("Sam");
        expect(household.children[0]?.first_name).toBe("Kai");
        expect(household.review_warnings.some((w) => w.includes("additional parent"))).toBe(true);
    });
});

describe("groupFactsIntoHouseholdCandidates — address", () => {
    it("preserves address without treating as location", () => {
        const text = [
            "Ravi Almead",
            "123 Main Street",
            "Springfield, IL 62704",
            "ravi@almead.com",
        ].join("\n");
        const extraction = extractFactsFromText({ text });
        const household = groupFactsIntoHouseholdCandidates(extraction.facts);
        expect(household.address?.lines.length).toBeGreaterThanOrEqual(2);
        expect(household.location).toBeNull();
    });
});

describe("groupFactsIntoHouseholdCandidates — curly apostrophe", () => {
    it("normalizes unicode apostrophe in child narrative", () => {
        const text = [
            "Ravi Almead",
            "ravi@almead.com",
            "9879879876",
            "child is Kai Almead, he\u2019s 2 years old (06/06/2024 DOB)",
        ].join("\n");
        const extraction = extractFactsFromText({ text });
        const household = groupFactsIntoHouseholdCandidates(extraction.facts);
        expect(household.children[0]?.first_name).toBe("Kai");
        expect(household.children[0]?.age_years).toBe(2);
    });
});
