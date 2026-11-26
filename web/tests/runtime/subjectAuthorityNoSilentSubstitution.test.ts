/**
 * SUBJECT AUTHORITY — a named subject is intent, and must never be silently swapped.
 *
 * Measured on a prod build before the fix: `?subject_id=<well-formed id not on the page>` returned
 * `terminal: "operational"` carrying the DEFAULT subject, with no error and no signal, while the URL
 * still read `subject_id=<the requested one>`. In a childcare enrollment surface that is an operator
 * acting on the wrong family — the most consequential form the fabrication defect can take.
 *
 * The selection lives inside the supabase-bound composer, so this is a source guard (the same shape
 * used for the sibling-prewarm reveal gate). The behavioural proof is the API certification recorded
 * in SUBJECT-AUTHORITY.md, which exercises the real composer over the real database.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
    join(process.cwd(), "lib/runtime/provisioning/workUnitProvisioningAnswer.ts"),
    "utf8",
);

function sliceBetween(from: string, to: string): string {
    const start = source.indexOf(from);
    const end = source.indexOf(to, start);
    expect(start, `anchor not found: ${from}`).toBeGreaterThan(-1);
    expect(end, `anchor not found: ${to}`).toBeGreaterThan(start);
    return source.slice(start, end);
}

describe("a requested subject is never silently substituted", () => {
    // The end anchor moved with Phase 4: the subject row is now resolved per GRAIN
    // (`childSubjectRow ?? page.find(...)`). The invariant under test is unchanged — a
    // requested-but-absent subject must still refuse BEFORE the default-subject fallback runs.
    const selection = sliceBetween("const requested = req.requestedSubjectId", "const childSubjectRow =");

    it("refuses when a subject was requested but is not on the evaluated page", () => {
        expect(selection).toMatch(/if\s*\(\s*req\.requestedSubjectId\s*&&\s*!requested\s*\)/);
        expect(selection).toContain('fail(');
        expect(selection).toContain("subject_unavailable");
    });

    it("the refusal happens BEFORE the default-subject fallback can run", () => {
        const guardAt = selection.search(/if\s*\(\s*req\.requestedSubjectId\s*&&\s*!requested\s*\)/);
        const fallbackAt = selection.indexOf("resolveDefaultOperationalSubject");
        expect(guardAt).toBeGreaterThan(-1);
        expect(fallbackAt).toBeGreaterThan(-1);
        // Order is the whole invariant: reaching the fallback with a requested-but-absent id is the bug.
        expect(guardAt).toBeLessThan(fallbackAt);
    });

    it("still falls back to the default subject when NO subject was requested", () => {
        // The bare route (no `subject_id`) must keep choosing a default — the fix narrows the
        // fallback to the case where the caller expressed no intent, it does not remove it.
        expect(selection).toMatch(/requested\s*\?\?\s*\n?\s*resolveDefaultOperationalSubject/);
    });

    it("keeps the pre-existing honest terminal for 'rows exist but no subject resolved'", () => {
        expect(selection).toContain("the configured strategy resolved no subject from the evaluated page");
    });
});
