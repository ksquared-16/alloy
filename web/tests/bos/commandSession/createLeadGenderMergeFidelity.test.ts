import { describe, expect, it } from "vitest";
import {
    buildCreateLeadCommitSelection,
    type CreateLeadCommitSelection,
} from "@/lib/admin/actions/createLead/commit/createLeadCommitSelection";
import { mergeCreateLeadCommitSelections } from "@/lib/bos/commandSession/createLeadRepeaterDraft";
import { householdFromCommitSelection } from "@/lib/pos/processingIdentity/sources/householdFromCommitSelection";
import type { IntakeHouseholdCandidate, IntakePersonCandidate } from "@/lib/intake/types";

function person(partial: Partial<IntakePersonCandidate> & Pick<IntakePersonCandidate, "candidate_id" | "role" | "first_name" | "last_name">): IntakePersonCandidate {
    return {
        emails: [],
        phones: [],
        dob: null,
        age_years: null,
        calculated_age: null,
        gender: null,
        program_interest: null,
        source_fact_ids: [],
        confidence: "high",
        validation_state: "valid",
        ...partial,
    };
}

function household(partial: {
    parents_guardians?: IntakePersonCandidate[];
    children?: IntakePersonCandidate[];
}): IntakeHouseholdCandidate {
    const parents_guardians = partial.parents_guardians ?? [];
    return {
        household_id: "household:test",
        parents_guardians,
        parents: parents_guardians,
        children: partial.children ?? [],
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

function selectionFromHousehold(partial: {
    parents_guardians?: IntakePersonCandidate[];
    children?: IntakePersonCandidate[];
}): CreateLeadCommitSelection {
    return buildCreateLeadCommitSelection(household(partial));
}

describe("Create Lead BOS merge preserves child gender", () => {
    it("keeps explicit gender when Conversation re-merges onto an existing Form child", () => {
        // Form already has the named child (no gender yet).
        const existing = selectionFromHousehold({
            parents_guardians: [
                person({
                    candidate_id: "parent:1",
                    role: "parent",
                    first_name: "Kelly",
                    last_name: "Kurzman",
                    emails: ["kelly@example.com"],
                }),
            ],
            children: [
                person({
                    candidate_id: "child:1",
                    role: "child",
                    first_name: "Wrigley",
                    last_name: "Kurzman",
                    dob: "2023-03-15",
                    gender: null,
                }),
            ],
        });

        // Conversation parse supplies gender on the same child name.
        const incoming = selectionFromHousehold({
            parents_guardians: [
                person({
                    candidate_id: "parent:parsed",
                    role: "parent",
                    first_name: "Kelly",
                    last_name: "Kurzman",
                    emails: ["kelly@example.com"],
                }),
            ],
            children: [
                person({
                    candidate_id: "child:parsed",
                    role: "child",
                    first_name: "Wrigley",
                    last_name: "Kurzman",
                    dob: "2023-03-15",
                    gender: "female",
                }),
            ],
        });

        const merged = mergeCreateLeadCommitSelections(existing, incoming);
        const child = merged.children.find((c) => c.first_name === "Wrigley");
        expect(child).toBeTruthy();
        expect(child!.extra_payload_values.gender).toBe("female");

        // Downstream Processing source must still see gender on the household candidate.
        const asHousehold = householdFromCommitSelection(merged);
        expect(asHousehold.children[0]?.gender).toBe("female");
    });

    it("does not clobber an operator-entered gender with a later empty parse", () => {
        const existing = selectionFromHousehold({
            children: [
                person({
                    candidate_id: "child:1",
                    role: "child",
                    first_name: "Lennon",
                    last_name: "Kurzman",
                    gender: "male",
                }),
            ],
        });
        const incoming = selectionFromHousehold({
            children: [
                person({
                    candidate_id: "child:2",
                    role: "child",
                    first_name: "Lennon",
                    last_name: "Kurzman",
                    gender: null,
                }),
            ],
        });

        const merged = mergeCreateLeadCommitSelections(existing, incoming);
        const child = merged.children.find((c) => c.first_name === "Lennon");
        expect(child!.extra_payload_values.gender).toBe("male");
    });
});
