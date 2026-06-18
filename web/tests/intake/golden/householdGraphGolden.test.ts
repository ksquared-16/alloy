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
import { buildIntakeDebugTrace } from "@/lib/intake/debug/buildIntakeDebugTrace";
import { createLeadParserSpec } from "@/lib/admin/actions/createLeadPlatformGather";
import type { IntakeHouseholdCandidate } from "@/lib/intake/types";

export type GoldenFixtureExpectation = {
    id: string;
    text: string;
    parents: number;
    children: number;
    relationships: number;
    has_address?: boolean;
    has_location?: boolean;
    has_program?: boolean;
    has_start_date?: boolean;
    parent_names?: string[];
    child_names?: string[];
    warning_codes?: string[];
};

export const GOLDEN_HOUSEHOLD_FIXTURES: GoldenFixtureExpectation[] = [
    {
        id: "one-parent-one-child",
        text: [
            "Parent: Jordan Lee",
            "Child: Riley Lee DOB 06/06/2024",
            "jordan.lee@test.com",
            "5551234567",
            "North Campus",
        ].join("\n"),
        parents: 1,
        children: 1,
        relationships: 1,
        has_location: true,
        parent_names: ["Jordan Lee"],
        child_names: ["Riley"],
    },
    {
        id: "two-parents-one-child",
        text: [
            "Parents: Alex and Jason Lyons",
            "Child: Jaxon DOB 11/23/2013",
            "alex.lyons@test.com",
            "South Campus",
        ].join("\n"),
        parents: 2,
        children: 1,
        relationships: 2,
        has_location: true,
        parent_names: ["Alex Lyons", "Jason Lyons"],
        child_names: ["Jaxon"],
        warning_codes: ["extra_parents_commit_limited"],
    },
    {
        id: "one-parent-three-children",
        text: [
            "Parent: Sam Carter",
            "Children: Kai (01/15/2020 DOB) and Mia (Feb 2 2022 DOB) and Leo (2/2/24 DOB)",
            "sam@test.com",
        ].join("\n"),
        parents: 1,
        children: 3,
        relationships: 3,
        parent_names: ["Sam Carter"],
        child_names: ["Kai", "Mia", "Leo"],
        warning_codes: ["extra_children_commit_limited"],
    },
    {
        id: "two-parents-three-children",
        text: [
            "Alex Lyons and Jason Lyons",
            "Kids: Jaxon DOB 11/23/2013",
            "Max DOB 11/14/2017",
            "Leo DOB 2.2.24",
            "alex.lyons@test.com",
        ].join("\n"),
        parents: 2,
        children: 3,
        relationships: 6,
        parent_names: ["Alex Lyons", "Jason Lyons"],
        child_names: ["Jaxon", "Max", "Leo"],
        warning_codes: ["extra_parents_commit_limited", "extra_children_commit_limited"],
    },
    {
        id: "shared-surname-inference",
        text: "Parents: Alex and Jason Lyons\nChildren: Jaxon and Max",
        parents: 2,
        children: 2,
        relationships: 4,
        parent_names: ["Alex Lyons", "Jason Lyons"],
        child_names: ["Jaxon", "Max"],
    },
    {
        id: "mixed-surname-household",
        text: [
            "Alex Lyons and Jason Carter",
            "Child: Jaxon DOB 11/23/2013",
        ].join("\n"),
        parents: 2,
        children: 1,
        relationships: 2,
        parent_names: ["Alex Lyons", "Jason Carter"],
        child_names: ["Jaxon"],
        warning_codes: ["child_last_name_needs_review"],
    },
    {
        id: "address-present",
        text: [
            "Alex Lyons",
            "123 Main Street",
            "Springfield, IL 62704",
            "alex@test.com",
        ].join("\n"),
        parents: 1,
        children: 0,
        relationships: 0,
        has_address: true,
        warning_codes: ["address_no_action_field"],
    },
    {
        id: "location-present",
        text: [
            "Alex Lyons",
            "alex@test.com",
            "Location: North Campus",
        ].join("\n"),
        parents: 1,
        children: 0,
        relationships: 0,
        has_location: true,
    },
    {
        id: "program-present",
        text: [
            "Alex Lyons",
            "alex@test.com",
            "Program: Toddler Room",
            "North Campus",
        ].join("\n"),
        parents: 1,
        children: 0,
        relationships: 0,
        has_program: true,
        has_location: true,
    },
    {
        id: "desired-start-date",
        text: [
            "Alex Lyons",
            "alex@test.com",
            "Desired start date: Feb 2 2024",
            "North Campus",
        ].join("\n"),
        parents: 1,
        children: 0,
        relationships: 0,
        has_start_date: true,
        has_location: true,
    },
];

const SITE_OPTIONS = [
    { value: "north-id", label: "North Campus" },
    { value: "south-id", label: "South Campus" },
];

beforeEach(() => {
    __resetExtractFactCounterForTests();
    __resetHouseholdCandidateCounterForTests();
    __resetRelationshipCounterForTests();
});

function guardianNames(household: IntakeHouseholdCandidate): string[] {
    const guardians = household.parents_guardians?.length ? household.parents_guardians : household.parents;
    return guardians.map((p) => [p.first_name, p.last_name].filter(Boolean).join(" ").trim());
}

function childFirstNames(household: IntakeHouseholdCandidate): string[] {
    return household.children.map((c) => c.first_name ?? "");
}

function assertNoSilentCandidateLoss(
    extraction: ReturnType<typeof extractFactsFromText>,
    household: IntakeHouseholdCandidate,
) {
    const parentFacts = extraction.facts.filter(
        (f) => f.fact_type === "person_name" && f.role_hint === "parent",
    ).length;
    const childFacts = extraction.facts.filter(
        (f) => f.fact_type === "person_name" && f.role_hint === "child",
    ).length;
    const guardians = household.parents_guardians?.length ? household.parents_guardians : household.parents;

    expect(guardians.length).toBe(parentFacts);
    expect(household.children.length).toBe(childFacts);

    for (const person of [...guardians, ...household.children]) {
        expect(person.candidate_id).toBeTruthy();
        expect(person.first_name).toBeTruthy();
    }
}

describe("golden household graph fixtures", () => {
    it.each(GOLDEN_HOUSEHOLD_FIXTURES)("$id — pipeline preserves candidates", (fixture) => {
        const extraction = extractFactsFromText({ text: fixture.text });
        const household = groupFactsIntoHouseholdCandidates(extraction.facts);
        const spec = createLeadParserSpec("dept-golden");
        const mapped = mapFactsToActionIntake({
            extraction,
            spec,
            field_options: { location_id: SITE_OPTIONS },
        });

        const guardians = household.parents_guardians?.length ? household.parents_guardians : household.parents;
        expect(guardians).toHaveLength(fixture.parents);
        expect(household.children).toHaveLength(fixture.children);
        expect(household.relationships).toHaveLength(fixture.relationships);

        if (fixture.has_address) expect(household.address?.lines.length).toBeGreaterThan(0);
        if (fixture.has_location) expect(household.location?.label).toBeTruthy();
        if (fixture.has_program) expect(household.program_interest ?? mapped.candidates.find((c) => c.payload_key === "child_program")?.value).toBeTruthy();
        if (fixture.has_start_date) expect(household.desired_start_date).toBeTruthy();

        if (fixture.parent_names) {
            expect(guardianNames(household)).toEqual(fixture.parent_names);
        }
        if (fixture.child_names) {
            expect(childFirstNames(household)).toEqual(fixture.child_names);
        }

        if (fixture.warning_codes) {
            const codes = (mapped.review_warning_items ?? household.review_warnings).map((w) => w.code);
            for (const code of fixture.warning_codes) {
                expect(codes).toContain(code);
            }
        }

        assertNoSilentCandidateLoss(extraction, household);

        const trace = buildIntakeDebugTrace({
            text: fixture.text,
            spec,
            field_options: { location_id: SITE_OPTIONS },
        });
        expect(trace.relationships).toHaveLength(fixture.relationships);
        expect(trace.commit_preview.will_create.length).toBeGreaterThan(0);
    });
});

describe("golden — Alex/Jason × Jaxon/Max relationships", () => {
    it("links each parent to each child", () => {
        const fixture = GOLDEN_HOUSEHOLD_FIXTURES.find((f) => f.id === "shared-surname-inference")!;
        const household = groupFactsIntoHouseholdCandidates(
            extractFactsFromText({ text: fixture.text }).facts,
        );

        expect(household.relationships).toHaveLength(4);
        expect(household.relationships.every((r) => r.inferred === true)).toBe(true);

        const parentIds = household.parents.map((p) => p.candidate_id);
        const childIds = household.children.map((c) => c.candidate_id);
        for (const parentId of parentIds) {
            for (const childId of childIds) {
                expect(
                    household.relationships.some(
                        (r) => r.from_candidate_id === parentId && r.to_candidate_id === childId,
                    ),
                ).toBe(true);
            }
        }
    });
});
