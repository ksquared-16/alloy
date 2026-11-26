import { describe, expect, it } from "vitest";
import { applyEmergencyRoleRemovalToTruth } from "@/lib/adminV2/runtime/focusPanel/emergencyContacts/focusPanelPersonChildRelationshipMutation";

describe("applyEmergencyRoleRemovalToTruth", () => {
    it("removes emergency role but preserves authorized_pickup on same edge", () => {
        const truth = {
            _person_child_relationships_by_member: [
                {
                    customer_member_id: "member-noah",
                    customer_id: "cust-1",
                    child_id: "child-noah",
                    items: [
                        {
                            id: "rel-2",
                            customer_member_id: "member-noah",
                            person_id: "person-alex",
                            operational_roles: ["emergency_contact", "authorized_pickup"],
                            status: "active",
                        },
                    ],
                },
            ],
        };
        const merged = applyEmergencyRoleRemovalToTruth(truth, {
            relationshipId: "rel-2",
            customerMemberId: "member-noah",
        });
        const item = (merged._person_child_relationships_by_member as { items: { operational_roles: string[]; status?: string }[] }[])[0]
            ?.items[0];
        expect(item?.operational_roles).toEqual(["authorized_pickup"]);
        expect(item?.status).toBe("active");
    });

    it("deactivates edge when last role removed", () => {
        const truth = {
            _person_child_relationships_by_member: [
                {
                    customer_member_id: "member-mia",
                    customer_id: "cust-1",
                    child_id: "child-mia",
                    items: [
                        {
                            id: "rel-1",
                            customer_member_id: "member-mia",
                            person_id: "person-alex",
                            operational_roles: ["emergency_contact"],
                            status: "active",
                        },
                    ],
                },
            ],
        };
        const merged = applyEmergencyRoleRemovalToTruth(truth, {
            relationshipId: "rel-1",
            customerMemberId: "member-mia",
        });
        const item = (merged._person_child_relationships_by_member as { items: { status: string; operational_roles: string[] }[] }[])[0]
            ?.items[0];
        expect(item?.operational_roles).toEqual([]);
        expect(item?.status).toBe("inactive");
    });
});
