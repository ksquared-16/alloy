import { describe, expect, it } from "vitest";
import { buildPersonDrawerRelationshipGroups } from "@/lib/admin/person/buildPersonDrawerRelationshipGroups";
import { resolvePersonDrawerPresentationEmphasis } from "@/lib/admin/person/personDrawerPresentationEmphasis";
import { resolvePersonDrawerRelationshipSectionModel } from "@/lib/admin/person/personDrawerRelationshipSection";
import type { PersonDrawerProfileResult } from "@/lib/admin/person/personDrawerVisibilityTypes";

const childProfile: PersonDrawerProfileResult = {
    profiles: ["child"],
    display: "child",
    badgeLabels: ["Child"],
};

describe("child family section IA", () => {
    it("shows siblings in family model for child emphasis", () => {
        const groups = buildPersonDrawerRelationshipGroups({
            person_id: "child-1",
            household_adult_links: [
                {
                    person_id: "parent-1",
                    display_name: "Sarah Chen",
                    role_type: "parent",
                    role_label: "Parent",
                    customer_id: "cust-1",
                    is_primary: true,
                is_household_primary_contact: true,
                },
            ],
            sibling_links: [
                {
                    customer_member_id: "cm-2",
                    person_id: "child-2",
                    display_name: "Emma Chen",
                    customer_id: "cust-1",
                },
            ],
        });
        const model = resolvePersonDrawerRelationshipSectionModel(childProfile, groups);
        expect(model.sectionTitle).toBe("Family");
        expect(model.showSiblings).toBe(true);
        expect(groups.siblings).toHaveLength(1);
        expect(resolvePersonDrawerPresentationEmphasis(childProfile)).toBe("child_lifecycle");
    });

    it("merges parents and guardians for child-facing family presentation input", () => {
        const groups = buildPersonDrawerRelationshipGroups({
            person_id: "child-1",
            household_adult_links: [
                {
                    person_id: "parent-1",
                    display_name: "Sarah Chen",
                    role_type: "parent",
                    role_label: "Parent",
                    customer_id: "cust-1",
                    is_primary: true,
                is_household_primary_contact: true,
                },
                {
                    person_id: "guard-1",
                    display_name: "Alex Guardian",
                    role_type: "guardian",
                    role_label: "Guardian",
                    customer_id: "cust-1",
                    is_primary: false,
                is_household_primary_contact: false,
                },
            ],
        });
        expect(groups.parents).toHaveLength(1);
        expect(groups.guardians).toHaveLength(1);
    });
});
