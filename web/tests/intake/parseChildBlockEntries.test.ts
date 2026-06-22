import { describe, expect, it } from "vitest";
import { parseChildBlockEntries } from "@/lib/intake/extract/parseChildBlockEntries";

describe("parseChildBlockEntries", () => {
    it("parses multiple children with DOB label and bare date", () => {
        const entries = parseChildBlockEntries("Children: Jet DOB 2/4/2026 and Chet 10/10/2023");
        expect(entries).toHaveLength(2);
        expect(entries[0]).toMatchObject({
            first_name: "Jet",
            last_name: null,
            dob: "2026-02-04",
        });
        expect(entries[1]).toMatchObject({
            first_name: "Chet",
            last_name: null,
            dob: "2023-10-10",
        });
    });

    it("does not include date text in child name", () => {
        const entries = parseChildBlockEntries("Children: Jet DOB 2/4/2026 and Chet 10/10/2023");
        for (const entry of entries) {
            expect(entry.raw_name).not.toMatch(/\d/);
            expect(entry.first_name).not.toMatch(/\d/);
            expect(entry.last_name ?? "").not.toMatch(/\d/);
        }
    });

    it.each([
        ["Kids: Jet 2/4/2026, Chet 10/10/2023", ["Jet", "Chet"], ["2026-02-04", "2023-10-10"]],
        ["Children: Jet (DOB 2/4/2026) and Chet (DOB 10/10/2023)", ["Jet", "Chet"], ["2026-02-04", "2023-10-10"]],
        ["Kids: Jet DOB 2.4.26 and Chet DOB 10.10.23", ["Jet", "Chet"], ["2026-02-04", "2023-10-10"]],
    ])("parses child segments from %s", (line, names, dobs) => {
        const entries = parseChildBlockEntries(line);
        expect(entries.map((e) => e.first_name)).toEqual(names);
        expect(entries.map((e) => e.dob)).toEqual(dobs);
    });
});
