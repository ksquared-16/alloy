import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const PAGE = join(
    process.cwd(),
    "app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx"
);

describe("workUnitQueuePillSwitchRegression", () => {
    it("page applies view-scoped cache on pill change and does not clear row buffer", () => {
        const src = readFileSync(PAGE, "utf8");
        expect(src).toContain("touchCachedQueueItemsForPill");
        expect(src).toContain("resolveWorkUnitQueueLaneItemsReady");
        expect(src).not.toMatch(
            /if \(!sameQueue\) \{\s*\n\s*queueRowsBufferWorkUnitIdRef\.current = workUnitId;\s*\n\s*queueRowsBufferRef\.current = \[\]/
        );
    });

    it("fetch finally clears loading when no leases remain (anti-freeze)", () => {
        const src = readFileSync(PAGE, "utf8");
        expect(src).toContain("queueRowLeaseSigsRef.current.size === 0");
    });
});
