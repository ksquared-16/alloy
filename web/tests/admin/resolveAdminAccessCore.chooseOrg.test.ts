import { describe, expect, it } from "vitest";
import { chooseOrgAndRoleKeysFromMembershipRows } from "@/lib/admin/resolveAdminAccessCore";

describe("chooseOrgAndRoleKeysFromMembershipRows", () => {
    it("picks lexicographically smallest org among admin/ops memberships and returns all role keys in that org", () => {
        const orgA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
        const orgB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
        const picked = chooseOrgAndRoleKeysFromMembershipRows([
            { org_id: orgB, role: "ops" },
            { org_id: orgB, role: "school_director" },
            { org_id: orgA, role: "admin" },
        ]);
        expect(picked).toEqual({ orgId: orgA, roleKeys: ["admin"] });
    });

    it("when only custom roles exist, picks smallest org among all rows", () => {
        const orgA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
        const orgB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
        const picked = chooseOrgAndRoleKeysFromMembershipRows([
            { org_id: orgB, role: "school_director" },
            { org_id: orgA, role: "regional_lead" },
        ]);
        expect(picked).toEqual({ orgId: orgA, roleKeys: ["regional_lead"] });
    });

    it("returns null for empty input", () => {
        expect(chooseOrgAndRoleKeysFromMembershipRows([])).toBeNull();
    });
});
