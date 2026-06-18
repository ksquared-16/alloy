import { describe, expect, it, beforeEach } from "vitest";
import {
    __resetRelationshipCounterForTests,
    buildHouseholdRelationships,
    summarizeHouseholdRelationships,
} from "@/lib/intake/relationship/buildHouseholdRelationships";
import type { IntakePersonCandidate } from "@/lib/intake/types";

function person(id: string, first: string, last: string | null): IntakePersonCandidate {
    return {
        candidate_id: id,
        role: "parent",
        first_name: first,
        last_name: last,
        emails: [],
        phones: [],
        dob: null,
        age_years: null,
        calculated_age: null,
        program_interest: null,
        source_fact_ids: [],
        confidence: "high",
        validation_state: "valid",
    };
}

function child(id: string, first: string, last: string | null): IntakePersonCandidate {
    return { ...person(id, first, last), role: "child" };
}

beforeEach(() => __resetRelationshipCounterForTests());

describe("buildHouseholdRelationships", () => {
    it("produces cartesian parent × child inferred relationships", () => {
        const parents = [person("p1", "Alex", "Lyons"), person("p2", "Jason", "Lyons")];
        const children = [child("c1", "Jaxon", "Lyons"), child("c2", "Max", "Lyons")];
        const relationships = buildHouseholdRelationships({ parents, children });

        expect(relationships).toHaveLength(4);
        expect(relationships.every((r) => r.inferred === true)).toBe(true);
        expect(relationships.every((r) => r.kind === "parent_guardian_to_child")).toBe(true);

        const pairs = relationships.map(
            (r) => `${r.from_candidate_id}:${r.to_candidate_id}`,
        );
        expect(pairs).toEqual(
            expect.arrayContaining(["p1:c1", "p1:c2", "p2:c1", "p2:c2"]),
        );
    });

    it("summarizes relationships with inferred tag", () => {
        const parents = [person("p1", "Alex", "Lyons"), person("p2", "Jason", "Lyons")];
        const children = [child("c1", "Jaxon", null), child("c2", "Max", null)];
        const relationships = buildHouseholdRelationships({ parents, children });
        const summary = summarizeHouseholdRelationships({ parents, children, relationships });

        expect(summary).toContain("Alex Lyons → Jaxon (inferred, high)");
        expect(summary).toContain("Jason Lyons → Max (inferred, high)");
    });
});
