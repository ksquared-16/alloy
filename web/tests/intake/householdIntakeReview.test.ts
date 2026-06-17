import { describe, expect, it, beforeEach } from "vitest";
import {
    __resetExtractFactCounterForTests,
    extractFactsFromText,
} from "@/lib/intake/extract/extractFactsFromText";
import {
    __resetHouseholdCandidateCounterForTests,
    groupFactsIntoHouseholdCandidates,
} from "@/lib/intake/group/groupFactsIntoHouseholdCandidates";
import { __resetRelationshipCounterForTests } from "@/lib/intake/relationship/buildHouseholdRelationships";
import { mapFactsToActionIntake } from "@/lib/intake/map/mapFactsToActionIntake";
import { createLeadParserSpec } from "@/lib/admin/actions/createLeadPlatformGather";
import { buildIntakeReviewPresentation } from "@/lib/intake/review/buildIntakeReviewPresentation";

const ALEX_JASON_PASTE = [
    "Alex Lyons and Jason Lyons",
    "4804804800",
    "alex.lyons@test.com",
    "",
    "Kids:",
    "Jaxon DOB 11/23/2013",
    "Max DOB 11/14/2017",
    "",
    "South Campus",
].join("\n");

beforeEach(() => {
    __resetExtractFactCounterForTests();
    __resetHouseholdCandidateCounterForTests();
    __resetRelationshipCounterForTests();
});

describe("Alex/Jason household intake", () => {
    it("extracts two parents and two children from narrative paste", () => {
        const extraction = extractFactsFromText({ text: ALEX_JASON_PASTE });
        const parentNames = extraction.facts
            .filter((f) => f.fact_type === "person_name" && f.role_hint === "parent")
            .map((f) => f.normalized_value);
        const childNames = extraction.facts
            .filter((f) => f.fact_type === "person_name" && f.role_hint === "child")
            .map((f) => f.raw_value);
        expect(parentNames).toEqual(["Alex Lyons", "Jason Lyons"]);
        expect(childNames).toEqual(["Jaxon", "Max"]);
    });

    it("groups household with inferred child last names and calculated ages", () => {
        const extraction = extractFactsFromText({ text: ALEX_JASON_PASTE });
        const household = groupFactsIntoHouseholdCandidates(extraction.facts);
        expect(household.parents).toHaveLength(2);
        expect(household.children).toHaveLength(2);
        expect(household.children[0]?.last_name).toBe("Lyons");
        expect(household.children[0]?.last_name_inferred).toBe(true);
        expect(household.children[1]?.last_name).toBe("Lyons");
        expect(household.children[0]?.dob).toBe("2013-11-23");
        expect(household.children[1]?.dob).toBe("2017-11-14");
        expect(household.children[0]?.calculated_age?.display).toBeTruthy();
        expect(household.relationships.length).toBe(4);
        expect(household.commit_limited_to_primary).toBe(true);
    });

    it("maps primary parent/child to Create Lead fields and preserves review presentation", () => {
        const extraction = extractFactsFromText({ text: ALEX_JASON_PASTE });
        const spec = createLeadParserSpec("dept-test");
        const mapped = mapFactsToActionIntake({
            extraction,
            spec,
            field_options: {
                location_id: [{ value: "south-id", label: "South Campus" }],
            },
        });
        const byKey = Object.fromEntries(mapped.candidates.map((c) => [c.payload_key, c.value]));
        expect(byKey.first_name).toBe("Alex");
        expect(byKey.last_name).toBe("Lyons");
        expect(byKey.child_first_name).toBe("Jaxon");
        expect(byKey.child_last_name).toBe("Lyons");
        expect(byKey.child_date_of_birth).toBe("2013-11-23");
        expect(byKey.child_age).toBeUndefined();
        expect(byKey.location_id).toBe("south-id");
        expect(mapped.review_warning_items?.some((w) => w.code === "extra_parents_commit_limited")).toBe(true);
        expect(mapped.review_warning_items?.some((w) => w.code === "extra_children_commit_limited")).toBe(true);

        const review = buildIntakeReviewPresentation(mapped.household);
        expect(review?.parents).toHaveLength(2);
        expect(review?.children).toHaveLength(2);
        expect(review?.children[1]?.display_name).toBe("Max Lyons");
    });
});

describe("last name inference — mixed parent surnames", () => {
    it("does not infer child last name when parents differ", () => {
        const text = [
            "Alex Lyons and Jason Carter",
            "Child: Jaxon DOB 11/23/2013",
        ].join("\n");
        const extraction = extractFactsFromText({ text });
        const household = groupFactsIntoHouseholdCandidates(extraction.facts);
        expect(household.children[0]?.last_name).toBeNull();
        expect(
            household.review_warnings.some((w) => w.code === "child_last_name_needs_review"),
        ).toBe(true);
    });
});

describe("multiple parents labeled variants", () => {
    it("handles Guardians: label", () => {
        const text = "Guardians: Alex Lyons, Jason Lyons";
        const extraction = extractFactsFromText({ text });
        expect(extraction.facts.filter((f) => f.role_hint === "parent")).toHaveLength(2);
    });
});

describe("address preservation", () => {
    it("keeps address separate from location", () => {
        const text = [
            "Alex Lyons",
            "123 Main Street",
            "Springfield, IL 62704",
            "alex@test.com",
        ].join("\n");
        const extraction = extractFactsFromText({ text });
        const household = groupFactsIntoHouseholdCandidates(extraction.facts);
        expect(household.address?.lines.length).toBeGreaterThanOrEqual(2);
        expect(household.location).toBeNull();
    });
});
