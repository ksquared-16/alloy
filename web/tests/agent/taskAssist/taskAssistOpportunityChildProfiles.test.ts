import { describe, expect, it } from "vitest";

import {
    normalizeChildDobToYyyyMmDd,
    resolvePrimaryChildDisplayNameFromProfiles,
    summarizeChildrenFromProfiles,
    type TaskAssistChildProfileV1,
} from "@/lib/agent/taskAssist/taskAssistOpportunityChildProfiles";

function p(over: Partial<TaskAssistChildProfileV1>): TaskAssistChildProfileV1 {
    return {
        source: "customer_member",
        customer_member_id: null,
        person_id: null,
        display_name: null,
        dob_iso: null,
        ...over,
    };
}

describe("taskAssistOpportunityChildProfiles", () => {
    it("summarizes zero / one / many profiles", () => {
        expect(summarizeChildrenFromProfiles([])).toBeNull();
        expect(summarizeChildrenFromProfiles([p({ display_name: "A" })])).toContain("One child");
        expect(summarizeChildrenFromProfiles([p({}), p({})])).toContain("2 child profiles");
    });

    it("with two DOBs, picks youngest by latest DOB", () => {
        const profiles: TaskAssistChildProfileV1[] = [
            p({ display_name: "Older", dob_iso: "2022-06-01", customer_member_id: "a" }),
            p({ display_name: "Younger", dob_iso: "2024-01-15", customer_member_id: "b" }),
        ];
        expect(resolvePrimaryChildDisplayNameFromProfiles(profiles)).toBe("Younger");
    });

    it("with multiple names but insufficient DOBs, does not pick a youngest", () => {
        const profiles: TaskAssistChildProfileV1[] = [
            p({ display_name: "A", dob_iso: null }),
            p({ display_name: "B", dob_iso: null }),
        ];
        expect(resolvePrimaryChildDisplayNameFromProfiles(profiles)).toBeNull();
    });

    it("with four named children and full DOBs, picks youngest by latest DOB", () => {
        const profiles: TaskAssistChildProfileV1[] = [
            p({ display_name: "Oldest", dob_iso: "2015-03-10", customer_member_id: "cm1" }),
            p({ display_name: "MidA", dob_iso: "2017-08-01", customer_member_id: "cm2" }),
            p({ display_name: "MidB", dob_iso: "2019-12-20", customer_member_id: "cm3" }),
            p({ display_name: "Youngest", dob_iso: "2024-01-15", customer_member_id: "cm4" }),
        ];
        expect(resolvePrimaryChildDisplayNameFromProfiles(profiles)).toBe("Youngest");
    });

    it("normalizeChildDobToYyyyMmDd handles plain dates", () => {
        expect(normalizeChildDobToYyyyMmDd("2024-03-02")).toBe("2024-03-02");
        expect(normalizeChildDobToYyyyMmDd("2024-03-02T00:00:00.000Z")).toBe("2024-03-02");
    });
});
