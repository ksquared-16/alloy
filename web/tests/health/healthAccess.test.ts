import { describe, expect, it } from "vitest";

import {
    canManageHealth,
    canViewHealth,
    evaluateHealthAccess,
    HEALTH_MANAGE_PERMISSION,
    HEALTH_VIEW_PERMISSION,
} from "@/lib/health/healthAccess";

describe("D-H6 — the health access boundary", () => {
    it("does not let admin/ops admission stand in for a health grant", () => {
        // The whole decision: an operator who works Attendance must not acquire allergies,
        // conditions and medications merely because a Health card was placed on a Surface.
        const opsWithoutHealth = { permissionKeys: ["ops.customers.read", "scheduling.read"] };
        expect(canViewHealth(opsWithoutHealth)).toBe(false);
        expect(canManageHealth(opsWithoutHealth)).toBe(false);
    });

    it("keeps read and write separate — manage does not imply view", () => {
        const managerOnly = { permissionKeys: [HEALTH_MANAGE_PERMISSION] };
        expect(canManageHealth(managerOnly)).toBe(true);
        expect(canViewHealth(managerOnly)).toBe(false);
    });

    it("denies when the grant read FAILED, which is not an empty grant set", () => {
        expect(evaluateHealthAccess({ permissionKeys: null }, HEALTH_VIEW_PERMISSION).allowed).toBe(false);
        expect(evaluateHealthAccess({ permissionKeys: [] }, HEALTH_VIEW_PERMISSION).allowed).toBe(false);
    });

    it("names the permission in its refusal, never the data", () => {
        // An operator who cannot see health information should not learn from the refusal that this
        // child has any.
        const decision = evaluateHealthAccess({ permissionKeys: [] }, HEALTH_VIEW_PERMISSION);
        expect(decision.allowed).toBe(false);
        if (decision.allowed) return;
        expect(decision.message).toBe("You do not have permission to view health information.");
        expect(decision.message).not.toMatch(/allerg|condition|medication/i);
        expect(decision.missing).toBe(HEALTH_VIEW_PERMISSION);
    });

    it("allows a caller holding the grant", () => {
        expect(canViewHealth({ permissionKeys: ["health.view"] })).toBe(true);
    });
});
