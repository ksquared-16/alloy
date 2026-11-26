import { describe, it, expect } from "vitest";
import { availableMatchSignals } from "@/lib/pos/recordResolution/recordResolverSeam";
import type { IntakeHouseholdCandidate, IntakePersonCandidate } from "@/lib/intake/types";

function person(opts: Partial<IntakePersonCandidate>): IntakePersonCandidate {
    return {
        candidate_id: opts.candidate_id ?? "p1",
        role: opts.role ?? "parent",
        first_name: opts.first_name ?? null,
        last_name: opts.last_name ?? null,
        emails: opts.emails ?? [],
        phones: opts.phones ?? [],
        dob: opts.dob ?? null,
        age_years: opts.age_years ?? null,
        calculated_age: opts.calculated_age ?? null,
        program_interest: opts.program_interest ?? null,
        source_fact_ids: opts.source_fact_ids ?? [],
        confidence: opts.confidence ?? "high",
        validation_state: opts.validation_state ?? "valid",
    };
}

function household(parents: IntakePersonCandidate[], children: IntakePersonCandidate[]): IntakeHouseholdCandidate {
    return {
        household_id: "h1",
        parents_guardians: parents,
        parents,
        children,
        household_contacts: [],
        address: null,
        location: null,
        source: null,
        notes: null,
        program_interest: null,
        start_date: null,
        relationships: [],
        unassigned_fact_ids: [],
        unmapped_facts: [],
        review_warnings: [],
    };
}

describe("availableMatchSignals", () => {
    it("detects email, phone, and child name+dob signals (presence only, no matching)", () => {
        const cand = household(
            [person({ emails: ["a@b.com"], phones: ["555"] })],
            [person({ role: "child", first_name: "Ada", dob: "2018-01-01" })],
        );
        expect(availableMatchSignals(cand).sort()).toEqual(["child_name_dob", "parent_email", "parent_phone"]);
    });

    it("returns no signals when identifiers are absent or blank", () => {
        const cand = household([person({ emails: ["  "], phones: [] })], [person({ role: "child", first_name: "Ada", dob: null })]);
        expect(availableMatchSignals(cand)).toEqual([]);
    });
});
