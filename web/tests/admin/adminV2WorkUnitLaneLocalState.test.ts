import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const pagePath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx"
);
const pageSource = readFileSync(pagePath, "utf8");

describe("work-unit lane local state (no URL churn)", () => {
    it("does not use useSearchParams or shallow URL writers", () => {
        expect(pageSource).not.toMatch(/import[\s\S]*useSearchParams/);
        expect(pageSource).not.toMatch(/\buseSearchParams\s*\(/);
        expect(pageSource).not.toContain("scheduleWorkUnitLaneUrlSync");
        expect(pageSource).not.toContain("commitWorkUnitLaneQueryUrl");
        expect(pageSource).not.toContain("history.replaceState");
    });

    it("reads initial queue from frozen location ref only", () => {
        expect(pageSource).toContain("readWorkUnitInitialLocationParams");
        expect(pageSource).toContain("initialLocationRef");
    });

    it("queue tab handler does not call router navigation", () => {
        const handler = pageSource.match(
            /const handleQueueTabChange = useCallback\([\s\S]*?\[setSelectedQueueKeyTraced\]/
        )?.[0];
        expect(handler).toBeTruthy();
        expect(handler).not.toMatch(/router\.(push|replace|refresh)/);
        expect(handler).not.toContain("scheduleWorkUnitLaneUrlSync");
    });
});
