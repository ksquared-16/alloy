import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** ACT-0A — dev seed must be additive + idempotent + tagged. */
describe("comms v2 dev seed", () => {
    const sql = readFileSync(join(process.cwd(), "..", "scripts", "dev", "seed_comms_v2_demo.sql"), "utf8");
    it("contains no destructive statements", () => {
        expect(sql).not.toMatch(/\bDROP\b/i);
        expect(sql).not.toMatch(/\bTRUNCATE\b/i);
        expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
        expect(sql).not.toMatch(/\bALTER\s+TABLE\b/i);
    });
    it("is idempotent (guarded by NOT EXISTS) and tagged", () => {
        expect(sql).toMatch(/WHERE NOT EXISTS/i);
        expect(sql).toMatch(/'comms_v2_demo'/);
    });
});
