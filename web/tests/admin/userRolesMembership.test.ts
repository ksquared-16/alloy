import { describe, expect, it } from "vitest";
import { displayRoleForAdminPicker, groupSortedRoleKeysByUserId } from "@/lib/admin/userRolesMembership";

describe("groupSortedRoleKeysByUserId", () => {
    it("aggregates multiple roles per user", () => {
        const map = groupSortedRoleKeysByUserId([
            { user_id: "u1", role: "ops" },
            { user_id: "u1", role: "regional_lead" },
            { user_id: "u2", role: "admin" },
        ]);
        expect(map.get("u1")).toEqual(["ops", "regional_lead"]);
        expect(map.get("u2")).toEqual(["admin"]);
    });

    it("dedupes roles", () => {
        const map = groupSortedRoleKeysByUserId([
            { user_id: "u1", role: "ops" },
            { user_id: "u1", role: "ops" },
        ]);
        expect(map.get("u1")).toEqual(["ops"]);
    });

    it("skips blank roles", () => {
        const map = groupSortedRoleKeysByUserId([{ user_id: "u1", role: "  " }, { user_id: "u1", role: "admin" }]);
        expect(map.get("u1")).toEqual(["admin"]);
    });
});

describe("displayRoleForAdminPicker", () => {
    it("prefers admin then ops", () => {
        expect(displayRoleForAdminPicker(["school_director", "admin"])).toBe("admin");
        expect(displayRoleForAdminPicker(["school_director", "ops"])).toBe("ops");
    });

    it("falls back to lexicographic first", () => {
        expect(displayRoleForAdminPicker(["regional_lead", "school_director"])).toBe("regional_lead");
    });
});
