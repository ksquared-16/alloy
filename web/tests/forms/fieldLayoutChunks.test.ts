import { describe, expect, it } from "vitest";
import { chunkFieldsForHalfRowLayout } from "@/lib/forms/fieldLayoutChunks";
import type { FormField } from "@/lib/forms/schema";

function text(id: string, layout?: "full" | "half"): FormField {
    return { id, type: "text", label: id, required: false, ...(layout ? { layout_width: layout } : {}) };
}

describe("chunkFieldsForHalfRowLayout", () => {
    it("pairs consecutive half-width text fields", () => {
        const fields = [text("a", "half"), text("b", "half"), text("c", "full")] as FormField[];
        const rows = chunkFieldsForHalfRowLayout(fields);
        expect(rows.map((r) => r.map((f) => f.id))).toEqual([["a", "b"], ["c"]]);
    });

    it("does not pair half with full in between", () => {
        const fields = [text("a", "half"), text("b"), text("c", "half")] as FormField[];
        const rows = chunkFieldsForHalfRowLayout(fields);
        expect(rows.map((r) => r.map((f) => f.id))).toEqual([["a"], ["b"], ["c"]]);
    });

    it("keeps trailing single half on its own row", () => {
        const fields = [text("a", "half")] as FormField[];
        expect(chunkFieldsForHalfRowLayout(fields).map((r) => r.map((f) => f.id))).toEqual([["a"]]);
    });

    it("does not pair group fields as half rows", () => {
        const g: FormField = {
            id: "g",
            type: "group",
            label: "G",
            required: false,
            layout_width: "half",
            fields: [text("inner")],
        };
        const fields = [text("a", "half"), g] as FormField[];
        const rows = chunkFieldsForHalfRowLayout(fields);
        expect(rows.map((r) => r.map((f) => f.id))).toEqual([["a"], ["g"]]);
    });
});
