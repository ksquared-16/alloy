import { describe, it, expect } from "vitest";
import { tierForRoleType, compareRecipientsForTier } from "@/lib/communications/v2/familyWorkspace/recipientTierPolicy";

describe("recipientTierPolicy", () => {
    it("maps parent/guardian/primary_contact to primary", () => {
        expect(tierForRoleType("parent")).toBe("primary");
        expect(tierForRoleType("guardian")).toBe("primary");
        expect(tierForRoleType("primary_contact")).toBe("primary");
    });
    it("maps emergency/pickup/grandparent to secondary", () => {
        expect(tierForRoleType("emergency_contact")).toBe("secondary");
        expect(tierForRoleType("authorized_pickup")).toBe("secondary");
        expect(tierForRoleType("grandparent")).toBe("secondary");
    });
    it("excludes child / staff / vendor", () => {
        expect(tierForRoleType("child")).toBe("excluded");
        expect(tierForRoleType("staff")).toBe("excluded");
        expect(tierForRoleType("vendor")).toBe("excluded");
    });
    it("defaults unknown household role to secondary (still messageable)", () => {
        expect(tierForRoleType("cousin")).toBe("secondary");
        expect(tierForRoleType(null)).toBe("secondary");
    });
    it("sorts is_primary first, then guardian precedence, then name", () => {
        const a = { isPrimary: true, roleType: "parent", displayName: "Zoe" };
        const b = { isPrimary: false, roleType: "guardian", displayName: "Al" };
        expect(compareRecipientsForTier(a, b)).toBeLessThan(0);
        const c = { isPrimary: false, roleType: "guardian", displayName: "Al" };
        const d = { isPrimary: false, roleType: "parent", displayName: "Al" };
        expect(compareRecipientsForTier(c, d)).toBeLessThan(0); // guardian precedes parent
    });
});
