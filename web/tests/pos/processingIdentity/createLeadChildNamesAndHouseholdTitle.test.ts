/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import { buildRecommendations } from "@/lib/pos/processingIdentity/operator/recommendationBuilder";
import type { IdentityResolutionSet } from "@/lib/pos/processingIdentity/operator/recommendationBuilder";
import { IDENTITY_COMMAND_KEYS } from "@/lib/pos/processingIdentity/commands/commandKeys";
import { buildHouseholdLeadDisplayName } from "@/lib/admin/opportunity/buildHouseholdLeadDisplayName";

describe("create lead bos smooth — child names + household title", () => {
    it("buildHouseholdLeadDisplayName prefers LastName Family", () => {
        expect(
            buildHouseholdLeadDisplayName({ firstName: "Alex", lastName: "Lyons" }),
        ).toBe("Lyons Family");
    });

    it("createChild plan payload includes first_name and last_name", () => {
        const set: IdentityResolutionSet = {
            subjects: [
                {
                    ref: "hh:1",
                    role: "household",
                    decision: "create",
                    selectedRecordId: null,
                    values: { household_name: "Lyons Family" },
                },
                {
                    ref: "child:1",
                    role: "child",
                    decision: "create",
                    selectedRecordId: null,
                    householdRef: "hh:1",
                    values: {
                        display_name: "Jaxon Lyons",
                        first_name: "Jaxon",
                        last_name: "Lyons",
                        dob: "2021-11-24",
                    },
                },
            ],
        };
        const { operations } = buildRecommendations(set);
        const createChild = operations.find((o) => o.commandKey === IDENTITY_COMMAND_KEYS.createChild);
        expect(createChild?.payload).toMatchObject({
            display_name: "Jaxon Lyons",
            first_name: "Jaxon",
            last_name: "Lyons",
            dob: "2021-11-24",
        });
    });
});
