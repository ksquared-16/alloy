import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("sidebar modal navigation", () => {
    it("Tasks and Inbox sidebar items dispatch modal events with notification badges", () => {
        const items = read("app/adminV2/components/SidebarModalNavItems.tsx");
        expect(items).toContain("SidebarTasksNavItem");
        expect(items).toContain("SidebarInboxNavItem");
        expect(items).toContain("SidebarAnalyticsNavItem");
        // Forms lives inside the Digital Mailroom — no standalone Forms sidebar item (Mailroom doctrine,
        // enforced by digitalMailroomFormsConsolidation.test.ts).
        expect(items).not.toContain("SidebarFormsNavItem");
        expect(items).not.toContain("SidebarNotificationsNavItem");
        expect(items).toContain("dispatchAdminV2OpenTasksPanel");
        expect(items).toContain("dispatchAdminV2OpenInboxModal");
        expect(items).toContain("data-adminv2-operational-tasks-badge");
        expect(items).toContain("data-adminv2-inbox-unread-badge");
        expect(items).toContain("formatSidebarBadgeCount");
        expect(read("app/adminV2/adminV2.css")).toContain("adminv2-sidebar-rail-icon-with-badge");
        expect(read("app/adminV2/components/TopNavBar.tsx")).toContain("subscribeAdminV2WorkspaceModal");
        expect(read("app/adminV2/components/TopNavBar.tsx")).toContain("adminv2:open-inbox-modal");
        expect(read("app/adminV2/components/TopNavBar.tsx")).toContain("adminv2:open-tasks-panel");
    });

    it("notifications live in the top header between locations and profile", () => {
        const topNav = read("app/adminV2/components/TopNavBar.tsx");
        const sidebar = read("app/adminV2/components/Sidebar.tsx");
        const headerControls = topNav.slice(topNav.indexOf('<div className="flex shrink-0 items-center gap-3">'));
        expect(topNav).toContain("TopNavNotificationsLink");
        expect(headerControls).toContain("WorkspaceSiteFilterStrip");
        expect(headerControls).toContain("AdminV2ProfileMenu");
        expect(headerControls.indexOf("TopNavNotificationsLink")).toBeGreaterThan(
            headerControls.indexOf("WorkspaceSiteFilterStrip")
        );
        expect(headerControls.indexOf("TopNavNotificationsLink")).toBeLessThan(
            headerControls.indexOf("AdminV2ProfileMenu")
        );
        expect(sidebar).not.toContain("SidebarNotificationsNavItem");
        expect(read("lib/adminV2/adminV2NavConstants.ts")).toContain("ADMIN_V2_NOTIFICATIONS_HREF");
    });

    /**
     * ONE Operations entry, where Roster / Records / Assignments used to be three.
     *
     * The absence assertions matter as much as the presence one: the convergence claim is that a
     * single placement exists, and a rail carrying both Operations and a surviving Assignments
     * button would satisfy "Operations is in the sidebar" while failing the actual invariant.
     */
    it("sidebar lists exactly one Operations workspace modal", () => {
        const sidebar = read("app/adminV2/components/Sidebar.tsx");
        expect(sidebar).toContain("SidebarOperationsNavItem");
        expect(sidebar).not.toContain("SidebarSchedulingNavItem");
        expect(sidebar).not.toContain("SidebarRosterNavItem");
        const items = read("app/adminV2/components/SidebarModalNavItems.tsx");
        expect(items).toContain("dispatchAdminV2OpenOperationsModal");
        expect(items).toContain('label="Operations"');
        expect(items).not.toContain('label="Assignments"');
        expect(items).not.toContain('label="Roster"');
    });
});
