import { describe, expect, it } from "vitest";
import { resolveChildDrawerCommandHeaderMeta } from "@/lib/layout/runtime/resolveChildDrawerHeaderContext";

describe("resolveChildDrawerCommandHeaderMeta", () => {
    it("formats DOB for operator display instead of raw ISO", () => {
        const meta = resolveChildDrawerCommandHeaderMeta({
            "child.date_of_birth": "2026-01-01",
        });
        expect(meta.ageDobRow).toContain("DOB Jan 1, 2026");
        expect(meta.ageDobRow).not.toContain("2026-01-01");
    });

    it("prefers inquiry_child.program and child.program for program row", () => {
        const meta = resolveChildDrawerCommandHeaderMeta({
            "child.program": "Preschool",
        });
        expect(meta.programRow).toBe("Preschool");
    });
});
