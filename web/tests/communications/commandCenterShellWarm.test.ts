import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(process.cwd());

function read(rel: string): string {
    return readFileSync(join(root, rel), "utf8");
}

describe("CommandCenterShell warm hydration", () => {
    it("hydrates from warm cache without default loading when queue + first conversation are warm", () => {
        const shell = read("app/adminV2/communications/CommandCenterShell.tsx");
        const cache = read("lib/communications/v2/commandCenterPrefetchCache.ts");
        expect(cache).toContain("getCommandCenterFirstConversationWarm");
        expect(cache).toContain("warmFirstConversationWorkspace");
        expect(cache).toContain("prefetchDrawerFamilyWorkspace");
        expect(cache).toContain("runWhenAdminV2PrimarySurfaceReady");
        expect(shell).toContain("useFamilyCommunicationRuntime");
        expect(shell).toContain('surfaceVariant: "workspace_inbox"');
        expect(shell).toContain("getCommandCenterWarmSelectedConversationId");
        expect(shell).toContain("CommsQueueListReserve");
        expect(shell).toContain("CommsWorkspacePanelReserve");
        expect(shell).not.toContain("loadLive");
        expect(shell).not.toContain("runFamilySend");
        expect(shell).not.toContain("data-cc-loading-overlay");
    });

    it("Workspace runtime owns family workspace loading instead of CommandCenterShell", () => {
        const shell = read("app/adminV2/communications/CommandCenterShell.tsx");
        expect(shell).toContain("initialThreadId: selectedId");
        expect(shell).toContain("runtime.send");
        expect(shell).not.toContain("/api/admin/communications/family-workspace?");
    });

    it("shell and sidebar schedule command center warm after primary surface", () => {
        expect(read("app/adminV2/components/SidebarModalNavItems.tsx")).toContain("warmCommunicationsWorkspaceModal");
        expect(read("app/adminV2/components/TopNavBar.tsx")).toContain("warmCommunicationsWorkspaceModal");
    });
});
