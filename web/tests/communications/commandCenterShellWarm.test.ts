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
        expect(cache).toContain("runWhenAdminV2PrimarySurfaceReady");
        expect(shell).toContain("initialWorkspaceFromWarm");
        expect(shell).toContain("initialHydratingWorkspace");
        expect(shell).toContain("getCommandCenterWarmSelectedConversationId");
        expect(shell).toContain("data-cc-loading-overlay");
    });

    it("openConversation reuses warm workspace before network", () => {
        const shell = read("app/adminV2/communications/CommandCenterShell.tsx");
        expect(shell).toMatch(/getCommandCenterFirstConversationWarm\(\)[\s\S]*?conversationId === id/);
    });

    it("shell and sidebar schedule command center warm after primary surface", () => {
        expect(read("app/adminV2/components/AdminV2Shell.tsx")).toContain("scheduleCommandCenterPrefetch");
        expect(read("app/adminV2/components/SidebarModalNavItems.tsx")).toContain("warmCommandCenterModal");
        expect(read("app/adminV2/components/TopNavBar.tsx")).toContain("warmCommandCenterModal");
    });
});
