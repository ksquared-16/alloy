import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("work-unit above-fold reveal gate (page)", () => {
    it("page holds WorkUnitPageLoadingGate until above_fold_ready", () => {
        const page = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        expect(page).toContain("workUnitRevealGate");
        expect(page).toContain("workUnitAboveFoldPageReady");
        expect(page).toContain("WorkUnitPageLoadingGate");
        expect(page).toMatch(/!workUnitAboveFoldPageReady[\s\S]*WorkUnitPageLoadingGate/);
        expect(page).toContain("markWorkUnitRevealGateStart");
        expect(page).toContain("markWorkUnitRevealGatePhases");
    });

    it("canonical bootstrap includes primary rows and right rail (defer_bundle=false)", () => {
        const session = read("lib/adminV2/workUnitBootstrapClientSession.ts");
        expect(session).toContain('defer_bundle: "false"');
    });

    it("dept oper console prefetches WU bootstrap on intent", () => {
        const dept = read("app/adminV2/workspace/dept/[departmentId]/page.tsx");
        expect(dept).toContain("prefetchWorkUnitOperationalBootstrapFromDeptHref");
        expect(dept).toContain("departmentId={departmentId}");
    });

    it("parallel primary row fetch starts before bootstrap resolves when cache exists", () => {
        const page = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        expect(page).toContain("startParallelPrimaryRowFetchFromCache");
        expect(page).toContain("fetchWorkUnitOperationalBootstrapSession");
    });
});
