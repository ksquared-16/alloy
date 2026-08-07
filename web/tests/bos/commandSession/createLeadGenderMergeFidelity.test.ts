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

function selectionFromHousehold(household: IntakeHouseholdCandidate): CreateLeadCommitSelection {
    return buildCreateLeadCommitSelection({
        household_contacts: [],
        parents_guardians: [],
        parents: [],
        children: [],
        ...household,
    });
}

describe("Create Lead BOS merge preserves child gender", () => {
    it("keeps explicit gender when Conversation re-merges onto an existing Form child", () => {
        // Form already has the named child (no gender yet).
        const existing = selectionFromHousehold({
            household_contacts: [],
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
            household_contacts: [],
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
        const household = householdFromCommitSelection(merged);
        expect(household.children[0]?.gender).toBe("female");
    });

    it("does not clobber an operator-entered gender with a later empty parse", () => {
        const existing = selectionFromHousehold({
            household_contacts: [],
            parents_guardians: [],
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
            household_contacts: [],
            parents_guardians: [],
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
        expect(merged.children[0]!.extra_payload_values.gender).toBe("male");
    });
});
