import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("workspace modal single ownership", () => {
    it("TopNavBar derives modal open state from the coordinator", () => {
        const topNav = readFileSync(join(process.cwd(), "app/adminV2/components/TopNavBar.tsx"), "utf8");
        expect(topNav).toContain("subscribeAdminV2WorkspaceModal");
        expect(topNav).toContain('activeWorkspaceModal === "tasks"');
        expect(topNav).toContain('activeWorkspaceModal === "inbox"');
        expect(topNav).toContain('activeWorkspaceModal === "analytics"');
        expect(topNav).toContain("openWorkspaceModal");
        expect(topNav).toContain("closeWorkspaceModal");
        expect(topNav).not.toContain("setTasksModalOpen(true)");
        expect(topNav).not.toContain("setInboxModalOpen(true)");
    });

    it("BOS Action Workspace closes shell modals before opening", () => {
        const hook = readFileSync(join(process.cwd(), "lib/bos/useActionWorkspaceOpenDocumentFlag.ts"), "utf8");
        expect(hook).toContain("closeAllWorkspaceModals");
    });

    it("sidebar dispatches through workspace modal events", () => {
        const items = readFileSync(join(process.cwd(), "app/adminV2/components/SidebarModalNavItems.tsx"), "utf8");
        expect(items).toContain("dispatchAdminV2OpenTasksPanel");
        expect(items).toContain("dispatchAdminV2OpenInboxModal");
        const events = readFileSync(join(process.cwd(), "lib/adminV2/workspaceModalEvents.ts"), "utf8");
        expect(events).toContain("openWorkspaceModal");
    });
});
