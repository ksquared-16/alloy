/**
 * Role creation stops asking an operator to invent a technical key.
 *
 * The field's own caption said "operators see the label, not this key" — so it should never have
 * been an operator's job. These tests hold the two properties that make generating it safe: the
 * client's slug rule is the SERVER's rule, and collisions resolve to something a human can read.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { roleKeyFromName, slugifyRoleKey } from "@/lib/access/roleKeyFromName";

describe("the derived key is the key the server would store", () => {
    it("uses the SAME normalisation the roles endpoint applies", () => {
        // Asserted against the route's source, not against a restatement of it. A client rule that
        // drifted would mean the key created is not the key stored — two answers to one question.
        const route = readFileSync(
            join(__dirname, "..", "..", "app/api/admin/rbac/roles/route.ts"),
            "utf8",
        );
        expect(route).toContain('replace(/[^a-z0-9_]/g, "_")');
        expect(route).toContain('replace(/_+/g, "_")');
        expect(route).toContain('replace(/^_|_$/g, "")');

        for (const name of ["Front Desk Coordinator", "  Centre  Director  ", "Billing/Payments", "Ops--Lead"]) {
            const mine = slugifyRoleKey(name);
            const theirs = name.trim().toLowerCase()
                .replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
            expect(mine, name).toBe(theirs);
        }
    });

    it("turns a business name into a readable key", () => {
        expect(roleKeyFromName("Front Desk Coordinator")).toBe("front_desk_coordinator");
        expect(roleKeyFromName("Centre Director")).toBe("centre_director");
    });
});

describe("collisions resolve deterministically", () => {
    it("suffixes _2, _3 rather than randomising", () => {
        expect(roleKeyFromName("Director", ["director"])).toBe("director_2");
        expect(roleKeyFromName("Director", ["director", "director_2"])).toBe("director_3");
    });

    it("the same name against the same roles always gives the same key", () => {
        const existing = ["director", "director_2"];
        expect(roleKeyFromName("Director", existing)).toBe(roleKeyFromName("Director", existing));
    });

    it("compares against the NORMALISED existing keys, not their raw spelling", () => {
        expect(roleKeyFromName("Front Desk", ["Front Desk"])).toBe("front_desk_2");
    });
});

describe("it refuses rather than inventing", () => {
    it("returns null when the name yields no slug", () => {
        for (const empty of ["", "   ", "---", "///"]) {
            expect(roleKeyFromName(empty), JSON.stringify(empty)).toBeNull();
        }
    });

    it("returns null rather than looping forever on an absurd collision set", () => {
        const existing = ["x", ...Array.from({ length: 998 }, (_, i) => `x_${i + 2}`)];
        expect(roleKeyFromName("X", existing)).toBeNull();
    });
});
