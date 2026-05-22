import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("adminV2DeferBackgroundWork", () => {
    it("exports idle scheduler helper", () => {
        const src = read("lib/workspace/adminV2DeferBackgroundWork.ts");
        expect(src).toContain("scheduleAdminV2BackgroundWork");
        expect(src).toContain("requestIdleCallback");
    });

    it("workspace layout server-hydrates entity labels for client provider", () => {
        const layout = read("app/adminV2/workspace/layout.tsx");
        expect(layout).toContain("loadEntityLabelsMapForUser");
        expect(layout).toContain("initialEntityLabels");
    });
});

describe("Dept nav background defer contracts", () => {
    it("defers shell background polls during workspace navigation", () => {
        expect(read("app/adminV2/components/AdminV2Shell.tsx")).toContain("prefetchWorkspaceNavTree");
        expect(read("app/adminV2/components/TopNavBar.tsx")).toContain("scheduleAdminV2BackgroundWork");
        expect(read("app/adminV2/components/aiActivity/RecentAiActionsStrip.tsx")).toContain(
            "scheduleAdminV2BackgroundWork"
        );
        expect(read("app/adminV2/components/OperationalTasksNavBadge.tsx")).toContain(
            "scheduleAdminV2BackgroundWork"
        );
        expect(read("app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx")).toContain(
            "scheduleAdminV2BackgroundWork"
        );
    });

    it("dept page defers KPI placement fetch behind oper-critical start", () => {
        const page = read("app/adminV2/workspace/dept/[departmentId]/page.tsx");
        expect(page).toContain("scheduleAdminV2BackgroundWork");
        expect(page).toMatch(/fetchDeptAttentionPreview\(cacheNaWuId\)[\s\S]*?summariesFetchPromise/);
        expect(page).toMatch(/cancelPlacementDefer/);
    });
});
