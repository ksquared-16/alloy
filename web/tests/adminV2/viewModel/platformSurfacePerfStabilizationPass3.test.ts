import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
    computeWorkUnitRevealGate,
    workUnitRevealKpiReady,
} from "@/lib/adminV2/workUnitRevealGate";
import { workUnitPageContentReady } from "@/lib/adminV2/workUnitPageRevealPolicy";
import { workUnitLanePrefetchTargets } from "@/lib/adminV2/workUnitQueuePillPrefetch";
import { shouldDisableAdminV2LinkPrefetch } from "@/app/adminV2/components/navigation/adminV2HeavyRoutePrefetch";

const webRoot = join(process.cwd());

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("platform performance pass 3 — atomic reveal + critical path diet", () => {
    it("workUnitPageContentReady waits for critical bundle on first paint", () => {
        expect(
            workUnitPageContentReady({
                shell_ready: true,
                critical_bundle_ready: false,
                coordinated_reveal_completed: false,
            }),
        ).toBe(false);
        expect(
            workUnitPageContentReady({
                shell_ready: true,
                critical_bundle_ready: true,
                coordinated_reveal_completed: false,
            }),
        ).toBe(true);
        expect(
            workUnitPageContentReady({
                shell_ready: true,
                critical_bundle_ready: false,
                coordinated_reveal_completed: true,
            }),
        ).toBe(true);
    });

    it("reveal gate blocks until KPI strip is ready when visible", () => {
        expect(
            computeWorkUnitRevealGate({
                shell_ready: true,
                summaries_ready: true,
                actions_ready: true,
                rows_ready: true,
                kpi_ready: false,
            }).above_fold_ready,
        ).toBe(false);
        expect(
            workUnitRevealKpiReady({
                suppress_kpi_strip: false,
                kpi_metrics_pending: true,
            }),
        ).toBe(false);
    });

    it("lane prefetch skips lifecycle siblings by default", () => {
        const targets = workUnitLanePrefetchTargets({
            visiblePillKeys: ["lifecycle_lead", "lifecycle_waitlist"],
            selectedPillKey: "lifecycle_lead",
            workUnit: {
                id: "wu-a",
                queue_definition: {
                    queues: [
                        { key: "lifecycle_lead", label: "Lead" },
                        { key: "lifecycle_waitlist", label: "Waitlist" },
                    ],
                },
            },
            lifecycleSiblings: [
                {
                    id: "wu-b",
                    queue_definition: {
                        queues: [{ key: "lifecycle_lead", label: "Lead" }],
                    },
                },
            ],
            cap: 4,
        });
        expect(targets.every((t) => t.workUnitId === "wu-a")).toBe(true);
    });

    it("legacy-admin links are heavy-route prefetch disabled", () => {
        expect(shouldDisableAdminV2LinkPrefetch("/legacy-admin/opportunities")).toBe(true);
        expect(shouldDisableAdminV2LinkPrefetch("/legacy-admin/system/work-units")).toBe(true);
    });

    it("workspace root actions rail never prefetches legacy-admin hrefs", () => {
        const rail = read("app/adminV2/components/workspace/WorkspaceRootActionsRail.tsx");
        expect(rail).toContain('prefetch={false}');
        expect(rail).toContain("/legacy-admin/opportunities");
    });

    it("work-unit page gates WorkUnitWorkspace on critical bundle", () => {
        const page = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        expect(page).toContain("critical_bundle_ready: workUnitAboveFoldPageReady");
        expect(page).toContain("coordinated_reveal_completed: wuCoordinatedRevealDone");
        expect(page).toMatch(/!workUnitPageContentReady[\s\S]*WorkUnitWorkspaceColdShell/);
        expect(page).toContain("workUnitRevealKpiReady");
    });

    it("primary surface gate clears on coordinated above-fold mark", () => {
        const perf = read("lib/perf/alloyPerfGlobal.ts");
        const clearBlock = perf.slice(
            perf.indexOf("PRIMARY_SURFACE_CLEAR_MARKS"),
            perf.indexOf("]);", perf.indexOf("PRIMARY_SURFACE_CLEAR_MARKS")) + 3,
        );
        expect(clearBlock).toContain('"wu_reveal_above_fold_ready"');
        expect(clearBlock).not.toContain("work_unit_primary_lane_ready");
    });

    it("bootstrap client uses initial summary mode for slimmer first fetch", () => {
        const bootstrap = read("lib/adminV2/workUnitBootstrapClientSession.ts");
        expect(bootstrap).toContain('summary_mode: "initial"');
    });

    it("shell defers inbox warm until idle", () => {
        const shell = read("app/adminV2/components/AdminV2Shell.tsx");
        expect(shell).toContain("scheduleAdminV2BackgroundWork");
        expect(shell).toContain("scheduleInboxWarmLoad");
    });

    it("row click warms opportunity VM before openDrawer", () => {
        const page = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        expect(page).toContain("warmQueueRowOpportunityVm");
        expect(page).toContain("openDrawer(openParams)");
        expect(page.indexOf("warmQueueRowOpportunityVm")).toBeLessThan(page.indexOf("openDrawer(openParams)"));
    });
});
