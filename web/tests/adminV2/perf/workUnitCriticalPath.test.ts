import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { buildWorkUnitLaneTimingTable } from "@/lib/perf/workUnitCriticalPathTrace";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("work-unit critical path", () => {
    it("exports lane audit metadata for all five lanes", () => {
        const rows = buildWorkUnitLaneTimingTable();
        expect(rows.map((r) => r.lane)).toEqual([
            "shell_chrome",
            "header_chips",
            "queue_rows",
            "actions_rail",
            "kpi_or_summary",
        ]);
        expect(rows.every((r) => r.data_source.length > 0)).toBe(true);
    });

    it("page uses reveal gate before mounting WorkUnitWorkspace", () => {
        const page = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        expect(page).toContain("workUnitRevealGate");
        expect(page).toContain("WorkUnitWorkspaceColdShell");
        expect(page).toContain("workUnitAboveFoldPageReady");
        expect(page).toContain("aboveFold={workUnitAboveFoldRenderable}");
        expect(page).toContain("buildWorkUnitAboveFoldRenderModel");
        expect(page).not.toContain("headerQueuePicker=");
        expect(page).toContain("markWorkUnitAboveFoldCoordinated");
        expect(page).toContain("markWorkUnitRevealGatePhases");
    });

    it("bootstrap applies or eagerly fetches right rail (not idle-deferred only)", () => {
        const page = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        const bootstrapBlock = page.slice(
            page.indexOf("if (bootstrapRes.ok && !cancelled)"),
            page.indexOf("/** Legacy fan-out when operational-bootstrap unavailable")
        );
        expect(bootstrapBlock).toContain("setEnrollmentRightRailResolved(b.right_rail_actions)");
        expect(bootstrapBlock).toContain("fetchWorkspaceRightRailResolvedActions");
        expect(bootstrapBlock).not.toMatch(
            /scheduleAdminV2BackgroundWork\([\s\S]{0,500}setEnrollmentRightRailResolved\(b\.right_rail_actions\)/
        );
    });
});
