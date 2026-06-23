import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(process.cwd(), "..", "supabase", "migrations");

describe("template version legacy compatibility migration", () => {
    it("backfills version from version_number and installs sync trigger", () => {
        const path = join(MIGRATIONS_DIR, "20260623140000_comms_v2_template_version_legacy_compat.sql");
        expect(existsSync(path)).toBe(true);
        const sql = readFileSync(path, "utf8");
        expect(sql).toMatch(/SET version = version_number/);
        expect(sql).toMatch(/sync_communication_template_version_legacy/);
        expect(sql).toMatch(/BEFORE INSERT OR UPDATE OF version, version_number/);
    });
});
