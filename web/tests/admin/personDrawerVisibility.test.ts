import { describe, expect, it } from "vitest";
import { buildPersonDrawerRelationshipGroups } from "@/lib/admin/person/buildPersonDrawerRelationshipGroups";
import { resolvePersonDrawerProfile } from "@/lib/admin/person/resolvePersonDrawerProfile";

describe("resolvePersonDrawerProfile", () => {
    it("detects child from customer_members relationship", () => {
        const result = resolvePersonDrawerProfile({
            person_id: "p1",
            customer_members: [{ relationship: "child" }],
        });
        expect(result.profiles).toContain("child");
        expect(result.badgeLabels).toContain("Child");
    });

    it("detects parent from customer_persons role", () => {
        const result = resolvePersonDrawerProfile({
            person_id: "p1",
            customer_persons: [{ role_type: "parent" }],
        });
        expect(result.profiles).toContain("parent");
        expect(result.badgeLabels).toContain("Parent");
    });

    it("detects employee alongside parent as mixed with multiple badges", () => {
        const result = resolvePersonDrawerProfile({
            person_id: "p1",
            is_employee: true,
            customer_persons: [{ role_type: "parent" }],
        });
        expect(result.display).toBe("mixed");
        expect(result.badgeLabels).toEqual(["Parent", "Employee"]);
    });

    it("infers child when person is to_person on parent edge", () => {
        const result = resolvePersonDrawerProfile({
            person_id: "child",
            person_relationships: [
                { from_person_id: "parent", to_person_id: "child", relationship_type: "parent" },
            ],
        });
        expect(result.profiles).toContain("child");
    });

    it("returns unknown when no signals", () => {
        const result = resolvePersonDrawerProfile({ person_id: "p1" });
        expect(result.display).toBe("unknown");
        expect(result.badgeLabels).toEqual([]);
    });
});

describe("buildPersonDrawerRelationshipGroups", () => {
    it("groups parents and children from directed person_relationships", () => {
        const groups = buildPersonDrawerRelationshipGroups({
            person_id: "parent",
            person_relationships: [
                {
                    from_person_id: "parent",
                    to_person_id: "child",
                    relationship_type: "parent",
                    _other_person_id: "child",
                    _other_person_name: "Jamie",
                    _relationship_type_label: "Parent",
                },
            ],
        });
        expect(groups.children).toHaveLength(1);
        expect(groups.children[0]?.display_name).toBe("Jamie");
    });

    it("includes siblings from sibling_links", () => {
        const groups = buildPersonDrawerRelationshipGroups({
            person_id: "child-a",
            sibling_links: [
                {
                    customer_member_id: "cm-b",
                    customer_id: "cust-1",
                    person_id: "child-b",
                    display_name: "Alex",
                },
            ],
        });
        expect(groups.siblings).toHaveLength(1);
        expect(groups.siblings[0]?.display_name).toBe("Alex");
    });

    it("includes household adults and children from shared customer accounts", () => {
        const groups = buildPersonDrawerRelationshipGroups({
            person_id: "child-1",
            household_adult_links: [
                {
                    person_id: "adult-1",
                    display_name: "Taylor Parent",
                    role_type: "parent",
                    role_label: "Parent",
                    customer_id: "cust-1",
                    is_primary: true,
                },
            ],
            household_child_links: [],
        });
        expect(groups.parents[0]?.person_id).toBe("adult-1");
    });
});
