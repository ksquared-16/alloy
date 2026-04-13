import { describe, expect, it } from "vitest";
import {
    mergeFieldVisibilityFlags,
    parseFieldVisibilityPatchStrict,
    rowToVisibilityFlags,
} from "@/lib/agent/v2/fieldVisibilityConfigV0";

describe("parseFieldVisibilityPatchStrict", () => {
    it("rejects unknown keys", () => {
        const r = parseFieldVisibilityPatchStrict({ version: 1, is_visible_in_form: true, extra: 1 });
        expect(r.ok).toBe(false);
    });

    it("requires version 1", () => {
        expect(parseFieldVisibilityPatchStrict({ is_visible_in_form: true }).ok).toBe(false);
    });

    it("requires at least one flag", () => {
        expect(parseFieldVisibilityPatchStrict({ version: 1 }).ok).toBe(false);
    });

    it("accepts partial flags", () => {
        const r = parseFieldVisibilityPatchStrict({ version: 1, is_visible_in_table: false });
        expect(r.ok).toBe(true);
    });
});

describe("mergeFieldVisibilityFlags", () => {
    it("merges over current", () => {
        const cur = rowToVisibilityFlags({
            is_visible_in_form: true,
            is_visible_in_drawer: true,
            is_visible_in_table: true,
            is_visible_in_public_booking: false,
        });
        const m = mergeFieldVisibilityFlags(cur, { version: 1, is_visible_in_table: false });
        expect(m.is_visible_in_table).toBe(false);
        expect(m.is_visible_in_form).toBe(true);
    });
});
