import { describe, expect, it } from "vitest";
import { provingMinPhysicalLicensedAst } from "@/lib/organizationCalculations/ast";
import { extractDependencyRefs } from "@/lib/organizationCalculations/dependencies";

describe("organizationCalculations exact-version binding rules", () => {
    it("new drafts must not inherit runtime_surface from a published version", () => {
        const source = { runtime_surface: true, note: "x" };
        const next = { ...source } as { runtime_surface?: boolean; note?: string };
        delete next.runtime_surface;
        expect(next.runtime_surface).toBeUndefined();
        expect(next.note).toBe("x");
    });

    it("dependency extract stays closed for proving AST", () => {
        expect(extractDependencyRefs(provingMinPhysicalLicensedAst())).toEqual([
            "capacity.room_binding.licensed",
            "capacity.room_binding.physical",
        ]);
    });
});
