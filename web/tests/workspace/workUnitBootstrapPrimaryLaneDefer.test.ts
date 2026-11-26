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

    // (Obsolete tests removed: the legacy `.../dept/[departmentId]/work-unit/[workUnitId]/page.tsx`
    // that consumed inline bootstrap primary_lane rows for above-fold reveal was replaced by the PRV2
    // runtime — the file no longer exists. The PRV2 Work Unit surface fetches its own view-scoped rows
    // and never reads the bootstrap payload, so the bootstrap must NOT compute a primary lane nothing
    // consumes. That is why the canonical client now defers — see the next test.)

    it("non-defer callers still receive inline primary_lane items (server path preserved)", () => {
        const src = read("lib/workspace/loadWorkUnitOperationalBootstrap.ts");
        expect(src).toMatch(
            /} else \{[\s\S]*?items: result\.items as unknown\[\]/
        );
    });

    it("client bootstrap session now DEFERS the primary lane (no duplicate row computation)", () => {
        // Deployed staging proved the non-deferred bootstrap computed the primary lane (~1073ms) that
        // the PRV2 runtime then re-fetched — a pure duplicate. The rows are not consumed for render, so
        // the canonical client defers them (runtime owns the single fetch: cold=one, warm=zero).
        const session = read("lib/adminV2/workUnitBootstrapClientSession.ts");
        expect(session).toContain('defer_bundle: "true"');
        expect(session).not.toContain('defer_bundle: "false"');
        expect(session).toContain("buildCanonicalWorkUnitOperationalBootstrapUrl");
    });

    it("defer_bundle=true path still defers primary_lane_rows server-side", () => {
        const route = read("app/api/admin/work-units/[id]/operational-bootstrap/route.ts");
        expect(route).toContain('defer_bundle") === "true"');
        expect(route).toContain("deferPrimaryLaneRows: deferBundle");
    });
});
