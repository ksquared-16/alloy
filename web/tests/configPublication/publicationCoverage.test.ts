/**
 * Publication coverage — no ordinary editor writes the runtime projection.
 *
 * The point of this sprint is that Business Process configuration has ONE publication system, not
 * several. That is a property of the whole surface, not of any single module, so it is asserted
 * here against the source: every ordinary editing path must reach `business_process_drafts`, and
 * none may `UPDATE departments`.
 *
 * Source-level assertions are the right instrument for this. A behavioural test proves one path
 * behaves; this proves no OTHER path exists — which is the actual claim.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const WEB = path.join(__dirname, "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(WEB, rel), "utf8");

/** Ordinary editing surfaces: the ones an operator drives from the configuration UI. */
const ORDINARY_EDITORS = [
    "lib/lifecycle/persistWorkViewsV1.ts",
    "lib/lifecycle/persistParticipationV1.ts",
    "lib/lifecycle/saveLifecycleStageRuntimeConfig.ts",
    "app/api/admin/lifecycle-builder/process-work-views/route.ts",
    "app/api/admin/lifecycle-builder/process-participation/route.ts",
    "app/api/admin/lifecycle-catalog/delete/route.ts",
];

/**
 * A direct write to the projection: `.from("departments")` followed by `.update(`/`.upsert(`.
 * Matched loosely on purpose — the claim is "does not write departments at all", so any shape of
 * write should trip it.
 */
function writesDepartments(source: string): boolean {
    return /from\(\s*["']departments["']\s*\)[\s\S]{0,200}?\.(update|upsert)\(/.test(source);
}

describe("no ordinary Business Process editor writes the runtime projection", () => {
    for (const file of ORDINARY_EDITORS) {
        it(`${file} does not UPDATE departments`, () => {
            expect(writesDepartments(read(file)), `${file} still writes the projection`).toBe(false);
        });
    }

    it("even the publication service does not UPDATE the projection from application code", () => {
        // Stronger than "only publish may write it": NOTHING in the app writes it. Publishing
        // calls a Postgres function that holds the guard's capability token, so the projection
        // has exactly one writer and it lives inside the database.
        const service = read("lib/businessProcesses/configuration/businessProcessConfigurationService.ts");
        expect(writesDepartments(service)).toBe(false);
        expect(service).toContain("publish_business_process_revision_v1");
    });

    it("the projection is written only by the guarded publish/rollback functions", () => {
        const service = read("lib/businessProcesses/configuration/businessProcessConfigurationService.ts");
        const rpcs = [...service.matchAll(/\.rpc\(\s*["']([a-z0-9_]+)["']/g)].map((m) => m[1]);
        expect(rpcs).toContain("publish_business_process_revision_v1");
        expect(rpcs).toContain("rollback_business_process_to_revision_v1");
    });
});

describe("every ordinary editor reaches the draft", () => {
    const DRAFT_MARKERS = ["editProcessInDraft", "editBuilderInDraft", "saveDraft", "writeStageDraft"];

    for (const file of ORDINARY_EDITORS.filter((f) => f.startsWith("lib/"))) {
        it(`${file} persists through the draft service`, () => {
            const src = read(file);
            expect(
                DRAFT_MARKERS.some((m) => src.includes(m)),
                `${file} reaches no known draft writer`,
            ).toBe(true);
        });
    }
});

describe("editors read from where their saves land", () => {
    // An editor that saves to the draft but reads the projection shows the operator their own
    // edit disappearing on reload. That defect was already fixed once for the stage editor; these
    // pin it closed for the families migrated in this sprint.
    it("Work Views GET reads the draft", () => {
        const route = read("app/api/admin/lifecycle-builder/process-work-views/route.ts");
        expect(route).toContain("readWorkViewsForEditor");
        expect(route).toContain("configuration_state");
    });

    it("Participation GET reads the draft", () => {
        const route = read("app/api/admin/lifecycle-builder/process-participation/route.ts");
        expect(route).toContain("readParticipationForEditor");
        expect(route).toContain("configuration_state");
    });
});

describe("the save contract is honest about runtime", () => {
    for (const route of ORDINARY_EDITORS.filter((f) => f.startsWith("app/"))) {
        it(`${route} tells the caller a publish is still required`, () => {
            expect(read(route)).toContain("publication_required");
        });

        it(`${route} reports a concurrent draft edit as a conflict, not a 500`, () => {
            const src = read(route);
            expect(src).toContain("BusinessProcessDraftEditConflictError");
            expect(src).toContain("409");
        });
    }
});

describe("the generic department endpoint refuses configuration writes", () => {
    it("rejects lifecycle_builder_v1 with an operator-facing reason and a destination", () => {
        const src = read("app/api/admin/departments/[departmentId]/route.ts");
        expect(src).toContain("LIFECYCLE_BUILDER_METADATA_KEY in");
        // Not a bare 403 — the operator is told where the edit actually belongs.
        expect(src).toContain("edit the draft and publish it");
        expect(src).toContain("409");
    });
});

describe("unknown fields survive an ordinary edit", () => {
    it("edits spread the process rather than rebuilding it", () => {
        // `{ ...process, work_views_v1: next }` keeps the Law 7 unknown-field carrier. Rebuilding
        // the object from named keys would silently drop row_grain_v1 and every future field.
        for (const file of ["lib/lifecycle/persistWorkViewsV1.ts", "lib/lifecycle/persistParticipationV1.ts"]) {
            expect(read(file), file).toMatch(/edit:\s*\(process\)\s*=>\s*\(\{\s*\.\.\.process,/);
        }
    });
});
