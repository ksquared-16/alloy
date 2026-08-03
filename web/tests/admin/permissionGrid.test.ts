import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
    PERMISSION_GRID_ROWS,
    applyGridRowSelection,
    levelFromGrantedKeys,
} from "@/lib/admin/permissionGrid";

/**
 * Keys seeded into `public.permission_definitions` by any migration.
 *
 * That is the table `PUT /api/admin/rbac/grants` validates against
 * (`app/api/admin/rbac/grants/route.ts:61-67`), and the validation runs *before* the
 * delete-all-then-insert at `:70-89` — so a grid row naming an unseeded key returns 400 and takes
 * the operator's other valid selections on that screen with it.
 */
function seededPermissionDefinitionKeys(): Set<string> {
    const migrationsDir = path.resolve(__dirname, "../../../supabase/migrations");
    const keys = new Set<string>();

    for (const file of fs.readdirSync(migrationsDir)) {
        if (!file.endsWith(".sql")) continue;
        const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
        // Each INSERT block, up to its terminating semicolon.
        for (const block of sql.split(/INSERT\s+INTO\s+public\.permission_definitions/i).slice(1)) {
            const body = block.split(";")[0] ?? "";
            for (const match of body.matchAll(/\(\s*'([a-zA-Z0-9_.]+)'/g)) {
                keys.add(match[1]!);
            }
        }
    }
    return keys;
}

describe("permissionGrid", () => {
    it("derives level from granted keys", () => {
        const row = PERMISSION_GRID_ROWS.find((r) => r.id === "users_roles")!;
        expect(levelFromGrantedKeys(row, new Set())).toBe("none");
        expect(levelFromGrantedKeys(row, new Set(["settings.users_roles.read"]))).toBe("read");
        expect(levelFromGrantedKeys(row, new Set(["settings.users_roles"]))).toBe("write");
    });

    it("applies selection without touching unknown keys", () => {
        const row = PERMISSION_GRID_ROWS.find((r) => r.id === "opportunities")!;
        const initial = new Set(["some.other.permission", "crm.opportunities.read"]);
        const next = applyGridRowSelection({ row, level: "none", granted: initial });
        expect(next.has("some.other.permission")).toBe(true);
        expect(next.has("crm.opportunities.read")).toBe(false);
    });
});

/**
 * W-3 — repair the unsavable grid row (closes C5). Regression lock **RL-2**.
 *
 * Plan: `docs/platform/planning/vacilando-os/qa/access-identity-v2/03-implementation-qa-sequence.md` §5.
 *
 * RL-2 is deliberately temporary: W-10 makes the grid a projection of the catalog, at which point
 * this assertion becomes structurally unnecessary and must be **replaced** by the generation test,
 * not quietly deleted when it starts failing.
 */
describe("permission grid keys are grantable (RL-2)", () => {
    const seeded = seededPermissionDefinitionKeys();

    it("reads a non-trivial catalog from the migrations", () => {
        // Guards the parser itself — an empty set would make every assertion below vacuous.
        expect(seeded.size).toBeGreaterThan(10);
        expect(seeded.has("settings.users_roles")).toBe(true);
    });

    it("names no key that is absent from permission_definitions", () => {
        const unseeded = PERMISSION_GRID_ROWS.flatMap((row) =>
            [...row.readKeys, ...row.writeKeys].filter((key) => !seeded.has(key))
        );
        expect(unseeded).toEqual([]);
    });

    it("round-trips a full-grid save — every key survives grants validation", () => {
        // What the UI submits when every row is set to "write": the union of all grid keys.
        const fullGridSelection = PERMISSION_GRID_ROWS.flatMap((row) => [
            ...row.readKeys,
            ...row.writeKeys,
        ]);
        const rejected = fullGridSelection.filter((key) => !seeded.has(key));
        expect(rejected).toEqual([]);
    });
});

