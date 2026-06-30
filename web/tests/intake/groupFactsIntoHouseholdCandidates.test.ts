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

describe("groupFactsIntoHouseholdCandidates — two parents keep their own email", () => {
    function parentByName(household: ReturnType<typeof groupFactsIntoHouseholdCandidates>, name: string) {
        return household.parents.find((p) => p.first_name === name);
    }

    it("assigns each parent their own email when name+email share a line", () => {
        const extraction = extractFactsFromText({
            text: ["Jason Lyons jason@lyons.com", "Alex Lyons alex@lyons.com"].join("\n"),
        });
        const household = groupFactsIntoHouseholdCandidates(extraction.facts);
        expect(household.parents).toHaveLength(2);
        expect(parentByName(household, "Jason")?.emails).toEqual(["jason@lyons.com"]);
        expect(parentByName(household, "Alex")?.emails).toEqual(["alex@lyons.com"]);
        // Neither parent's email leaks onto the other.
        expect(parentByName(household, "Jason")?.emails).not.toContain("alex@lyons.com");
        expect(parentByName(household, "Alex")?.emails).not.toContain("jason@lyons.com");
    });

    it("preserves both emails from a comma-separated list (matched by name local-part)", () => {
        const extraction = extractFactsFromText({
            text: ["Jason Lyons and Alex Lyons", "jason@lyons.com, alex@lyons.com"].join("\n"),
        });
        const household = groupFactsIntoHouseholdCandidates(extraction.facts);
        expect(parentByName(household, "Jason")?.emails).toContain("jason@lyons.com");
        expect(parentByName(household, "Alex")?.emails).toContain("alex@lyons.com");
    });

    it("does not regress single-parent households (all contact info stays on the one parent)", () => {
        const extraction = extractFactsFromText({
            text: ["Ravi Almead", "ravi@almead.com", "9879879876"].join("\n"),
        });
        const household = groupFactsIntoHouseholdCandidates(extraction.facts);
        expect(household.parents).toHaveLength(1);
        expect(household.parents[0]?.emails).toEqual(["ravi@almead.com"]);
        expect(household.parents[0]?.phones).toEqual(["9879879876"]);
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
        expect(household.review_warnings.some((w) => w.code === "extra_children_commit_limited")).toBe(true);
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
        expect(household.review_warnings.some((w) => w.code === "extra_parents_commit_limited")).toBe(true);
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
