/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import {
    buildHouseholdChildrenLookup,
    mergeCrmCompactLineProfile,
    mergeInquiryChildProfileFromHousehold,
    splitCrmCompactPrimaryDisplay,
} from "@/lib/workUnits/queueRowChildProfileMerge";

describe("queueRowChildProfileMerge", () => {
    it("splits age embedded in CRM compact primary text", () => {
        expect(splitCrmCompactPrimaryDisplay("Lennon (2y)")).toEqual({
            displayName: "Lennon",
            ageLabel: "2y",
        });
    });

    it("merges household DOB into inquiry child raw missing profile fields", () => {
        const lookup = buildHouseholdChildrenLookup({
            _household_children: [
                {
                    customer_member_id: "cm-1",
                    person_id: "person-1",
                    display_name: "Lennon Kurzman",
                    dob: "2024-01-15",
                    gender: "female",
                },
            ],
        });

        const profile = mergeInquiryChildProfileFromHousehold(
            { customer_member_id: "cm-1", display_name: "Lennon Kurzman" },
            lookup,
        );

        expect(profile.date_of_birth).toBe("2024-01-15");
        expect(profile.age_label).toMatch(/2y/i);
        expect(profile.gender_label).toBeTruthy();
    });

    it("merges CRM compact line profile from household lookup", () => {
        const lookup = buildHouseholdChildrenLookup({
            _household_children: [
                {
                    person_id: "person-2",
                    display_name: "Wrigley Kurzman",
                    dob: "2025-10-01",
                },
            ],
        });

        const merged = mergeCrmCompactLineProfile(
            { personId: "person-2", primary: "Wrigley Kurzman" },
            lookup,
        );

        expect(merged.displayName).toBe("Wrigley Kurzman");
        expect(merged.age_label).toMatch(/\d+[ym]/i);
    });
});
