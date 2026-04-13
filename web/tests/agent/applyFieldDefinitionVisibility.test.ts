import { describe, expect, it } from "vitest";
import { lockTimestampMatches, prepareFieldDefinitionVisibilityPatch } from "@/lib/agent/v2/applyFieldDefinitionVisibility";

const row = {
    is_visible_in_form: true,
    is_visible_in_drawer: true,
    is_visible_in_table: false,
    is_visible_in_public_booking: false,
    updated_at: "2026-01-15T12:00:00.000Z",
};

describe("prepareFieldDefinitionVisibilityPatch", () => {
    it("merges patch", () => {
        const p = prepareFieldDefinitionVisibilityPatch(row, {
            version: 1,
            is_visible_in_table: true,
        });
        expect(p.ok).toBe(true);
        if (p.ok) expect(p.mergedFlags.is_visible_in_table).toBe(true);
    });
});

describe("lockTimestampMatches", () => {
    it("matches ISO strings", () => {
        expect(lockTimestampMatches(row, "2026-01-15T12:00:00.000Z")).toBe(true);
    });

    it("rejects mismatch", () => {
        expect(lockTimestampMatches(row, "2026-01-16T12:00:00.000Z")).toBe(false);
    });
});
