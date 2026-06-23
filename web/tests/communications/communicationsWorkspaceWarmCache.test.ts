import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(process.cwd());

function read(rel: string): string {
    return readFileSync(join(root, rel), "utf8");
}

describe("communicationsWorkspaceWarmCache", () => {
    it("defines TTL snapshot, inflight dedupe, schedule, and warm entry points", () => {
        const cache = read("lib/communications/v2/communicationsWorkspaceWarmCache.ts");
        expect(cache).toContain("CACHE_TTL_MS");
        expect(cache).toContain("getCommunicationsWorkspaceWarmSnapshot");
        expect(cache).toContain("prefetchCommunicationsWorkspaceWarm");
        expect(cache).toContain("warmCommunicationsWorkspaceModal");
        expect(cache).toContain("scheduleCommunicationsWorkspaceWarm");
        expect(cache).toContain("subscribeCommunicationsWorkspaceWarm");
        expect(cache).toContain("prefetchCommandCenterConversations");
        expect(cache).toContain("fetchCommunicationsBindingsCached");
    });

    it("warms templates library, active templates, announcements, and audience metadata", () => {
        const cache = read("lib/communications/v2/communicationsWorkspaceWarmCache.ts");
        expect(cache).toContain("templatesLibrary");
        expect(cache).toContain("activeTemplates");
        expect(cache).toContain("announcements");
        expect(cache).toContain("audienceMetadata");
        expect(cache).toContain(TEMPLATES_API);
        expect(cache).toContain(ANNOUNCEMENTS_API);
    });
});

const TEMPLATES_API = "/api/admin/communications/templates";
const ANNOUNCEMENTS_API = "/api/admin/communications/announcements";

describe("Communications workspace shell (Increment 1)", () => {
    it("InboxModal uses CommunicationsWorkspaceShell when Command Center is enabled", () => {
        const modal = read("app/adminV2/components/InboxModal.tsx");
        const shell = read("app/adminV2/communications/CommunicationsWorkspaceShell.tsx");
        expect(modal).toContain("CommunicationsWorkspaceShell");
        expect(modal).toContain("warmCommunicationsWorkspaceModal");
        expect(shell).toContain('data-comms-workspace-shell="true"');
    });

    it("AdminV2Shell schedules unified communications workspace warm", () => {
        expect(read("app/adminV2/components/AdminV2Shell.tsx")).toContain("scheduleCommunicationsWorkspaceWarm");
    });
});
