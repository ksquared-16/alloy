import { describe, expect, it } from "vitest";
import { layoutRuntimeTaskChipStyle } from "@/lib/layout/runtime/layoutRuntimeTaskChipStyles";

describe("layoutRuntimeTaskChipStyle", () => {
    it("uses juniper accent for open tasks", () => {
        const style = layoutRuntimeTaskChipStyle({ status: "open", due_at: "2099-01-01T12:00:00.000Z" });
        expect(style.label).toBe("Open");
        expect(style.rowClassName).toContain("alloy-juniper");
    });

    it("uses ember accent for overdue tasks", () => {
        const style = layoutRuntimeTaskChipStyle({ status: "open", due_at: "2020-01-01T12:00:00.000Z" });
        expect(style.label).toBe("Overdue");
        expect(style.rowClassName).toContain("alloy-ember");
    });
});
