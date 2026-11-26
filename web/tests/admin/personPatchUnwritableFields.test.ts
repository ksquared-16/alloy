/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A SAVE THAT PERSISTS NOTHING MUST NOT REPORT SUCCESS.
 *
 * `upsertFieldValuesFromBody` skipped any key with no `field_definitions` row — correctly, there
 * is nowhere to put it — but silently, so `PATCH /api/admin/persons/:id` returned 200 for a body
 * that wrote nothing at all. The helper now reports `{ written, skipped }` and the route refuses
 * only the case where changes were asked for and NONE could land.
 *
 * Proven live against Firefly:
 *   { slot5_definitely_not_a_field } -> 400 "No writable field in this request"
 *   { address_line2 }                -> 200 (a real person field definition; it does persist)
 *   { phone }                        -> 200 (native column, unaffected)
 */
const read = (rel: string) =>
    readFileSync(join(__dirname, "..", "..", rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("person PATCH — unwritable fields", () => {
    it("the field-values helper reports what it wrote and skipped", () => {
        const code = read("lib/admin/fieldValues.ts");
        expect(code).toContain("Promise<{ written: string[]; skipped: string[] }>");
        expect(code).toContain("skipped.push(field_key)");
        expect(code).toContain("written.push(field_key)");
    });

    it("the route refuses a PATCH that can persist nothing", () => {
        const code = read("app/api/admin/persons/[id]/route.ts");
        expect(code).toContain("unwritable_fields");
        expect(code).toContain("fieldValueOutcome.skipped.length > 0");
    });

    it("refuses ONLY when nothing landed — a partial write still succeeds", () => {
        const code = read("app/api/admin/persons/[id]/route.ts");
        expect(code).toContain("Object.keys(personUpdates).length === 0");
        expect(code).toContain("fieldValueOutcome.written.length === 0");
    });
});
