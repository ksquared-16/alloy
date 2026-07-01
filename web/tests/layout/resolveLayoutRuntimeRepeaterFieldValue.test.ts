import { describe, expect, it } from "vitest";
import {
    layoutRuntimeRepeaterFieldDisplay,
    readLayoutRuntimeRepeaterFieldRaw,
} from "@/lib/layout/runtime/resolveLayoutRuntimeRepeaterFieldValue";

describe("resolveLayoutRuntimeRepeaterFieldValue", () => {
    it("reads flat child.first_name from repeater row", () => {
        const row = { "child.first_name": "Jim", "child.last_name": "Pat", "child.name": "Jim Pat" };
        expect(readLayoutRuntimeRepeaterFieldRaw(row, "child.first_name")).toBe("Jim");
        expect(layoutRuntimeRepeaterFieldDisplay(row, "child.first_name").text).toBe("Jim");
    });

    it("reads nested child object fields", () => {
        const row = {
            child: { first_name: "Alex", last_name: "Johnson", display_name: "Alex Johnson" },
        };
        expect(readLayoutRuntimeRepeaterFieldRaw(row, "child.first_name")).toBe("Alex");
        expect(layoutRuntimeRepeaterFieldDisplay(row, "child.name").text).toBe("Alex Johnson");
    });

    it("splits child.name when first_name column is configured but only name exists", () => {
        const row = { "child.name": "Jim Pat" };
        expect(readLayoutRuntimeRepeaterFieldRaw(row, "child.first_name")).toBe("Jim");
        expect(readLayoutRuntimeRepeaterFieldRaw(row, "child.last_name")).toBe("Pat");
    });

    it("falls back to row.display_name for name columns", () => {
        const row = { display_name: "Sam Lee" };
        expect(readLayoutRuntimeRepeaterFieldRaw(row, "child.name")).toBe("Sam Lee");
    });
});
