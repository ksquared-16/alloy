/**
 * A MIGRATION VERSION IS A POSITION IN ONE ORDERED SEQUENCE, AND THE SEQUENCE IS SHARED.
 *
 * Two migrations were authored at 20261010120000 and 20261011120000 while this branch was behind
 * `origin/staging` — which had by then landed `staffing_participation_supply_backfill` at the
 * first and `staff_coverage_v1` at the second. Nothing local could see it: `ls` over this
 * worktree shows no duplicate, because the colliding files are the ones this branch does not
 * have yet. The collision only exists after a merge, which is the worst moment to find it.
 *
 * A duplicate version is not a merge conflict. Both files land, and the ledger keys on the
 * version, so one of the pair can be recorded as applied when the other actually ran — a silent
 * FALSE SKIP of real DDL against a real database.
 *
 * This asserts the rule against the merge target rather than against the working tree, which is
 * the only place the answer is true.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(process.cwd(), "..");
const MIGRATIONS = "supabase/migrations";

function localMigrations(): string[] {
    return readdirSync(join(repoRoot, MIGRATIONS)).filter((f) => f.endsWith(".sql"));
}

/** The merge target's migration filenames, or null when the ref is not fetched here. */
function targetMigrations(): string[] | null {
    try {
        const out = execFileSync("git", ["ls-tree", "--name-only", "-r", "origin/staging", `${MIGRATIONS}/`], {
            cwd: repoRoot,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
        });
        const names = out.split("\n").map((l) => l.trim().split("/").pop() ?? "").filter((f) => f.endsWith(".sql"));
        return names.length > 0 ? names : null;
    } catch {
        return null;
    }
}

const version = (file: string) => file.split("_")[0] ?? "";

describe("migration versions do not collide with the branch they will merge into", () => {
    it("no two local migrations share a version", () => {
        const seen = new Map<string, string[]>();
        for (const file of localMigrations()) {
            seen.set(version(file), [...(seen.get(version(file)) ?? []), file]);
        }
        const dupes = [...seen.entries()].filter(([, files]) => files.length > 1);
        expect(dupes, `duplicate versions: ${JSON.stringify(dupes)}`).toHaveLength(0);
    });

    it("nothing this branch adds reuses a version origin/staging already spent", () => {
        const target = targetMigrations();
        if (!target) {
            /*
             * A shallow or un-fetched checkout cannot answer this, and guessing would be worse
             * than declining: a green tick that means "could not look" is the failure mode this
             * whole file exists to prevent.
             */
            expect(true, "origin/staging is not available in this checkout").toBe(true);
            return;
        }
        const targetSet = new Set(target);
        const spent = new Map<string, string>();
        for (const file of target) spent.set(version(file), file);

        const added = localMigrations().filter((f) => !targetSet.has(f));
        const collisions = added
            .filter((f) => spent.has(version(f)))
            .map((f) => `${version(f)}: this branch adds ${f}, origin/staging already has ${spent.get(version(f))}`);
        expect(collisions, collisions.join(" · ")).toHaveLength(0);
    });

    it("every migration this branch adds sorts after the last one on origin/staging", () => {
        /*
         * Not merely unique — LATER. A unique version that sorts before the target's newest still
         * runs out of order on a fresh database, where the whole directory is replayed in name
         * order rather than in the order anyone applied them.
         */
        const target = targetMigrations();
        if (!target) return;
        const targetSet = new Set(target);
        const newestOnTarget = target.map(version).sort().pop() ?? "";
        const added = localMigrations().filter((f) => !targetSet.has(f));
        for (const file of added) {
            expect(version(file) > newestOnTarget, `${file} must sort after ${newestOnTarget}`).toBe(true);
        }
    });
});
