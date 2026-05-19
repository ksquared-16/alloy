import { describe, expect, it } from "vitest";
import {
    LAYOUT_COMPOSITION_PRIMARY_BOS_CAPABILITY,
    resolveLayoutCompositionCapabilities,
} from "@/lib/adminV2/layouts/layoutCompositionCapabilities";
import { LAYOUT_MUTATION_CLASS } from "@/lib/adminV2/layouts/layoutMutationClasses";

describe("layoutCompositionCapabilities", () => {
    it("enables full composition for opportunity workflow v1", () => {
        const cap = resolveLayoutCompositionCapabilities({
            entity: "opportunity",
            workflowV1Configured: true,
        });
        expect(cap.isReadOnly).toBe(false);
        expect(cap.canManageSections).toBe(true);
        expect(cap.canAssignFields).toBe(true);
        expect(cap.supportsFieldReorder).toBe(true);
        expect(cap.primaryBosCapability).toBe(LAYOUT_COMPOSITION_PRIMARY_BOS_CAPABILITY);
        expect(cap.allowedMutationClasses).toContain(LAYOUT_MUTATION_CLASS.A_DRAWER_CHROME);
        expect(cap.allowedMutationClasses).toContain(LAYOUT_MUTATION_CLASS.B_FIELD_PLACEMENT);
    });

    it("read-only opportunity when workflow v1 not configured", () => {
        const cap = resolveLayoutCompositionCapabilities({
            entity: "opportunity",
            workflowV1Configured: false,
        });
        expect(cap.isReadOnly).toBe(true);
        expect(cap.canManageSections).toBe(false);
        expect(cap.allowedMutationClasses).toEqual([]);
        expect(cap.readOnlyReason).toMatch(/workflow v1/i);
    });

    it("read-only job and schedule", () => {
        for (const entity of ["job", "schedule"] as const) {
            const cap = resolveLayoutCompositionCapabilities({ entity });
            expect(cap.isReadOnly).toBe(true);
            expect(cap.canManageSections).toBe(false);
            expect(cap.canAssignFields).toBe(false);
        }
    });
});
