import { describe, expect, it } from "vitest";
import {
    isGenericLayoutColumnLabel,
    layoutRepeaterColumnGridTrack,
    layoutRepeaterColumnHeaderLabel,
    layoutRepeaterRowGridStyle,
} from "@/lib/layout/runtime/layoutRepeaterColumnLayout";
import type { LayoutCollectionColumn } from "@/lib/layout/layoutV2";

function col(partial: Partial<LayoutCollectionColumn> & Pick<LayoutCollectionColumn, "refKey">): LayoutCollectionColumn {
    return {
        label: partial.label ?? "Column",
        ...partial,
    };
}

describe("layoutRepeaterColumnLayout", () => {
    it("treats builder placeholder labels as generic", () => {
        expect(isGenericLayoutColumnLabel("Column", "child.first_name")).toBe(true);
        expect(isGenericLayoutColumnLabel("FIELD", "child.program")).toBe(true);
        expect(isGenericLayoutColumnLabel("First name", "child.first_name")).toBe(false);
    });

    it("uses configured labels in drawer headers", () => {
        expect(
            layoutRepeaterColumnHeaderLabel(col({ refKey: "child.first_name", label: "First Name" })),
        ).toBe("First Name");
        expect(
            layoutRepeaterColumnHeaderLabel(col({ refKey: "child.program", label: "Column" })),
        ).toBe("Program");
    });

    it("maps flexible width to equal grid tracks", () => {
        const columns = [
            col({ refKey: "child.full_name", label: "Name", widthBehavior: "flexible" }),
            col({ refKey: "child.program", label: "Program", widthBehavior: "flexible" }),
            col({ refKey: "child.age_band", label: "Age", widthBehavior: "small" }),
        ];
        const style = layoutRepeaterRowGridStyle(columns);
        expect(style.gridTemplateColumns).toContain("minmax(0, 1fr)");
        expect(layoutRepeaterColumnGridTrack(columns[2]!)).toBe("max-content");
    });
});
