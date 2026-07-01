import { describe, expect, it } from "vitest";
import { resolvePersonDrawerHouseholdModel } from "@/lib/admin/person/resolvePersonDrawerHouseholdModel";

describe("resolvePersonDrawerHouseholdModel", () => {
    it("partitions guardians, children, emergency contacts, and authorized pickups", () => {
        const model = resolvePersonDrawerHouseholdModel({
            id: "parent-1",
            _household_context: [{ customer_id: "c1", customer_name: "Murphy Household" }],
            _household_adult_links: [
                {
                    person_id: "parent-1",
                    customer_id: "c1",
                    display_name: "Jordan Murphy",
                    role_type: "primary_contact",
                    role_label: "Primary contact",
                    is_primary: true,
                    is_household_primary_contact: true,
                },
                {
                    person_id: "parent-2",
                    customer_id: "c1",
                    display_name: "Alex Murphy",
                    role_type: "guardian",
                    role_label: "Guardian",
                    is_primary: false,
                    is_household_primary_contact: false,
                },
                {
                    person_id: "ec-1",
                    customer_id: "c1",
                    display_name: "Pat Lee",
                    role_type: "emergency_contact",
                    role_label: "Emergency contact",
                    is_primary: false,
                },
                {
                    person_id: "pickup-1",
                    customer_id: "c1",
                    display_name: "Sam Pickup",
                    role_type: "authorized_pickup",
                    role_label: "Authorized pickup",
                    is_primary: false,
                },
            ],
            _household_child_links: [
                {
                    customer_id: "c1",
                    customer_member_id: "m1",
                    person_id: "child-1",
                    display_name: "Owen Murphy",
                },
            ],
        });

        expect(model.groups).toHaveLength(1);
        const group = model.groups[0]!;
        expect(group.household_label).toBe("Murphy Household");
        expect(group.guardians.map((g) => g.display_name)).toEqual(["Alex Murphy"]);
        expect(group.guardians.some((g) => g.person_id === "parent-1")).toBe(false);
        expect(group.children.map((c) => c.display_name)).toEqual(["Owen Murphy"]);
        expect(group.children[0]?.link_state).toBe("openable");
        expect(group.children[0]?.initials).toBe("OM");
        expect(group.emergency_contacts.map((e) => e.display_name)).toEqual(["Pat Lee"]);
        expect(group.authorized_pickups.map((p) => p.display_name)).toEqual(["Sam Pickup"]);
    });

    it("shows no role chips for parent without household primary contact", () => {
        const model = resolvePersonDrawerHouseholdModel({
            _household_context: [{ customer_id: "c1", customer_name: "Test" }],
            _household_adult_links: [
                {
                    person_id: "p1",
                    customer_id: "c1",
                    display_name: "Jordan",
                    role_type: "parent",
                    role_label: "Parent",
                    is_primary: true,
                    is_household_primary_contact: false,
                },
            ],
        });
        expect(model.groups[0]?.guardians[0]?.role_chips).toEqual([]);
    });

    it("dedupes primary and primary contact into a single Primary chip", () => {
        const model = resolvePersonDrawerHouseholdModel({
            _household_context: [{ customer_id: "c1", customer_name: "Test" }],
            _household_adult_links: [
                {
                    person_id: "p1",
                    customer_id: "c1",
                    display_name: "Alex Parent",
                    role_type: "primary_contact",
                    role_label: "Guardian",
                    is_primary: true,
                },
            ],
        });
        expect(model.groups[0]?.guardians[0]?.role_chips).toEqual(["Primary"]);
    });

    it("excludes viewing child from children column and includes siblings", () => {
        const model = resolvePersonDrawerHouseholdModel(
            {
                id: "child-1",
                _household_context: [{ customer_id: "c1", customer_name: "Murphy Household" }],
                _household_adult_links: [
                    {
                        person_id: "parent-1",
                        customer_id: "c1",
                        display_name: "Jordan Murphy",
                        role_type: "guardian",
                        role_label: "Guardian",
                        is_primary: true,
                    },
                ],
                _household_child_links: [
                    {
                        customer_id: "c1",
                        customer_member_id: "m1",
                        person_id: "child-1",
                        display_name: "Owen Murphy",
                    },
                ],
                _sibling_links: [
                    {
                        customer_id: "c1",
                        customer_member_id: "m2",
                        person_id: "child-2",
                        display_name: "Riley Murphy",
                    },
                ],
            },
            { viewing_person_id: "child-1" }
        );

        const group = model.groups[0]!;
        expect(group.children.map((c) => c.display_name)).toEqual(["Riley Murphy"]);
    });

    it("suppresses empty groups", () => {
        const model = resolvePersonDrawerHouseholdModel({
            id: "p1",
            _household_context: [],
            _household_adult_links: [],
            _household_child_links: [],
        });
        expect(model.groups).toHaveLength(0);
    });
});
