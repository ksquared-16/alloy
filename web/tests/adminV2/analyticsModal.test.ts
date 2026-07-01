import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(rel: string): string {
    return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("analytics modal shell", () => {
    it("registers analytics in workspace modal coordinator", () => {
        expect(read("lib/adminV2/workspaceModalCoordinator.ts")).toContain('"analytics"');
        expect(read("lib/adminV2/workspaceModalEvents.ts")).toContain("dispatchAdminV2OpenAnalyticsModal");
        expect(read("lib/adminV2/workspaceModalEvents.ts")).toContain("adminv2:open-analytics-modal");
    });

    it("mounts AnalyticsModal from TopNavBar single owner", () => {
        const topNav = read("app/adminV2/components/TopNavBar.tsx");
        expect(topNav).toContain("AnalyticsModal");
        expect(topNav).toContain('activeWorkspaceModal === "analytics"');
        expect(topNav).toContain("adminv2:open-analytics-modal");
    });

    it("sidebar dispatches analytics modal open", () => {
        const items = read("app/adminV2/components/SidebarModalNavItems.tsx");
        expect(items).toContain("SidebarAnalyticsNavItem");
        expect(items).toContain("dispatchAdminV2OpenAnalyticsModal");
        expect(read("app/adminV2/components/Sidebar.tsx")).toContain("SidebarAnalyticsNavItem");
    });

    it("uses BOS-rail modal shell and batch metric fetch", () => {
        expect(read("app/adminV2/components/AnalyticsModal.tsx")).toContain("AdminV2WorkspaceBosModalShell");
        expect(read("app/adminV2/components/AnalyticsModal.tsx")).toContain("bg-white");
        expect(read("app/adminV2/analytics/AnalyticsWorkspacePanel.tsx")).toContain("prefetchOipMetricsWarm");
        expect(read("app/adminV2/analytics/AnalyticsWorkspacePanel.tsx")).toContain('data-oip-tab="overview"');
        expect(read("app/adminV2/analytics/AnalyticsWorkspacePanel.tsx")).toContain('closeWorkspaceModal("analytics")');
        expect(read("lib/metrics/packs.ts")).toContain("operational_health");
    });
});
