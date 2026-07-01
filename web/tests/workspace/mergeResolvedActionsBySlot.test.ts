import { describe, expect, it } from "vitest";
import { mergeResolvedActionsBySlot } from "@/lib/workspace/mergeResolvedActionsBySlot";
import type { ResolvedActionsBySlot } from "@/lib/admin/actions/types";

function slot(
    partial: Partial<ResolvedActionsBySlot> & Pick<ResolvedActionsBySlot, "right_rail" | "primary">
): ResolvedActionsBySlot {
    return {
        primary: partial.primary ?? [],
        secondary: partial.secondary ?? [],
        overflow: partial.overflow ?? [],
        right_rail: partial.right_rail ?? [],
        row_inline: partial.row_inline ?? [],
        header: partial.header ?? [],
    };
}

describe("mergeResolvedActionsBySlot", () => {
    it("dedupes by slot+key and preserves first occurrence order", () => {
        const a = slot({
            right_rail: [{ key: "a", label: "A", action_type: "navigate", display_style: "button", payload: {}, workflow_id: null, description: null, icon: null, style: null }],
            primary: [{ key: "b", label: "B", action_type: "navigate", display_style: "button", payload: {}, workflow_id: null, description: null, icon: null, style: null }],
        });
        const b = slot({
            right_rail: [{ key: "a", label: "A2", action_type: "navigate", display_style: "button", payload: {}, workflow_id: null, description: null, icon: null, style: null }],
            primary: [{ key: "c", label: "C", action_type: "navigate", display_style: "button", payload: {}, workflow_id: null, description: null, icon: null, style: null }],
        });
        const m = mergeResolvedActionsBySlot(a, b);
        expect(m.right_rail.map((x) => x.key)).toEqual(["a"]);
        expect(m.right_rail[0]?.label).toBe("A");
        expect(m.primary.map((x) => x.key)).toEqual(["b", "c"]);
    });
});
