/**
 * CAPABILITY AN ADMINISTRATOR CANNOT REACH IS NOT CAPABILITY.
 *
 * `multiselect` was once in the builder's type union, in the schema and in the runtime — and absent
 * from the Studio's answer-type MENU, so a question the family may answer several ways could not be
 * authored at all. `structured_address` was the same miss, made again, and the final one-pass
 * certification is what caught it: my earlier capability matrix verified authoring through the
 * builder API, and the builder API is not the product.
 *
 * So the menu is asserted against the builder's own union. A future answer type cannot ship
 * unreachable.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const BUILDER = readFileSync(
    new URL("../../app/adminV2/pos/ProcessingFormBuilder.tsx", import.meta.url).pathname,
    "utf8",
);
const INSPECTOR = readFileSync(
    new URL("../../app/adminV2/pos/ProcessingFormQuestionInspector.tsx", import.meta.url).pathname,
    "utf8",
);
const SCHEMA_TYPES = readFileSync(new URL("../../lib/forms/formBuilderSchema.ts", import.meta.url).pathname, "utf8");

/** The answer types the Studio menu actually offers. */
function menuTypes(): string[] {
    const at = BUILDER.indexOf("const QUESTION_TYPES");
    const block = BUILDER.slice(at, BUILDER.indexOf("\n];", at));
    return [...block.matchAll(/\{\s*type:\s*"([a-z_]+)"/g)].map((m) => m[1]);
}

/** Every type the builder's union declares. */
function unionTypes(): string[] {
    const at = SCHEMA_TYPES.indexOf("export type BuilderFieldType =");
    const block = SCHEMA_TYPES.slice(at, SCHEMA_TYPES.indexOf(";", SCHEMA_TYPES.indexOf('"structured_address"', at)) + 1);
    return [...block.matchAll(/\|\s*"([a-z_]+)"/g)].map((m) => m[1]);
}

describe("the Studio menu offers every answer type the builder can make", () => {
    it("offers structured_address — the miss this certification found", () => {
        expect(menuTypes(), "an administrator cannot reach it from the menu").toContain("structured_address");
    });

    it("offers multiselect and repeated people — the earlier misses of the same kind", () => {
        expect(menuTypes()).toContain("multiselect");
        expect(menuTypes()).toContain("party_collection");
    });

    it("leaves NO type in the union unreachable from the menu", () => {
        const missing = unionTypes().filter((t) => !menuTypes().includes(t));
        expect(missing, `unreachable from the Studio menu: ${missing.join(", ")}`).toEqual([]);
    });
});

describe("an authored address is configurable, not just creatable", () => {
    it("asks whose address it is", () => {
        expect(INSPECTOR).toContain("data-inspector-address");
        expect(INSPECTOR).toContain("Whose address?");
        expect(INSPECTOR).toContain("data-inspector-address-subject");
    });

    it("offers the role in the platform's own relationship vocabulary, derived so it cannot drift", () => {
        expect(INSPECTOR).toContain("PARTY_ROLE_OPTIONS");
        const at = INSPECTOR.indexOf("const PARTY_ROLE_OPTIONS");
        expect(INSPECTOR.slice(at, at + 320)).toContain("PARTY_KIND_OPTIONS");
    });

    it("edits the schema's own construct rather than a parallel copy", () => {
        expect(INSPECTOR).toContain("updateAddressBinding");
        const at = INSPECTOR.indexOf("function updateAddressBinding");
        const fn = INSPECTOR.slice(at, at + 900);
        expect(fn).toContain("address_binding: next");
        // A key passed empty is CLEARED — how "belongs to the subject, not a role" is said.
        expect(fn).toContain("delete next[key]");
    });

    it("shows the control only for a group that declared itself an address", () => {
        const at = INSPECTOR.indexOf("function isAddress");
        expect(INSPECTOR.slice(at, at + 200)).toContain("address_binding");
    });
});
