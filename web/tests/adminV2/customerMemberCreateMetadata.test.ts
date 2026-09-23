/**
 * Creating a child through the admin route always failed.
 *
 * `customer_members.metadata` is NOT NULL and the insert sent an explicit `null` whenever the
 * caller omitted it — which is every ordinary create. The error a caller saw was the database's:
 * "null value in column metadata of relation customer_members violates not-null constraint".
 *
 * Found while building a QA household: adding a sibling through the canonical route returned 500
 * every time, and nothing about the request was wrong.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const route = readFileSync(
    new URL("../../app/api/admin/customer-members/route.ts", import.meta.url).pathname,
    "utf8",
);

describe("a customer member can actually be created", () => {
    it("never sends a null into the NOT NULL metadata column", () => {
        const at = route.indexOf("metadata: body.metadata");
        expect(at).toBeGreaterThan(0);
        const assignment = route.slice(at, route.indexOf("\n", at));
        expect(assignment, "an absent metadata is an empty object, not a null").not.toMatch(/:\s*null/);
        expect(assignment).toContain("{}");
    });

    it("still honours metadata the caller supplied", () => {
        const at = route.indexOf("metadata: body.metadata");
        const assignment = route.slice(at, route.indexOf("\n", at));
        expect(assignment).toContain("body.metadata");
        // An array is not a metadata object; it would violate the column's shape.
        expect(assignment).toContain("!Array.isArray(body.metadata)");
    });
});
