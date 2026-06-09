import { describe, expect, it } from "vitest";
import {
    enrichInferredChildRepeaterColumns,
    ensureLayoutRuntimeChildLinkAdornment,
    isLayoutRuntimeChildLinkColumn,
} from "@/lib/layout/runtime/layoutRuntimeLinkHarness";

describe("layoutRuntimeLinkHarness", () => {
    it("marks child name columns as link columns", () => {
        expect(isLayoutRuntimeChildLinkColumn("child.name", "child")).toBe(true);
        expect(isLayoutRuntimeChildLinkColumn("child.program", "child")).toBe(false);
    });

    it("injects child open_drawer adornment on inferred columns", () => {
        const cols = enrichInferredChildRepeaterColumns([
            { refKey: "child.name", label: "Child", width: "flexible" },
            { refKey: "child.program", label: "Program", width: "flexible" },
        ]);
        expect(cols[0]?.adornment?.action).toEqual({
            type: "open_drawer",
            entity: "child",
            idPath: "child.id",
        });
        expect(cols[1]?.adornment).toBeUndefined();
    });

    it("preserves configured child adornment", () => {
        const configured = ensureLayoutRuntimeChildLinkAdornment({
            position: "left",
            icon: "child",
            action: { type: "open_drawer", entity: "child", idPath: "child.id" },
        });
        expect(configured.action?.idPath).toBe("child.id");
    });
});
