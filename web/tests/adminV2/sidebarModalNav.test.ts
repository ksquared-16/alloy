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
        expect(items).toContain("SidebarFormsNavItem");
        expect(items).toContain("SidebarNotificationsNavItem");
        expect(items).toContain("dispatchAdminV2OpenTasksPanel");
        expect(items).toContain("dispatchAdminV2OpenInboxModal");
        expect(items).toContain("ADMIN_FORMS_HREF");
        expect(items).toContain("data-adminv2-operational-tasks-badge");
        expect(items).toContain("data-adminv2-inbox-unread-badge");
        expect(items).toContain("formatSidebarBadgeCount");
        expect(read("app/adminV2/adminV2.css")).toContain("adminv2-sidebar-rail-icon-with-badge");
        expect(read("app/adminV2/components/TopNavBar.tsx")).toContain("adminv2:open-inbox-modal");
        expect(read("app/adminV2/components/TopNavBar.tsx")).toContain("adminv2:open-tasks-panel");
    });

    it("sidebar lists Forms and Notifications route destinations", () => {
        const sidebar = read("app/adminV2/components/Sidebar.tsx");
        expect(sidebar).toContain("SidebarFormsNavItem");
        expect(sidebar).toContain("SidebarNotificationsNavItem");
        expect(read("app/adminV2/components/SidebarModalNavItems.tsx")).toContain('href={ADMIN_FORMS_HREF}');
        expect(read("app/adminV2/components/SidebarModalNavItems.tsx")).toContain("ADMIN_V2_NOTIFICATIONS_HREF");
    });
});
