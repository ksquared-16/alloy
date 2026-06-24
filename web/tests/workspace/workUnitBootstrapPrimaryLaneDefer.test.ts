import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("Card 3 — deferred primary lane rows", () => {
    it("loader skips getWorkUnitQueueItems when deferPrimaryLaneRows", () => {
        const src = read("lib/workspace/loadWorkUnitOperationalBootstrap.ts");
        expect(src).toContain("deferPrimaryLaneRows");
        expect(src).toContain("rows_deferred: true");
        expect(src).toContain("deferred_rows_source");
        const deferBlock = src.match(/if \(deferPrimaryLaneRows\) \{[\s\S]*?\} else \{/)?.[0];
        expect(deferBlock).toBeTruthy();
        expect(deferBlock).not.toContain("getWorkUnitQueueItems");
        expect(src).toContain("getWorkUnitQueueItems");
    });

    it("defer_bundle route passes deferPrimaryLaneRows and lists primary_lane_rows in runtime.deferred", () => {
        const route = read("app/api/admin/work-units/[id]/operational-bootstrap/route.ts");
        expect(route).toContain("deferPrimaryLaneRows: deferBundle");
        expect(route).toContain('"primary_lane_rows"');
    });

    it("perf log exposes defer timing fields", () => {
        const perf = read("lib/workspace/workUnitOperationalBootstrapPerf.ts");
        expect(perf).toContain("primary_lane_rows_deferred");
        expect(perf).toContain("blocking_loader_ms");
        expect(perf).toContain("deferred_rows_source");
    });

    it("WU page loads rows after shell when bootstrap returns rows_deferred", () => {
        const page = read(
            "app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx"
        );
        expect(page).toContain("rows_deferred");
        expect(page).toContain("primaryRowsDeferred");
        expect(page).toContain("runBootstrapPrimaryRowFetch(wu, qs)");
        expect(page).toMatch(/setLoading\(false\)[\s\S]*?runBootstrapPrimaryRowFetch/);
    });

    it("needs-attention inline hydrate still uses attention bucket from URL", () => {
        const page = read(
            "app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx"
        );
        expect(page).toContain("attention_bucket");
        expect(page).toMatch(/needs_attention/);
    });

    it("non-defer callers still receive inline primary_lane items", () => {
        const src = read("lib/workspace/loadWorkUnitOperationalBootstrap.ts");
        expect(src).toMatch(
            /} else \{[\s\S]*?items: result\.items as unknown\[\]/
        );
    });

    it("client bootstrap session defaults to defer_bundle=false for above-fold reveal", () => {
        const session = read("lib/adminV2/workUnitBootstrapClientSession.ts");
        expect(session).toContain('defer_bundle: "false"');
        expect(session).toContain("buildCanonicalWorkUnitOperationalBootstrapUrl");
    });

    it("defer_bundle=true path still defers primary_lane_rows server-side", () => {
        const route = read("app/api/admin/work-units/[id]/operational-bootstrap/route.ts");
        expect(route).toContain('defer_bundle") === "true"');
        expect(route).toContain("deferPrimaryLaneRows: deferBundle");
    });
});
