import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * R-016 — Household `address_line2` read-back.
 *
 * Reported as a data-model problem: PATCH returns 200, the value persists, the UI shows what was
 * submitted, and after reload the household reads `—`. It is not a data-model problem.
 *
 * Canonical storage for person addresses IS `field_values` on entity_type `person` — the migration
 * `20260602130000_person_address_field_definitions.sql` defines all five components there, and
 * `resolvePersonAddressFieldValues` states it outright: "Storage: field_definitions / field_values
 * on entity_type `person` (not persons columns)". The write goes there correctly, and the person
 * address index reads all five keys generically.
 *
 * The defect was one omission in ONE read composition: `buildAddressLine` picked line 1, city,
 * state and postal code, and never picked line 2 — the only component left out. So the value was
 * written, persisted, and never read back, which to the operator is indistinguishable from the save
 * not sticking.
 *
 * Asserted at source level because `buildAddressLine` is module-private and its caller needs a full
 * `OperationalContext`; the invariant worth locking is that every address component participates.
 */

const SRC = readFileSync(
    join(process.cwd(), "lib/adminV2/runtime/focusPanel/household/buildHouseholdCardEvidence.ts"),
    "utf8",
);

/** The composition body only, so prose in comments cannot satisfy these assertions. */
const composition = (() => {
    const start = SRC.indexOf("function buildAddressLine(");
    const body = SRC.slice(start, SRC.indexOf("\nfunction ", start + 10));
    return body.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
})();

describe("the household address reads back every component it can store", () => {
    it.each([
        ["line 1", "person.primary_address_line1", "person.address_line1"],
        ["line 2", "person.primary_address_line2", "person.address_line2"],
        ["city", "person.primary_address_city", "person.city"],
        ["state", "person.primary_address_state", "person.state"],
        ["postal code", "person.primary_address_postal_code", "person.postal_code"],
    ])("picks %s from both its primary and bare truth keys", (_label, primaryKey, bareKey) => {
        expect(composition).toContain(primaryKey);
        expect(composition).toContain(bareKey);
    });

    it("includes line 2 in the composed address, not merely in scope", () => {
        // The regression this replaces was `[line1, tail]` — line2 resolved and then dropped.
        expect(composition).toMatch(/const line2 = pick\(/);
        expect(composition).toMatch(/\[\s*line1\s*,\s*line2\s*,/);
    });

    it("keeps the composition ordered as an address reads", () => {
        const order = ["line1", "line2", "city", "state", "postal"].map((n) =>
            composition.indexOf(`const ${n} =`),
        );
        expect(order.every((i) => i > -1)).toBe(true);
        expect([...order].sort((a, b) => a - b)).toEqual(order);
    });
});
