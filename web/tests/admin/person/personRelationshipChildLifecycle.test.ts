import { describe, expect, it } from "vitest";
import { buildPersonDrawerRelationshipGroups } from "@/lib/admin/person/buildPersonDrawerRelationshipGroups";
import { applyPersonDrawerPresentationProfile } from "@/lib/admin/person/personDrawerPresentationProfile";
import {
    personDrawerRelationshipSectionHasContent,
    resolvePersonDrawerRelationshipSectionModel,
    resolvePersonDrawerRelationshipSectionTitle,
} from "@/lib/admin/person/personDrawerRelationshipSection";
import { personDrawerHasRelationshipContent } from "@/lib/admin/person/personDrawerRelationshipVisibility";
import type { PersonDrawerProfileResult } from "@/lib/admin/person/personDrawerVisibilityTypes";

const childProfile: PersonDrawerProfileResult = {
    profiles: ["child"],
    display: "child",
    badgeLabels: ["Child"],
};

const parentProfile: PersonDrawerProfileResult = {
    profiles: ["parent"],
    display: "parent",
    badgeLabels: ["Parent"],
};

const mixedProfile: PersonDrawerProfileResult = {
    profiles: ["child", "parent"],
    display: "mixed",
    badgeLabels: ["Child", "Parent"],
};

describe("household relationship links", () => {
    it("merges household adults into parents for child-facing family section", () => {
        const groups = buildPersonDrawerRelationshipGroups({
            person_id: "child-1",
            household_adult_links: [
                {
                    person_id: "parent-1",
                    display_name: "Jordan Lee",
                    role_type: "parent",
                    role_label: "Parent",
                    customer_id: "cust-1",
                    is_primary: true,
                is_household_primary_contact: true,
                },
            ],
        });
        expect(groups.parents).toHaveLength(1);
        expect(groups.parents[0]?.display_name).toBe("Jordan Lee");

        const model = resolvePersonDrawerRelationshipSectionModel(childProfile, groups);
        expect(model.sectionTitle).toBe("Family");
        expect(model.showParents).toBe(true);
        expect(model.showChildren).toBe(false);
        expect(personDrawerRelationshipSectionHasContent(model, groups)).toBe(true);
    });

    it("merges household children for parent-facing children section", () => {
        const groups = buildPersonDrawerRelationshipGroups({
            person_id: "parent-1",
            household_child_links: [
                {
                    customer_member_id: "cm-1",
                    person_id: "child-1",
                    display_name: "Mia Chen",
                    customer_id: "cust-1",
                },
            ],
        });
        expect(groups.children).toHaveLength(1);
        expect(groups.children[0]?.display_name).toBe("Mia Chen");

        const model = resolvePersonDrawerRelationshipSectionModel(parentProfile, groups);
        expect(model.sectionTitle).toBe("Children");
        expect(model.showChildren).toBe(true);
        expect(model.showParents).toBe(false);
    });

    it("dedupes person_relationship and household links for the same person", () => {
        const groups = buildPersonDrawerRelationshipGroups({
            person_id: "parent-1",
            person_relationships: [
                {
                    from_person_id: "parent-1",
                    to_person_id: "child-1",
                    relationship_type: "parent",
                    _other_person_id: "child-1",
                    _other_person_name: "Mia Chen",
                },
            ],
            household_child_links: [
                {
                    customer_member_id: "cm-1",
                    person_id: "child-1",
                    display_name: "Mia Chen",
                    customer_id: "cust-1",
                },
            ],
        });
        expect(groups.children).toHaveLength(1);
    });
});

describe("personDrawerHasRelationshipContent", () => {
    it("returns false when no relationship sources exist", () => {
        expect(
            personDrawerHasRelationshipContent({ id: "p1", _person_relationships: [] }, parentProfile)
        ).toBe(false);
    });

    it("returns true for child with household adults only", () => {
        expect(
            personDrawerHasRelationshipContent(
                {
                    id: "child-1",
                    _household_adult_links: [
                        {
                            person_id: "parent-1",
                            display_name: "Jordan",
                            role_type: "parent",
                            role_label: "Parent",
                            customer_id: "cust-1",
                            is_primary: true,
                is_household_primary_contact: true,
                        },
                    ],
                },
                childProfile
            )
        ).toBe(true);
    });
});

describe("mixed role presentation", () => {
    it("uses single Family section title without assuming separate entity types", () => {
        expect(resolvePersonDrawerRelationshipSectionTitle(mixedProfile)).toBe("Family");
        const groups = buildPersonDrawerRelationshipGroups({
            person_id: "p-mixed",
            household_adult_links: [
                {
                    person_id: "parent-2",
                    display_name: "Alex Parent",
                    role_type: "parent",
                    role_label: "Parent",
                    customer_id: "cust-1",
                    is_primary: false,
                is_household_primary_contact: false,
                },
            ],
            household_child_links: [
                {
                    customer_member_id: "cm-2",
                    person_id: "child-2",
                    display_name: "Sam Child",
                    customer_id: "cust-2",
                    },
            ],
        });
        const model = resolvePersonDrawerRelationshipSectionModel(mixedProfile, groups);
        expect(model.sectionTitle).toBe("Family");
        expect(model.showParents).toBe(true);
        expect(model.showChildren).toBe(true);
    });
});

describe("parent communication_opt_out", () => {
    it("remains visible for parent profile in consent section", () => {
        const sections = [
            {
                key: "consent",
                title: "Consent",
                fields: [{ key: "communication_opt_out" }],
            },
        ] as Parameters<typeof applyPersonDrawerPresentationProfile>[0];
        const out = applyPersonDrawerPresentationProfile(sections, parentProfile, {
            communication_opt_out: "boolean",
        });
        expect(out.find((s) => s.key === "consent")?.fields?.map((f) => f.key)).toEqual([
            "communication_opt_out",
        ]);
    });

    it("hides communication_opt_out for child profile", () => {
        const sections = [
            {
                key: "consent",
                title: "Consent",
                fields: [{ key: "communication_opt_out" }],
            },
        ] as Parameters<typeof applyPersonDrawerPresentationProfile>[0];
        const out = applyPersonDrawerPresentationProfile(sections, childProfile, {
            communication_opt_out: "boolean",
        });
        expect(out.map((s) => s.key)).not.toContain("consent");
    });
});
