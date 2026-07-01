import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("work-unit above-fold reveal gate (page)", () => {
    it("page uses cold/warm content gate for WorkUnitWorkspaceColdShell", () => {
        const page = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        expect(page).toContain("workUnitRevealGate");
        expect(page).toContain("workUnitAboveFoldPageReady");
        expect(page).toContain("workUnitPageSeededFromCache");
        expect(page).toContain("setWorkUnitPageSeededFromCache");
        expect(page).toContain("warmLaneRetain");
        expect(page).toContain("queueItemsForDisplay");
        expect(page).toContain("workUnitPageContentReady");
        expect(page).toContain("resolveWorkUnitPageContentReady");
        expect(page).not.toContain("WorkUnitPageLoadingGate");
        expect(page).toMatch(/!workUnitPageContentReady[\s\S]*WorkUnitWorkspaceColdShell/);
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

    it("warm navigation retains lane authority and restores session lane rows", () => {
        // The row-fetch (qs.set row_mode reveal) now lives in the canonical useWorkUnitQueueRuntime
        // hook; the warm-lane bootstrap stays in the page.
        const page =
            read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx") +
            read("lib/adminV2/runtime/queue/useWorkUnitQueueRuntime.ts");
        expect(page).toContain("restoreWarmWorkUnitLaneRows");
        expect(page).toMatch(/if \(warmLaneRetain\) \{[\s\S]*setWuQueueLaneAuthorityReady\(true\)/);
        expect(page).toMatch(/if \(!warmLaneRetain\) \{[\s\S]*clearWorkUnitBootstrapSessionForEntity/);
        expect(page).toContain("initialLaneReveal: true");
        expect(page).toContain('qs.set("row_mode", "reveal")');
    });

    it("bootstrap primary lane never blocks first paint on full queue_list", () => {
        const page = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        const inlineIdx = page.indexOf("if (inlineIncomplete)");
        const inlineBlock = page.slice(inlineIdx, page.indexOf("} else {", inlineIdx));
        expect(inlineBlock).toContain("initialLaneReveal: true");
        expect(inlineBlock).not.toContain("force: true");
        expect(page).toMatch(
            /!bootstrapPrimaryRowFetchScheduledRef\.current[\s\S]*?initialLaneReveal: true/
        );
        expect(page).toMatch(/!primaryLaneRowsSettledOnceRef\.current\) return/);
        expect(page).toContain("bootstrapPrimaryRowFetchScheduledRef.current = true");
        expect(page).toContain("suppressQueueFetchEffectOnceRef.current = true");
    });
});
