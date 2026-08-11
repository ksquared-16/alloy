/**
 * Migration version uniqueness — certification (D-72).
 *
 * On 2026-08-07 two branches each authored a migration stamped
 * `20260807090000` and both merged. `supabase_migrations.schema_migrations` is
 * `PRIMARY KEY (version)`, so the pair could never both be recorded, and
 * `supabase db push` does not check for the collision before it starts
 * executing — it applies the first file, records the version, then dies on the
 * duplicate key partway through the chain. On a shared tenant that leaves a
 * half-converged schema.
 *
 * `scripts/migration-preflight.mjs` already detected this. Nothing ran it. The
 * gap was never the parser — it was that no gate called the parser, so a
 * collision could merge in silence. This test is that caller, and it is
 * deliberately wired into the Trust DB certification workflow, which is
 * required on `staging` and unfiltered.
 *
 * Repo-only: no database, no network, no Docker. Version uniqueness is a
 * property of filenames, and making a filename check depend on a database
 * would be a reason to skip it.
 */

import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { checkMigrationRepo } from "../../../scripts/migration-preflight.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const fixtures = (name: string) => path.join(repoRoot, "scripts/migration-preflight-fixtures", name);
const CANONICAL = path.join(repoRoot, "supabase/migrations");

describe("D-72 — a duplicate migration version fails the build", () => {
    it("the real repository has no duplicate versions", () => {
        const { files, versions, failures } = checkMigrationRepo(CANONICAL);

        // The property, stated two ways so a regression cannot hide in either.
        expect(failures).toEqual([]);
        expect(versions.length).toBe(files.length);
    });

    it("the scan is not vacuous — it is reading the real migration tree", () => {
        const { files } = checkMigrationRepo(CANONICAL);
        // A scan that silently found nothing would pass every assertion above.
        expect(files.length).toBeGreaterThan(300);
        expect(readdirSync(CANONICAL).some((f) => f.endsWith(".sql"))).toBe(true);
    });

    it("NEGATIVE CONTROL — the exact 2026-08-07 collision is rejected", () => {
        const { failures } = checkMigrationRepo(fixtures("duplicate-version"));

        expect(failures.length).toBeGreaterThan(0);
        expect(failures.some((f) => f.startsWith("duplicate version 20260807090000:"))).toBe(true);
        // The finding names BOTH files, because "there is a duplicate" is not
        // actionable and "these two collide" is.
        const dup = failures.find((f) => f.includes("duplicate version"))!;
        expect(dup).toContain("business_process_publish_idempotency");
        expect(dup).toContain("membership_profile_atomic_create");
    });

    it("a clean fixture passes, so the control discriminates rather than always failing", () => {
        expect(checkMigrationRepo(fixtures("clean")).failures).toEqual([]);
    });

    it("a malformed filename is rejected too", () => {
        const { failures } = checkMigrationRepo(fixtures("bad-filename"));
        expect(failures.some((f) => f.startsWith("filename shape: not-a-migration.sql"))).toBe(true);
    });

    it("the repaired pair still exists, at distinct versions", () => {
        // Guards the specific repair: someone re-colliding these two by reverting
        // the rename fails here with a message naming the decision.
        expect(existsSync(path.join(CANONICAL, "20260807090000_business_process_publish_idempotency.sql"))).toBe(true);
        expect(existsSync(path.join(CANONICAL, "20260807090001_membership_profile_atomic_create.sql"))).toBe(true);
        expect(existsSync(path.join(CANONICAL, "20260807090000_membership_profile_atomic_create.sql"))).toBe(false);
    });
});
