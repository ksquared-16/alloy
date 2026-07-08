import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(rel: string): string {
    return readFileSync(join(root, rel), "utf8");
}

describe("familyWorkspace activity_embed contract", () => {
    it("prop chain passes surfaceVariant from Activity cockpit to workspace view", () => {
        const embedded = read("components/admin/focusPanel/OpportunityFocusPanelEmbeddedWorkspace.tsx");
        const drawer = read("components/admin/communications/CommunicationsDrawerSection.tsx");
        const tab = read("app/adminV2/communications/recordTab/RecordCommunicationsTab.tsx");
        const workspace = read("app/adminV2/communications/FamilyCommunicationWorkspace.tsx");

        expect(embedded).toMatch(/surfaceVariant="activity_embed"/);
        expect(drawer).toMatch(/surfaceVariant\?: FamilyWorkspaceSurfaceVariant/);
        expect(drawer).toMatch(/surfaceVariant=\{props\.surfaceVariant\}/);
        expect(tab).toMatch(/surfaceVariant=\{props\.surfaceVariant\}/);
        expect(workspace).toMatch(/onNewMessage=\{startNewMessage\}/);
        expect(workspace).toMatch(/threads=\{vm\.threads\}/);
    });

    it("activity_embed view renders thread strip and New message affordance", () => {
        const view = read("app/adminV2/communications/FamilyCommunicationWorkspaceView.tsx");
        expect(view).toMatch(/data-cc-thread-strip/);
        expect(view).toMatch(/data-cc-new-message/);
        expect(view).toMatch(/data-cc-recipient-compact/);
        expect(view).toMatch(/onNewMessage\?\.\(\)/);
    });

    it("Recent Activity ribbon uses compact event count", () => {
        const embedded = read("components/admin/focusPanel/OpportunityFocusPanelEmbeddedWorkspace.tsx");
        expect(embedded).toMatch(/RIBBON_EVENT_COUNT = 4/);
    });
});

describe("startNewMessage clears thread context", () => {
    it("FamilyCommunicationWorkspace resets selectedThreadId in startNewMessage", () => {
        const workspace = read("app/adminV2/communications/FamilyCommunicationWorkspace.tsx");
        expect(workspace).toMatch(/const startNewMessage = useCallback\(\(\) => \{/);
        expect(workspace).toMatch(/setSelectedThreadId\(null\)/);
        expect(workspace).toMatch(/void load\(null, false\)/);
    });
});
