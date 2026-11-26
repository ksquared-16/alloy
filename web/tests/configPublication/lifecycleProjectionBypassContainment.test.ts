/**
 * Law 4 — containment of the two remaining non-editor bypasses.
 *
 * These are not editor migrations (that is the draft-service convergence slice). They are the two
 * paths that could rewrite publication-owned configuration without being a configuration editor at
 * all: the generic admin department PATCH, and demo seed tooling.
 *
 * Both are also caught by the database guard, but a guard rejection surfaces as an opaque Postgres
 * 42501. These assertions hold the application-level behaviour: reject with a reason, or don't
 * attempt the write in the first place.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const adminPatch = readFileSync(
    resolve(process.cwd(), "app/api/admin/departments/[departmentId]/route.ts"),
    "utf8",
);

const demoSeed = readFileSync(
    resolve(process.cwd(), "scripts/seedRealisticChildcareDemoData.ts"),
    "utf8",
);

const bootstrap = readFileSync(
    resolve(process.cwd(), "lib/admin/verticalBootstrap/applyVerticalBootstrap.ts"),
    "utf8",
);

describe("generic admin department PATCH cannot alter lifecycle configuration", () => {
    it("rejects a metadata body carrying lifecycle_builder_v1", () => {
        expect(adminPatch).toContain("LIFECYCLE_BUILDER_METADATA_KEY in (body.metadata");
        // 409, not 400: the request is well-formed, it is the destination that is wrong.
        expect(adminPatch).toMatch(/status:\s*409/);
    });

    it("tells the caller where the change belongs instead of leaking a Postgres error", () => {
        expect(adminPatch).toContain("Business Process configuration cannot be changed here");
        expect(adminPatch).toContain("publish");
        // The rejection must not be phrased as a database failure.
        expect(adminPatch).not.toContain("42501");
    });

    it("still deep-merges unrelated department metadata", () => {
        // Category-F writers must keep working — the guard and this check are both narrow.
        expect(adminPatch).toContain("deepMergeJsonObjects(prev, body.metadata");
    });
});

describe("demo seed tooling cannot overwrite an established department", () => {
    // Scope every assertion to ensureDepartment. Bare `metadata: meta` is still correct elsewhere
    // in this seeder — on the departments INSERT (creation has nothing to overwrite) and on other
    // tables entirely (locations, customers), which are not publication-owned.
    const ensureDepartment = (() => {
        const start = demoSeed.indexOf("async function ensureDepartment");
        expect(start).toBeGreaterThan(-1);
        const next = demoSeed.indexOf("\nasync function ", start + 1);
        return demoSeed.slice(start, next === -1 ? undefined : next);
    })();

    // Only the existing-department branch, up to its own `return` — the INSERT that follows it is
    // creation and legitimately still writes the bare marker.
    const updateBranch = (() => {
        const start = ensureDepartment.indexOf("if ((existing as { id?: string } | null)?.id)");
        expect(start).toBeGreaterThan(-1);
        const end = ensureDepartment.indexOf("return id;", start);
        expect(end).toBeGreaterThan(start);
        return ensureDepartment.slice(start, end);
    })();

    it("reads existing metadata rather than only the id", () => {
        expect(ensureDepartment).toContain('.select("id, metadata")');
    });

    it("merges with existing keys winning instead of replacing the column", () => {
        expect(updateBranch).toContain("const mergedMeta = { ...meta, ...existingMeta }");
        expect(updateBranch).toContain("metadata: mergedMeta");
    });

    it("no longer writes the bare seed marker over an existing department's column", () => {
        // The destructive shape was `metadata: meta,` inside the existing-department UPDATE.
        expect(updateBranch).not.toMatch(/metadata:\s*meta,/);
    });
});

describe("vertical bootstrap cannot overwrite an established department", () => {
    it("strips publication-owned configuration from the blueprint", () => {
        expect(bootstrap).toContain("lifecycle_builder_v1: _publicationOwned");
    });

    it("merges with existing keys winning", () => {
        expect(bootstrap).toContain("const mergedMeta = { ...blueprintMeta, ...existingMeta }");
    });
});
