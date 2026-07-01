import { describe, expect, it } from "vitest";
import {
    personDrawerEmphasisCandidates,
    resolvePersonDrawerPresentationEmphasis,
} from "@/lib/admin/person/personDrawerPresentationEmphasis";
import type { PersonDrawerProfileResult } from "@/lib/admin/person/personDrawerVisibilityTypes";
import { buildPersonEnrollmentActivityEntries } from "@/components/admin/entity/PersonDrawerEnrollmentActivity";
import { personDrawerHasRelationshipContent } from "@/lib/admin/person/personDrawerRelationshipVisibility";

describe("personDrawerPresentationEmphasis", () => {
    it("prefers child lifecycle when child and parent roles coexist", () => {
        const profile: PersonDrawerProfileResult = {
            profiles: ["child", "parent"],
            display: "mixed",
            badgeLabels: ["Child", "Parent"],
        };
        expect(resolvePersonDrawerPresentationEmphasis(profile)).toBe("child_lifecycle");
        expect(personDrawerEmphasisCandidates(profile)).toEqual([
            "child_lifecycle",
            "guardian_communication",
        ]);
    });

    it("maps employee + parent to both emphases with employee after guardian", () => {
        const profile: PersonDrawerProfileResult = {
            profiles: ["parent", "employee"],
            display: "mixed",
            badgeLabels: ["Parent", "Employee"],
        };
        expect(resolvePersonDrawerPresentationEmphasis(profile)).toBe("guardian_communication");
        expect(personDrawerEmphasisCandidates(profile)).toContain("employee_operations");
    });
});

describe("buildPersonEnrollmentActivityEntries", () => {
    it("dedupes mirror and opportunity rows by opportunity_id", () => {
        const entries = buildPersonEnrollmentActivityEntries(
            [
                {
                    id: "ocm-1",
                    opportunity_id: "opp-1",
                    opportunity_name: "Fall enrollment",
                    opportunity_status_key: "open",
                    opportunity_status_label: "Open",
                    customer_member_id: "cm-1",
                    child_display_name: "Jamie",
                    location_label: "Main campus",
                    program_label: "Preschool",
                    room_label: "Room A",
                    location_id: null,
                    outcome_status_key: null,
                    outcome_status_label: null,
                },
            ],
            [
                {
                    opportunity_id: "opp-1",
                    opportunity_name: "Fall enrollment",
                    status_key: "open",
                    status_label: "Open",
                    role_label: "Primary contact",
                    link_source: "primary_person",
                },
            ]
        );
        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({
            opportunity_id: "opp-1",
            role_label: "Primary contact",
            program_label: "Preschool",
            location_label: "Main campus",
        });
    });
});

describe("personDrawerHasRelationshipContent", () => {
    it("returns false when no relationship rows exist", () => {
        const profile: PersonDrawerProfileResult = {
            profiles: ["parent"],
            display: "parent",
            badgeLabels: ["Parent"],
        };
        expect(
            personDrawerHasRelationshipContent(
                { id: "p1", _person_relationships: [], _household_adult_links: [], _household_child_links: [] },
                profile
            )
        ).toBe(false);
    });
});
