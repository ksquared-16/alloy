import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const PAGE = join(
    process.cwd(),
    "app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx"
);
const HOOK = join(process.cwd(), "lib/adminV2/runtime/queue/useWorkUnitQueueRuntime.ts");

describe("workUnitQueuePillSwitchRegression", () => {
    it("page applies view-scoped cache on pill change and does not clear row buffer", () => {
        const src = readFileSync(PAGE, "utf8");
        expect(src).toContain("touchCachedQueueItemsForPill");
        expect(src).toContain("resolveWorkUnitQueueLaneRevealState");
        expect(src).not.toMatch(
            /if \(!sameQueue\) \{\s*\n\s*queueRowsBufferWorkUnitIdRef\.current = workUnitId;\s*\n\s*queueRowsBufferRef\.current = \[\]/
        );
    });

    it("holds current lane visible on pill cache miss", () => {
        const src = readFileSync(PAGE, "utf8");
        expect(src).toContain("markWorkUnitVmPillSwitchCacheMissHoldCurrent");
        expect(src).toContain("lifecyclePillSwitchRetainRowsRef.current = true");
        expect(src).toContain("if (options?.userInitiated) return prev");
        expect(src).toContain("markKpiPillClick");
        expect(src).toContain("pill_switch_retain_rows");
    });

    it("prefetches valid lanes after first paint", () => {
        const src = readFileSync(PAGE, "utf8");
        expect(src).toContain("workUnitLanePrefetchTargets");
        expect(src).toContain("markWorkUnitVmPillPrefetchStart");
        expect(src).toContain("workUnitRowOverride");
    });

    it("fetch finally clears loading when no leases remain (anti-freeze)", () => {
        // fetchQueueItems moved to the canonical useWorkUnitQueueRuntime hook.
        const src = readFileSync(PAGE, "utf8") + readFileSync(HOOK, "utf8");
        expect(src).toContain("queueRowLeaseSigsRef.current.size === 0");
    });
});
